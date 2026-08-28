import { strict as assert } from "node:assert";
import {
  catalogFailureMessage,
  classifyCatalogFailure,
  fetchPublicCatalog,
  parsePublicCatalog,
  CatalogContractError,
  CatalogHttpError,
  PUBLIC_PLANS_PATH,
} from "./public-catalog";

const body = {
  checkout: "external",
  trialDays: 90,
  items: [
    {
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
    },
  ],
};

const parsed = parsePublicCatalog(body);
assert.equal(parsed.checkout, "external");
assert.equal(parsed.items.length, 1);
assert.equal(parsed.items[0].seatsMinimum, 3);
assert.equal(parsed.items[0].prices[1].amountCents, 169000);
assert.equal(parsed.trialDays, 90);
assert.deepEqual(
  parsePublicCatalog({ checkout: "hosted", items: [], trialDays: 14 }),
  { checkout: "hosted", items: [], trialDays: 14 },
);

// Un cuerpo que no encaja NO se pinta a medias.
const rejected: unknown[] = [
  null,
  [],
  { items: [] },
  { checkout: "manual", items: [], trialDays: 90 },
  { checkout: "hosted", trialDays: 90 },
  // La duración de la oferta se valida como un precio: sin ella, fuera de
  // rango o fraccionaria, el catálogo entero se rechaza. «3 meses gratis» es
  // una promesa comercial y no se publica a ojo.
  { checkout: "hosted", items: [] },
  { checkout: "hosted", items: [], trialDays: 0 },
  { checkout: "hosted", items: [], trialDays: 91 },
  { checkout: "hosted", items: [], trialDays: 14.5 },
  { checkout: "hosted", items: [], trialDays: "90" },
  {
    checkout: "hosted",
    trialDays: 90,
    items: [{ ...body.items[0], name: "" }],
  },
  {
    checkout: "hosted",
    trialDays: 90,
    items: [{ ...body.items[0], kind: "gratis" }],
  },
  {
    checkout: "hosted",
    trialDays: 90,
    items: [{ ...body.items[0], perSeat: "sí" }],
  },
  {
    checkout: "hosted",
    trialDays: 90,
    items: [{ ...body.items[0], seatsMinimum: 2.5 }],
  },
  {
    checkout: "hosted",
    trialDays: 90,
    items: [
      {
        ...body.items[0],
        // Un importe en coma flotante es exactamente lo que este parser existe
        // para no dejar pasar: los céntimos son enteros o no son.
        prices: [{ currency: "MXN", period: "monthly", amountCents: 169.5 }],
      },
    ],
  },
  {
    checkout: "hosted",
    trialDays: 90,
    items: [
      {
        ...body.items[0],
        prices: [{ currency: "mxn", period: "monthly", amountCents: 16900 }],
      },
    ],
  },
  {
    checkout: "hosted",
    trialDays: 90,
    items: [
      {
        ...body.items[0],
        prices: [{ currency: "MXN", period: "semanal", amountCents: 16900 }],
      },
    ],
  },
];
for (const payload of rejected) {
  assert.throws(
    () => parsePublicCatalog(payload),
    CatalogContractError,
    `debería rechazar ${JSON.stringify(payload)}`,
  );
}

// ── Clasificación de fallos y textos honestos ──────────────────────────────
assert.deepEqual(classifyCatalogFailure(new CatalogHttpError(503)), {
  kind: "http",
  status: 503,
});
assert.equal(
  classifyCatalogFailure(new CatalogContractError("x")).kind,
  "contract",
);
assert.deepEqual(classifyCatalogFailure(new TypeError("fetch failed")), {
  kind: "network",
});
for (const failure of [
  { kind: "network" } as const,
  { kind: "http", status: 500 } as const,
  { kind: "contract", detail: "items" } as const,
]) {
  const message = catalogFailureMessage(failure);
  assert.ok(message.length > 20);
  // Un estado de error jamás sugiere un importe.
  assert.doesNotMatch(message, /\$\s*\d|\d+\s*(?:MXN|pesos)/iu);
}

// ── La lectura pide la moneda y NO manda credenciales ──────────────────────
async function main() {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fakeFetch = ((url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
    });
  }) as unknown as typeof fetch;

  const catalog = await fetchPublicCatalog({ fetchImpl: fakeFetch });
  assert.equal(catalog.checkout, "external");
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.includes(`${PUBLIC_PLANS_PATH}?currency=MXN`));
  assert.equal(
    calls[0].init.credentials,
    "omit",
    "la ruta es pública y cacheable: mandar cookies sólo estropearía la caché",
  );

  const failing = (() =>
    Promise.resolve({
      ok: false,
      status: 502,
      json: () => Promise.resolve({}),
    })) as unknown as typeof fetch;
  await assert.rejects(
    () => fetchPublicCatalog({ fetchImpl: failing }),
    CatalogHttpError,
  );

  console.log(
    "public-catalog: contrato validado antes de publicar precios y lectura pública sin credenciales",
  );
}

void main();
