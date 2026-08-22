# El primer día en Valle Design

De clonar a tener el producto corriendo y tu primer cambio dentro. Si algo de
esta página no funciona como dice, ESO es un defecto: repórtalo como tal.

## Qué es esto

Valle Design es un CAD 2D técnico en español que corre en el navegador, para
despachos de arquitectura en México. Compite contra AutoCAD LT y contra la
piratería en el flujo diario: dibujar con precisión, acotar con la norma del
despacho, componer la lámina y publicar el PDF a escala. El alcance completo y
el estado real por área viven en `docs/competitive/` (la rúbrica es la fuente
autoritativa, no este párrafo).

## Requisitos

- **Node 22.x** (el repo se desarrolla con 22.18; `@types/node` está alineado
  a 22 y las herramientas asumen ≥22).
- **PostgreSQL 16** para la API con persistencia real. En desarrollo, sin
  `DATABASE_URL`, la API arranca con SQLite local (suficiente para el primer
  día).
- Windows, macOS o Linux. En Windows: si el equipo tiene Control de
  aplicaciones (Smart App Control/WDAC), la primera instalación puede bloquear
  binarios nativos recién extraídos (esbuild, SWC de Next). El build de web
  funciona con los bindings WASM de Next 16.2; si `esbuild` da
  `spawn UNKNOWN`, revisa esa política antes de sospechar del repo.

## Los tres comandos

```bash
npm ci          # ~3-4 min. Instala TODOS los workspaces desde el lockfile.
npm run dev     # arranca web (Next, puerto 3000) y api (Nest, puerto 3001) juntos
```

Abrir <http://localhost:3000>. La tercera cosa no es un comando: copia
`.env.example` a `.env` sólo si necesitas PostgreSQL, CFDI o correo; el
arranque de primer día no lo exige.

Tiempos esperados en una máquina normal: `npm ci` 2–4 min, primer
`npm run dev` 30–60 s hasta servir, `npm run build` completo 3–6 min,
`npm test` 4–8 min, `npm run check:cad` 3–5 min.

## Qué es cada carpeta (una frase cada una)

| Carpeta | Qué es |
| --- | --- |
| `apps/web` | El producto que ve el usuario: Next.js, el estudio CAD entero. |
| `apps/web/src/lib/cad` | El corazón: documento canónico, motor de comandos, geometría, render, interop — lógica PURA, probada en Node. |
| `apps/web/src/components/cad` | Los componentes React del estudio; `editor/Layout3DEditor.tsx` es el monolito en descomposición (ver su deuda declarada). |
| `apps/api` | NestJS: identidad, tenancy, documentos CAD persistidos (CAS), comercial (planes, CFDI), outbox. |
| `packages/contracts` | El contrato OpenAPI primero; de aquí se GENERA el SDK. |
| `packages/design-sdk` | SDK TypeScript generado del contrato; no se edita a mano. |
| `packages/dwg-codec` | Códec DWG propio (lectura 2000/2004 validada); aislado del producto por política. |
| `scripts/` | Los gates: cada `check:*` de la raíz vive aquí. |
| `docs/` | Decisiones (`adr/`), gobernanza, competitivo (rúbrica), ejecución (campañas y backlog), onboarding (esto). |

El mapa del sistema con fronteras y flujos: [`MAPA.md`](MAPA.md).

## Correr las pruebas y leer un fallo

```bash
npm test                 # todos los workspaces (turbo). Web: specs tsx en Node; API: jest.
npm run check:cad        # la batería del producto CAD (ver GATES.md)
```

- Un spec de web es un archivo autoejecutable (`npx tsx ruta/al/spec.ts`):
  falla con un `AssertionError` con mensaje en español que dice QUÉ invariante
  se rompió. Corre el archivo solo antes que la suite entera.
- Un fallo de API con `Test Suites: 1 failed` bajo carga suele ser el timeout
  del round-trip >1MB: repite el spec en aislamiento antes de tocar nada
  (`node --experimental-vm-modules scripts/jest.js --testPathPatterns <spec>`,
  desde `apps/api`).
- Los gates DWG necesitan el espejo del corpus:
  `VALLE_DWG_CORPUS_MIRROR=<ruta al clon de valle-design-dwg-conformance>`.
  Sin él, `check:dwg-evidence` compara contra un árbol sin corpus y falla.

## Ramas, PRs y gates

- Política de ramas completa: `CONTRIBUTING.md` (main única de larga vida,
  prefijo `claude/` o `deps/`, vida máxima 7 días/30 commits, borrado al
  cerrar).
- Antes de CUALQUIER push a main, los seis gates locales verdes sobre el SHA
  exacto: `check:cad`, `check:dwg`, `typecheck`, `test`, `lint`, `build`.
- Un PR además necesita los checks de CI verdes (los nombres estables están en
  `docs/governance/repository-protection-baseline.json`) y la plantilla de PR
  llena: alcance, procedencia, desarrollo asistido, riesgos y rollback.

## A quién se le pregunta qué

Hoy el proyecto tiene UN titular y contribuidor humano: Sergio Valle Zárate
(`@Sergiovalle3121`). Toda duda de producto, alcance, licencias o gobernanza
es para él. Las respuestas técnicas que no requieren a una persona están, en
este orden: en el gate que falló (su mensaje dice qué arreglar), en el ADR
correspondiente (`docs/adr/README.md`), y en la bitácora de la campaña más
reciente (`docs/execution/`).
