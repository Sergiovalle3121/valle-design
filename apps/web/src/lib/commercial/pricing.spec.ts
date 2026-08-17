import { strict as assert } from "node:assert";
import {
  annualSaving,
  canStartCheckout,
  formatMoney,
  minimumChargeCents,
  MoneyFormatError,
  planPrice,
  planView,
  priceUnitLabel,
  seatsMinimumLabel,
  taxLabel,
  type PublicCatalog,
  type PublicPlan,
} from "./pricing";

/** Catálogo mexicano tal y como lo publica hoy la API en local. */
const individual: PublicPlan = {
  code: "individual",
  name: "Individual",
  kind: "paid",
  perSeat: false,
  seatsMinimum: 1,
  taxIncluded: true,
  prices: [
    { currency: "MXN", period: "monthly", amountCents: 19900 },
    { currency: "MXN", period: "yearly", amountCents: 199000 },
  ],
};

const despacho: PublicPlan = {
  code: "despacho",
  name: "Despacho",
  kind: "paid",
  perSeat: true,
  seatsMinimum: 3,
  taxIncluded: true,
  prices: [
    { currency: "MXN", period: "monthly", amountCents: 16900 },
    { currency: "MXN", period: "yearly", amountCents: 169000 },
  ],
};

const prueba: PublicPlan = {
  code: "standalone-trial",
  name: "Prueba",
  kind: "trial",
  perSeat: false,
  seatsMinimum: 1,
  taxIncluded: true,
  prices: [],
};

const hosted: PublicCatalog = {
  checkout: "hosted",
  items: [individual, despacho, prueba],
};
const external: PublicCatalog = {
  checkout: "external",
  items: [individual, despacho, prueba],
};

// ── Céntimos → pesos mexicanos ─────────────────────────────────────────────
assert.equal(formatMoney(19900, "MXN"), "$199.00");
assert.equal(formatMoney(199000, "MXN"), "$1,990.00");
assert.equal(formatMoney(16900, "MXN"), "$169.00");
assert.equal(formatMoney(0, "MXN"), "$0.00");
// El céntimo suelto sobrevive al formateo: nada se redondea por el camino.
assert.equal(formatMoney(1, "MXN"), "$0.01");
assert.equal(formatMoney(169001, "MXN"), "$1,690.01");
// Ni una coma decimal a mano: el separador decimal mexicano es el punto.
assert.match(formatMoney(19900, "MXN"), /\.\d{2}$/u);

// Fallo cerrado: lo que no es un entero de céntimos no se publica.
for (const invalid of [199.5, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
  assert.throws(() => formatMoney(invalid, "MXN"), MoneyFormatError);
}
assert.throws(() => formatMoney(19900, "mxn"), MoneyFormatError);
assert.throws(() => formatMoney(19900, "PESOS"), MoneyFormatError);

// ── Plan por asiento: el unitario NO es lo que se paga ──────────────────────
assert.equal(priceUnitLabel(despacho, "monthly"), "por usuario/mes");
assert.equal(priceUnitLabel(despacho, "yearly"), "por usuario/año");
assert.equal(priceUnitLabel(individual, "monthly"), "por cuenta/mes");
assert.equal(seatsMinimumLabel(despacho), "Mínimo 3 usuarios");
assert.equal(seatsMinimumLabel(individual), null);
assert.equal(
  minimumChargeCents(despacho, { amountCents: 16900 }),
  50700,
  "tres asientos de 169,00 son 507,00 — el número que de verdad se factura",
);
assert.equal(
  formatMoney(minimumChargeCents(despacho, { amountCents: 16900 }), "MXN"),
  "$507.00",
);
assert.equal(minimumChargeCents(individual, { amountCents: 19900 }), 19900);
assert.equal(taxLabel(individual), "IVA incluido");
assert.equal(taxLabel({ taxIncluded: false }), "IVA no incluido");

// ── Ahorro anual: calculado, jamás escrito a mano ───────────────────────────
const savingIndividual = annualSaving(19900, 199000);
assert.ok(savingIndividual);
assert.equal(savingIndividual.twelveMonthsCents, 238800);
assert.equal(savingIndividual.savedCents, 39800);
assert.equal(savingIndividual.percent, 17);
assert.equal(formatMoney(savingIndividual.savedCents, "MXN"), "$398.00");

const savingDespacho = annualSaving(16900, 169000);
assert.ok(savingDespacho);
assert.equal(savingDespacho.savedCents, 33800);
assert.equal(savingDespacho.percent, 17);

// Sin ahorro real no se inventa un descuento.
assert.equal(annualSaving(19900, 238800), null);
assert.equal(annualSaving(19900, 300000), null);
assert.equal(annualSaving(0, 199000), null);
assert.equal(annualSaving(199.5, 199000), null);

// ── El botón de compra depende del modo de cobro del despliegue ─────────────
assert.equal(canStartCheckout(hosted, individual), true);
assert.equal(
  canStartCheckout(external, individual),
  false,
  "con checkout external no hay pasarela: un botón de compra no llevaría a ninguna parte",
);
assert.equal(canStartCheckout(hosted, prueba), false);
assert.equal(
  canStartCheckout(hosted, { kind: "paid", prices: [] }),
  false,
  "un plan de pago sin precio publicado tampoco se puede comprar",
);
assert.equal(canStartCheckout({ checkout: "external" }, prueba), false);

// ── Vista completa del plan ─────────────────────────────────────────────────
const viewHosted = planView(hosted, despacho, "MXN");
assert.equal(viewHosted.purchasable, true);
assert.deepEqual(
  viewHosted.periods.map((entry) => entry.period),
  ["monthly", "yearly"],
);
assert.equal(viewHosted.periods[0].amount, "$169.00");
assert.equal(viewHosted.periods[0].unit, "por usuario/mes");
assert.equal(viewHosted.periods[0].minimumCharge, "$507.00");
assert.equal(viewHosted.seatsNote, "Mínimo 3 usuarios");
assert.equal(viewHosted.taxNote, "IVA incluido");
assert.equal(viewHosted.savingAmount, "$338.00");

const viewExternal = planView(external, despacho, "MXN");
assert.equal(
  viewExternal.purchasable,
  false,
  "el mismo plan deja de ser comprable cuando el despliegue no tiene pasarela",
);
assert.equal(viewExternal.periods[0].amount, "$169.00");

// Una moneda que el catálogo no publica no produce precios inventados.
const viewUsd = planView(hosted, despacho, "USD");
assert.deepEqual(viewUsd.periods, []);
assert.equal(viewUsd.saving, null);
assert.equal(viewUsd.savingAmount, null);
assert.equal(planPrice(despacho, "monthly", "USD"), null);
assert.equal(planPrice(despacho, "monthly", "MXN")?.amountCents, 16900);

// El plan de prueba se publica sin precio y sin fingir uno.
const viewTrial = planView(hosted, prueba, "MXN");
assert.deepEqual(viewTrial.periods, []);
assert.equal(viewTrial.purchasable, false);

console.log(
  "pricing: céntimos→MXN, plan por asiento con su mínimo, ahorro anual calculado y compra vetada con checkout external",
);
