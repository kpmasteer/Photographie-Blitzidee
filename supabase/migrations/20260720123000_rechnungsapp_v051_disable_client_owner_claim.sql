-- Organization ownership is provisioned by an administrator. Never let a
-- browser client promote its own authenticated account to owner.

revoke execute on function public.claim_first_owner(text)
  from public, anon, authenticated;
grant execute on function public.claim_first_owner(text) to service_role;

revoke execute on function private.provision_first_owner(uuid, text)
  from public, anon, authenticated;
grant execute on function private.provision_first_owner(uuid, text) to service_role;
