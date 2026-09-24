import type { PlanSelection } from "./checkout";
import { formatMoney, planPrice, taxLabel, type PublicCatalog } from "./pricing";

/** Precio de lista publicado por la API; la pasarela confirma el cargo final. */
export interface CheckoutQuote {
  planName: string;
  amount: string;
  unitAmount: string;
  seats: number;
  perSeat: boolean;
  periodLabel: string;
  taxNote: string;
}

export function checkoutQuote(
  catalog: PublicCatalog,
  selection: PlanSelection,
): CheckoutQuote | null {
  if (catalog.checkout !== "hosted") return null;
  const plan = catalog.items.find((item) => item.code === selection.planCode);
  if (!plan || plan.kind !== "paid") return null;
  const price = planPrice(plan, selection.period, selection.currency);
  if (!price || !Number.isSafeInteger(price.amountCents) ||
    price.amountCents <= 0 || !Number.isSafeInteger(plan.seatsMinimum) ||
    plan.seatsMinimum < 1) return null;
  if (!plan.perSeat && selection.seats !== undefined) return null;
  if (!plan.perSeat && plan.seatsMinimum !== 1) return null;
  const seats = plan.perSeat
    ? (selection.seats ?? plan.seatsMinimum)
    : 1;
  if (!Number.isSafeInteger(seats) || seats < plan.seatsMinimum) return null;
  const amountCents = price.amountCents * seats;
  if (!Number.isSafeInteger(amountCents)) return null;
  return {
    planName: plan.name,
    amount: formatMoney(amountCents, selection.currency),
    unitAmount: formatMoney(price.amountCents, selection.currency),
    seats,
    perSeat: plan.perSeat,
    periodLabel: selection.period === "yearly" ? "año" : "mes",
    taxNote: taxLabel(plan),
  };
}
