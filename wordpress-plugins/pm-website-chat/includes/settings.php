<?php
if (!defined('ABSPATH')) {
    exit;
}

function pm_website_chat_default_options() {
    return [
        'enabled' => 0,
        'hub_url' => 'https://marketing.petersandmay.com',
        'site_key' => '',
        'greeting' => '',
        'exclude_paths' => '',
        'position' => 'bottom-right',
    ];
}

function pm_website_chat_get_options() {
    $opts = get_option('pm_website_chat_options', []);
    if (!is_array($opts)) {
        $opts = [];
    }
    return array_merge(pm_website_chat_default_options(), $opts);
}

function pm_website_chat_register_settings() {
    register_setting(
        'pm_website_chat',
        'pm_website_chat_options',
        [
            'type' => 'array',
            'sanitize_callback' => 'pm_website_chat_sanitize_options',
            'default' => pm_website_chat_default_options(),
        ]
    );
}

function pm_website_chat_sanitize_options($input) {
    $defaults = pm_website_chat_default_options();
    $out = $defaults;
    if (!is_array($input)) {
        return $out;
    }
    $out['enabled'] = empty($input['enabled']) ? 0 : 1;
    $hub = isset($input['hub_url']) ? esc_url_raw(trim((string) $input['hub_url'])) : '';
    $out['hub_url'] = $hub !== '' ? untrailingslashit($hub) : $defaults['hub_url'];
    $out['site_key'] = isset($input['site_key'])
        ? sanitize_text_field((string) $input['site_key'])
        : '';
    $out['greeting'] = isset($input['greeting'])
        ? sanitize_text_field((string) $input['greeting'])
        : '';
    $out['exclude_paths'] = isset($input['exclude_paths'])
        ? sanitize_textarea_field((string) $input['exclude_paths'])
        : '';
    $pos = isset($input['position']) ? sanitize_text_field((string) $input['position']) : 'bottom-right';
    $out['position'] = in_array($pos, ['bottom-right', 'bottom-left'], true)
        ? $pos
        : 'bottom-right';
    return $out;
}

function pm_website_chat_render_settings_page() {
    if (!current_user_can('manage_options')) {
        return;
    }
    $opts = pm_website_chat_get_options();
    ?>
    <div class="wrap">
      <h1><?php echo esc_html__('PM Website Chat', 'pm-website-chat'); ?></h1>
      <p><?php echo esc_html__('Connects to Marketing Hub for AI answers, staff inbox, and enquiry leads. Do not put OpenAI keys here.', 'pm-website-chat'); ?></p>
      <form method="post" action="options.php">
        <?php settings_fields('pm_website_chat'); ?>
        <table class="form-table" role="presentation">
          <tr>
            <th scope="row"><?php echo esc_html__('Enable widget', 'pm-website-chat'); ?></th>
            <td>
              <label>
                <input type="checkbox" name="pm_website_chat_options[enabled]" value="1" <?php checked($opts['enabled'], 1); ?> />
                <?php echo esc_html__('Show chat on the public site', 'pm-website-chat'); ?>
              </label>
            </td>
          </tr>
          <tr>
            <th scope="row"><label for="pm_chat_hub_url"><?php echo esc_html__('Hub base URL', 'pm-website-chat'); ?></label></th>
            <td>
              <input class="regular-text" type="url" id="pm_chat_hub_url" name="pm_website_chat_options[hub_url]" value="<?php echo esc_attr($opts['hub_url']); ?>" />
            </td>
          </tr>
          <tr>
            <th scope="row"><label for="pm_chat_site_key"><?php echo esc_html__('Site key', 'pm-website-chat'); ?></label></th>
            <td>
              <input class="regular-text" type="text" id="pm_chat_site_key" name="pm_website_chat_options[site_key]" value="<?php echo esc_attr($opts['site_key']); ?>" autocomplete="off" />
              <p class="description"><?php echo esc_html__('Must match CHAT_SITE_KEY on Marketing Hub (Vercel). Not the enquiry webhook secret.', 'pm-website-chat'); ?></p>
            </td>
          </tr>
          <tr>
            <th scope="row"><label for="pm_chat_greeting"><?php echo esc_html__('Greeting override', 'pm-website-chat'); ?></label></th>
            <td>
              <input class="regular-text" type="text" id="pm_chat_greeting" name="pm_website_chat_options[greeting]" value="<?php echo esc_attr($opts['greeting']); ?>" />
              <p class="description"><?php echo esc_html__('Optional. Leave blank to use the Hub greeting.', 'pm-website-chat'); ?></p>
            </td>
          </tr>
          <tr>
            <th scope="row"><label for="pm_chat_exclude"><?php echo esc_html__('Exclude path prefixes', 'pm-website-chat'); ?></label></th>
            <td>
              <textarea class="large-text" rows="3" id="pm_chat_exclude" name="pm_website_chat_options[exclude_paths]"><?php echo esc_textarea($opts['exclude_paths']); ?></textarea>
              <p class="description"><?php echo esc_html__('One path per line, e.g. /wp-admin', 'pm-website-chat'); ?></p>
            </td>
          </tr>
          <tr>
            <th scope="row"><?php echo esc_html__('Position', 'pm-website-chat'); ?></th>
            <td>
              <select name="pm_website_chat_options[position]">
                <option value="bottom-right" <?php selected($opts['position'], 'bottom-right'); ?>><?php echo esc_html__('Bottom right', 'pm-website-chat'); ?></option>
                <option value="bottom-left" <?php selected($opts['position'], 'bottom-left'); ?>><?php echo esc_html__('Bottom left', 'pm-website-chat'); ?></option>
              </select>
            </td>
          </tr>
        </table>
        <?php submit_button(); ?>
      </form>
      <hr />
      <h2><?php echo esc_html__('Before go-live', 'pm-website-chat'); ?></h2>
      <ol>
        <li><?php echo esc_html__('In Hub → Website chat → Deploy, turn on live answers.', 'pm-website-chat'); ?></li>
        <li><?php echo esc_html__('Disable HubSpot chat / tracking chat widget on this site so only PM Website Chat appears.', 'pm-website-chat'); ?></li>
        <li><?php echo esc_html__('Smoke-test: ask a question, Speak to the team with email, confirm lead in Hub Enquiries.', 'pm-website-chat'); ?></li>
      </ol>
    </div>
    <?php
}
