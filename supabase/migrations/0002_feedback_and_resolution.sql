begin;

create table public.report_votes (
  report_id uuid not null references public.reports (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (report_id, user_id)
);

create table public.resolution_confirmations (
  report_id uuid not null references public.reports (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  agrees boolean not null,
  image_path text,
  created_at timestamptz not null default now(),
  primary key (report_id, user_id)
);

alter table public.report_votes enable row level security;
alter table public.resolution_confirmations enable row level security;

grant select, insert, update, delete on public.report_votes to authenticated;
grant select, insert, update on public.resolution_confirmations to authenticated;

create policy report_votes_select on public.report_votes for select to authenticated
using (true);
create policy report_votes_write_own on public.report_votes for all to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy confirmations_select on public.resolution_confirmations for select to authenticated
using (
  user_id = (select auth.uid())
  or exists (select 1 from public.reports r where r.id = report_id and r.reporter_id = (select auth.uid()))
  or public.auth_role() = 'dispatcher'
);
create policy confirmations_write_own on public.resolution_confirmations for insert to authenticated
with check (user_id = (select auth.uid()));
create policy confirmations_update_own on public.resolution_confirmations for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create or replace function public.vote_report(p_report uuid, p_value smallint)
returns table (upvotes bigint, downvotes bigint)
language plpgsql security invoker set search_path = public as $$
begin
  if p_value not in (-1, 1) then
    raise exception 'vote must be -1 or 1' using errcode = '22023';
  end if;

  insert into public.report_votes (report_id, user_id, value)
  values (p_report, auth.uid(), p_value)
  on conflict (report_id, user_id) do update
    set value = excluded.value, updated_at = now();

  return query
    select count(*) filter (where value = 1), count(*) filter (where value = -1)
    from public.report_votes
    where report_id = p_report;
end $$;

create or replace function public.confirm_report_resolution(
  p_report uuid, p_agrees boolean, p_image_path text default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.reports
    where id = p_report and reporter_id = auth.uid() and status = 'resolved'
  ) then
    raise exception 'only the reporter can confirm a resolved report' using errcode = '42501';
  end if;

  insert into public.resolution_confirmations (report_id, user_id, agrees, image_path)
  values (p_report, auth.uid(), p_agrees, p_image_path)
  on conflict (report_id, user_id) do update
    set agrees = excluded.agrees, image_path = excluded.image_path;

  if not p_agrees then
    update public.reports set status = 'pending' where id = p_report and status = 'resolved';
  elsif p_agrees then
    update public.reports set status = 'closed' where id = p_report and status = 'resolved';
  end if;
end $$;

revoke all on function public.vote_report, public.confirm_report_resolution from public, anon;
grant execute on function public.vote_report, public.confirm_report_resolution to authenticated;

commit;
