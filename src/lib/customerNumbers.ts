import { db } from "../db";
import type { CustomerNumberConfig } from "../types";

export const DEFAULT_CUSTOMER_NUMBER_CONFIG: CustomerNumberConfig = { prefix: "K-", startNumber: 1, digits: 4, nextValue: 1 };

export async function getCustomerNumberConfig(): Promise<CustomerNumberConfig> {
  const stored = await db.settings.get("customerNumberConfig");
  return { ...DEFAULT_CUSTOMER_NUMBER_CONFIG, ...(stored?.value as Partial<CustomerNumberConfig> | undefined) };
}

export async function allocateCustomerNumber(): Promise<string> {
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
