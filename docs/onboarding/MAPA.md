# El mapa del sistema en una página

Léelo en diez minutos y sabrás dónde tocar. Cada frontera nombrada aquí tiene
un gate que la defiende (ver [GATES.md](GATES.md)).

## Los tres procesos

```
┌────────────────────────┐   HTTP /v1 (OpenAPI)   ┌──────────────────────┐
│  WEB (Next.js, :3000)  │ ─────────────────────► │  API (NestJS, :3001) │
│  el estudio CAD entero │ ◄───────────────────── │  identidad · tenancy │
│  corre EN el navegador │      design-sdk        │  CAS · comercial     │
└───────────┬────────────┘                        └──────────┬───────────┘
            │                                                │ TypeORM
            │  el dibujo vive y se edita AQUÍ                ▼
            │  (documento canónico en memoria)      ┌────────────────┐
            └── guardar = mandar el JSON canónico ─►│ PostgreSQL 16  │
                con CAS (version check) a la API    │ (SQLite en dev)│
                                                    └────────────────┘
```

- La web es el CAD: TODO el dibujo, la geometría y el render ocurren en el
  navegador. La API no entiende de geometría; custodia documentos, identidad,
  organizaciones y dinero.
- El SDK (`packages/design-sdk`) se GENERA del contrato
  (`packages/contracts/specs/design-api.v1.yaml`). Regla: primero el contrato,
  luego `npm run generate`, nunca el SDK a mano. El gate compara byte a byte.

## La fuente de verdad: el documento canónico

`apps/web/src/lib/cad/cad-document.ts`. Un solo JSON versionado (esquema 9
hoy) con TODO: entidades, capas, estilos, bloques, restricciones, paper
spaces, historial, manifiesto de pérdidas. Reglas que no se negocian:

1. **Migración aditiva**: un documento viejo se abre entero y sólo cambia
   `meta.schema` (ADR-0011). Los tipos persistidos están CONGELADOS
   (`IDENTITY.md`, ADR-0010): renombrarlos rompe planos de clientes.
2. **Toda mutación entra por el lote**: `executeCadEntityCommandBatch` — una
   orden del usuario = una transacción = un paso de deshacer. No hay segunda
   puerta de escritura; LISP y plugins heredan la disciplina por construcción.
3. **Guardar es CAS**: la API rechaza el guardado si la versión no coincide;
   la web resuelve el conflicto, nunca lo pisa.

## El motor de comandos

`lib/cad/engine/`: ~192 comandos estilo AutoCAD como máquinas de estado PURAS
(entra un punto/palabra/selección, sale el siguiente prompt y, al final, el
lote). No tocan React ni THREE: el ANFITRIÓN (`components/cad/command-line/`)
aplica lotes, atiende peticiones (trazar, exportar, cambiar de espacio) y
avisa a la interfaz. El gate de integridad ejecuta los 192 sin navegador y
prohíbe el «hecho» sin efecto.

## El pipeline de render

`lib/cad/render/`: teselación (cacheada, por worker) → lotes instanciados por
estilo (`line-batch`) → THREE con shaders propios (grosor en píxeles, orden de
dibujo por profundidad, tipos de línea en el fragment). El monolito
(`Layout3DEditor.tsx`) todavía orquesta cámara y escena: es la pieza en
descomposición declarada, no el patrón a imitar. Limitación medida y
documentada: coordenadas ~10⁶–10⁷ pierden centímetros en pantalla por float32
(`docs/cad/evidence/large-coordinate-precision.json`); el documento y la
exportación no pierden nada.

## La frontera de interoperabilidad

- DXF: lectura y escritura PROPIAS en `lib/cad/` (web) — con manifiesto de
  pérdidas que viaja JUNTO al archivo.
- DWG: **fuera del producto por política** (ADR-0004/0007/0012). El laboratorio
  y su corpus viven en el repositorio `valle-design-dwg-conformance`; el
  producto sólo detecta el formato y lo dice. `packages/dwg-codec` es el códec
  propio en maduración; su superficie pública y su estado real los gobierna la
  evidencia (`check:dwg-evidence`), no el optimismo.
- El contrato de cualquier formato futuro (bytes → representación neutral →
  documento, pérdidas declaradas en ambos sentidos):
  `docs/interop/CONTRATO-INTEROP.md`.

## Multi-tenant y lo comercial (API)

Aislamiento por organización con política a nivel de fila; el guard de
permisos pregunta entitlements GENÉRICOS por código (`hasEntitlement`), el
catálogo admite N capacidades por plan (hoy se vende una, `design.cad`, y eso
es deliberado y honesto), y `UsageLedger` ya registra uso por organización con
métrica genérica e idempotencia (`design.document.saved`,
`design.document.published`). Cobrar algo nuevo mañana es una fila en el
catálogo y un `record()` más, no un rediseño.

## Fronteras que NO se cruzan

1. `lib/` no importa de `components/` ni de `app/` (gate de dirección).
2. El producto no importa del laboratorio DWG (gate de frontera DWG).
3. El SDK generado no se edita a mano (gate de contrato).
4. Ningún identificador persistido se renombra (lista congelada, gate).
5. Ningún comando responde éxito sin efecto verificable (gate de integridad).
6. El registro de comandos es inmutable; plugins y LISP COMPONEN, nunca mutan.

## Decisiones

Las diez ADR con su estado: [`docs/adr/README.md`](../adr/README.md).
