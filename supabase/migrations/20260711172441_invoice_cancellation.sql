create or replace function private.cancel_invoice_impl(
  p_original uuid,
  p_correction uuid
)
returns public.invoices
language plpgsql
security definer
set search_path = ''
as $$
declare
  original public.invoices;
  correction public.invoices;
begin
  perform 1
  from public.invoices
  where id in (p_original, p_correction)
  order by id
  for update;

  select * into original from public.invoices where id = p_original;
  select * into correction from public.invoices where id = p_correction;

  if original.id is null or correction.id is null
     or original.organization_id <> correction.organization_id
     or not private.is_org_member(original.organization_id, true) then
    raise exception using errcode = '42501', message = 'Keine Berechtigung für diese Stornierung.';
  end if;
  if original.status in ('draft','cancelled') or original.invoice_number is null then
    raise exception 'Nur eine bestehende, nicht stornierte Rechnung kann korrigiert werden.';
  end if;
  if correction.status <> 'draft'
     or correction.cancelled_invoice_id is distinct from original.id
     or correction.total_cents <> -original.total_cents then
    raise exception 'Die Stornorechnung ist nicht vollständig mit der Ursprungsrechnung verknüpft.';
  end if;

  correction := private.finalize_invoice_impl(p_correction);

  perform set_config('blitzidee.invoice_action', 'cancel:' || p_original::text, true);
  update public.invoices
  set status = 'cancelled',
      cancelled_at = now(),
      correction_invoice_id = correction.id
  where id = p_original;

  insert into public.audit_log
    (organization_id, action, record_type, record_id, before_data, after_data, actor_id)
  values
    (
      original.organization_id,
      'cancel',
      'invoice',
      original.id,
      to_jsonb(original),
      jsonb_build_object('correction_invoice_id', correction.id),
      (select auth.uid())
    );
  return correction;
end
$$;
revoke all on function private.cancel_invoice_impl(uuid,uuid) from public, anon;
grant execute on function private.cancel_invoice_impl(uuid,uuid) to authenticated;

create or replace function public.cancel_invoice(
  p_original uuid,
  p_correction uuid
)
returns public.invoices
language sql
security invoker
set search_path = ''
as $$
  select private.cancel_invoice_impl(p_original, p_correction)
$$;
revoke all on function public.cancel_invoice(uuid,uuid) from public, anon;
grant execute on function public.cancel_invoice(uuid,uuid) to authenticated;
