export const euro = (cents: number) => new Intl.NumberFormat("de-DE", {
  style: "currency", currency: "EUR"
}).format(cents / 100);

export const parseEuroToCents = (value: string | number): number => {
  if (typeof value === "number") return Math.round(value * 100);
  const normalized = value.trim().replace(/\s|€/g, "").replace(/\./g, "").replace(",", ".");
  if (!normalized) return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
};

export function parsePriceInput(value: string): { valid: boolean; cents: number; normalized: string } {
  const raw = value.trim().replace(/\s|€/g, "");
  if (!raw || !/^-?(?:\d+([.,]\d{0,2})?|[.,]\d{1,2})$/.test(raw)) return { valid: false, cents: 0, normalized: value };
  const cents = Math.round(Number(raw.replace(",", ".")) * 100);
  if (!Number.isFinite(cents)) return { valid: false, cents: 0, normalized: value };
  return { valid: true, cents, normalized: (cents / 100).toFixed(2).replace(".", ",") };
}

export const itemTotal = (quantityMilli: number, unitPriceCents: number) =>
  Math.round((quantityMilli * unitPriceCents) / 1000);

export type DiscountType = "percent" | "fixed";
export function calculateDiscount(baseCents: number, type?: DiscountType, value = 0) {
  if (!type || value === 0) return { discountCents: 0, totalCents: baseCents };
  if (value < 0) throw new Error("Der Rabatt darf nicht negativ sein.");
  if (type === "percent" && value > 100) throw new Error("Ein prozentualer Rabatt darf höchstens 100 % betragen.");
  const discountCents = type === "percent" ? Math.round(baseCents * value / 100) : Math.round(value);
  if (discountCents > baseCents) throw new Error("Der feste Rabatt darf den zugrunde liegenden Betrag nicht überschreiten.");
  return { discountCents, totalCents: baseCents - discountCents };
}

export const openAmount = (invoiceTotalCents: number, payments: { amountCents: number }[]) =>
  Math.max(0, invoiceTotalCents - payments.reduce((sum, payment) => sum + payment.amountCents, 0));
