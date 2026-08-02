# @valle/design-sdk

SDK TypeScript oficial de la **API v1 de Valle Design (CAD)**.

- **Tipos generados** desde la fuente única del contrato:
  `packages/contracts/specs/design-api.v1.yaml` (OpenAPI 3.1, validado con
  Redocly). Se regeneran con `npm run generate` (openapi-typescript pineado);
  el resultado (`src/generated/design-api.ts`) está versionado — el build no
  depende de la red.
- **Cliente fetch fino y tipado** (`createDesignClient`): sin dependencias de
  runtime, un método por operación del contrato, errores contractuales como
  `DesignApiError` (con `code`, `details`, `requestId` y, en el 409 CAS,
  `expected`/`current` al nivel superior — la forma REAL del backend).
- **Test de compatibilidad de contrato** (`src/compat.spec.ts`): igualdad
  estructural entre los tipos generados y `@axos/contracts`
  (design-contracts.ts) — códigos de error, permisos `cad:*`, entitlement
  `design.cad`, puntero a blob del `CadDocumentEnvelope`, límites del
  documento y códigos de evento `design.*`. Corre con `npm test`
  (tsc + node --test).

## Uso

```ts
import { createDesignClient, DesignApiError } from "@valle/design-sdk";

const design = createDesignClient({
  baseUrl: "https://design.api.example.com",
  token: () => localStorage.getItem("axos_access_token"),
});

const { items } = await design.documents.list({ limit: 50 });
const doc = await design.documents.open(items[0].id);
// R3: doc.cadDocument llega SIEMPRE hidratado (inline), aunque el servidor lo
// persista como puntero a blob (>1 MB). doc.dxf = colocación del plano o null.

try {
  await design.documents.saveContent(items[0].id, doc.cadDocument!, doc.cadDocumentVersion);
} catch (error) {
  if (error instanceof DesignApiError && error.isVersionConflict()) {
    // error.body.expected / error.body.current — recargar, comparar, reintentar.
  }
}
```

## Montaje de rutas (decisión R1)

El YAML describe los recursos como `/v1/<recurso>`; la API real los monta bajo
el prefijo de producto **`/v1/cad/<recurso>`**. El cliente aplica ese mapeo en
un único lugar (`mountPrefix`, default `/v1/cad`). Si algún día se despliega el
alias 1:1 del spec, basta `createDesignClient({ ..., mountPrefix: "/v1" })`.

## Superficie NO incluida en el cliente (deliberado)

- **review-sessions / comments**: descritos por el contrato v1, pero la API R1
  aún no los sirve (Fase 5 — review links UI + persistencia propia). Los TIPOS
  generados ya existen (`components["schemas"]["CadReviewSession"]`, …); los
  métodos se añadirán cuando el backend los monte.
- **intent / vision (copiloto NL→CAD)**: la API R1 los expone
  (`POST /v1/cad/documents/:id/intent`, `POST /v1/cad/vision`) pero están
  FUERA del contrato v1 (candidatos a v1.1); el editor los consume vía su
  adaptador interno, no vía SDK.

## Scripts

| Script | Qué hace |
|---|---|
| `npm run generate` | Regenera `src/generated/design-api.ts` desde el YAML |
| `npm run build` | Compila a `dist/` (tsc, declaraciones incluidas) |
| `npm test` | Compila + test de compatibilidad de contrato (node --test) |
