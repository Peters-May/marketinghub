-- Submission deadline for award entries (when the entry must be submitted).
alter table public.award_entries
  add column if not exists submission_deadline date;
