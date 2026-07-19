-- A direct membership deletion must never remove the last active owner. When an
-- auth account itself is deleted, the FK cascade is a nested trigger operation;
-- allow that cleanup so an intentionally removed test/offboarded account does
-- not leave an orphaned auth identity behind.

create or replace function private.protect_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  remaining_owners integer;
  target_org uuid := old.organization_id;
begin
  if tg_op = 'UPDATE'
     and (new.organization_id is distinct from old.organization_id
          or new.user_id is distinct from old.user_id) then
    raise exception using errcode = '42501', message = 'Mitgliedsschlüssel dürfen nicht geändert werden.';
  end if;

  -- ON DELETE CASCADE from auth.users runs as a nested trigger. The account
  -- removal is authoritative; keep the direct membership guard below intact.
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;

  if old.role = 'owner' and old.status = 'active'
     and (tg_op = 'DELETE' or new.role <> 'owner' or new.status <> 'active') then
    perform pg_advisory_xact_lock(hashtextextended(target_org::text, 0));
    select count(*) into remaining_owners
    from public.organization_members m
    where m.organization_id = target_org
      and m.role = 'owner'
      and m.status = 'active'
      and m.user_id <> old.user_id;
    if remaining_owners = 0 then
      raise exception using errcode = '23514', message = 'Der letzte aktive Hauptadmin bleibt geschützt.';
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$$;

revoke all on function private.protect_owner_membership() from public, anon, authenticated;
