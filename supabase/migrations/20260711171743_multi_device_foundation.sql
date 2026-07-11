create extension if not exists pgcrypto;
create schema if not exists private;

create type public.member_role as enum ('owner','admin','member','read_only');
create type public.member_status as enum ('active','invited','disabled');

create table public.profiles (id uuid primary key references auth.users(id) on delete cascade, display_name text, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.organizations (id uuid primary key default gen_random_uuid(), name text not null, owner_name text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz);
create table public.organization_members (organization_id uuid not null references public.organizations(id) on delete cascade, user_id uuid not null references auth.users(id) on delete cascade, role public.member_role not null default 'member', status public.member_status not null default 'active', created_at timestamptz not null default now(), primary key (organization_id,user_id));

create function private.is_org_member(p_org uuid, p_write boolean default false) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.organization_members m where m.organization_id=p_org and m.user_id=(select auth.uid()) and m.status='active' and (not p_write or m.role in ('owner','admin','member')))
$$;
create function private.is_org_admin(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.organization_members m where m.organization_id=p_org and m.user_id=(select auth.uid()) and m.status='active' and m.role in ('owner','admin'))
$$;
revoke all on function private.is_org_member(uuid,boolean), private.is_org_admin(uuid) from public;
grant execute on function private.is_org_member(uuid,boolean), private.is_org_admin(uuid) to authenticated;

create table public.company_settings (organization_id uuid primary key references public.organizations(id) on delete cascade, data jsonb not null default '{}', created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users, updated_by uuid references auth.users, version bigint not null default 1);
create table public.customers (id uuid primary key, organization_id uuid not null references public.organizations, customer_number text not null, salutation text, first_name text not null default '', last_name text not null default '', company text, street text not null default '', postal_code text not null default '', city text not null default '', country text not null default 'Deutschland', email text, phone text, notes text, archived boolean not null default false, import_fingerprint text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users, updated_by uuid references auth.users, version bigint not null default 1, deleted_at timestamptz, unique(organization_id,customer_number));
create table public.invoices (id uuid primary key, organization_id uuid not null references public.organizations, customer_id uuid references public.customers, draft_number text not null, invoice_number text, year integer not null, status text not null, customer_snapshot jsonb, company_snapshot jsonb, invoice_date date not null, service_date_from date not null, service_date_to date, payment_term_days integer not null default 14, due_date date not null, subtotal_cents bigint not null default 0, discount_type text, discount_value bigint, discount_cents bigint not null default 0, total_cents bigint not null default 0, paid_at date, intro_text text not null default '', outro_text text not null default '', tax_exemption_note text not null default '', notes text, finalized_at timestamptz, cancelled_at timestamptz, cancelled_invoice_id uuid references public.invoices, content_hash text, imported boolean not null default false, import_source text, import_fingerprint text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users, updated_by uuid references auth.users, version bigint not null default 1, deleted_at timestamptz, unique(organization_id,invoice_number));
create table public.invoice_items (id uuid primary key, organization_id uuid not null references public.organizations, invoice_id uuid not null references public.invoices on delete cascade, description text not null, details text, quantity_milli bigint not null, unit text not null default '', unit_price_cents bigint not null, discount_type text, discount_value bigint, discount_cents bigint not null default 0, subtotal_cents bigint not null, total_cents bigint not null, sort_order integer not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users, updated_by uuid references auth.users, version bigint not null default 1, deleted_at timestamptz);
create table public.payments (id uuid primary key, organization_id uuid not null references public.organizations, invoice_id uuid not null references public.invoices, amount_cents bigint not null check(amount_cents>0), paid_at date not null, method text not null, note text, import_fingerprint text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users, updated_by uuid references auth.users, version bigint not null default 1, deleted_at timestamptz);
create table public.expenses (id uuid primary key, organization_id uuid not null references public.organizations, data jsonb not null, paid_at date not null, total_cents bigint not null, deductible_cents bigint not null, supplier text not null, category text not null, import_fingerprint text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users, updated_by uuid references auth.users, version bigint not null default 1, deleted_at timestamptz);
create table public.recurring_expenses (id uuid primary key, organization_id uuid not null references public.organizations, data jsonb not null, status text not null, next_due_date date, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users, updated_by uuid references auth.users, version bigint not null default 1, deleted_at timestamptz);
create table public.description_templates (id uuid primary key, organization_id uuid not null references public.organizations, title text not null, description text not null, category text, sort_order integer not null default 0, archived boolean not null default false, usage_count integer not null default 0, source_fingerprint text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users, updated_by uuid references auth.users, version bigint not null default 1, deleted_at timestamptz);
create table public.number_sequences (organization_id uuid not null references public.organizations, sequence_type text not null, year integer not null, next_value bigint not null default 1, prefix text not null default '', digits integer not null default 5, primary key(organization_id,sequence_type,year));
create table public.sync_changes (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations, entity_type text not null, entity_id uuid not null, action text not null, version bigint not null, source text not null, changed_at timestamptz not null default now(), changed_by uuid references auth.users);
create table public.audit_log (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations, action text not null, record_type text not null, record_id uuid, before_data jsonb, after_data jsonb, actor_id uuid references auth.users, created_at timestamptz not null default now());
create table public.import_batches (id uuid primary key, organization_id uuid not null references public.organizations, source_name text not null, source_fingerprint text not null, status text not null, progress jsonb not null default '{}', created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid references auth.users, unique(organization_id,source_fingerprint));
create table public.attachments (id uuid primary key, organization_id uuid not null references public.organizations, owner_type text not null, owner_id uuid not null, bucket text not null, object_path text not null, filename text not null, content_type text not null, size_bytes bigint not null check(size_bytes between 1 and 15728640), created_at timestamptz not null default now(), created_by uuid references auth.users, deleted_at timestamptz, unique(bucket,object_path));

create index customers_org_updated on public.customers(organization_id,updated_at);
create index invoices_org_updated on public.invoices(organization_id,updated_at);
create index invoice_items_invoice_order on public.invoice_items(invoice_id,sort_order);
create index payments_invoice on public.payments(invoice_id,paid_at);
create index expenses_org_paid on public.expenses(organization_id,paid_at);
create index sync_changes_org_time on public.sync_changes(organization_id,changed_at);

create function private.bump_version() returns trigger language plpgsql set search_path='' as $$ begin new.updated_at=now(); new.updated_by=(select auth.uid()); new.version=old.version+1; return new; end $$;
do $$ declare t text; begin foreach t in array array['company_settings','customers','invoices','invoice_items','payments','expenses','recurring_expenses','description_templates'] loop execute format('create trigger bump_%I before update on public.%I for each row execute function private.bump_version()',t,t); end loop; end $$;

create function private.finalize_invoice_impl(p_invoice uuid) returns public.invoices language plpgsql security definer set search_path='' as $$
declare inv public.invoices; seq bigint; formatted text;
begin
  select * into inv from public.invoices where id=p_invoice for update;
  if inv.id is null or not private.is_org_member(inv.organization_id,true) then raise exception 'not_authorized'; end if;
  if inv.status <> 'draft' or inv.invoice_number is not null then raise exception 'not_a_draft'; end if;
  insert into public.number_sequences(organization_id,sequence_type,year,next_value) values(inv.organization_id,'invoice',inv.year,2)
    on conflict(organization_id,sequence_type,year) do update set next_value=public.number_sequences.next_value+1 returning next_value-1 into seq;
  if seq is null then seq=1; end if;
  select coalesce(prefix,'') || lpad(seq::text,digits,'0') into formatted from public.number_sequences where organization_id=inv.organization_id and sequence_type='invoice' and year=inv.year;
  update public.invoices set invoice_number=formatted,status='finalized',finalized_at=now(),updated_at=now(),updated_by=(select auth.uid()),version=version+1 where id=p_invoice returning * into inv;
  insert into public.audit_log(organization_id,action,record_type,record_id,after_data,actor_id) values(inv.organization_id,'finalize','invoice',inv.id,to_jsonb(inv),(select auth.uid()));
  return inv;
end $$;
revoke all on function private.finalize_invoice_impl(uuid) from public;
grant execute on function private.finalize_invoice_impl(uuid) to authenticated;
create function public.finalize_invoice(p_invoice uuid) returns public.invoices language sql security invoker set search_path='' as $$ select private.finalize_invoice_impl(p_invoice) $$;
revoke all on function public.finalize_invoice(uuid) from public;
grant execute on function public.finalize_invoice(uuid) to authenticated;

create function private.create_organization_impl(p_name text, p_owner_name text) returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid; uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'authentication_required'; end if;
  insert into public.profiles(id) values(uid) on conflict(id) do nothing;
  insert into public.organizations(name,owner_name) values(trim(p_name),trim(p_owner_name)) returning id into org;
  insert into public.organization_members(organization_id,user_id,role,status) values(org,uid,'owner','active');
  insert into public.company_settings(organization_id,data,created_by,updated_by) values(org,'{}',uid,uid);
  insert into public.audit_log(organization_id,action,record_type,record_id,actor_id) values(org,'create','organization',org,uid);
  return org;
end $$;
revoke all on function private.create_organization_impl(text,text) from public;
grant execute on function private.create_organization_impl(text,text) to authenticated;
create function public.create_organization(p_name text,p_owner_name text) returns uuid language sql security invoker set search_path='' as $$ select private.create_organization_impl(p_name,p_owner_name) $$;
revoke all on function public.create_organization(text,text) from public;
grant execute on function public.create_organization(text,text) to authenticated;

alter table public.profiles enable row level security; alter table public.organizations enable row level security; alter table public.organization_members enable row level security;
do $$ declare t text; begin foreach t in array array['company_settings','customers','invoices','invoice_items','payments','expenses','recurring_expenses','description_templates','sync_changes','audit_log','import_batches','attachments'] loop execute format('alter table public.%I enable row level security',t); execute format('create policy %I on public.%I for select to authenticated using (private.is_org_member(organization_id,false))','select_'||t,t); execute format('create policy %I on public.%I for insert to authenticated with check (private.is_org_member(organization_id,true))','insert_'||t,t); execute format('create policy %I on public.%I for update to authenticated using (private.is_org_member(organization_id,true)) with check (private.is_org_member(organization_id,true))','update_'||t,t); end loop; end $$;
create policy profiles_self on public.profiles for all to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()));
create policy organizations_member_select on public.organizations for select to authenticated using(private.is_org_member(id,false));
create policy organizations_admin_update on public.organizations for update to authenticated using(private.is_org_admin(id)) with check(private.is_org_admin(id));
create policy members_select on public.organization_members for select to authenticated using(private.is_org_member(organization_id,false));
create policy members_admin_write on public.organization_members for all to authenticated using(private.is_org_admin(organization_id)) with check(private.is_org_admin(organization_id));
drop policy update_company_settings on public.company_settings; create policy update_company_settings on public.company_settings for update to authenticated using(private.is_org_admin(organization_id)) with check(private.is_org_admin(organization_id));
drop policy insert_company_settings on public.company_settings; create policy insert_company_settings on public.company_settings for insert to authenticated with check(private.is_org_admin(organization_id));
revoke all on public.number_sequences, public.audit_log from anon, authenticated;
grant select,insert,update on public.profiles,public.organizations,public.organization_members,public.company_settings,public.customers,public.invoices,public.invoice_items,public.payments,public.expenses,public.recurring_expenses,public.description_templates,public.sync_changes,public.import_batches,public.attachments to authenticated;
grant select on public.audit_log to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('receipts','receipts',false,15728640,array['application/pdf','image/jpeg','image/png','image/webp','application/xml','text/xml']),
 ('invoice-pdfs','invoice-pdfs',false,15728640,array['application/pdf']),
 ('company-assets','company-assets',false,5242880,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
create policy storage_org_select on storage.objects for select to authenticated using(bucket_id in ('receipts','invoice-pdfs','company-assets') and private.is_org_member((storage.foldername(name))[1]::uuid,false));
create policy storage_org_insert on storage.objects for insert to authenticated with check(bucket_id in ('receipts','invoice-pdfs','company-assets') and private.is_org_member((storage.foldername(name))[1]::uuid,true));
create policy storage_org_update on storage.objects for update to authenticated using(private.is_org_member((storage.foldername(name))[1]::uuid,true)) with check(private.is_org_member((storage.foldername(name))[1]::uuid,true));
create policy storage_org_delete on storage.objects for delete to authenticated using(private.is_org_member((storage.foldername(name))[1]::uuid,true));

do $$ declare t text; begin foreach t in array array['customers','invoices','invoice_items','payments','expenses','recurring_expenses','description_templates','company_settings'] loop begin execute format('alter publication supabase_realtime add table public.%I',t); exception when duplicate_object then null; end; end loop; end $$;

-- v0.5.0 hardening. This remains in the initial migration because the target
-- project was verified empty before its first application.

revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

alter table public.organizations
  add column created_by uuid references auth.users,
  add column updated_by uuid references auth.users,
  add column version bigint not null default 1,
  add constraint organizations_name_not_blank check (btrim(name) <> '');

alter table public.customers add column local_id text;
update public.customers set local_id = id::text where local_id is null;
alter table public.customers alter column local_id set not null;

alter table public.invoices
  add column local_id text,
  add column payment_method text,
  add column sent_at timestamptz,
  add column correction_invoice_id uuid,
  add column payment_reminder_at date,
  add column payment_reminder_last_shown_at timestamptz,
  add column payment_reminder_completed_at timestamptz;
update public.invoices set local_id = id::text where local_id is null;
alter table public.invoices
  alter column local_id set not null,
  alter column discount_value type numeric(14,4) using discount_value::numeric;

alter table public.invoice_items add column local_id text;
update public.invoice_items set local_id = id::text where local_id is null;
alter table public.invoice_items
  alter column local_id set not null,
  alter column discount_value type numeric(14,4) using discount_value::numeric;

alter table public.payments
  add column local_id text,
  add column data jsonb not null default '{}';
update public.payments set local_id = id::text where local_id is null;
alter table public.payments alter column local_id set not null;

alter table public.expenses add column local_id text;
update public.expenses set local_id = id::text where local_id is null;
alter table public.expenses alter column local_id set not null;

alter table public.recurring_expenses add column local_id text;
update public.recurring_expenses set local_id = id::text where local_id is null;
alter table public.recurring_expenses alter column local_id set not null;

alter table public.description_templates add column local_id text;
update public.description_templates set local_id = id::text where local_id is null;
alter table public.description_templates alter column local_id set not null;

alter table public.import_batches
  add column local_id text,
  add column updated_by uuid references auth.users,
  add column version bigint not null default 1,
  add column deleted_at timestamptz;
update public.import_batches set local_id = id::text where local_id is null;
alter table public.import_batches alter column local_id set not null;

alter table public.attachments
  add column local_id text,
  add column updated_at timestamptz not null default now(),
  add column updated_by uuid references auth.users,
  add column version bigint not null default 1;
update public.attachments set local_id = id::text where local_id is null;
alter table public.attachments alter column local_id set not null;

alter table public.customers add constraint customers_org_local_id_key unique (organization_id, local_id);
alter table public.invoices add constraint invoices_org_local_id_key unique (organization_id, local_id);
alter table public.invoice_items add constraint invoice_items_org_local_id_key unique (organization_id, local_id);
alter table public.payments add constraint payments_org_local_id_key unique (organization_id, local_id);
alter table public.expenses add constraint expenses_org_local_id_key unique (organization_id, local_id);
alter table public.recurring_expenses add constraint recurring_expenses_org_local_id_key unique (organization_id, local_id);
alter table public.description_templates add constraint description_templates_org_local_id_key unique (organization_id, local_id);
alter table public.import_batches add constraint import_batches_org_local_id_key unique (organization_id, local_id);
alter table public.attachments add constraint attachments_org_local_id_key unique (organization_id, local_id);

alter table public.invoices drop constraint invoices_organization_id_invoice_number_key;
alter table public.invoices add constraint invoices_org_year_number_key unique (organization_id, year, invoice_number);

alter table public.customers add constraint customers_org_id_key unique (organization_id, id);
alter table public.invoices add constraint invoices_org_id_key unique (organization_id, id);

alter table public.invoices drop constraint invoices_customer_id_fkey;
alter table public.invoices drop constraint invoices_cancelled_invoice_id_fkey;
alter table public.invoices
  add constraint invoices_customer_same_org_fkey
    foreign key (organization_id, customer_id) references public.customers (organization_id, id),
  add constraint invoices_cancelled_same_org_fkey
    foreign key (organization_id, cancelled_invoice_id) references public.invoices (organization_id, id),
  add constraint invoices_correction_same_org_fkey
    foreign key (organization_id, correction_invoice_id) references public.invoices (organization_id, id),
  add constraint invoices_status_check
    check (status in ('draft','finalized','sent','partially_paid','paid','overdue','cancelled')),
  add constraint invoices_discount_type_check
    check (discount_type is null or discount_type in ('percent','fixed')),
  add constraint invoices_discount_cents_check check (discount_cents >= 0),
  add constraint invoices_dates_check check (service_date_to is null or service_date_to >= service_date_from);

alter table public.invoice_items drop constraint invoice_items_invoice_id_fkey;
alter table public.invoice_items
  add constraint invoice_items_invoice_same_org_fkey
    foreign key (organization_id, invoice_id) references public.invoices (organization_id, id) on delete cascade,
  add constraint invoice_items_sort_order_check check (sort_order >= 0),
  add constraint invoice_items_discount_type_check
    check (discount_type is null or discount_type in ('percent','fixed')),
  add constraint invoice_items_discount_cents_check check (discount_cents >= 0);

alter table public.payments drop constraint payments_invoice_id_fkey;
alter table public.payments
  add constraint payments_invoice_same_org_fkey
    foreign key (organization_id, invoice_id) references public.invoices (organization_id, id);

create index organization_members_user_active
  on public.organization_members (user_id, status, organization_id);
create index invoice_items_org_invoice
  on public.invoice_items (organization_id, invoice_id, sort_order);
create index payments_org_invoice
  on public.payments (organization_id, invoice_id, paid_at);

create unique index customers_import_fingerprint_key
  on public.customers (organization_id, import_fingerprint) where import_fingerprint is not null;
create unique index invoices_import_fingerprint_key
  on public.invoices (organization_id, import_fingerprint) where import_fingerprint is not null;
create unique index payments_import_fingerprint_key
  on public.payments (organization_id, import_fingerprint) where import_fingerprint is not null;
create unique index expenses_import_fingerprint_key
  on public.expenses (organization_id, import_fingerprint) where import_fingerprint is not null;
create unique index description_templates_source_fingerprint_key
  on public.description_templates (organization_id, source_fingerprint) where source_fingerprint is not null;

alter table public.number_sequences enable row level security;
revoke all on public.number_sequences from anon, authenticated;

drop policy insert_invoices on public.invoices;
create policy insert_invoices on public.invoices for insert to authenticated
with check (
  private.is_org_member(organization_id, true)
  and status = 'draft'
  and invoice_number is null
  and finalized_at is null
);

drop policy insert_import_batches on public.import_batches;
drop policy update_import_batches on public.import_batches;
create policy insert_import_batches on public.import_batches for insert to authenticated
with check (private.is_org_admin(organization_id));
create policy update_import_batches on public.import_batches for update to authenticated
using (private.is_org_admin(organization_id))
with check (private.is_org_admin(organization_id));

drop policy insert_sync_changes on public.sync_changes;
drop policy update_sync_changes on public.sync_changes;
drop policy insert_audit_log on public.audit_log;
drop policy update_audit_log on public.audit_log;
revoke all on public.sync_changes, public.audit_log from anon, authenticated;
grant select on public.sync_changes, public.audit_log to authenticated;

revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from anon;

create or replace function private.set_row_actor()
returns trigger
language plpgsql
set search_path = ''
as $$
declare uid uuid := (select auth.uid());
begin
  if uid is not null then
    new.created_by := uid;
    new.updated_by := uid;
  end if;
  return new;
end
$$;

create trigger set_actor_organizations before insert on public.organizations
for each row execute function private.set_row_actor();
create trigger set_actor_company_settings before insert on public.company_settings
for each row execute function private.set_row_actor();
create trigger set_actor_customers before insert on public.customers
for each row execute function private.set_row_actor();
create trigger set_actor_invoices before insert on public.invoices
for each row execute function private.set_row_actor();
create trigger set_actor_invoice_items before insert on public.invoice_items
for each row execute function private.set_row_actor();
create trigger set_actor_payments before insert on public.payments
for each row execute function private.set_row_actor();
create trigger set_actor_expenses before insert on public.expenses
for each row execute function private.set_row_actor();
create trigger set_actor_recurring_expenses before insert on public.recurring_expenses
for each row execute function private.set_row_actor();
create trigger set_actor_description_templates before insert on public.description_templates
for each row execute function private.set_row_actor();
create trigger set_actor_import_batches before insert on public.import_batches
for each row execute function private.set_row_actor();
create trigger set_actor_attachments before insert on public.attachments
for each row execute function private.set_row_actor();

create trigger bump_organizations before update on public.organizations
for each row execute function private.bump_version();
create trigger bump_import_batches before update on public.import_batches
for each row execute function private.bump_version();
create trigger bump_attachments before update on public.attachments
for each row execute function private.bump_version();

create or replace function private.record_domain_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_row jsonb;
  after_row jsonb;
  active_row jsonb;
  org_id uuid;
  row_id uuid;
  row_version bigint;
  change_source text;
begin
  before_row := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  after_row := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  active_row := coalesce(after_row, before_row);
  org_id := (active_row ->> 'organization_id')::uuid;
  row_id := coalesce((active_row ->> 'id')::uuid, org_id);
  row_version := coalesce((active_row ->> 'version')::bigint, 1);
  change_source := coalesce(nullif(current_setting('blitzidee.change_source', true), ''), 'data_api');

  insert into public.sync_changes
    (organization_id, entity_type, entity_id, action, version, source, changed_by)
  values
    (org_id, tg_table_name, row_id, lower(tg_op), row_version, change_source, (select auth.uid()));

  insert into public.audit_log
    (organization_id, action, record_type, record_id, before_data, after_data, actor_id)
  values
    (org_id, lower(tg_op), tg_table_name, row_id, before_row, after_row, (select auth.uid()));

  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'company_settings','customers','invoices','invoice_items','payments',
    'expenses','recurring_expenses','description_templates','import_batches','attachments'
  ]
  loop
    execute format(
      'create trigger record_%1$I after insert or update or delete on public.%1$I for each row execute function private.record_domain_change()',
      table_name
    );
  end loop;
end
$$;

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

create trigger a_protect_invoice_update before update on public.invoices
for each row execute function private.protect_invoice_update();

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

create trigger a_protect_invoice_item
before insert or update or delete on public.invoice_items
for each row execute function private.protect_invoice_item();

create or replace function private.is_org_path_member(p_name text, p_write boolean default false)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1
    from public.organization_members m
    where m.organization_id::text = (storage.foldername(p_name))[1]
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and (not p_write or m.role in ('owner','admin','member'))
  )
$$;
revoke all on function private.is_org_path_member(text,boolean) from public, anon;
grant execute on function private.is_org_path_member(text,boolean) to authenticated;

drop policy storage_org_select on storage.objects;
drop policy storage_org_insert on storage.objects;
drop policy storage_org_update on storage.objects;
drop policy storage_org_delete on storage.objects;

create policy storage_org_select on storage.objects for select to authenticated
using (
  bucket_id in ('receipts','invoice-pdfs','company-assets')
  and private.is_org_path_member(name, false)
);
create policy storage_org_insert on storage.objects for insert to authenticated
with check (
  bucket_id in ('receipts','invoice-pdfs','company-assets')
  and private.is_org_path_member(name, true)
);
create policy storage_org_update on storage.objects for update to authenticated
using (
  bucket_id in ('receipts','invoice-pdfs','company-assets')
  and private.is_org_path_member(name, true)
)
with check (
  bucket_id in ('receipts','invoice-pdfs','company-assets')
  and private.is_org_path_member(name, true)
);
create policy storage_org_delete on storage.objects for delete to authenticated
using (
  bucket_id in ('receipts','invoice-pdfs','company-assets')
  and private.is_org_path_member(name, true)
);

create or replace function private.validate_invoice(p_invoice uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.invoices;
  item_count bigint;
  calculated_subtotal bigint;
begin
  select * into inv from public.invoices where id = p_invoice for update;
  if inv.id is null then raise exception 'Rechnungsentwurf wurde nicht gefunden.'; end if;
  if inv.customer_id is null or inv.customer_snapshot is null or inv.company_snapshot is null then
    raise exception 'Kunden- und Unternehmenssnapshot müssen vor der Finalisierung gespeichert sein.';
  end if;

  perform 1 from public.invoice_items
  where invoice_id = p_invoice and deleted_at is null
  for update;

  select count(*), coalesce(sum(total_cents), 0)
    into item_count, calculated_subtotal
  from public.invoice_items
  where invoice_id = p_invoice
    and deleted_at is null
    and btrim(description) <> ''
    and quantity_milli > 0;

  if item_count = 0 then raise exception 'Mindestens eine vollständig beschriebene Position ist erforderlich.'; end if;
  if exists(
    select 1 from public.invoice_items
    where invoice_id = p_invoice
      and deleted_at is null
      and (
        subtotal_cents <> round(quantity_milli::numeric * unit_price_cents::numeric / 1000)::bigint
        or total_cents <> subtotal_cents - discount_cents
        or discount_cents < 0
      )
  ) then
    raise exception 'Mindestens eine Rechnungsposition ist rechnerisch inkonsistent.';
  end if;
  if inv.subtotal_cents <> calculated_subtotal
     or inv.total_cents <> inv.subtotal_cents - inv.discount_cents
     or inv.discount_cents < 0
     or inv.discount_cents > greatest(inv.subtotal_cents, 0) then
    raise exception 'Die Rechnungssummen sind rechnerisch inkonsistent.';
  end if;
  if inv.total_cents = 0 then raise exception 'Der Gesamtbetrag darf nicht null sein.'; end if;
  if inv.total_cents < 0 and inv.cancelled_invoice_id is null then
    raise exception 'Ein negativer Beleg benötigt eine zugehörige Ursprungsrechnung.';
  end if;
end
$$;
revoke all on function private.validate_invoice(uuid) from public, anon;
grant execute on function private.validate_invoice(uuid) to authenticated;

create or replace function private.finalize_invoice_impl(p_invoice uuid)
returns public.invoices
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.invoices;
  seq bigint;
  baseline bigint;
  formatted text;
begin
  select * into inv from public.invoices where id = p_invoice for update;
  if inv.id is null or not private.is_org_member(inv.organization_id, true) then
    raise exception using errcode = '42501', message = 'Keine Berechtigung für diese Rechnung.';
  end if;
  if inv.status <> 'draft' or inv.invoice_number is not null then
    raise exception 'Diese Rechnung ist kein offener Entwurf mehr.';
  end if;

  perform private.validate_invoice(p_invoice);

  select coalesce(max(invoice_number::bigint), 0) + 1
    into baseline
  from public.invoices
  where organization_id = inv.organization_id
    and year = inv.year
    and invoice_number ~ '^[0-9]+$';

  insert into public.number_sequences
    (organization_id, sequence_type, year, next_value, prefix, digits)
  values
    (inv.organization_id, 'invoice', inv.year, baseline + 1, '', 5)
  on conflict (organization_id, sequence_type, year)
  do update set next_value = greatest(
    public.number_sequences.next_value,
    excluded.next_value - 1
  ) + 1
  returning next_value - 1 into seq;

  select coalesce(prefix, '') || lpad(seq::text, digits, '0')
    into formatted
  from public.number_sequences
  where organization_id = inv.organization_id
    and sequence_type = 'invoice'
    and year = inv.year;

  perform set_config('blitzidee.invoice_action', 'finalize:' || p_invoice::text, true);
  update public.invoices
  set invoice_number = formatted,
      status = 'finalized',
      finalized_at = now()
  where id = p_invoice
  returning * into inv;

  insert into public.audit_log
    (organization_id, action, record_type, record_id, after_data, actor_id)
  values
    (inv.organization_id, 'finalize', 'invoice', inv.id, to_jsonb(inv), (select auth.uid()));
  return inv;
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
    raise exception 'Historische Übernahme ist nur für einen neuen importierten Entwurf zulässig.';
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

create or replace function public.import_historical_invoice(
  p_invoice uuid,
  p_invoice_number text,
  p_status text,
  p_finalized_at timestamptz,
  p_paid_at date
)
returns public.invoices
language sql
security invoker
set search_path = ''
as $$
  select private.import_historical_invoice_impl(
    p_invoice, p_invoice_number, p_status, p_finalized_at, p_paid_at
  )
$$;
revoke all on function public.import_historical_invoice(uuid,text,text,timestamptz,date) from public, anon;
grant execute on function public.import_historical_invoice(uuid,text,text,timestamptz,date) to authenticated;

create or replace function private.allocate_customer_number_impl(
  p_organization uuid,
  p_prefix text default 'K-',
  p_digits integer default 4,
  p_start bigint default 1
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  baseline bigint;
  allocated bigint;
begin
  if not private.is_org_member(p_organization, true) then
    raise exception using errcode = '42501', message = 'Keine Berechtigung für Kundennummern.';
  end if;
  if p_digits not between 1 and 12 or p_start < 1 then
    raise exception 'Ungültige Konfiguration für Kundennummern.';
  end if;

  select greatest(
    p_start,
    coalesce(max((regexp_match(customer_number, '([0-9]+)$'))[1]::bigint), 0) + 1
  )
  into baseline
  from public.customers
  where organization_id = p_organization
    and deleted_at is null
    and customer_number like coalesce(p_prefix, '') || '%';

  insert into public.number_sequences
    (organization_id, sequence_type, year, next_value, prefix, digits)
  values
    (p_organization, 'customer', 0, baseline + 1, coalesce(p_prefix, ''), p_digits)
  on conflict (organization_id, sequence_type, year)
  do update set
    next_value = greatest(public.number_sequences.next_value, excluded.next_value - 1) + 1,
    prefix = excluded.prefix,
    digits = excluded.digits
  returning next_value - 1 into allocated;

  return coalesce(p_prefix, '') || lpad(allocated::text, p_digits, '0');
end
$$;
revoke all on function private.allocate_customer_number_impl(uuid,text,integer,bigint) from public, anon;
grant execute on function private.allocate_customer_number_impl(uuid,text,integer,bigint) to authenticated;

create or replace function public.allocate_customer_number(
  p_organization uuid,
  p_prefix text default 'K-',
  p_digits integer default 4,
  p_start bigint default 1
)
returns text
language sql
security invoker
set search_path = ''
as $$
  select private.allocate_customer_number_impl(p_organization, p_prefix, p_digits, p_start)
$$;
revoke all on function public.allocate_customer_number(uuid,text,integer,bigint) from public, anon;
grant execute on function public.allocate_customer_number(uuid,text,integer,bigint) to authenticated;

create or replace function private.create_organization_impl(p_name text, p_owner_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  org uuid;
  uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'authentication_required'; end if;
  if btrim(coalesce(p_name, '')) = '' or btrim(coalesce(p_owner_name, '')) = '' then
    raise exception 'Unternehmen und Inhaberin dürfen nicht leer sein.';
  end if;
  insert into public.profiles(id) values(uid) on conflict(id) do nothing;
  insert into public.organizations(name, owner_name, created_by, updated_by)
  values(btrim(p_name), btrim(p_owner_name), uid, uid)
  returning id into org;
  insert into public.organization_members(organization_id,user_id,role,status)
  values(org,uid,'owner','active');
  insert into public.company_settings(organization_id,data,created_by,updated_by)
  values(org,'{}',uid,uid);
  insert into public.audit_log(organization_id,action,record_type,record_id,actor_id)
  values(org,'create','organization',org,uid);
  return org;
end
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array['import_batches','attachments']
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    exception when duplicate_object then null;
    end;
  end loop;
end
$$;

revoke execute on all functions in schema private from public, anon;
revoke execute on all functions in schema public from public, anon;
grant execute on function public.create_organization(text,text) to authenticated;
grant execute on function public.finalize_invoice(uuid) to authenticated;
grant execute on function public.import_historical_invoice(uuid,text,text,timestamptz,date) to authenticated;
grant execute on function public.allocate_customer_number(uuid,text,integer,bigint) to authenticated;
