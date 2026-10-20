<?php
/**
 * Same-origin REST proxy → Marketing Hub.
 * Avoids browser CORS / Cookiebot blocking cross-origin fetch.
 */
if (!defined('ABSPATH')) {
    exit;
}

add_action('rest_api_init', static function () {
    register_rest_route('pm-website-chat/v1', '/hub/(?P<path>.+)', [
        'methods' => ['GET', 'POST', 'OPTIONS'],
        'callback' => 'pm_website_chat_proxy_hub',
        'permission_callback' => '__return_true',
        'args' => [
            'path' => [
                'required' => true,
                'type' => 'string',
            ],
        ],
    ]);
});

/**
 * @param WP_REST_Request $request
 * @return WP_REST_Response|WP_Error
 */
function pm_website_chat_proxy_hub($request) {
    $opts = pm_website_chat_get_options();
    $hub = isset($opts['hub_url']) ? untrailingslashit(trim((string) $opts['hub_url'])) : '';
    $site_key = isset($opts['site_key']) ? trim((string) $opts['site_key']) : '';

    if ($hub === '' || $site_key === '') {
        return new WP_Error(
            'pm_chat_not_configured',
            'PM Website Chat is not configured (Hub URL / site key).',
            ['status' => 503]
        );
    }

    $path = (string) $request['path'];
    $path = ltrim($path, '/');
    // Only allow Hub public chat session routes (no path traversal / admin).
    if (
        strpos($path, '..') !== false ||
        !preg_match(
            '#^api/chat/sessions(?:/[A-Za-z0-9_-]+(?:/(?:messages|lead|handoff))?)?$#',
            $path
        )
    ) {
        return new WP_Error('pm_chat_forbidden_path', 'Path not allowed.', ['status' => 403]);
    }

    // Hub URL must stay on Marketing Hub (misconfig / SSRF guard).
    $hub_host = wp_parse_url($hub, PHP_URL_HOST);
    $hub_scheme = wp_parse_url($hub, PHP_URL_SCHEME);
    $allowed_hosts = [
        'marketing.petersandmay.com',
        'marketinghub.vercel.app',
        'localhost',
        '127.0.0.1',
    ];
    if (
        $hub_scheme !== 'https' &&
        !($hub_scheme === 'http' && in_array($hub_host, ['localhost', '127.0.0.1'], true))
    ) {
        return new WP_Error(
            'pm_chat_bad_hub',
            'Hub URL must use HTTPS.',
            ['status' => 400]
        );
    }
    $host_ok = false;
    foreach ($allowed_hosts as $allowed) {
        if ($hub_host === $allowed) {
            $host_ok = true;
            break;
        }
    }
    if (
        !$host_ok &&
        is_string($hub_host) &&
        substr($hub_host, -strlen('.vercel.app')) === '.vercel.app'
    ) {
        $host_ok = true;
    }
    if (!$host_ok) {
        return new WP_Error(
            'pm_chat_bad_hub',
            'Hub URL host is not allowed.',
            ['status' => 400]
        );
    }

    $url = $hub . '/' . $path;
    $query = $request->get_query_params();
    unset($query['path']);
    if (!empty($query)) {
        $url = add_query_arg($query, $url);
    }

    $method = strtoupper($request->get_method());
    if ($method === 'OPTIONS') {
        return new WP_REST_Response(null, 204);
    }

    $args = [
        'method' => $method === 'GET' ? 'GET' : 'POST',
        'timeout' => 60,
        'headers' => [
            'Content-Type' => 'application/json',
            'X-Chat-Site-Key' => $site_key,
            'Accept' => '*/*',
        ],
        'sslverify' => true,
    ];

    if ($method !== 'GET') {
        $body = $request->get_body();
        if ($body === '' || $body === null) {
            $json = $request->get_json_params();
            $body = wp_json_encode(is_array($json) ? $json : new stdClass());
        }
        $args['body'] = $body;
    }

    $response = wp_remote_request($url, $args);
    if (is_wp_error($response)) {
        return new WP_Error(
            'pm_chat_hub_unreachable',
            $response->get_error_message(),
            ['status' => 502]
        );
    }

    $code = (int) wp_remote_retrieve_response_code($response);
    $raw = wp_remote_retrieve_body($response);
    $ctype = (string) wp_remote_retrieve_header($response, 'content-type');

    // Decode JSON so WP REST encodes once (avoids double-encoded string bodies).
    $data = $raw;
    if ($raw !== '' && stripos($ctype, 'application/json') !== false) {
        $decoded = json_decode($raw, true);
        if (json_last_error() === JSON_ERROR_NONE) {
            $data = $decoded;
        }
    }

    $out = new WP_REST_Response($data, $code > 0 ? $code : 502);

    $handoff = wp_remote_retrieve_header($response, 'x-chat-handoff');
    if ($handoff !== '' && $handoff !== null) {
        $out->header('X-Chat-Handoff', (string) $handoff);
    }
    $sources = wp_remote_retrieve_header($response, 'x-chat-sources');
    if ($sources !== '' && $sources !== null) {
        $out->header('X-Chat-Sources', (string) $sources);
    }

    return $out;
}
