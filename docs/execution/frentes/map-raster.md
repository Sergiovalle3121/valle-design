# F8 · Toolsets Map 3D y Raster Design

> Frente de la campaña «Superar a AutoCAD completo» (2026-09-04).
> Coordinador: `docs/execution/CAMPANA_SUPERAR_20260904.md`.
> Mapa de brechas: `docs/competitive/distancia-autocad-completo-20260903.md`.

## Territorio exclusivo

- `apps/web/src/lib/cad/geo*`
- `apps/web/src/lib/cad/map*`
- `apps/web/src/lib/cad/raster*`
- `apps/web/src/lib/cad/image*`
- `apps/web/src/lib/cad/engine/commands/geo*|map*|image*|vector*`
- `specs y goldens`

## Cola

1. Map: más sistemas de coordenadas (todo México y los EPSG comunes de LATAM); COGO (rumbos y distancias, cuadro de construcción); topología y consultas espaciales; edición de atributos GIS en tabla; exportar shapefile y GeoJSON (hoy sólo se importa).

2. Raster: **vectorización de líneas y textos de un escaneo** — es un criterio ABIERTO de la rúbrica que vale 2 pt, es tu entrega de mayor valor; IMAGEFRAME y transparencia; corrección de deformación y limpieza (deskew, despeckle).

## Cierre

Filas Map y Raster a 4/4 salvo evidencia independiente; el criterio de vectorización otorgado por la rúbrica.

## Lo que hay que tener presente

Fondos de mapa en línea sólo con permiso de uso escrito; si no lo hay, no se pone.

## Las reglas que no se negocian

- **R1 Territorio.** Sólo modificas los directorios de arriba. Si necesitas algo fuera,
  NO lo tocas: lo escribes en `docs/execution/frentes/map-raster-peticiones.md` y el coordinador
  lo aplica en la ventana de integración.
- **R2 Archivos compartidos, sólo el coordinador.** `package.json`, `turbo.json`,
  `.github/workflows/*`, `docs/competitive/rubric.json`, `scripts/cad/monolith-budget.json`,
  `scripts/lint-budget.json`, `docs/governance/assisted-development-log.json`,
  `docs/execution/BACKLOG.md`, `docs/parity/ESCALERA.md`, `AGENTS.md`, `IDENTITY.md`,
  migraciones de la API y el esquema del documento canónico (`cad-document*.ts`,
  `cad-entities-v*.ts`). **Nunca edites la rúbrica.** Excepción única: el presupuesto del
  monolito se actualiza con `--update` si y sólo si BAJA.
- **R3 Tu árbol.** Trabajas en `/home/user/vd-map-raster` sobre la rama `campana/superar/map-raster`. Commits sí;
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
cd /home/user/vd-map-raster
npx vitest run <ruta de tu spec>        # lo tuyo primero, rápido
npm run typecheck                       # el árbol entero compila
npm run check:command-integrity         # si tocaste comandos
npm run check:cad                       # antes de cerrar
```

## Bitácora

_(sin entradas todavía)_

## «Todavía no»

_(sin entradas todavía)_
