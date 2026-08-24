# Informe — Campaña de rendimiento (re-medición honesta)

**Fecha:** 24 de agosto de 2026 · **Base de arranque:** `2a2c8ac` (189/220, 85.9 %) ·
**Cierre de esta re-medición:** `1cd0f43`

Este informe no implementa: **mide**. La cola pedía confirmar, con corridas
reales y no con la memoria de la campaña anterior, qué de lo que otros agentes
cambiaron hoy (A.1 origen flotante, A.2 diffing de activos, A.3 InstancedMesh,
A.4 kernel Rust/WASM enchufado) movió números de verdad, y qué sigue exactamente
donde estaba. La cultura del repositorio ya rechazó una vez un score inflado
(189/200 concedido por la sola existencia de un JSON cuyo contenido lo
desmentía — nota `Corte 2026-08-20` en `docs/competitive/rubric.json`); este
informe sigue esa regla al pie: ningún número aquí se reafirma sin corrida
propia de esta sesión.

---

## 1. Verificación de base: lint y typecheck

```
npm run lint       → 0 errores, 202 warnings (idéntico al techo declarado por A.2; ninguno nuevo en archivos tocados hoy)
npm run typecheck  → 6/6 paquetes en verde (contracts, dwg-codec, design-sdk, valle-design-api, web)
```

Ambos limpios sobre el árbol tal como quedó tras A.1–A.4. Nada que esconder
aquí.

Adicionalmente, sin que la tarea lo pidiera, se corrió la suite completa de
specs unitarios de `web` (`node scripts/run-specs.mjs`): **400/400 verdes**
(A.2 había reportado 397/397 antes de que B.2/B.3 agregaran specs de
materiales; los tres nuevos también están en verde).

---

## 2. La rúbrica competitiva, re-corrida

```
node scripts/cad/rubric.mjs --history
```

**Total: 189/220 (85.9 %) — IDÉNTICO al de la línea base `2a2c8ac`.**
El número de cabecera no se movió. Pero por debajo de él sí hubo un cambio
real, y vale la pena entender por qué no llegó a la cifra final.

### 2.1 Kernel Rust/WASM — el gap SÍ se cerró, el score no lo refleja

La línea base decía: *«falta: alguien importándolo fuera de `lib/cad/wasm`»*.
Hoy:

```
grep "cad/wasm" apps/web/src/lib/cad/render/tessellate.worker.ts
→ 23:} from "../wasm/curve-kernel";
```

`tessellate.worker.ts` (fuera de `lib/cad/wasm`) importa el kernel real, y
`docs/cad/evidence/wasm-parity.json` sigue con `verdict.passed=true` (4,4
millones de coordenadas comparadas, regenerado hoy mismo por A.4). El criterio
`wasm.toolchain` pasó de `notGranted` a **otorgado** — se puede comprobar
diffeando los dos históricos:

```
docs/competitive/history/2026-08-24-2a2c8ac.json → wasm.notGranted = ["wasm.toolchain"]
docs/competitive/history/2026-08-24-1cd0f43.json → wasm.notGranted = []
```

Y sin embargo la fila **«Kernel Rust/WASM» sigue en 1/2**, exactamente como
antes. La razón no es que el trabajo no cuente: es la regla de independencia
del corte 2026-08-22 (`scripts/cad/rubric.mjs:596-605`) — una categoría que
llega a su tope de puntos SÓLO con evidencia propia (specs y benchmarks del
propio proyecto, sin oráculo externo ni material de terceros) retiene 1 punto
igual. Ni `wasm.gate` ni `wasm.toolchain` traen evidencia independiente, así
que aunque los DOS criterios ahora otorgan, el techo de la fila se retiene
igual que antes — antes por un criterio sin otorgar, ahora por la regla de
independencia. Dos motivos distintos, mismo 1/2 visible.

**Vale la pena dejarlo escrito para que la próxima campaña no lo redescubra
como si fuera nuevo:** el punto que falta en esta fila no se cierra con más
trabajo de wiring — ya está cerrado — se cierra con evidencia independiente
(un tercero, un oráculo externo) sobre el propio kernel.

### 2.2 Rendimiento 10k/100k — sigue en 11/12, y aquí está el trabajo real de esta sesión

La fila no se movió: **11/12**, mismo criterio pendiente
(`performance.architecture-100k`). Pero el TEXTO que la rúbrica cita
(«25,3 s de detalle completo y 8,57 fps») viene de
`docs/cad/evidence/browser-slo-100k.json`, cuya fecha de commit es
**2026-08-21** — es decir, de ANTES de los cuatro commits de esta campaña
(A.1 `393d1bb`, A.3 `844ca8a`/`e7d97f9`, A.4 `70ef2ee`, A.2 `595a9bb`, todos
del 2026-08-24). Reafirmar ese número sin volver a medir sería exactamente el
error que este proyecto ya pagó una vez. Sección 3 documenta la re-medición.

---

## 3. Re-medición de `architecture@100k` — lo que se pudo medir y lo que no

### 3.1 No hay GPU real en este entorno

```
nvidia-smi   → command not found
glxinfo      → command not found
echo $DISPLAY → (vacío)
```

El `browser-slo-100k.json` vigente se corrió en un portátil Windows con AMD
Radeon real (ANGLE D3D11). Este entorno de agente no tiene GPU: cualquier
Chromium que se lance aquí cae en `SwiftShader` (rasterizado por software),
igual que ya declara `docs/cad/evidence/browser-slo-100k-swiftshader-ci.json`.
**No hay forma de producir en esta sesión un número comparable al de la
línea base real-GPU.** Decirlo así, en vez de correr el benchmark y
presentarlo como si fuera la cifra de producto, es el punto de esta sección.

### 3.2 Lo que SÍ se corrió: el benchmark real, sobre el código de hoy, en software

```
CAD_PERF_E2E=1 CAD_RENDER_BROWSER_TIER=full \
  npx playwright test e2e/performance/cad-render-browser.spec.ts \
  -g "architecture@100000" --project=chromium
```

Verde (1 passed, 2.9 min), contra `apps/web/e2e/performance/cad-render-browser.spec.ts`
— el mismo arnés que generó la línea base, el mismo corpus, la misma cámara,
sólo que sobre `SwiftShader` en vez de una GPU real. Resultado, guardado en
`docs/cad/evidence/browser-slo-architecture-100k-resweep-20260824.json`:

| Métrica (perfil `next`, corpus `architecture@100000`) | Línea base real-GPU (2026-08-21, PRE-campaña) | Re-medición software (2026-08-24, POST-campaña) |
| --- | ---: | ---: |
| `fullDetailMs` | 25 339,8 ms | **56 585,7 ms** |
| `openSettled` | `true` | **`false`** (no asentó dentro del tope de reloj del arnés) |
| `pan.fpsP95` | 8,569 | **0,125** |
| `pan.trianglesP95` | 596 172 | 610 282 |

El número de software es **peor en términos absolutos**, y eso es exactamente
lo esperable: rasterizar 25k+ triángulos por cuadro sin GPU cuesta órdenes de
magnitud más. Sirve para UNA cosa y sólo una: confirma que el pipeline `next`
sigue ejecutando de punta a punta sobre el árbol de hoy (corpus, teselado,
subida de geometría, atlas de glifos, paneo, cierre) sin errores de consola ni
excepciones — la aserción de integridad del propio spec pasó. **No sirve, y
no se usa aquí, como sustituto de la medida de SLO**: comparar 56,6 s de
software contra el umbral de 5 s pensado para GPU real sería tan deshonesto
como reafirmar el 25,3 s viejo sin medir.

### 3.3 Por qué es improbable (aunque no está demostrado) que el número real-GPU haya cambiado

Ninguno de los cuatro cambios de esta campaña toca la ruta que domina el
costo de `architecture@100k` en la evidencia vieja
(`glyphRebuildFrames: 8`, `glyphsPerRebuild: 1811`, `textObjects: 2073` —
el atlas de glifos y el teselado de línea/muro, no el bloque INSERT):

- **A.1** (origen flotante) es una corrección de PRECISIÓN (float32 → error
  en unidades), no de rendimiento; resta un origen antes de empaquetar, mismo
  volumen de trabajo.
- **A.2/A.3** (diffing de activos, `InstancedMesh`) tocan el camino de
  `Asset[]`/bloques INSERT (mobiliario, equipo) — la mezcla `architecture` de
  este benchmark es muros/puertas/ventanas/cotas/texto, no activos con
  arquetipo.
- **A.4** (kernel WASM) está enchufado sólo en el carril fuera de hilo
  (`tessellateCadEntityBatch`), detrás de `curveKernel?: boolean`
  **apagado por defecto**. Verificado con grep sobre todo `apps/web/src`:
  ningún llamador en el árbol pasa `curveKernel: true`. El benchmark de
  navegador no lo ejercita en absoluto.

Esto es una inferencia razonada, NO una medición — se deja así de explícito
porque es justo la clase de afirmación que este informe existe para no
inflar. La única forma honesta de cerrar `performance.architecture-100k` es
correr `browser-slo-100k` de nuevo en hardware con GPU real, como se hizo el
21-08.

### 3.4 Veredicto de la fila

`performance.architecture-100k` **sigue sin poder concederse**. No porque se
haya confirmado que sigue fallando con datos de hoy — sino porque la única
evidencia real-GPU disponible es de antes de esta campaña, y esta sesión no
tuvo manera de producir una más nueva. El texto de
`docs/competitive/rubric.json` que cita 25,3 s / 8,57 fps queda **desactualizado
por antigüedad de máquina**, no por ser falso: sigue siendo la última medida
real-GPU que existe, simplemente ya no es "de hoy". Se deja anotado en el
BACKLOG (§4) en vez de tocar el criterio sin evidencia fresca.

---

## 4. Qué queda pendiente, y para quién

| Ítem | Estado | Siguiente paso |
| --- | --- | --- |
| `performance.architecture-100k` (25,3 s/8,57 fps vs ≤5 s/≥30 fps) | **Evidencia real-GPU stale (2026-08-21), sin remedir con GPU en esta sesión (sin GPU disponible)** | Correr `CAD_PERF_E2E=1 CAD_RENDER_BROWSER_TIER=full npx playwright test e2e/performance/cad-render-browser.spec.ts` completo en máquina con GPU real; regenerar `docs/cad/evidence/browser-slo-100k.json` con el árbol de hoy (post A.1-A.4) antes de tocar el criterio |
| `wasm.toolchain` (Kernel Rust/WASM importado fuera de `lib/cad/wasm`) | **CERRADO** por A.4, verificado en esta sesión (import + `wasm-parity.json` verde) | Ninguno — el punto que falta en la fila es de evidencia independiente, no de wiring |
| Independencia de evidencia en «Kernel Rust/WASM» (retiene 1/2 pese a 2/2 de criterios) | Sin evidencia de tercero | Conseguir un oráculo externo (paridad contra una librería de terceros, o medición fuera del propio repo) — NO otro spec propio |
| Corpus `architecture@100k` con GPU real desde ESTE árbol | No existe | Repetir §3.2 en hardware con GPU y actualizar `browser-slo-100k.json` |

---

## 5. Archivos que deja esta sesión

- `docs/cad/evidence/browser-slo-architecture-100k-resweep-20260824.json` —
  evidencia de la re-medición de software descrita en §3.2, con su propio
  `note` explicando el alcance parcial (un solo corpus, sin GPU) para que
  nadie la confunda con una corrida completa del escalón `full`.
- `docs/competitive/history/2026-08-24-1cd0f43.json` — snapshot histórico
  generado por `rubric.mjs --history` al correr esta verificación (commit
  `1cd0f43`, el HEAD del árbol al momento de medir).

Ningún archivo de código se tocó en esta sesión: es una campaña de medición,
no de implementación.
