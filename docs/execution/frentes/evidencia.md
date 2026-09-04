# F11 · Evidencia independiente

> Frente de la campaña «Superar a AutoCAD completo» (2026-09-04).
> Coordinador: `docs/execution/CAMPANA_SUPERAR_20260904.md`.
> Mapa de brechas: `docs/competitive/distancia-autocad-completo-20260903.md`.

## Territorio exclusivo

- `valle-design-dwg-conformance/** (repo entero)`
- `docs/cad/evidence/**`
- `docs/cad/corpus/** (nuevo)`
- `apps/web/src/lib/cad/verification/** (sólo specs nuevas)`

## Cola

1. Corpus DXF/DWG de terceros con licencia permisiva o dominio público — **criterio ABIERTO de la rúbrica, 2 pt**. La red sólo alcanza `raw.githubusercontent.com`: sirven repositorios de ejemplo con licencia clara. Cada archivo con su procedencia y sus derechos registrados, y la matriz de fidelidad corriendo contra ellos.

2. Oráculos binarios adicionales (dwg2dxf, lectores IFC/STEP de terceros) instalados y cableados a los arneses. Si el entorno no los sostiene, se declara con el intento y el motivo.

3. Por cada fila que retiene 1 punto por «evidencia propia» (29 filas hoy), la spec que compara contra material ajeno, de modo que la rúbrica lo reconozca sola.

## Cierre

Los 5 puntos de evidencia independiente suben; cada archivo del corpus con sus derechos escritos.

## Lo que hay que tener presente

NO tocas código de producto. Un archivo sin licencia clara no entra: el corpus prefiere estar vacío a estar sucio.

## Las reglas que no se negocian

- **R1 Territorio.** Sólo modificas los directorios de arriba. Si necesitas algo fuera,
  NO lo tocas: lo escribes en `docs/execution/frentes/evidencia-peticiones.md` y el coordinador
  lo aplica en la ventana de integración.
- **R2 Archivos compartidos, sólo el coordinador.** `package.json`, `turbo.json`,
  `.github/workflows/*`, `docs/competitive/rubric.json`, `scripts/cad/monolith-budget.json`,
  `scripts/lint-budget.json`, `docs/governance/assisted-development-log.json`,
  `docs/execution/BACKLOG.md`, `docs/parity/ESCALERA.md`, `AGENTS.md`, `IDENTITY.md`,
  migraciones de la API y el esquema del documento canónico (`cad-document*.ts`,
  `cad-entities-v*.ts`). **Nunca edites la rúbrica.** Excepción única: el presupuesto del
  monolito se actualiza con `--update` si y sólo si BAJA.
- **R3 Tu árbol.** Trabajas en `/home/user/vd-evidencia` sobre la rama `campana/superar/evidencia`. Commits sí;
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
cd /home/user/vd-evidencia
npx vitest run <ruta de tu spec>        # lo tuyo primero, rápido
npm run typecheck                       # el árbol entero compila
npm run check:command-integrity         # si tocaste comandos
npm run check:cad                       # antes de cerrar
```

## Bitácora

_(sin entradas todavía)_

## «Todavía no»

_(sin entradas todavía)_
