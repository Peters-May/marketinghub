import {
  createMcpHandler,
  McpServer,
  WebStandardStreamableHTTPServerTransport,
  type AuthInfo,
} from "@modelcontextprotocol/server";
import { withMcpAuth } from "mcp-handler";
import { mcpCorsPreflight, withMcpCors } from "@/lib/mcp/cors";
import {
  getMcpResourceUrl,
  isMcpConfigured,
  verifyMcpAccessToken,
} from "@/lib/mcp/oauth";

/** ChatGPT snapshots tools at connector create / refresh — these must work unauthenticated. */
const PUBLIC_MCP_METHODS = new Set([
  "initialize",
  "notifications/initialized",
  "ping",
  "tools/list",
  "server/discover",
]);

export type HubMcpHttpOptions = {
  serverInfo: { name: string; version: string };
  instructions: string;
  register: (server: McpServer) => void;
  resourcePath?: string;
};

function mcpMethodFromBody(parsedBody: unknown): string | undefined {
  if (
    parsedBody &&
    typeof parsedBody === "object" &&
    "method" in parsedBody &&
    typeof (parsedBody as { method: unknown }).method === "string"
  ) {
    return (parsedBody as { method: string }).method;
  }
  return undefined;
}

function hasModernEnvelope(parsedBody: unknown): boolean {
  if (!parsedBody || typeof parsedBody !== "object" || Array.isArray(parsedBody)) {
    return false;
  }
  const params = (parsedBody as { params?: unknown }).params;
  return Boolean(
    params &&
      typeof params === "object" &&
      !Array.isArray(params) &&
      "_meta" in (params as object)
  );
}

/**
 * ChatGPT sends MCP-Protocol-Version: 2026-07-28 without the modern `_meta`
 * envelope. The SDK then 400s tools/list (`modern-header-without-claim`) and
 * initialize (`initialize-with-modern-header`), so the connector shows as
 * connected with zero tools. Downgrade those requests to 2025 Streamable HTTP.
 */
function coerceChatGptLegacyBody(parsedBody: unknown): unknown {
  if (!parsedBody || typeof parsedBody !== "object" || Array.isArray(parsedBody)) {
    return parsedBody;
  }
  const body = parsedBody as {
    method?: string;
    params?: Record<string, unknown>;
  };
  if (body.method !== "initialize" || !body.params) return parsedBody;
  return {
    ...body,
    params: {
      ...body.params,
      protocolVersion: "2025-03-26",
    },
  };
}

function withLegacyProtocolHeader(request: Request): Request {
  const headers = new Headers(request.headers);
  const proto = headers.get("mcp-protocol-version");
  if (proto && proto !== "2025-03-26" && proto !== "2025-06-18") {
    headers.set("mcp-protocol-version", "2025-03-26");
  }
  return new Request(request.url, {
    method: request.method,
    headers,
    signal: request.signal,
  });
}

function allMethodsPublic(parsedBody: unknown): boolean {
  if (Array.isArray(parsedBody)) {
    return (
      parsedBody.length > 0 &&
      parsedBody.every((item) => {
        const method = mcpMethodFromBody(item);
        return Boolean(method && PUBLIC_MCP_METHODS.has(method));
      })
    );
  }
  const method = mcpMethodFromBody(parsedBody);
  return Boolean(method && PUBLIC_MCP_METHODS.has(method));
}

function isNullSchema(schema: unknown): boolean {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    return false;
  }
  return (schema as { type?: unknown }).type === "null";
}

/**
 * ChatGPT drops the whole connector tool list when any schema still has
 * `$schema`, `null` unions, or missing `additionalProperties: false`.
 */
function sanitizeToolSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) {
    return schema.map(sanitizeToolSchema);
  }
  if (!schema || typeof schema !== "object") return schema;

  const input = schema as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (key === "$schema" || key === "$id" || key === "unevaluatedProperties") {
      continue;
    }
    next[key] = sanitizeToolSchema(value);
  }

  if (Array.isArray(next.type)) {
    const types = next.type.filter((item) => item !== "null");
    next.type = types.length === 1 ? types[0] : types;
  }

  for (const unionKey of ["anyOf", "oneOf"] as const) {
    const union = next[unionKey];
    if (!Array.isArray(union)) continue;
    const filtered = union.filter((item) => !isNullSchema(item));
    if (filtered.length === 1) {
      const only = filtered[0];
      delete next[unionKey];
      if (only && typeof only === "object" && !Array.isArray(only)) {
        return sanitizeToolSchema({
          ...(only as Record<string, unknown>),
          ...next,
        });
      }
    } else {
      next[unionKey] = filtered;
    }
  }

  if (next.type === "object") {
    next.additionalProperties = false;
    if (!Array.isArray(next.required)) next.required = [];
  }

  return next;
}

async function sanitizeMcpResponse(
  response: Response,
  mcpMethod: string
): Promise<Response> {
  if (mcpMethod !== "tools/list" || !response.ok) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  try {
    const payload = await response.json();
    const tools = payload?.result?.tools;
    if (!Array.isArray(tools)) {
      return new Response(JSON.stringify(payload), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    }

    payload.result.tools = tools.map(
      (tool: { inputSchema?: unknown; outputSchema?: unknown }) => ({
        ...tool,
        inputSchema: sanitizeToolSchema(tool.inputSchema),
        ...(tool.outputSchema
          ? { outputSchema: sanitizeToolSchema(tool.outputSchema) }
          : {}),
      })
    );

    const headers = new Headers(response.headers);
    headers.set("Content-Type", "application/json");
    return new Response(JSON.stringify(payload), {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch {
    return response;
  }
}

function notConfigured(): Response {
  return new Response(
    JSON.stringify({
      error:
        "MCP is not configured. Set HUB_MCP_API_KEY on the Hub deployment.",
    }),
    { status: 503, headers: { "Content-Type": "application/json" } }
  );
}

async function verifyToken(
  _req: Request,
  bearerToken?: string
): Promise<AuthInfo | undefined> {
  const auth = verifyMcpAccessToken(bearerToken);
  if (!auth) return undefined;
  return {
    token: bearerToken!,
    scopes: auth.scope.split(/\s+/).filter(Boolean),
    clientId: auth.clientId,
  };
}

export function createHubMcpHttpHandler(options: HubMcpHttpOptions) {
  const resourcePath = options.resourcePath ?? "/api/mcp";

  function createHubMcpServer() {
    const server = new McpServer(options.serverInfo, {
      instructions: options.instructions,
    });
    options.register(server);
    return server;
  }

  async function handleLegacyMcp(
    request: Request,
    extra?: { authInfo?: AuthInfo; parsedBody?: unknown }
  ): Promise<Response> {
    if (request.method.toUpperCase() !== "POST") {
      return Response.json(
        {
          jsonrpc: "2.0",
          error: { code: -32000, message: "Method not allowed." },
          id: null,
        },
        { status: 405, headers: { Allow: "POST" } }
      );
    }

    const server = createHubMcpServer();
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    try {
      return await transport.handleRequest(request, {
        authInfo: extra?.authInfo,
        parsedBody: extra?.parsedBody,
      });
    } finally {
      await Promise.allSettled([transport.close(), server.close()]);
    }
  }

  const modernHandler = createMcpHandler(async () => createHubMcpServer(), {
    // Keep 2025-03-26 (and the other 2025 revisions) alongside 2026-07-28.
    // "reject" answers those handshakes with Unsupported protocol version.
    legacy: "stateless",
    responseMode: "json",
    onerror: (err) => {
      console.error("[mcp] sdk error", err);
    },
  });

  async function mcpCore(request: Request): Promise<Response> {
    const started = Date.now();
    let parsedBody: unknown;
    let mcpMethod = "(none)";

    if (
      request.method === "POST" &&
      (request.headers.get("content-type") || "").includes("application/json")
    ) {
      try {
        parsedBody = await request.clone().json();
        mcpMethod = mcpMethodFromBody(parsedBody) ?? "(unparseable)";
      } catch {
        mcpMethod = "(invalid-json)";
      }
    }

    console.info("[mcp] request", {
      resourcePath,
      httpMethod: request.method,
      mcpMethod,
      accept: request.headers.get("accept"),
      protocol: request.headers.get("mcp-protocol-version"),
      hasAuthorization: Boolean(request.headers.get("authorization")),
    });

    try {
      const authInfo = request.auth;
      const forceLegacy = !hasModernEnvelope(parsedBody);
      const body = forceLegacy
        ? coerceChatGptLegacyBody(parsedBody)
        : parsedBody;
      const transportRequest = forceLegacy
        ? withLegacyProtocolHeader(request)
        : request;

      const response = forceLegacy
        ? await handleLegacyMcp(transportRequest, {
            authInfo,
            parsedBody: body,
          })
        : await modernHandler.fetch(transportRequest, {
            authInfo,
            parsedBody: body,
          });

      const sanitized = await sanitizeMcpResponse(response, mcpMethod);

      console.info("[mcp] completed", {
        resourcePath,
        mcpMethod,
        legacy: forceLegacy,
        status: sanitized.status,
        contentType: sanitized.headers.get("content-type"),
        durationMs: Date.now() - started,
      });

      if (mcpMethod === "tools/list" && sanitized.ok) {
        try {
          const payload = await sanitized.clone().json();
          const tools = payload?.result?.tools;
          if (Array.isArray(tools)) {
            console.info("[mcp] tools/list names", {
              resourcePath,
              count: tools.length,
              names: tools.map((t: { name?: string }) => t.name),
            });
          }
        } catch {
          /* ignore parse failures */
        }
      }

      return sanitized;
    } catch (err) {
      console.error("[mcp] handler error", { resourcePath, mcpMethod, err });
      return new Response(
        JSON.stringify({
          error: "MCP handler failed",
          message: err instanceof Error ? err.message : "Unknown error",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  async function handleMcp(request: Request): Promise<Response> {
    if (!isMcpConfigured()) return withMcpCors(notConfigured(), request);

    let parsedBody: unknown;
    if (
      request.method === "POST" &&
      (request.headers.get("content-type") || "").includes("application/json")
    ) {
      try {
        parsedBody = await request.clone().json();
      } catch {
        parsedBody = undefined;
      }
    }

    const publicDiscovery =
      request.method === "POST" && allMethodsPublic(parsedBody);

    // ChatGPT often sends a Bearer token on tools/list. If that token fails
    // resource checks, withMcpAuth 401s and the connector shows zero tools.
    if (publicDiscovery) {
      return withMcpCors(await mcpCore(request), request);
    }

    const authHandler = withMcpAuth(mcpCore, verifyToken, {
      required: true,
      requiredScopes: ["mcp:tools"],
      resourceMetadataPath: "/.well-known/oauth-protected-resource",
      resourceUrl: getMcpResourceUrl(request, resourcePath),
    });

    try {
      return withMcpCors(await authHandler(request), request);
    } catch (err) {
      console.error("[mcp] auth/handler error", err);
      return withMcpCors(
        new Response(
          JSON.stringify({
            error: "MCP handler failed",
            message: err instanceof Error ? err.message : "Unknown error",
          }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        ),
        request
      );
    }
  }

  return {
    GET: handleMcp,
    POST: handleMcp,
    DELETE: handleMcp,
    OPTIONS: (request: Request) => mcpCorsPreflight(request),
  };
}
