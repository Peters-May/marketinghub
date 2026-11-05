import { describe, expect, it } from "vitest";
import {
  extractProposedActionsFromSteps,
  serializeHubAction,
  wrapHubCommandBlock,
  type HubAction,
} from "@/lib/ai/hub-actions";
import { parseHubCommand } from "@/lib/command/parse";

describe("hub-actions", () => {
  it("serializes PR content so the command parser accepts it", () => {
    const action: HubAction = {
      kind: "create_content",
      title: "Peters & May Bahri Shipment",
      content_type: "PR",
      asset_url:
        "https://example.supabase.co/storage/v1/object/public/attachments/hub-content/bahri.pdf",
    };
    const line = serializeHubAction(action);
    const parsed = parseHubCommand(line);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.command.kind !== "create_content") return;
    expect(parsed.command.content_type).toBe("PR");
    expect(parsed.command.channel).toEqual(["PR"]);
    expect(parsed.command.asset_url).toContain("bahri.pdf");
    expect(parsed.command.summary).not.toContain("LinkedIn");
  });

  it("serializes editorial content without LinkedIn", () => {
    const line = serializeHubAction({
      kind: "create_content",
      title: "Bahri Shipment",
      content_type: "Editorial",
      asset_url: "https://cdn.example.com/a.pdf",
    });
    const parsed = parseHubCommand(line);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.command.kind !== "create_content") return;
    expect(parsed.command.content_type).toBe("Editorial");
  });

  it("wraps structured actions into a hub-command fence", () => {
    const wrapped = wrapHubCommandBlock(
      "Add PR content Bahri with link https://cdn.example.com/a.pdf",
      "I will add the press release to Content."
    );
    expect(wrapped).toContain(":::hub-command");
    expect(wrapped).toContain("Add PR content Bahri");
  });

  it("extracts propose_hub_actions from generateText steps", () => {
    const actions = extractProposedActionsFromSteps([
      {
        toolCalls: [
          {
            toolName: "propose_hub_actions",
            input: {
              actions: [
                {
                  kind: "create_content",
                  title: "Bahri",
                  content_type: "PR",
                  asset_url: "https://cdn.example.com/a.pdf",
                },
              ],
            },
          },
        ],
      },
    ]);
    expect(actions).toHaveLength(1);
    expect(actions[0].kind).toBe("create_content");
  });
});
