<?php
/**
 * Plugin Name: PM Website Chat
 * Description: Peters & May website chatbot — connects to Marketing Hub (AI, inbox, enquiries).
 * Version: 1.0.0
 * Author: Peters & May Marketing
 * Text Domain: pm-website-chat
 */

if (!defined('ABSPATH')) {
    exit;
}

define('PM_WEBSITE_CHAT_VERSION', '1.0.0');
define('PM_WEBSITE_CHAT_PLUGIN_FILE', __FILE__);
define('PM_WEBSITE_CHAT_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('PM_WEBSITE_CHAT_PLUGIN_URL', plugin_dir_url(__FILE__));

require_once PM_WEBSITE_CHAT_PLUGIN_DIR . 'includes/settings.php';
require_once PM_WEBSITE_CHAT_PLUGIN_DIR . 'includes/enqueue.php';

add_action('plugins_loaded', static function () {
    pm_website_chat_register_settings();
});

add_action('admin_menu', static function () {
    add_options_page(
        __('PM Website Chat', 'pm-website-chat'),
        __('PM Website Chat', 'pm-website-chat'),
        'manage_options',
        'pm-website-chat',
        'pm_website_chat_render_settings_page'
    );
});

add_shortcode('pm_chat', static function () {
    return '<div id="pm-website-chat-inline" data-pm-chat-inline="1"></div>';
});
