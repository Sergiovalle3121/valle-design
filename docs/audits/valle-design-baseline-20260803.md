# Valle Design — inventario de verdad (baseline)

**Fecha:** 2026-08-03
**SHA de inicio:** `aa5c783064507f55f8d125a8ca0967a8961df248`
**Rama de trabajo:** `claude/valle-design-audit-8niaqt`
**Alcance de esta sesión:** Milestone 0 (R0 · detener la línea) — inventario,
reproducción del fallo de CI y corrección de las causas raíz verificadas.

Este documento distingue de forma explícita entre **verificado en esta sesión**
(con evidencia reproducible) y **no verificado**. Nada aquí debe leerse como
acreditación de capacidad: una afirmación sin evidencia es una hipótesis.

---

## 1. Estado real de la entrega

### 1.1 Ramas y PR

| Hecho | Estado |
| --- | --- |
| Ramas remotas | `main` y `claude/valle-design-audit-8niaqt` |
| PR abiertas al iniciar | ninguna |
| `claude/valle-design-audit-8niaqt` vs `main` | idénticas al iniciar (`git diff main..HEAD` vacío) |

No hay ramas históricas pendientes de fusionar. El problema no es limpiar
ramas: es recuperar la calidad de `main`.

### 1.2 CI en el SHA auditado

Run analizado: [`30777420447`](https://github.com/Sergiovalle3121/valle-design/actions/runs/30777420447)

| Job | Resultado |
| --- | --- |
| Gitleaks (historial completo) | ✅ success |
| SBOM CycloneDX | ✅ success |
| Contrato · Build · Test · Lint · Smoke | ✅ success |
| **E2E Playwright (Chromium + Firefox)** | ❌ **failure** |

**Corrección relevante frente a la auditoría de partida:** *tres de los cuatro
jobs están verdes*. El único bloqueo de `main` es el job E2E. La foto de la
auditoría («CI rojo») es cierta pero demasiado gruesa para priorizar.

Resultado del job E2E: **15 passed · 47 failed · 14 did not run**, 44.9 min.
La mayor parte del tiempo de reloj se consume en *timeouts*, no en trabajo útil.

---

## 2. Causas raíz del fallo E2E (verificadas)

Los 47 fallos **no son 47 defectos**. Se agrupan en un número pequeño de causas.

### 2.1 P0 — El editor se destruye entero en navegadores sin WebGL

**Ésta es la causa raíz de los 28 fallos de Firefox.** Es un defecto de
producto, no del test.

`THREE.WebGLRenderer` **lanza** cuando el navegador no concede contexto WebGL.
La construcción estaba sin proteger dentro del efecto de ciclo de vida de la
escena, así que la excepción escapaba, tumbaba el árbol React completo y el
usuario perdía **todo** el editor —no sólo el viewport— sin ningún mensaje.

Firefox headless no habilita WebGL por defecto; Chromium sí (SwiftShader). Por
eso el patrón de fallo era sistemático y siempre en el primer paso.

**Evidencia reproducible** (probe con `getContext` devolviendo `null` en
Chromium, antes de la corrección):

```
PAGE ERRORS: ["Error: Error creating WebGL context."]
cad-canvas count: 0
entity list count: 0
```

Esto explica exactamente cada firma observada en Firefox en CI:
`cad-canvas` ausente, `cad-native-entity-list` ausente,
`cad-native-entity-*` ausente, `cad-native-document-count` /
`cad-native-render-stats` ausentes, y el primer `locator.click` agotando el
tiempo.

**Impacto comercial:** cualquier usuario con WebGL deshabilitado por política
de empresa, sin GPU utilizable o con un perfil endurecido perdía el producto
completo con la pantalla vacía. No es un caso de laboratorio.

**Estado:** corregido y verificado en esta sesión (§4.1).

### 2.2 P1 — Test acoplado a Chromium (`newCDPSession`)

`e2e/golden/11-cad-recovery-journal.spec.ts` abría una sesión CDP
(`Storage.overrideQuotaForOrigin`) sin guardar por navegador. CDP sólo existe
en Chromium, así que en Firefox el test fallaba **siempre por el harness**.

**Estado:** corregido y verificado (§4.2).

### 2.3 P1 — Indicadores de recuperación observados en una carrera

Los avisos «Recovery local activo» / «Recovery local en riesgo» se renderizan
bajo la condición `dirty && …`. Esa semántica **es la correcta**: cuando el
guardado remoto confirma, el journal local se purga y el aviso deja de ser
cierto. Volverlo pegajoso afirmaría que existe una recuperación local ya
purgada.

El defecto estaba en los tests: el backend hermético responde el `PUT` de forma
instantánea, así que `dirty` se apagaba antes de que el test pudiera observar
el indicador. Explica los fallos #3 y #4 de Chromium en CI.

**Estado:** corregido y verificado (§4.3).

### 2.4 Mojibake visible en producto

Texto UTF-8 interpretado como cp1252 en 9 ficheros, **visible en la UI real**
(capturado en el snapshot de un fallo):

```
button "MTEXT: texto multilÃ­nea semÃ¡ntico, estilos y mÃ¡scara"
```

**Estado:** corregido y verificado (§4.4).

### 2.5 Fallos de Chromium aún abiertos

Tras las correcciones anteriores siguen abiertos los fallos de Chromium #1, #2,
#5–#19 (hatch asociativo, dimensiones, mleader, bloques, viewports, xrefs,
compare, fillet, capas, trim/extend, DXF loss manifest, OSNAP y el recorrido
comercial full-stack). **No están diagnosticados en esta sesión.** Requieren el
mismo tratamiento caso a caso y no deben declararse resueltos hasta tenerlo.

---

## 3. Defectos de producto verificados (independientes del CI)

### 3.1 P0 — POLYLINE persiste pero no existe para el runtime

Confirmado por lectura directa del código:

- `apps/web/src/lib/cad/cad-document.ts:235` — `polyline` **es** un tipo válido
  del documento canónico.
- `apps/web/src/lib/cad/entity-runtime.ts:30` — `CadNativeEntity` excluye
  explícitamente `polyline`.
- `apps/web/src/lib/cad/entity-runtime.ts:1232-1241` — `CAD_ENTITY_REGISTRY`
  registra `line, circle, arc, ellipse, spline, mtext, hatch, dimension,
  mleader, insert`. **No hay adaptador de `polyline`.**
- `CadEntityRegistry.supports()` devuelve `false` para `polyline`; el editor
  filtra la escena por ese registro.

**Consecuencia:** una polilínea importada de DXF se persiste en el documento y
**no** se renderiza, selecciona, edita, indexa ni sirve de contorno asociativo.
Es pérdida funcional silenciosa. Confirma la conclusión de la auditoría de
partida.

**Estado:** **no corregido.** Es trabajo de Milestone 1 y no debe hacerse a
medias: exige render, hit-test, bounds, grips por vértice y segmento, snaps,
propiedades, transformaciones, índice espacial, uso como boundary de HATCH,
serialización determinista, DXF con `bulge`/`width` y manifiesto de pérdidas,
undo/redo, recovery y colaboración, con pruebas unitarias, property-based,
golden y E2E.

### 3.2 Toolchain no reproducible

`.nvmrc` fija Node **20**; el entorno de desarrollo usado corre Node **22.22.2**
y npm 10.9.7 frente al `packageManager: npm@10.9.3` declarado. CI sí usa
`.nvmrc`. Es una divergencia real dev/CI que debe cerrarse.

### 3.3 Licencia y propiedad intelectual

`LICENSE` sigue titulado **«AXOS OS — Proprietary Software License»** en un
repositorio público que declara software propietario.

**BLOCKED-OWNER.** No es cosmético y no debe redactarse sin decisión del
titular: hay que resolver (a) si el repositorio sigue público y (b) el texto y
titular legal correctos. No se redacta aquí una licencia definitiva fingiendo
asesoría legal.

---

## 4. Cambios realizados en esta sesión (todos verificados)

### 4.1 Degradación honesta sin WebGL — *producto*

`apps/web/src/components/line-engineering/Layout3DEditor.tsx`

- La construcción de `THREE.WebGLRenderer` queda protegida. Si el navegador no
  concede contexto, se registra el error, se limpian las refs y **el resto del
  editor sigue montado y utilizable** (documento, capas, propiedades, guardado).
- Se añade un aviso explícito en el viewport (`cad-webgl-unavailable`) que dice
  la verdad al usuario en lugar de dejar la pantalla vacía.

Verificación (Chromium con `getContext` devolviendo `null`), después:

```
PAGE ERRORS: []
cad-canvas count: 1
webgl notice count: 1
```

Regresión fijada en `e2e/golden/29-cad-webgl-unavailable.spec.ts` — **pasa**.

### 4.2 Test de cuota sin dependencia de Chromium — *harness*

`apps/web/e2e/golden/11-cad-recovery-journal.spec.ts`

Se sustituye `newCDPSession` + `Storage.overrideQuotaForOrigin` por agotar la
cuota de IndexedDB directamente. Ejercita **exactamente la misma ruta de
producto** (`isQuotaError` → poda agresiva → reintento → `CadRecoveryQuotaError`)
y es determinista en cualquier navegador. No se debilita ninguna aserción: se
elimina una dependencia de motor, no una comprobación.

### 4.3 Indicadores de recuperación observables — *harness*

Se retiene el guardado remoto en vuelo (`holdRemoteSaveInFlight`) para
reproducir de forma determinista la condición real —guardado lento— bajo la que
el indicador existe. **No se toca la semántica del producto**, que es correcta.

Verificación: los **2** tests de `11-cad-recovery-journal.spec.ts` pasan en
Chromium (antes fallaban ambos en CI).

### 4.4 Mojibake reparado — *producto*

9 ficheros reparados (`Layout3DEditor.tsx`, `logout/page.tsx`,
`associative-dimension.ts`, `basic-native-adapters.ts`, `entity-runtime.ts` y
sus specs). Reparación acotada a secuencias que hacen *round-trip* limpio, para
no tocar texto legítimo. Cero secuencias residuales.

### 4.5 Firefox con WebGL software — *harness*

`apps/web/playwright.config.ts` fuerza las prefs de WebGL por software en
Firefox para que ejercite el **mismo** viewport real que Chromium, en lugar de
excluir el navegador.

> ⚠️ **No verificado localmente.** Las descargas de binarios de Playwright
> están bloqueadas por política de red en este entorno
> (`403` en `cdn.playwright.dev`), así que **no se pudo instalar ni ejecutar
> Firefox**. Esta configuración es la corrección de principio y debe validarse
> con la ejecución de CI de la PR. Hasta entonces no debe afirmarse que Firefox
> esté verde.

---

## 5. Gates ejecutados en esta sesión

| Gate | Comando | Resultado |
| --- | --- | --- |
| Instalación reproducible | `npm ci` | ✅ |
| Build monorepo | `npx turbo run build` | ✅ 4/4 |
| Typecheck web | `npm run typecheck` | ✅ |
| Lint web | `npm run lint` | ✅ 0 errores · 151 warnings (= baseline, sin regresión) |
| Specs unitarios web | `npm run test:specs` | ✅ **127/127** |
| E2E recovery (Chromium) | `playwright test …11-cad-recovery-journal` | ✅ 2/2 |
| E2E regresión WebGL (Chromium) | `playwright test …29-cad-webgl-unavailable` | ✅ 1/1 |
| **E2E Firefox** | — | ⛔ **no ejecutable** (binarios bloqueados por red) |
| **E2E full-stack real** | — | ⛔ **no ejecutado** (requiere PostgreSQL + API) |

---

## 6. Deuda por severidad

### P0
1. **POLYLINE no nativa** — pérdida funcional silenciosa (§3.1). *Abierto.*
2. ~~Editor destruido sin WebGL~~ — *corregido en esta sesión.*

### P1
3. Fallos de Chromium #1, #2, #5–#19 sin diagnosticar (§2.5).
4. `main` sin protección de rama demostrada que impida mergear con CI rojo.
5. Toolchain dev/CI divergente (§3.2).
6. Suite E2E de 45 min dominada por timeouts: el coste de reloj es en sí un
   defecto de diagnóstico.

### P2
7. `Layout3DEditor.tsx` con **22 552 líneas** — riesgo sistémico. Exige
   extracción caracterizada, no reescritura.
8. Umbrales de rendimiento (60 s canonical ready, 90 s detalle, 30 s zoom) no
   son SLO comerciales.
9. 151 warnings de lint sin presupuesto decreciente formalizado.

---

## 7. Decisiones que requieren al propietario (BLOCKED-OWNER)

| # | Decisión | Por qué no puede delegarse |
| --- | --- | --- |
| 1 | Visibilidad del repositorio (público vs privado) | Propiedad intelectual |
| 2 | Titular y texto de `LICENSE` (hoy «AXOS OS») | Requiere asesoría legal real |
| 3 | Estrategia DWG (ODA Drawings SDK vs RealDWG) | Licencia y coste recurrente |
| 4 | Kernel B-Rep si se persigue 3D real | Licencia, distribución y coste |
| 5 | Proveedor de correo transaccional y de pagos | Cuentas, secretos y fiscalidad |
| 6 | Precios y entidad legal | Estrategia fiscal y jurídica |

Ninguna de estas se ha inventado ni asumido en esta sesión.

---

## 8. Lo que esta sesión **no** acredita

Para evitar cualquier lectura optimista:

- **No** se ha verificado que Firefox pase (imposible en este entorno).
- **No** se ha ejecutado la suite full-stack real contra PostgreSQL.
- **No** se han diagnosticado los ~17 fallos restantes de Chromium.
- **No** se ha tocado POLYLINE, draw order, validación canónica, manifiesto de
  pérdidas DXF ni colaboración semántica.
- **No** hay avance en DWG, 3D B-Rep, billing, correo transaccional, desktop,
  observabilidad ni despliegue.
- La nota global del producto **no** ha cambiado de forma material: se ha
  eliminado un P0 real y se ha recuperado diagnóstico fiable, que es la
  precondición para todo lo demás.
