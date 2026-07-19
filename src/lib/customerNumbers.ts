import { db } from "../db";
import type { CustomerNumberConfig } from "../types";
import { cloudConfigured } from "../cloud/config";
import { supabase } from "../cloud/client";
import { getActiveSyncOrganization } from "../cloud/sync/localChanges";

export const DEFAULT_CUSTOMER_NUMBER_CONFIG: CustomerNumberConfig = { prefix: "K-", startNumber: 1, digits: 4, nextValue: 1 };

export async function getCustomerNumberConfig(): Promise<CustomerNumberConfig> {
  const [company, stored] = await Promise.all([
    db.company.get("company"),
    db.settings.get("customerNumberConfig")
  ]);
  return {
    ...DEFAULT_CUSTOMER_NUMBER_CONFIG,
    ...(stored?.value as Partial<CustomerNumberConfig> | undefined),
    ...company?.customerNumberConfig
  };
}

export async function allocateCustomerNumber(): Promise<string> {
  const organizationId = getActiveSyncOrganization();
  const online = typeof navigator === "undefined" || navigator.onLine;
  if (cloudConfigured && supabase && organizationId && online) {
    const config = await getCustomerNumberConfig();
    const { data, error } = await supabase.rpc("allocate_customer_number", {
      p_organization: organizationId,
      p_prefix: config.prefix,
      p_digits: config.digits,
      p_start: config.startNumber
    });
    if (error || typeof data !== "string") {
      throw new Error("Die nächste Kundennummer konnte nicht sicher vom Server vergeben werden.");
    }
    const match = data.match(/(\d+)$/);
    if (match) {
      await db.settings.put({
        key: "customerNumberConfig",
        value: { ...config, nextValue: Math.max(config.nextValue, Number(match[1]) + 1) }
      });
    }
    return data;
  }
  return db.transaction("rw", db.settings, db.customers, async () => {
    const config = await getCustomerNumberConfig();
    let value = Math.max(config.startNumber, config.nextValue);
    let candidate = "";
    do candidate = `${config.prefix}${String(value++).padStart(config.digits, "0")}`;
    while (await db.customers.where("customerNumber").equals(candidate).first());
    await db.settings.put({ key: "customerNumberConfig", value: { ...config, nextValue: value } });
    return candidate;
  });
}

export async function ensureCustomerNumbers(): Promise<void> {
  const missing = await db.customers.filter((customer) => !customer.customerNumber).toArray();
  for (const customer of missing) await db.customers.update(customer.id, { customerNumber: await allocateCustomerNumber(), updatedAt: new Date().toISOString() });
}
