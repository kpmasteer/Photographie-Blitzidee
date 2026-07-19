-- Safe first-account onboarding for the single pre-provisioned organisation.
-- The organisation itself remains unique and cannot be created by the client.

create or replace function public.claim_first_owner(p_display_name text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_org uuid;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'Eine gültige Anmeldung ist erforderlich.';
  end if;

  target_org := private.provision_first_owner((select auth.uid()), p_display_name);

  insert into public.company_settings (organization_id, data, created_by, updated_by)
  values (target_org, '{}'::jsonb, (select auth.uid()), (select auth.uid()))
  on conflict (organization_id) do nothing;

  return target_org;
end
$$;

revoke all on function public.claim_first_owner(text) from public, anon;
grant execute on function public.claim_first_owner(text) to authenticated;
