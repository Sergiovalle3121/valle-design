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

### 2026-09-04 · Cola 2 · El kernel WASM, enchufado al teselado caliente

Qué existe ahora que antes no: `apps/web/src/lib/cad/render/curve-kernel-tessellation.ts`
enruta **arcos, círculos, elipses y splines** al kernel de curvas y deja todo lo demás en el
carril de adaptadores. Arcos y elipses cruzan la frontera **por lotes**, agrupados por
(tipo × pasos) —y «pasos» es el escalón de LOD que ya resolvía `cadRenderSegmentBudget`—, así
que `mechanical@10k` entero cruza en **6 llamadas** para sus 5.600 arcos/círculos/elipses. La
spline cruza una vez por curva: la ABI v1 del binario no tiene entrada de lote para ella
porque cada una trae su vector de nudos de longitud propia, y el crate no se toca en esta
entrega.

El punto de inserción es `tessellate.worker.ts`: su núcleo `tessellateCadEntityBatch` delega
en el módulo nuevo, de modo que el carril fuera de hilo del pipeline (activo por defecto en el
navegador, `resolveCadOffThreadTessellator`) y su reserva síncrona pasan los dos por el kernel
sin cambiar ni una firma. El **binario se calienta desde el worker**, no desde el hilo
principal: `warmCadRenderCurveKernel()` se lanza sin esperarla al arrancar el worker y, hasta
que llega, el motor JavaScript sirve los lotes.

Evidencia (`npx tsx src/lib/cad/render/curve-kernel-tessellation.spec.ts`, 12 s, 28
comprobaciones): **7.530.200 coordenadas EXACTAS** —igualdad de bits, no tolerancia— entre el
carril del kernel y el de adaptadores sobre `mechanical@10k` y `plano-real@10k` (8.200 curvas
desviadas); las mismas 7.530.200 con el **binario del árbol instalado**, con peor desviación
relativa medida **0,000e+0**, es decir que el empaquetado a `Float32Array` absorbe entera la
diferencia entre los dos motores; y las mismas 7.530.200 idénticas **sin binario**, tras
calentar contra una URL que no existe.

Regresión verde: los 18 specs de `render/`, `wasm/curve-kernel-parity`,
`wasm/curve-kernel-fallback`, `curve-tessellate`, `npm run typecheck` del árbol entero y
`npm run check:cad`.

Rúbrica: el criterio `wasm.toolchain` pasa de ✖ «NADIE lo importa» a ✅ citando
`apps/web/src/lib/cad/render/curve-kernel-tessellation.ts`. Ver el «Todavía no» de abajo sobre
por qué la FILA sigue mostrando 1/2.

## «Todavía no»

### 2026-09-04 · La fila «Kernel Rust/WASM» sigue en 1/2 pese a tener sus dos criterios verdes

Con el cable puesto, `node scripts/cad/rubric.mjs --verbose` muestra los **dos** criterios de
la fila en ✅ (2 pt ganados) y cita el importador. La fila sigue leyéndose `1/2` por una regla
distinta y anterior: `rubric.mjs` aplica un techo a toda categoría cuyos puntos ganados vengan
**íntegramente de evidencia propia** (`earned === category.points && independentEarned === 0`
→ `points − 1`), que es la regla 1 de la campaña de cimientos. Para llegar a 2/2 hace falta un
**oráculo externo** para el kernel: un teselado de referencia de un tercero, o la medida en
hardware de un usuario real. Marcar la evidencia como `independent: true` en
`docs/competitive/rubric.json` sería a la vez tocar un archivo compartido (R2) y relajar un
gate (R6): no se hace.

### 2026-09-04 · Qué motor sirvió cada lote no llega al hilo principal

`tessellateCadEntitiesWithCurveKernel` devuelve `stats.backend` (`wasm` | `javascript`) y su
`fallbackReason`, pero el worker no los devuelve en su respuesta, así que el pipeline no puede
publicarlos junto a `tessellation: source` ni un golden de navegador puede afirmar «el binario
CORRIÓ aquí». Es exactamente el silencio contra el que ya avisa `pipeline-offthread.ts` para
`source`. El diseño está claro y cabe entero en `render/`: `backend?` opcional en
`CadTessellateWorkerResponse`, la promesa del pool resolviendo `{results, backend}`,
`CadTessellateOffThreadResult.backend`, el carril guardándolo y `CadRenderPipelineStats`
publicándolo. No entra en esta entrega para no ampliarla; queda como primera tarea de la
siguiente.

### 2026-09-04 · La ganancia del kernel no se puede MEDIR en este contenedor

Con el motor por defecto (JavaScript) el carril del kernel hace el mismo trabajo que el de
adaptadores más el empaquetado plano: no es más rápido y no se afirma que lo sea. La ganancia
la trae el binario, y medirla como la ve un usuario exige navegador: aquí **no hay navegadores
de Playwright y no se pueden instalar** (`npx playwright install chromium` sale por egreso
denegado, `/root/.cache/ms-playwright` no existe) ni hay GPU. Lo que sí está medido aquí es la
PARIDAD con el binario cargado en Node, que es lo que autoriza a encenderlo.
