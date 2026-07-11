import type { Invoice, InvoiceItem } from "../types";
import { calculateDiscount, itemTotal } from "./money";

export interface InvoiceCalculation { items: InvoiceItem[]; subtotalCents: number; discountCents: number; totalCents: number; errors: Record<string, string>; }

export function calculateInvoice(items: InvoiceItem[], discountType?: Invoice["discountType"], discountValue = 0): InvoiceCalculation {
  const errors: Record<string, string> = {};
  const calculatedItems = items.map((item) => { const subtotalCents = itemTotal(item.quantityMilli, item.unitPriceCents); try { const result = calculateDiscount(subtotalCents, item.discountType, item.discountValue || 0); return { ...item, subtotalCents, discountCents: result.discountCents, totalCents: result.totalCents }; } catch (cause) { errors[item.id] = cause instanceof Error ? cause.message : String(cause); return { ...item, subtotalCents, discountCents: 0, totalCents: subtotalCents }; } });
  const subtotalCents = calculatedItems.reduce((sum, item) => sum + item.totalCents, 0);
  try { const result = calculateDiscount(subtotalCents, discountType, discountValue); return { items: calculatedItems, subtotalCents, discountCents: result.discountCents, totalCents: result.totalCents, errors }; }
  catch (cause) { errors.invoice = cause instanceof Error ? cause.message : String(cause); return { items: calculatedItems, subtotalCents, discountCents: 0, totalCents: subtotalCents, errors }; }
}
