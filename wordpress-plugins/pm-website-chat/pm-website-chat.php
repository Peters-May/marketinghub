<?php
/**
 * Plugin Name: PM Website Chat
 * Plugin URI: https://marketing.petersandmay.com/app/chat
 * Description: Peters and May website chatbot. Connects to Marketing Hub for AI answers, staff inbox, and enquiry leads.
 * Version: 1.0.1
 * Requires at least: 5.8
 * Requires PHP: 7.4
 * Author: Peters and May Marketing
 * Text Domain: pm-website-chat
 */

if (!defined('ABSPATH')) {
    exit;
}

define('PM_WEBSITE_CHAT_VERSION', '1.0.1');
define('PM_WEBSITE_CHAT_PLUGIN_FILE', __FILE__);
define('PM_WEBSITE_CHAT_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('PM_WEBSITE_CHAT_PLUGIN_URL', plugin_dir_url(__FILE__));

$pm_website_chat_includes = PM_WEBSITE_CHAT_PLUGIN_DIR . 'includes/';
if (!is_readable($pm_website_chat_includes . 'settings.php') || !is_readable($pm_website_chat_includes . 'enqueue.php')) {
    add_action('admin_notices', static function () {
        echo '<div class="notice notice-error"><p>PM Website Chat is missing include files. Re-upload the plugin zip.</p></div>';
    });
    return;
}

require_once $pm_website_chat_includes . 'settings.php';
require_once $pm_website_chat_includes . 'enqueue.php';

add_action('plugins_loaded', static function () {
    pm_website_chat_register_settings();
});

add_action('admin_menu', static function () {
    add_options_page(
        'PM Website Chat',
        'PM Website Chat',
        'manage_options',
        'pm-website-chat',
        'pm_website_chat_render_settings_page'
    );
});

add_shortcode('pm_chat', static function () {
    return '<div id="pm-website-chat-inline" data-pm-chat-inline="1"></div>';
});
