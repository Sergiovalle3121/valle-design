# F2 · Velocidad sentida

> Frente de la campaña «Superar a AutoCAD completo» (2026-09-04).
> Coordinador: `docs/execution/CAMPANA_SUPERAR_20260904.md`.
> Mapa de brechas: `docs/competitive/distancia-autocad-completo-20260903.md`.

## Territorio exclusivo

- `apps/web/src/lib/cad/render/**`
- `apps/web/src/lib/cad/wasm/**`
- `crates/**`
- `apps/web/src/lib/cad/*index*`
- `apps/web/e2e/performance/**`
- `docs/cad/evidence/*100k*`
- `scripts/perf/**`

## Cola

1. `architecture@100k` a SLO: ≤5 s de detalle completo y ≥30 fps de paneo p95. Hoy 25.3 s y 8.57 fps. El índice ya dio ×6.75; el perfil señala teselado y subida por lotes.

2. Kernel WASM enchufado: la paridad numérica está verde y nadie lo importa desde el producto. Que el teselado caliente pase por él con fallback, y la evidencia de la ganancia. **Criterio de rúbrica: alguien fuera de `lib/cad/wasm` debe importarlo** (sin contar specs).

3. Estrés de edición densa a 100k (selección y modificación sobre trazos densos) con artefacto versionado por corrida.

4. Medición en GPU real reproducible por el titular con un solo comando, con la máquina declarada en el artefacto.

## Cierre

Las filas de rendimiento de la rúbrica sin criterios abiertos; evidencia con máquina declarada.

## Lo que hay que tener presente

Prohibido relajar el SLO. Si la cifra no llega, se declara la cifra real y el siguiente cuello, no se mueve el umbral.

## Las reglas que no se negocian

- **R1 Territorio.** Sólo modificas los directorios de arriba. Si necesitas algo fuera,
  NO lo tocas: lo escribes en `docs/execution/frentes/velocidad-peticiones.md` y el coordinador
  lo aplica en la ventana de integración.
- **R2 Archivos compartidos, sólo el coordinador.** `package.json`, `turbo.json`,
  `.github/workflows/*`, `docs/competitive/rubric.json`, `scripts/cad/monolith-budget.json`,
  `scripts/lint-budget.json`, `docs/governance/assisted-development-log.json`,
  `docs/execution/BACKLOG.md`, `docs/parity/ESCALERA.md`, `AGENTS.md`, `IDENTITY.md`,
  migraciones de la API y el esquema del documento canónico (`cad-document*.ts`,
  `cad-entities-v*.ts`). **Nunca edites la rúbrica.** Excepción única: el presupuesto del
  monolito se actualiza con `--update` si y sólo si BAJA.
- **R3 Tu árbol.** Trabajas en `/home/user/vd-velocidad` sobre la rama `campana/superar/velocidad`. Commits sí;
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
cd /home/user/vd-velocidad
npx vitest run <ruta de tu spec>        # lo tuyo primero, rápido
npm run typecheck                       # el árbol entero compila
npm run check:command-integrity         # si tocaste comandos
npm run check:cad                       # antes de cerrar
```

## Bitácora

_(sin entradas todavía)_

## «Todavía no»

_(sin entradas todavía)_
