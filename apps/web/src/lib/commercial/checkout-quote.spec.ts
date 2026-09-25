import { strict as assert } from "node:assert";
import { checkoutQuote } from "./checkout-quote";
import type { PublicCatalog } from "./pricing";

const catalog: PublicCatalog = {
  checkout: "hosted",
  trialDays: 90,
  cfdi: "manual",
  items: [
    {
      code: "individual", name: "Individual", kind: "paid", perSeat: false,
      seatsMinimum: 1, taxIncluded: true,
      prices: [{ currency: "MXN", period: "monthly", amountCents: 19900 }],
    },
    {
      code: "despacho", name: "Despacho", kind: "paid", perSeat: true,
      seatsMinimum: 3, taxIncluded: false,
      prices: [{ currency: "MXN", period: "monthly", amountCents: 16900 }],
    },
  ],
};

assert.deepEqual(checkoutQuote(catalog, {
  planCode: "individual", currency: "MXN", period: "monthly",
}), {
  planName: "Individual", amount: "$199.00", unitAmount: "$199.00",
  seats: 1, perSeat: false, periodLabel: "mes", taxNote: "IVA incluido",
});
assert.equal(checkoutQuote(catalog, {
  planCode: "despacho", currency: "MXN", period: "monthly",
})?.amount, "$507.00", "el mínimo de tres asientos se cobra completo");
assert.equal(checkoutQuote(catalog, {
  planCode: "despacho", currency: "MXN", period: "monthly", seats: 5,
})?.amount, "$845.00", "los asientos elegidos cambian el importe visible");
assert.equal(checkoutQuote(catalog, {
  planCode: "despacho", currency: "MXN", period: "monthly", seats: 2,
}), null, "nunca se anuncia un importe por debajo del mínimo");
assert.equal(checkoutQuote(catalog, {
  planCode: "individual", currency: "MXN", period: "monthly", seats: 3,
}), null, "un plan por cuenta no acepta una cifra de asientos inventada");
assert.equal(checkoutQuote(catalog, {
  planCode: "individual", currency: "USD", period: "monthly",
}), null, "no se presenta un precio de otra moneda");
assert.equal(checkoutQuote({ ...catalog, checkout: "external" }, {
  planCode: "individual", currency: "MXN", period: "monthly",
}), null, "sin pasarela no se ofrece pagar");
assert.equal(checkoutQuote({ ...catalog, items: [{
  ...catalog.items[0], prices: [{ currency: "MXN", period: "monthly", amountCents: 0 }],
}] }, {
  planCode: "individual", currency: "MXN", period: "monthly",
}), null, "un plan de pago sin importe positivo no llega a la pasarela");
console.log("checkout-quote: importe real, asientos, moneda y fallo cerrado PASS");
