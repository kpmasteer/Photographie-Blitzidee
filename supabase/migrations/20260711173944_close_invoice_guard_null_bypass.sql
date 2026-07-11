-- Close a PostgreSQL three-valued-logic edge case in the immutable invoice
-- guards. A missing custom setting returns NULL; NULL NOT IN (...) is also
-- NULL and therefore cannot be used as a deny decision.

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

create or replace function private.protect_invoice_item()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target_invoice uuid := case when tg_op = 'DELETE' then old.invoice_id else new.invoice_id end;
  invoice_status text;
  action_guard text := coalesce(current_setting('blitzidee.invoice_action', true), '');
begin
  select status into invoice_status from public.invoices where id = target_invoice;
  if invoice_status is null then raise exception 'Die zugehörige Rechnung fehlt.'; end if;
  if invoice_status <> 'draft'
     and action_guard not in ('import:' || target_invoice::text, 'cancel:' || target_invoice::text) then
    raise exception using errcode = '42501', message = 'Positionen einer finalisierten Rechnung sind unveränderlich.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$$;
