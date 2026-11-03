-- Hub PR module collections live in hub_store.payload JSON (not separate tables):
-- media_lists, pr_pitches, pr_coverage, pr_coverage_reports, pr_monitor_queries, pr_monitor_mentions
-- Contact press fields: is_press, beat, outlet, country, preferred_topics, last_contacted_at
-- Public newsroom is served at /newsroom from published PR content.
-- Coverage books share at /share/coverage/{token}.
-- Optional: set NEWS_API_KEY for automated media monitoring via NewsAPI.

select 1;
