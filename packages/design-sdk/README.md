# @valle/design-sdk

SDK TypeScript oficial de la **API v1 standalone de Valle Design**: identidad,
organizaciones, estado comercial y CAD.

- **Tipos generados** desde la fuente única del contrato:
  `packages/contracts/specs/design-api.v1.yaml` (OpenAPI 3.1, validado con
  Redocly). Se regeneran con `npm run generate` (openapi-typescript pineado);
  el resultado (`src/generated/design-api.ts`) está versionado — el build no
  depende de la red.
- **Cliente fetch fino y tipado** (`createDesignClient`): sin dependencias de
  runtime, métodos para toda la superficie standalone, errores contractuales como
  `DesignApiError` (con `code`, `details`, `requestId` y, en el 409 CAS,
  `expected`/`current` al nivel superior — la forma REAL del backend).
- **Test de compatibilidad de contrato** (`src/compat.spec.ts`): igualdad
  estructural entre los tipos generados y `@valle-design/contracts`
  (design-contracts.ts) — códigos de error, permisos `cad:*`, entitlement
  `design.cad`, puntero a blob del `CadDocumentEnvelope`, límites del
  documento y códigos de evento `design.*`. Corre con `npm test`
  (tsc + node --test).

## Uso

```ts
import { createDesignClient, DesignApiError } from "@valle/design-sdk";

const design = createDesignClient({
  baseUrl: "https://design.api.example.com",
});

// Cookies first-party (`credentials: include`) en todas las llamadas. En el
// navegador, las mutaciones leen `valle_csrf` automáticamente; `csrfToken`
// sigue disponible para SSR, tests o un lector de cookies propio.
const session = await design.identity.currentSession();
const organizations = await design.organizations.list();
const entitlements = await design.commercial.entitlements();

const { items } = await design.documents.list({ limit: 50 });
const doc = await design.documents.open(items[0].id);
// R3: doc.cadDocument llega SIEMPRE hidratado (inline), aunque el servidor lo
// persista como puntero a blob (>1 MB). doc.dxf = colocación del plano o null.

try {
  await design.documents.saveContent(
    items[0].id,
    doc.cadDocument!,
    doc.cadDocumentVersion,
  );
} catch (error) {
  if (error instanceof DesignApiError && error.isVersionConflict()) {
    // error.body.expected / error.body.current — recargar, comparar, reintentar.
  }
}
```

## Rutas canónicas

El YAML, el router Nest y el cliente usan literalmente `/v1/auth/*`,
`/v1/organizations*`, `/v1/commercial/*` y **`/v1/cad/*`**. El SDK no remapea
prefijos, no usa bearer tokens y no acepta identificadores de tenant u
organización para las lecturas comerciales: el servidor los deriva de la
sesión activa. Las invitaciones sólo devuelven un `invitationId`; el token
secreto nunca forma parte de la respuesta normal.

## Superficie standalone

- `identity`: register/login/logout/verificación/recuperación y gestión de
  sesiones propias (listar, rotar y revocar).
- `organizations`: listar, crear, activar, ver membresías e invitar/aceptar.
- `commercial`: suscripción activa y entitlements efectivos, sin precios ni
  información de pago.
- `projects`, `documents`, `reviews`, `blocks` y `assistance`: dominio CAD.

## Asistencia CAD

Review sessions, comentarios, intent y vision forman parte del contrato y del
cliente. `assistance.interpretIntent` y `assistance.vectorizeImage` devuelven
`available: false` cuando el motor opcional no está configurado; nunca fingen
haber aplicado cambios al documento.

## Scripts

| Script             | Qué hace                                                   |
| ------------------ | ---------------------------------------------------------- |
| `npm run generate` | Regenera `src/generated/design-api.ts` desde el YAML       |
| `npm run build`    | Compila a `dist/` (tsc, declaraciones incluidas)           |
| `npm test`         | Compila + test de compatibilidad de contrato (node --test) |
