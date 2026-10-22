-- Hotel booking checklist flag, and per-item N/A marks.
-- Runtime edits still live in hub_store. N/A keys are left out of the count.

alter table public.events
  add column if not exists hotel_booked boolean not null default false,
  add column if not exists attendance_checklist_na jsonb not null default '{}'::jsonb;
