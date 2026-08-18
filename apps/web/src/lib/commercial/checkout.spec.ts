import { strict as assert } from "node:assert";
import {
  authPathForCheckout,
  availablePaymentMethods,
  canCancelSubscription,
  canOpenCheckout,
  checkoutPath,
  checkoutProblem,
  forgetCheckout,
  parsePlanSelection,
  paymentMethodLabel,
  pendingPaymentNotice,
  recallCheckout,
  rememberCheckout,
  resolveCheckoutOutcome,
  CHECKOUT_MEMORY_KEY,
  PAYMENT_METHOD_OPTIONS,
  type PendingPayment,
  type Subscription,
} from "./checkout";

const selection = {
  planCode: "despacho",
  currency: "MXN",
  period: "yearly",
} as const;

// ── La elección de plan viaja por la URL y sobrevive al login ───────────────
assert.equal(
  checkoutPath(selection),
  "/precios/checkout?plan=despacho&periodo=yearly&moneda=MXN",
);
assert.equal(
  authPathForCheckout("register", selection),
  "/register?returnTo=%2Fprecios%2Fcheckout%3Fplan%3Ddespacho%26periodo%3Dyearly%26moneda%3DMXN",
);
assert.equal(
  authPathForCheckout("login", selection),
  "/login?returnTo=%2Fprecios%2Fcheckout%3Fplan%3Ddespacho%26periodo%3Dyearly%26moneda%3DMXN",
);

const fromQuery = (query: string) => {
  const params = new URLSearchParams(query);
  return parsePlanSelection((key) => params.get(key));
};
assert.deepEqual(
  fromQuery("plan=despacho&periodo=yearly&moneda=MXN"),
  selection,
);
assert.deepEqual(fromQuery("plan=individual&periodo=monthly&moneda=MXN"), {
  planCode: "individual",
  currency: "MXN",
  period: "monthly",
});
// Fallo cerrado: ni un plan por defecto ni una moneda supuesta.
for (const broken of [
  "",
  "plan=despacho",
  "plan=despacho&periodo=weekly&moneda=MXN",
  "plan=despacho&periodo=yearly&moneda=mxn",
  "plan=despacho&periodo=yearly&moneda=PESOS",
  "plan=Despacho&periodo=yearly&moneda=MXN",
  "plan=../admin&periodo=yearly&moneda=MXN",
  `plan=${"x".repeat(81)}&periodo=yearly&moneda=MXN`,
]) {
  assert.equal(fromQuery(broken), null, `debería rechazar "${broken}"`);
}

// ── Roles: la interfaz no ofrece lo que la API va a rechazar ────────────────
assert.equal(canOpenCheckout("owner"), true);
assert.equal(canOpenCheckout("admin"), true);
assert.equal(canOpenCheckout("member"), false);
assert.equal(canOpenCheckout("viewer"), false);
assert.equal(canOpenCheckout(null), false);
assert.equal(canCancelSubscription("owner"), true);
assert.equal(
  canCancelSubscription("admin"),
  false,
  "la baja la exige owner: un admin no debe ver el botón",
);
assert.equal(canCancelSubscription("member"), false);
assert.equal(canCancelSubscription(undefined), false);

// ── Errores del checkout traducidos sin inventar cobros ────────────────────
const unavailable = checkoutProblem({
  status: 409,
  code: "checkout_unavailable",
});
assert.equal(unavailable.code, "checkout_unavailable");
assert.equal(unavailable.contactSales, true);
assert.match(unavailable.detail, /No se te ha cobrado nada/u);
assert.equal(
  checkoutProblem({ status: 403 }).title,
  "Tu rol no permite contratar",
);
assert.equal(checkoutProblem({ status: 401 }).title, "Tu sesión ha caducado");
assert.equal(
  checkoutProblem({ status: 409, code: "plan_already_active" }).code,
  "plan_already_active",
);
assert.equal(
  checkoutProblem({ status: 400, code: "price_unavailable" }).contactSales,
  true,
);
assert.equal(checkoutProblem(new Error("boom")).code, null);
assert.match(
  checkoutProblem(new Error("boom")).detail,
  /no se ha iniciado ningún cobro/u,
);

// ── Los tres desenlaces salen de la SUSCRIPCIÓN, no de la URL ──────────────
const subscription = (patch: Partial<Subscription>): Subscription => ({
  planCode: "despacho",
  status: "active",
  trialEndsAt: null,
  currentPeriodEnd: "2026-09-16T14:30:00.000Z",
  cancelAtPeriodEnd: false,
  seats: 3,
  effective: true,
  ...patch,
});

assert.equal(
  resolveCheckoutOutcome(subscription({ status: "active" }), "despacho")
    .outcome,
  "pagado",
);
assert.equal(
  resolveCheckoutOutcome(subscription({ status: "active" }), null).outcome,
  "pagado",
);
// Activa, pero del plan ANTERIOR: la compra nueva sigue sin aterrizar.
assert.equal(
  resolveCheckoutOutcome(subscription({ status: "active" }), "individual")
    .outcome,
  "pendiente",
);
assert.equal(
  resolveCheckoutOutcome(subscription({ status: "trialing" }), "despacho")
    .outcome,
  "pendiente",
);
assert.equal(resolveCheckoutOutcome(null, "despacho").outcome, "pendiente");
assert.equal(
  resolveCheckoutOutcome(subscription({ status: "past_due" }), "despacho")
    .outcome,
  "fallido",
);
assert.equal(
  resolveCheckoutOutcome(subscription({ status: "suspended" }), "despacho")
    .outcome,
  "fallido",
);
assert.equal(
  resolveCheckoutOutcome(subscription({ status: "cancelled" }), "despacho")
    .outcome,
  "fallido",
);

// Pendiente NO es error: OXXO y SPEI tardan horas y la página debe seguir
// esperando en vez de declarar un fallo.
const pending = resolveCheckoutOutcome(null, "despacho");
assert.equal(pending.keepPolling, true);
assert.match(pending.detail, /OXXO|SPEI/u);
assert.match(pending.detail, /no vuelvas a pagar/iu);
assert.equal(
  resolveCheckoutOutcome(subscription({ status: "active" }), "despacho")
    .keepPolling,
  false,
);

// LA PRUEBA CENTRAL: ningún parámetro de la URL puede cambiar el desenlace.
// `resolveCheckoutOutcome` no recibe la URL — sólo la suscripción y el plan que
// el navegador esperaba— así que un `?resultado=pagado` tecleado a mano es,
// literalmente, un dato que nadie lee.
for (const forged of [
  "?resultado=pagado",
  "?status=paid&session_id=cs_test_falsificado",
  "?checkout=success",
]) {
  const params = new URLSearchParams(forged);
  const claimed = params.get("resultado") ?? params.get("status") ?? "";
  assert.match(claimed || "vacío", /pagado|paid|vacío/u);
  assert.equal(
    resolveCheckoutOutcome(subscription({ status: "trialing" }), "despacho")
      .outcome,
    "pendiente",
    `la URL "${forged}" no puede convertir una suscripción en prueba en un pago confirmado`,
  );
  assert.equal(
    resolveCheckoutOutcome(subscription({ status: "past_due" }), "despacho")
      .outcome,
    "fallido",
  );
}

// ── Memoria del plan esperado: útil, prescindible y nunca autoritativa ─────
const store = new Map<string, string>();
const storage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, value),
  removeItem: (key: string) => void store.delete(key),
};
rememberCheckout(storage, { planCode: "despacho", startedAt: 1 });
assert.equal(recallCheckout(storage)?.planCode, "despacho");
forgetCheckout(storage);
assert.equal(recallCheckout(storage), null);
assert.equal(recallCheckout(null), null);
store.set(CHECKOUT_MEMORY_KEY, "{no es json");
assert.equal(recallCheckout(storage), null);
store.set(CHECKOUT_MEMORY_KEY, JSON.stringify({ planCode: "PLAN INVÁLIDO" }));
assert.equal(recallCheckout(storage), null);
// Un almacenamiento que lanza no puede romper la compra.
const hostile = {
  getItem: () => {
    throw new Error("bloqueado");
  },
  setItem: () => {
    throw new Error("bloqueado");
  },
  removeItem: () => {
    throw new Error("bloqueado");
  },
};
assert.equal(recallCheckout(hostile), null);
rememberCheckout(hostile, { planCode: "despacho", startedAt: 1 });
forgetCheckout(hostile);

// ── Medios de pago: tres opciones que NO son equivalentes ──────────────────
assert.deepEqual(
  PAYMENT_METHOD_OPTIONS.map((option) => option.method),
  ["card", "oxxo", "spei"],
);
// Quien paga en efectivo compra UN periodo: callarlo garantiza que pierda el
// acceso un día sin entender por qué.
for (const option of PAYMENT_METHOD_OPTIONS.filter((o) => o.asynchronous)) {
  assert.match(option.detail, /renovar a mano/u);
}
assert.equal(
  PAYMENT_METHOD_OPTIONS.find((o) => o.method === "card")?.asynchronous,
  false,
);
// OXXO y SPEI son infraestructura mexicana: sólo existen en pesos. Ofrecerlos
// en un plan en dólares sería un botón que el proveedor va a rechazar.
assert.deepEqual(
  availablePaymentMethods("USD").map((option) => option.method),
  ["card"],
);
assert.equal(availablePaymentMethods("MXN").length, 3);
assert.equal(paymentMethodLabel("oxxo"), "Efectivo en OXXO");
// Un medio desconocido se enseña tal cual en vez de romper la pantalla.
assert.equal(paymentMethodLabel("bitcoin"), "bitcoin");

// ── Un pago pendiente se NOMBRA, no se deja en blanco ──────────────────────
const pagoPendiente: PendingPayment = {
  method: "oxxo",
  since: "2026-08-17T10:00:00.000Z",
  voucherUrl: "https://payments.stripe.test/oxxo/voucher/abc",
  planCode: "despacho",
};
const notice = pendingPaymentNotice(pagoPendiente);
assert.match(notice, /Efectivo en OXXO/u);
assert.match(notice, /despacho/u);
// La frase que evita el doble pago, que es el fallo caro de un cobro asíncrono.
assert.match(notice, /No vuelvas a pagar/u);

// Con pago pendiente registrado, el desenlace lo dice con nombre y plan; sin
// él, se queda en la frase genérica de siempre.
const esperando = resolveCheckoutOutcome(
  subscription({ status: "trialing", trialEndsAt: "2026-09-01T00:00:00.000Z" }),
  "despacho",
  pagoPendiente,
);
assert.equal(esperando.outcome, "pendiente");
assert.equal(esperando.keepPolling, true);
assert.match(esperando.title, /Efectivo en OXXO/u);
const generico = resolveCheckoutOutcome(
  subscription({ status: "trialing", trialEndsAt: "2026-09-01T00:00:00.000Z" }),
  "despacho",
);
assert.match(generico.title, /Esperando la confirmación/u);
// Un pago pendiente NUNCA convierte un fallo real en espera: el past_due sigue
// siendo un fallo aunque haya una ficha viva.
assert.equal(
  resolveCheckoutOutcome(subscription({ status: "past_due" }), "despacho", pagoPendiente)
    .outcome,
  "fallido",
);

// ── Los problemas nuevos se explican, no se vuelven un error genérico ──────
const fiscal = checkoutProblem({ status: 409, code: "tax_profile_required" });
assert.equal(fiscal.code, "tax_profile_required");
assert.match(fiscal.detail, /RFC/u);
assert.match(fiscal.detail, /deducible/u);
// No se manda a ventas: lo resuelve el propio cliente con cinco campos.
assert.equal(fiscal.contactSales, false);

const tope = checkoutProblem({
  status: 400,
  code: "payment_method_amount_limit",
});
assert.match(tope.detail, /10\.000 MXN/u);
assert.match(tope.detail, /SPEI o tarjeta/u);
assert.equal(
  checkoutProblem({ status: 400, code: "payment_method_currency" }).title,
  tope.title,
);

console.log(
  "checkout: selección de plan a prueba de URL, roles owner/admin, medios de pago mexicanos con su letra pequeña y los desenlaces derivados de la suscripción",
);
