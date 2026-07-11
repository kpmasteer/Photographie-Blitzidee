-- Align server validation with editable local drafts and close migration and
-- operational-metadata gaps found during the release security review.

alter table public.invoice_items
  drop constraint if exists invoice_items_description_check,
  drop constraint if exists invoice_items_quantity_check;

create or replace function private.protect_invoice_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  action_guard text := coalesce(current_setting('blitzidee.invoice_action', true), '');
  expected_finalize text := 'finalize:' || old.id::text;
  expected_import text := 'import:' || old.id::text;
  expected_cancel text := 'cancel:' || old.id::text;
  old_content jsonb;
  new_content jsonb;
begin
  if old.status = 'draft' then
    if (
      new.status <> 'draft'
      or new.invoice_number is distinct from old.invoice_number
      or new.finalized_at is distinct from old.finalized_at
    ) and action_guard not in (expected_finalize, expected_import, expected_cancel) then
      raise exception using
        errcode = '42501',
        message = 'Rechnungen dürfen nur über die serverseitige Finalisierung endgültig werden.';
    end if;
    return new;
  end if;

  if action_guard in (expected_import, expected_cancel) then return new; end if;
  if old.status = 'cancelled' and new.status <> 'cancelled' then
    raise exception using errcode = '42501', message = 'Eine stornierte Rechnung ist unveränderlich.';
  end if;
  if new.status = 'draft' or new.status = 'cancelled' then
    raise exception using errcode = '42501', message = 'Dieser Statuswechsel benötigt eine serverseitige Korrekturfunktion.';
  end if;
  if new.content_hash is distinct from old.content_hash
     and not (old.content_hash is null and new.content_hash is not null) then
    raise exception using errcode = '42501', message = 'Der Dokument-Hash darf nicht überschrieben werden.';
  end if;

  old_content := to_jsonb(old) - array[
    'status','paid_at','payment_method','sent_at','payment_reminder_at',
    'payment_reminder_last_shown_at','payment_reminder_completed_at',
    'content_hash','updated_at','updated_by','version'
  ];
  new_content := to_jsonb(new) - array[
    'status','paid_at','payment_method','sent_at','payment_reminder_at',
    'payment_reminder_last_shown_at','payment_reminder_completed_at',
    'content_hash','updated_at','updated_by','version'
  ];
  if old_content is distinct from new_content then
    raise exception using errcode = '42501', message = 'Der Inhalt einer finalisierten Rechnung ist unveränderlich.';
  end if;
  return new;
end
$$;

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
    raise exception 'Historische Übernahme ist nur für einen ausdrücklich importierten neuen Entwurf zulässig.';
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
