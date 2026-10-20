<?php
if (!defined('ABSPATH')) {
    exit;
}

function pm_website_chat_path_excluded($exclude_raw) {
    $path = isset($_SERVER['REQUEST_URI']) ? (string) wp_parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) : '/';
    $lines = preg_split('/\r\n|\r|\n/', (string) $exclude_raw) ?: [];
    foreach ($lines as $line) {
        $prefix = trim($line);
        if ($prefix === '') {
            continue;
        }
        if (strpos($path, $prefix) === 0) {
            return true;
        }
    }
    return false;
}

add_action('wp_enqueue_scripts', static function () {
    if (is_admin()) {
        return;
    }

    $opts = pm_website_chat_get_options();
    if (empty($opts['enabled']) || empty($opts['hub_url']) || empty($opts['site_key'])) {
        return;
    }
    if (pm_website_chat_path_excluded($opts['exclude_paths'])) {
        return;
    }

    $handle = 'pm-website-chat';
    wp_enqueue_style(
        $handle,
        PM_WEBSITE_CHAT_PLUGIN_URL . 'assets/chat.css',
        [],
        PM_WEBSITE_CHAT_VERSION
    );
    wp_enqueue_script(
        $handle,
        PM_WEBSITE_CHAT_PLUGIN_URL . 'assets/chat.js',
        [],
        PM_WEBSITE_CHAT_VERSION,
        true
    );

    $utm = [];
    foreach (['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as $key) {
        if (isset($_GET[$key]) && is_string($_GET[$key])) {
            $utm[$key] = sanitize_text_field(wp_unslash($_GET[$key]));
        }
    }

    wp_localize_script($handle, 'PMWebsiteChat', [
        // Browser talks to WordPress; WP proxies to Hub (avoids CORS / Cookiebot).
        'apiBase' => esc_url_raw(rest_url('pm-website-chat/v1/hub')),
        'hubUrl' => untrailingslashit($opts['hub_url']),
        'siteKey' => $opts['site_key'],
        'greeting' => $opts['greeting'],
        'position' => $opts['position'],
        'pageUrl' => home_url(add_query_arg([])),
        'pageTitle' => wp_get_document_title(),
        'referrer' => isset($_SERVER['HTTP_REFERER'])
            ? esc_url_raw(wp_unslash($_SERVER['HTTP_REFERER']))
            : '',
        'utm' => $utm,
        'labels' => [
            'title' => 'Peters & May',
            'subtitle' => 'Ask a question or get a quote',
            'placeholder' => 'Message…',
            'speak' => 'Speak to the team',
            'send' => 'Send',
            'email' => 'Business email',
            'name' => 'Name',
            'company' => 'Company',
            'close' => 'Close',
            'minimize' => 'Minimise',
            'closeConfirm' =>
                "Would you like to close the chat?\n\nThis ends the chat.",
            'open' => 'Chat',
            'botSender' => 'Your P&M friendly assistant',
        ],
    ]);
});
