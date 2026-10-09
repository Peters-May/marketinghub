-- Yacht transport fields on the hub events mirror.
-- Runtime edits still live in the hub store. These columns let the mirror keep the same fields.

alter table public.events
  add column if not exists transport_relevant boolean not null default false,
  add column if not exists show_in_transport_planner boolean not null default false,
  add column if not exists planner_category text not null default '',
  add column if not exists recommended_arrival_start date,
  add column if not exists recommended_arrival_end date,
  add column if not exists transport_destination_region text not null default '',
  add column if not exists transport_destination_port text not null default '',
  add column if not exists transport_origin_regions text[] not null default '{}',
  add column if not exists planner_priority text not null default 'standard',
  add column if not exists date_status text not null default 'confirmed',
  add column if not exists recurring_event boolean not null default false,
  add column if not exists event_series_id text not null default '',
  add column if not exists planner_slug text not null default '',
  add column if not exists pm_attendance text not null default '';
