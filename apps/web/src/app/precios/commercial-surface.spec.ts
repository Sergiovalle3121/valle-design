import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";

/**
 * Lo que este spec vigila no se puede comprobar llamando a una función: son
 * propiedades de las PANTALLAS. Que la página de precios no tenga un solo
 * importe escrito a mano, que el retorno del pago ni siquiera lea la URL y que
 * la baja no se le enseñe a quien no puede pulsarla son afirmaciones sobre el
 * código fuente, y aquí se comprueban leyéndolo.
 */
const routes = [
  "src/app/precios/page.tsx",
  "src/app/precios/PricingCatalog.tsx",
  "src/app/precios/checkout/page.tsx",
  "src/app/precios/checkout/CheckoutStarter.tsx",
  "src/app/cuenta/facturacion/page.tsx",
  "src/app/cuenta/facturacion/BillingPortal.tsx",
  "src/app/cuenta/facturacion/retorno/page.tsx",
  "src/app/cuenta/facturacion/retorno/CheckoutReturn.tsx",
] as const;

for (const route of routes) {
  assert.ok(existsSync(route), `falta la ruta comercial ${route}`);
}

const read = (path: string) => readFileSync(path, "utf8");
const pricingPage = read("src/app/precios/page.tsx");
const catalog = read("src/app/precios/PricingCatalog.tsx");
const starter = read("src/app/precios/checkout/CheckoutStarter.tsx");
const portal = read("src/app/cuenta/facturacion/BillingPortal.tsx");
const returned = read("src/app/cuenta/facturacion/retorno/CheckoutReturn.tsx");
const commercialConfig = read("src/config/commercial.ts");

// ── Los precios vienen de la API o no vienen ───────────────────────────────
assert.ok(
  catalog.includes("fetchPublicCatalog"),
  "la página de precios debe leer el catálogo público real",
);
for (const [name, source] of [
  ["precios/page.tsx", pricingPage],
  ["PricingCatalog.tsx", catalog],
] as const) {
  assert.doesNotMatch(
    source,
    /\$\s*\d|\d+(?:[.,]\d+)?\s*(?:MXN|USD|pesos)/iu,
    `${name} no puede publicar un importe escrito a mano`,
  );
  assert.doesNotMatch(
    source,
    /amountCents\s*:\s*\d/u,
    `${name} no puede llevar un catálogo simulado`,
  );
}
assert.ok(
  catalog.includes("catalogFailureMessage"),
  "sin catálogo, la página muestra el error honesto en vez de precios",
);
assert.match(catalog, /data-testid="pricing-error"/u);

// ── `checkout: external` no puede ofrecer un botón de compra ───────────────
assert.match(
  catalog,
  /view\.purchasable && shown \?/u,
  "el enlace de compra debe estar condicionado a que el plan sea comprable",
);
assert.ok(
  catalog.includes('data-testid="checkout-external-note"'),
  "con checkout external la página debe explicar que el cobro no está habilitado",
);
assert.ok(
  catalog.includes("COMMERCIAL_LINKS.sales"),
  "sin pasarela hay que ofrecer el camino que sí funciona: el equipo comercial",
);

// ── El desenlace del pago no se lee de la URL ──────────────────────────────
assert.doesNotMatch(
  returned,
  /useSearchParams|searchParams|location\.search|URLSearchParams/u,
  "la página de retorno no puede derivar el estado del pago de la URL",
);
assert.ok(
  returned.includes("resolveCheckoutOutcome") &&
    returned.includes("designClient.commercial.subscription"),
  "el estado sale de GET /v1/commercial/subscription",
);

// ── La compra pasa por el SDK, no por un fetch artesanal ───────────────────
assert.ok(
  starter.includes("designClient.commercial.createCheckoutSession"),
  "el checkout debe abrirse con el cliente del SDK ya existente",
);
assert.doesNotMatch(
  starter,
  /fetch\(/u,
  "no se inventa un cliente HTTP nuevo para el checkout",
);
assert.ok(
  starter.includes("authPathForCheckout"),
  "sin sesión, el visitante va a registro/login conservando el plan",
);

// ── El portal respeta los roles ────────────────────────────────────────────
assert.match(
  portal,
  /canCancelSubscription\(auth\.role\) \?/u,
  "la baja sólo se enseña a quien puede ejecutarla",
);
assert.ok(
  portal.includes('data-testid="cancel-denied"'),
  "a quien no es owner se le explica, no se le esconde sin más",
);
assert.ok(
  portal.includes("cancellationWarning"),
  "la confirmación de baja debe explicar qué pasa al cancelar",
);
assert.ok(
  portal.includes("invoice.hostedUrl"),
  "cada factura enlaza al documento del proveedor",
);

// ── Copy: nada que el producto no haga ─────────────────────────────────────
for (const [name, source] of [
  ["PricingCatalog.tsx", catalog],
  ["CheckoutStarter.tsx", starter],
] as const) {
  assert.doesNotMatch(
    source,
    /compatible con DWG|soporte DWG|reemplaza(?:r)? a AutoCAD|sustituye a AutoCAD/iu,
    `${name} promete algo que el producto no hace`,
  );
}
assert.match(
  catalog,
  /DXF/u,
  "DXF sí: se importa y se exporta, y eso se puede decir",
);
assert.ok(
  commercialConfig.includes('"/precios"'),
  "la superficie pública debe conocer la ruta de precios",
);

console.log(
  "commercial-surface: precios sin cifras a mano, compra vetada sin pasarela, retorno ciego a la URL y baja sólo para owner",
);
