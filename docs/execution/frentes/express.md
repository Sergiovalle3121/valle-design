# F4 · Express y universal

> Frente de la campaña «Superar a AutoCAD completo» (2026-09-04).
> Coordinador: `docs/execution/CAMPANA_SUPERAR_20260904.md`.
> Mapa de brechas: `docs/competitive/distancia-autocad-completo-20260903.md`.

## Territorio exclusivo

- `apps/web/src/lib/cad/engine/commands/express*|compare*|units*|clipboard*|pdf*`
- `apps/web/src/lib/cad/units*`
- `apps/web/src/lib/cad/compare*`
- `apps/web/src/lib/cad/pdf*`
- `sus specs y goldens`

## Cola

1. Las quince Express Tools que un veterano usa sin pensar: BREAKLINE, TXTEXP, FLATTEN, LAYWALK, ALIASEDIT, ARCTEXT, TCOUNT, TXT2MTXT, BURST, EXTRIM, MOCORO, DIMEX, DIMIM, SUPERHATCH, y las que el registro no tenga de LAYMRG/LAYDEL. Verifica primero cuáles existen ya (NCOPY existe).

2. DWG COMPARE / XREF COMPARE entre dos archivos cualesquiera, con nubes de revisión de las diferencias. La fila «Compare» actual compara versiones propias.

3. Unidades imperiales y arquitectónicas de punta a punta — pies-pulgadas fraccionarios, UNITS Architectural/Engineering — en entrada, cota, DXF y PDF.

4. PDF como underlay con snap, y PDFIMPORT de vectores a entidades: verificar el alcance actual y cerrar lo que falte.

5. Portapapeles del SISTEMA: PASTESPEC y pegar entre pestañas (hoy es interno al editor).

6. CTB/STB: que un `.ctb` real importado gobierne el PDF; completar STB.

## Cierre

Cada comando nuevo en el registro con veredicto del arnés de integridad (`npm run check:command-integrity`); goldens; unidades verificadas en `verification/`.

## Lo que hay que tener presente

Un comando que no es alcanzable con ratón no cuenta: la campaña mantiene 243/243. Fix-or-hide.

## Las reglas que no se negocian

- **R1 Territorio.** Sólo modificas los directorios de arriba. Si necesitas algo fuera,
  NO lo tocas: lo escribes en `docs/execution/frentes/express-peticiones.md` y el coordinador
  lo aplica en la ventana de integración.
- **R2 Archivos compartidos, sólo el coordinador.** `package.json`, `turbo.json`,
  `.github/workflows/*`, `docs/competitive/rubric.json`, `scripts/cad/monolith-budget.json`,
  `scripts/lint-budget.json`, `docs/governance/assisted-development-log.json`,
  `docs/execution/BACKLOG.md`, `docs/parity/ESCALERA.md`, `AGENTS.md`, `IDENTITY.md`,
  migraciones de la API y el esquema del documento canónico (`cad-document*.ts`,
  `cad-entities-v*.ts`). **Nunca edites la rúbrica.** Excepción única: el presupuesto del
  monolito se actualiza con `--update` si y sólo si BAJA.
- **R3 Tu árbol.** Trabajas en `/home/user/vd-express` sobre la rama `campana/superar/express`. Commits sí;
  **push a origin no** (el coordinador hace un push por ventana).
- **R6 Las reglas de la casa, intactas.** Prohibido relajar gates, umbrales, goldens o
  presupuestos. Prohibido tocar identificadores persistidos (IDENTITY.md, ADR-0010).
  Prohibido renombrar `data-testid`. Fix-or-hide: lo que no gana su evidencia no es visible.
  Ningún claim sin evidencia; lo parcial se declara «todavía no» en tu bitácora, con fecha.
  Las banderas `DWG_IMPORT_FLAG` y `DWG_EXPORT_FLAG` NO se encienden en esta campaña.
- **R7 Bitácora.** Este archivo es tu memoria. Si tu contexto se compacta, lo relees primero.
  Nunca se pregunta al titular: se decide, se anota y se sigue.

## Cómo se valida antes de dar algo por hecho

```
cd /home/user/vd-express
npx vitest run <ruta de tu spec>        # lo tuyo primero, rápido
npm run typecheck                       # el árbol entero compila
npm run check:command-integrity         # si tocaste comandos
npm run check:cad                       # antes de cerrar
```

## Bitácora

### C1 · Reconocimiento del territorio (2026-09-04)

Medido, no supuesto. El registro real (`CAD_COMMAND_DESCRIPTORS`) tiene **274 comandos** y
`node scripts/cad/ui-command-reach.mjs` da **274/274 alcanzables con el ratón** — la cinta se
genera del propio registro (`ribbon.ts` recorre los descriptores), así que un comando nuevo
nace con botón. Lo que cuesta registrar un comando son cuatro archivos FUERA de mi territorio:
`engine/index.ts`, `engine/command-summaries.ts` (contrato fail-closed, un comando mudo rompe
CI), `engine/alias-table.ts` (el pipeline de entrada resuelve por ESTA tabla, no por el
descriptor) y `docs/cad/evidence/ui-command-reach.json` (regenerado). Todo eso va por petición.

**De la cola 1 (Express Tools), lo que YA existe en el registro:** `LAYWALK`, `LAYMRG`,
`BURST`, `NCOPY`, `TEXTALIGN`, `QDIM`, `QLEADER`, `XPLODE`, `OVERKILL`, `SETBYLAYER`, `CHPROP`.
**Lo que NO existe:** `BREAKLINE`, `TXTEXP`, `FLATTEN`, `ALIASEDIT`, `ARCTEXT`, `TCOUNT`,
`TXT2MTXT`, `EXTRIM`, `MOCORO`, `DIMEX`, `DIMIM`, `SUPERHATCH`, `LAYDEL`.

**Cola 4 (PDF) — el hallazgo caro.** `apps/web/src/lib/cad/pdf/` son ~250 KB de motor
TERMINADO y probado contra corpus real: `importCadPdf`, `readCadPdfPageList`,
`cadPdfAttachCommands`, `cadPdfClipCommands`, `cadPdfUnderlayFadeCommands`,
`cadPdfScaleToDistanceCommands`, `cadPdfUnderlayPageCommands`, informe de pérdidas, y
`check:pdf-corpus` de gate. **Ningún comando lo alcanza.** `grep PDFATTACH|PDFIMPORT` en
`engine/` da cero; el único consumidor del subsistema fuera de sí mismo es `cadPdfInflate`
desde `session-catalogs.ts`, para descomprimir `.ctb`. Por la regla 1 de la campaña de
cimientos, hoy PDF **no está implementado**: es un subsistema sin importador.

**Cola 2 (COMPARE).** No hay diff de entidades en ningún sitio. Lo único que existe es
`snapshots.ts`: `diffCadSnapshots` compara dos HASHES y devuelve `changed: true|false`. No
hay añadido/borrado/modificado, no hay nubes de revisión, no hay comparar dos archivos.
Greenfield entero, y entero dentro de mi territorio (`compare*`). `revcloudVertices` y
`REVCLOUD_BULGE` ya existen exportados en `engine/commands/draw-rings.ts`.

**Cola 3 (unidades imperiales).** Existe la mitad de SALIDA: `unit-format.ts` formatea
`architectural`/`engineering`/`fractional`, `system-variables.ts` mapea `LUNITS`→sistema y
`inquiry/reports.ts` lo consume. Falta lo demás, y está medido con sonda:

- **Entrada: imposible.** `parseCoordinate` usa `Number(s)`. Medido hoy — `1'-6 1/2"`, `12'`,
  `6"`, `6 1/2`, `1'6` → `{ok:false,"No se pudo interpretar la entrada"}`; `@1'-0",0` →
  `{ok:false,"Coordenada inválida"}`.
- **Cota: métrica y nada más.** `dimension-format.ts` declara
  `type LengthUnit = 'mm' | 'cm' | 'm'`. No hay pulgada ni pie en el rótulo de una cota.
- **DXF: no viaja.** `dxf-export.ts` escribe `$INSUNITS` desde `options.units` (mm/cm/m) y
  **no escribe `$LUNITS` ni `$LUPREC`**: el ajuste arquitectónico del dibujo no sobrevive al
  archivo.

**Cola 6 (CTB/STB).** Está mucho más avanzado de lo que la cola sugiere:
`plot/plot-style-table.ts` lee un `.ctb` real (detecta `PIAFILEVERSION`, localiza el flujo
zlib y lo descomprime con el códec inyectado), tiene CTB y STB, y `session-catalogs.ts` ya
enchufa `importCadPlotStyleTable` + `cadPdfInflate` en la sesión. Queda por medir si la tabla
GOBIERNA el PDF de salida; `plot/` no es territorio mío.

**Cola 5 (portapapeles).** `COPYCLIP/CUTCLIP/COPYBASE/PASTECLIP/PASTEORIG` existen y viajan
por la petición de anfitrión `clipboard`. `PASTESPEC` no existe, y lo copiado vive dentro de la pestaña: no llega al portapapeles del sistema.

**Frontera que este reconocimiento deja escrita:** `lib/cad/clipboard.ts`,
`lib/cad/precision-input.ts`, `lib/cad/dimension-format.ts`, `lib/cad/dxf-export.ts`,
`lib/cad/snap-engine.ts`, `engine/command-types.ts` y `lib/cad/plot/` están FUERA de mi
territorio aunque la cola los toque. Todo lo que necesiten va a `express-peticiones.md` con
el diseño completo.

## «Todavía no»

_(sin entradas todavía)_
