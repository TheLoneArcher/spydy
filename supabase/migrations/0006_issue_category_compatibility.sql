begin;

do $$
begin
  if not exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'issue_category'
      and e.enumlabel = 'water_leak'
  ) then
    alter type public.issue_category add value 'water_leak';
  end if;
end
$$;

create unique index if not exists reports_seed_key_unique_idx
  on public.reports (seed_key)
  where seed_key is not null;
create unique index if not exists tasks_report_id_unique_idx
  on public.tasks (report_id);
create unique index if not exists report_votes_report_user_unique_idx
  on public.report_votes (report_id, user_id);
create unique index if not exists skills_slug_unique_idx
  on public.skills (slug);
create unique index if not exists volunteer_applications_user_unique_idx
  on public.volunteer_applications (user_id);
create unique index if not exists volunteer_profiles_user_unique_idx
  on public.volunteer_profiles (user_id);

commit;