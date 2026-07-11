-- Follow-up from Supabase security/performance advisors after the initial,
-- successfully verified empty-project migration.

create policy number_sequences_no_direct_access
on public.number_sequences for select to authenticated
using (false);

drop policy members_admin_write on public.organization_members;
create policy members_admin_insert
on public.organization_members for insert to authenticated
with check (private.is_org_admin(organization_id));
create policy members_admin_update
on public.organization_members for update to authenticated
using (private.is_org_admin(organization_id))
with check (private.is_org_admin(organization_id));
create policy members_admin_delete
on public.organization_members for delete to authenticated
using (private.is_org_admin(organization_id));

create index attachments_created_by_idx on public.attachments(created_by);
create index attachments_updated_by_idx on public.attachments(updated_by);
create index audit_log_org_created_idx on public.audit_log(organization_id, created_at desc);
create index audit_log_actor_idx on public.audit_log(actor_id);
create index company_settings_created_by_idx on public.company_settings(created_by);
create index company_settings_updated_by_idx on public.company_settings(updated_by);
create index customers_created_by_idx on public.customers(created_by);
create index customers_updated_by_idx on public.customers(updated_by);
create index description_templates_created_by_idx on public.description_templates(created_by);
create index description_templates_updated_by_idx on public.description_templates(updated_by);
create index expenses_created_by_idx on public.expenses(created_by);
create index expenses_updated_by_idx on public.expenses(updated_by);
create index import_batches_created_by_idx on public.import_batches(created_by);
create index import_batches_updated_by_idx on public.import_batches(updated_by);
create index invoice_items_created_by_idx on public.invoice_items(created_by);
create index invoice_items_updated_by_idx on public.invoice_items(updated_by);
create index invoices_customer_idx on public.invoices(organization_id, customer_id);
create index invoices_cancelled_invoice_idx on public.invoices(organization_id, cancelled_invoice_id);
create index invoices_correction_invoice_idx on public.invoices(organization_id, correction_invoice_id);
create index invoices_created_by_idx on public.invoices(created_by);
create index invoices_updated_by_idx on public.invoices(updated_by);
create index organizations_created_by_idx on public.organizations(created_by);
create index organizations_updated_by_idx on public.organizations(updated_by);
create index payments_created_by_idx on public.payments(created_by);
create index payments_updated_by_idx on public.payments(updated_by);
create index recurring_expenses_created_by_idx on public.recurring_expenses(created_by);
create index recurring_expenses_updated_by_idx on public.recurring_expenses(updated_by);
create index sync_changes_changed_by_idx on public.sync_changes(changed_by);
