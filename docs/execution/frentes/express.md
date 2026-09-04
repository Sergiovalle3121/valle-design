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

_(sin entradas todavía)_

## «Todavía no»

_(sin entradas todavía)_
