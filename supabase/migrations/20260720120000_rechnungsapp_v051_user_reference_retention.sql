-- Preserve business and audit records when an authentication account is removed.
-- All affected actor/author columns are nullable by design. The membership/profile
-- rows keep their existing ON DELETE CASCADE behavior.

alter table public.audit_log
  drop constraint if exists audit_log_actor_id_fkey,
  add constraint audit_log_actor_id_fkey
    foreign key (actor_id) references auth.users(id) on delete set null;

alter table public.company_settings
  drop constraint if exists company_settings_created_by_fkey,
  drop constraint if exists company_settings_updated_by_fkey,
  add constraint company_settings_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete set null,
  add constraint company_settings_updated_by_fkey
    foreign key (updated_by) references auth.users(id) on delete set null;

alter table public.customers
  drop constraint if exists customers_created_by_fkey,
  drop constraint if exists customers_updated_by_fkey,
  add constraint customers_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete set null,
  add constraint customers_updated_by_fkey
    foreign key (updated_by) references auth.users(id) on delete set null;

alter table public.invoices
  drop constraint if exists invoices_created_by_fkey,
  drop constraint if exists invoices_updated_by_fkey,
  add constraint invoices_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete set null,
  add constraint invoices_updated_by_fkey
    foreign key (updated_by) references auth.users(id) on delete set null;

alter table public.invoice_items
  drop constraint if exists invoice_items_created_by_fkey,
  drop constraint if exists invoice_items_updated_by_fkey,
  add constraint invoice_items_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete set null,
  add constraint invoice_items_updated_by_fkey
    foreign key (updated_by) references auth.users(id) on delete set null;

alter table public.sync_changes
  drop constraint if exists sync_changes_changed_by_fkey,
  add constraint sync_changes_changed_by_fkey
    foreign key (changed_by) references auth.users(id) on delete set null;
