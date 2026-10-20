-- Company attendance gate, operational checklist, and hotel booking fields
-- on the hub events mirror. Runtime edits still live in hub_store.

alter table public.events
  add column if not exists pm_attending boolean not null default false,
  add column if not exists accommodation_arranged boolean not null default false,
  add column if not exists costs_collected boolean not null default false,
  add column if not exists stand_or_passes_booked boolean not null default false,
  add column if not exists press_kit_ready boolean not null default false,
  add column if not exists hotel_name text not null default '',
  add column if not exists hotel_confirmation text not null default '',
  add column if not exists hotel_check_in date,
  add column if not exists hotel_check_out date,
  add column if not exists hotel_guests text not null default '',
  add column if not exists hotel_cost_estimate text not null default '',
  add column if not exists hotel_booking_url text not null default '',
  add column if not exists hotel_notes text not null default '';
