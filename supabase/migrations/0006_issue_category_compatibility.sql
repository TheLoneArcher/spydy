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

commit;