# Campaña VALLE-DESIGN-COMMERCIAL-RC1 — bitácora de ejecución (2026-08-26)

Directiva del titular: llevar el producto «de laboratorio a producto vendible y
verificado» (prompt maestro COMMERCIAL-RC1). Orden obligatorio: Fase 0
(baseline verde) antes que cualquier feature. Un solo escritor; agentes
paralelos sólo de lectura. Una sola rama de campaña
(`claude/valle-design-commercial-rc1-izgdxb`) y un solo PR; nada cuenta hasta
estar fusionado en `main` con CI verde.

## Baseline

- SHA baseline de `origin/main`: `bc4dda1d4f77a6c7dbee9ecbfab27e25e81ba758`.
- Árbol limpio; ramas remotas vivas al inicio: `claude/valle-design-3d-campaign-t0zzad`
  (PR #108 abierto) y `claude/valle-design-p0-3-encuadre-utm` (huérfana,
  contenido ya en `main` vía squash de PR #102/#104 — verificado por
  comparación de contenido, 68/74 archivos idénticos y los 6 restantes con
  `main` por delante).
- PR #108 (reintento de 429 en review concurrency): revisado por diff y
  pruebas — correcto, acotado, con specs; su rojo E2E era preexistente (los
  mismos 5 fallos que `main`). **Decisión: adoptado** en la rama de campaña por
  fast-forward (`bc4dda1..c25a0bb`); el PR se cierra como «adopted» al fusionar
  la campaña, con la rama borrada (política de ramas de CONTRIBUTING.md).

## Fase 0 — diagnóstico del CI rojo de `main`

Estado encontrado: **`main` sin un solo run verde desde el 12 de agosto**
(run 288, último verde). Eras de rojo, cada una con causa verificada en logs
de CI (runs muestreados 289–479):

1. **14→20 ago (runs 289–324):** el workflow moría al arrancar (3–70 s);
   E2E nunca corrió.
2. **20–21 ago (325–335):** primera aparición de
   `e2e/performance/cad-dense-editing-100k.spec.ts` — **nunca pasó en CI**:
   consumía su techo de 1 h, Playwright lo reintentaba (retries=1) y el job
   E2E moría cancelado a los 100 min. Además: 6 goldens heredados rojos (
   cerrados el 23-08 por otra campaña), 1 hallazgo de gitleaks y un smoke de
   despliegue con drenaje fallido (ya cerrados).
3. **22→24 ago (347–408):** `check:dwg-evidence` — artefacto committeado
   desincronizado (decoder-matrix con «cero bundles» vs 7 reales). Resuelto
   en 410 por otra sesión.
4. **24→26 ago (410–479):** tres causas simultáneas y estables:
   `cad-dense-editing-100k` (cuelgue de 1 h + retry → job cancelado a 100 min),
   golden `20-cad-multiple-viewports` y golden `46-cad-pointer-engine` test 2.
   Consecuencia estructural: **todo lo posterior al test ~99 — unos 200 tests,
   el proyecto Firefox completo incluido — no se ejecutó ni una vez desde el
   21-08**; su estado era desconocido.
5. Run 475: `check:governance` por id duplicado en el log de gobernanza
   (resuelto en bc4dda1).

Gates locales reproducidos en verde sobre `bc4dda1`/`c25a0bb` antes de tocar
nada: `check:cad`, `check:dwg` (con espejo del corpus en el pin exacto),
`build`, `typecheck`, `test` (7/7 turbo), `lint`, `lint:check` (API), `sbom`,
`check:licenses`, `test:pg` contra PostgreSQL 16.13 real.

### Causa raíz 1 — dense-100k: designar «Todo» materializaba 100.000 objetos THREE

Con el pipeline por lotes, la única vía que aún creaba un objeto de escena POR
ENTIDAD era la proyección de la selección (grips + realce). Sin presupuesto:
«Todo» sobre 100k construía 100.000 objetos THREE en el hilo principal.
Medido antes del arreglo (Chromium headless, SwiftShader, 4 vCPU):
apertura 10,7 s / detalle 21,1 s (sanos), `paletteOpen` 53 s, y **`selectAll`
sin terminar tras >25 min** (en CI: 1,0 h de techo consumido, 9 runs
consecutivos idénticos). El instrumento del spec no era el problema; el
producto sí.

**Arreglo (producto):** `lib/cad/selection-projection-budget.ts` — política
`GRIPOBJLIMIT` (como AutoCAD): selección ≤400 → proyección por entidad
completa; >400 → cero objetos individuales, el realce lo da el propio lote
(`setSelection` retesela con color de selección) y el recuento del HUD sigue
exacto. La selección NUNCA se trunca. Además: universo de selección memoizado
por documento (antes se reconstruía entero en cada render con la paleta
abierta) y extraído a `components/cad/editor/selection-universe.ts` (el
monolito baja de 20242 a 20237 líneas).

Medido después del arreglo (mismo entorno): `selectAll` **25,9 s y completa
las 100.000** (~60× menos y, sobre todo, ACOTADO). `paletteOpen` 44,6 s —
sigue caro (hay más O(n)-por-render en el monolito; queda para Fase 2 con
perfil en mano), pero acotado y lejos del techo.

**Arreglo (política de capacidad, CI):** la suite `e2e/performance` sale del
job `e2e` a un job propio `e2e-perf` (sólo push/dispatch, Chromium, sin
retries, techo 75 min, artefactos siempre). Sigue **bloqueando** el veredicto
de `main`; lo que ya no puede es dejar sin ejecutar al resto de la suite. El
techo del spec dense baja de 60 a 35 min: con el arreglo ninguna fase legítima
se acerca, y el guion vuelca su artefacto tras cada fase.

### Causa raíz 2 — golden 46 test 2: la barra del dibujo en curso se tragaba el pick

`draft-toolbar.tsx` (ORTO + entrada dinámica + Terminar/Cerrar) flota sobre el
lienzo con `z-20`; TODO su rectángulo —fondo y padding incluidos— capturaba
los clics. La entrada dinámica hace `flex-wrap`, así que su altura depende de
la métrica de la fuente: por eso la bisección de P1-1b encontró que
`next/font/local` era «la variable» — con las fuentes propias la píldora
crecía y cubría el segundo punto del LINE del golden. Defecto de producto real
(un usuario dibujando bajo la barra pierde el clic), no fragilidad del test.
Sondeado empíricamente: `elementFromPoint` sobre el punto B devolvía el DIV de
la barra tras el primer clic.

**Arreglo:** `pointer-events-none` en el contenedor y `pointer-events-auto`
sólo en los controles (mismo patrón que el dock del tour guiado). Verificado:
46:106 y 46:177 verdes.

### Causa raíz 3 — golden 20: los `fill` desplazan el scroll del panel

Los cinco `fill(...)` previos al drag desplazan el scroll del panel del
paquete de entrega; la miniatura del viewport quedaba fuera del área visible
(boundingBox y≈16 vs y≈422 real) y el drag manual aterrizaba sobre la pestaña
«Model» del encabezado — que CIERRA el panel — y `nth(1)` desaparecía.
Determinista con contenido lo bastante alto (otra vez métricas de fuente).

**Arreglo (spec):** `scrollIntoViewIfNeeded()` antes de medir la caja para los
dos drags manuales. Verificado: golden 20 verde.

### Verificación local tras los arreglos

- Goldens 20 + 46 (ambos tests): **3/3 verdes** (43,5 s), build de producción
  E2E real, mocks en la frontera de red.
- `selection-projection-budget.spec.ts` nuevo (límite exacto, supresión, O(1)
  a 100k) verde; typecheck web verde; presupuesto de monolito verde (20237).
- dense-100k tras el fix: fases completándose (artefacto por fase);
  corrida completa en curso al escribir esta entrada.

(continúa)

## Fase 1 — lo hecho y lo abierto (corte 07:40 UTC)

Hecho y verificado (specs verdes, 412/412 web):
- Booleanas de vanos con diagnóstico tipado y bloqueo de representación
  (`wall-solid-diagnostics.ts`, `wall_opening_not_cut` en el informe de
  validación con muro+vano+causa).
- Capas en 3D por entidad: apagada/congelada no construye el muro; congelada
  sale además de la derivación de masas; apagada cuenta (solo display); el
  vano corta sin mirar su capa (paridad 2D); ocultar/congelar/bloquear depura
  la selección.
- GLB con arquitectura + round-trip por spec (bbox, material, hueco por
  raycast).
- Cantidades sin volumen doble en uniones (medido y declarado por fila).

Abierto (declarado, no escondido):
- Uniones L/T/X en 3D siguen SOLAPANDO volumen visual (sin inglete). Las
  CANTIDADES ya lo descuentan; la malla no. Siguiente paso: booleana de unión
  por pareja en la vecindad afectada.
- Cutaway/corte comercial: los presets sólo mueven cámara.
- Espesores de piso/cielorraso/cubierta siguen siendo constantes de módulo
  (un espesor editable exige bump de esquema + migración + round-trip).
- `detectCadRooms` no resuelve cruces en X sin nodo compartido; el contorno
  cóncavo con patio se deriva del anillo exterior real (cubre patio simple),
  sin bloqueo diagnósticado específico para anillos internos.

## OWNER ACTIONS (registro vivo)

- `OWNER ACTION: RAILWAY` — cuenta, proyecto, servicios, plugin PG16 y
  variables (ver docs/ops/railway.md). Sin esto no hay despliegue real que
  probar; la configuración y el pre-deploy de migraciones quedan listos y
  ensayados localmente.
- `OWNER ACTION: DNS/TLS` — CNAMEs app./api. hacia Railway.
- `OWNER ACTION: SMTP/CORREO` — receptor HTTPS firmado del outbox o
  credenciales del transporte transaccional real.
- `OWNER ACTION: STRIPE TEST` — claves de test para ejecutar la batería
  completa de cobro (trial→checkout $199 MXN→webhooks→OXXO/SPEI→past_due→
  cancelación→reembolso→idempotencia) contra Stripe real; el repo degrada
  declarado sin ellas y los specs existentes cubren la lógica con dobles.
- `OWNER ACTION: STRIPE LIVE` — autorización expresa para cualquier cobro
  real (no se ejecuta en esta campaña).
- `OWNER ACTION: LEGAL` — texto legal FINAL con razón social, RFC,
  domicilio, jurisdicción, SLA y política de reembolsos (las plantillas de
  docs/legal/ siguen sin datos reales). El candado técnico (versión + hash +
  gate de CI + versión visible) ya existe; el contenido definitivo es
  decisión jurídica del titular.
- `OWNER ACTION: CORPUS REAL DWG` — archivos DWG reales y autorizados de
  usuarios para promover la beta más allá de laboratorio (hard cap: DWG
  permanece beta sin ellos).
- `OWNER ACTION: PILOTOS` — mínimo cinco arquitectos externos con proyectos
  reales para declarar GA (Claude no puede simular validación humana).
- `OWNER ACTION: SENTRY/OBSERVABILIDAD` — DSN/cuenta si se contrata.
