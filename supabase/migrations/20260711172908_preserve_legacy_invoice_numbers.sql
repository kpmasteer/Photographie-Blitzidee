create or replace function private.import_historical_invoice_impl(
  p_invoice uuid,
  p_invoice_number text,
  p_status text,
  p_finalized_at timestamptz,
  p_paid_at date
)
returns public.invoices
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.invoices;
  numeric_number bigint;
begin
  select * into inv from public.invoices where id = p_invoice for update;
  if inv.id is null or not private.is_org_admin(inv.organization_id) then
    raise exception using errcode = '42501', message = 'Nur Owner oder Admin dürfen historische Rechnungen übernehmen.';
  end if;
  if not inv.imported or inv.status <> 'draft' or inv.invoice_number is not null then
    raise exception 'Historische Übernahme ist nur für einen neuen Entwurf zulässig.';
  end if;
  if btrim(coalesce(p_invoice_number, '')) = '' then raise exception 'Historische Rechnungsnummer fehlt.'; end if;
  if p_status not in ('finalized','sent','partially_paid','paid','overdue','cancelled') then
    raise exception 'Ungültiger historischer Rechnungsstatus.';
  end if;

  perform private.validate_invoice(p_invoice);
  perform set_config('blitzidee.invoice_action', 'import:' || p_invoice::text, true);
  update public.invoices
  set invoice_number = btrim(p_invoice_number),
      status = p_status,
      finalized_at = coalesce(p_finalized_at, now()),
      paid_at = p_paid_at,
      cancelled_at = case when p_status = 'cancelled' then coalesce(p_finalized_at, now()) else null end
  where id = p_invoice
  returning * into inv;

  if p_invoice_number ~ '^[0-9]+$' then
    numeric_number := p_invoice_number::bigint;
    insert into public.number_sequences
      (organization_id, sequence_type, year, next_value, prefix, digits)
    values
      (inv.organization_id, 'invoice', inv.year, numeric_number + 1, '', greatest(length(p_invoice_number), 5))
    on conflict (organization_id, sequence_type, year)
    do update set next_value = greatest(public.number_sequences.next_value, excluded.next_value);
  end if;

  insert into public.audit_log
    (organization_id, action, record_type, record_id, after_data, actor_id)
  values
    (inv.organization_id, 'import_historical', 'invoice', inv.id, to_jsonb(inv), (select auth.uid()));
  return inv;
end
$$;
revoke all on function private.import_historical_invoice_impl(uuid,text,text,timestamptz,date) from public, anon;
grant execute on function private.import_historical_invoice_impl(uuid,text,text,timestamptz,date) to authenticated;
