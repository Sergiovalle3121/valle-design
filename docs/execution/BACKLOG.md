# BACKLOG — ordenado por lo que impide vender

Actualizado: 2026-08-22, campaña de cimientos. Cada entrada dice qué falla,
dónde, cómo se reproduce, qué criterio la cierra y qué prueba lo fija. El
orden dentro de cada nivel es el orden recomendado de ataque. Una entrada que
se cierre se BORRA de aquí con su commit en el mensaje — este archivo es la
cola viva, no el museo (el museo es `docs/history/`).

---

## P0 — impide vender o expone al dueño

### P0-1 · Los dos repositorios son PÚBLICOS y toda la gobernanza dice «confidencial»
- **Qué falla:** `Sergiovalle3121/valle-design` y
  `Sergiovalle3121/valle-design-dwg-conformance` responden 200 a un `curl`
  anónimo (verificado 2026-08-22 por API y navegador). LICENSE/NOTICE declaran
  software propietario confidencial. La visibilidad pública es además lo que
  hace funcionar la protección de rama en el plan Free — no es un accidente
  sin causa.
- **Dónde:** configuración del repositorio en GitHub; registro del hallazgo en
  `docs/governance/repository-protection-baseline.json`
  (`visibilityDecision`).
- **Decisión del titular (nadie más puede tomarla):** (a) volver ambos a
  privado y aceptar que la protección remota se apaga (los gates locales y el
  protocolo del titular ya la sustituyen operativamente); (b) GitHub Pro u
  organización: privado CON protección (~4 USD/mes); (c) público deliberado,
  asumiendo exposición del código propietario.
- **Criterio de aceptación:** la baseline registra la decisión con fecha y el
  gate `check:governance` la refleja; NOTICE y REPOSITORY_PROTECTION dejan de
  tener un asterisco.
- **Estimación:** 15 minutos una vez decidido.

### P0-2 · Precisión float32 con coordenadas grandes (topografía/UTM)
- **Qué falla:** el camino de render cuantiza a float32 desde la TESELACIÓN
  (`CadTessellatedPath.xy`); a magnitud 2·10⁶ (UTM norte México) el error
  medido es 4.2 cm y a 10⁷ es 37.5 cm. Documento y exportación pierden CERO.
- **Reproducir:** `npx tsx scripts/large-coordinate-precision-probe.mts`
  (desde `apps/web`); evidencia committeada en
  `docs/cad/evidence/large-coordinate-precision.json`.
- **Diseño (completo, listo para ejecutar):** origen flotante de escena — (1)
  anclar el marco al centro del documento redondeado (doubles); (2) restar ese
  origen ANTES de teselar/empaquetar; (3) `cadCenter` y todo uniforme
  posicional se calculan en JS doubles como (centroVista − origen) pequeño;
  (4) idéntico en `text-atlas-three`, `entity-three` y el mapeo de cámara del
  monolito; (5) el snap/selección ya operan en doubles del documento — no se
  tocan. La sonda existente es la evidencia «después».
- **Por qué no se hizo el 22-08:** colisión directa con la campaña de pulido,
  que estaba optimizando `line-batch`/`text-atlas`/pipeline ese mismo día.
- **Criterio:** error ≤1e-3 unidades a magnitud 10⁷ en la sonda; goldens de
  render sin cambio en planos locales.
- **Prueba requerida:** la sonda como spec con umbral + un golden con
  documento UTM. **Estimación:** 1–2 días.

### P0-3 · Las dos rutas de importación DXF divergen y una re-encuadra en silencio
- **Qué falla:** dos rutas con comportamiento distinto; una re-encuadra el
  plano automáticamente SIN registrar el desplazamiento (pérdida de
  georreferencia silenciosa — viola la garantía 5 del contrato de interop);
  tope de 50,000 entidades (`apps/web/src/lib/cad/dxf-import.ts:267`) y corte
  de ~850 objetos en la ruta editable.
- **Criterio:** UNA ruta bajo `docs/interop/CONTRATO-INTEROP.md`: manifiesto
  de pérdidas obligatorio, desplazamiento registrado y reversible al exportar,
  topes DECLARADOS al usuario cuando se alcanzan (no silencio).
- **Prueba:** spec de round-trip UTM (importar→exportar→comparar coordenadas
  absolutas) + spec del aviso de tope. **Estimación:** 2–3 días. Depende de:
  nada; habilita: P0-2 completo para DXF georreferenciado.

---

## P1 — bloquea flujos que un despacho espera

### P1-1 · ~~Los seis goldens rojos~~ — CERRADO 2026-08-23, queda un huérfano nuevo
Los seis originales (`21-cad-xrefs`, `47-cad-lisp-appload`, `47-cad-solids`,
`53-cad-bim-wall`, `54-cad-bim-wall-joins`, `55-cad-anchored-comments`) cerraron
en el commit `64d1ee28` ("Los seis goldens heredados cierran…"), confirmado en
`f5e36ca4` ("85 de 87 goldens, desde 81/87"). Verificado por auditoría
2026-08-24 contra el árbol real. Pero el criterio literal ("87/87 dos corridas
seguidas") sigue sin cumplirse por dos rojos DISTINTOS a los seis originales:
`46-cad-pointer-engine` (ya trackeado abajo, P1-1b) y **`20-cad-multiple-viewports`**,
que quedó huérfano — documentado como intermitente conocido en
`.github/workflows/ci.yml` ("los tres intermitentes que costaron un día entero
(goldens 18, 33 y 20)") pero nunca tuvo entrada propia aquí. Reproducido de
nuevo el 2026-08-24 en CI (Chromium, PR #93, dos corridas de E2E, ambas con
timeout en el mismo test). **Criterio:** 87/87 con árbol quieto dos corridas
seguidas, contando este huérfano. **Estimación:** medio día de diagnóstico
(mismo patrón de intermitencia que P1-1b — no asumir causa común sin medir).

### P1-1b · golden 46 test 2 (LINE por ratón) frágil ante el cambio de fuentes
- **Qué falla:** `e2e/golden/46-cad-pointer-engine.spec.ts:177` («con el motor
  abierto, la máquina heredada no recibe el clic») espera `Native 2` tras dos
  clics de ratón + Enter y recibe `Native 1`: el segundo punto de LINE no entra.
- **Bisección RIGUROSA (3× cada variante, caché `.next` limpia, puerto propio):**
  la ÚNICA variable es el cambio `next/font/google` → `next/font/local` de la
  OLA 3 de cimientos (fuentes autohospedadas). Fuentes de Google: 3/3 verde.
  Fuentes propias: 3/3 rojo. Mismo commit, mismo layout salvo la *fuente* de las
  variables CSS. `document.fonts.status` es `loaded` al fallar (NO es timing de
  carga); quitar `adjustFontFallback` no lo cambia; añadir `fonts.ready` + doble
  `requestAnimationFrame` en `openStudio` tampoco. El test 1 del mismo archivo
  (PLINE, cierra por menú) SÍ pasa; sólo el test 2 (LINE, cierra por Enter).
- **Por qué NO se revierten las fuentes:** el autohospedaje es requisito del
  build offline (P0 de la campaña); las otras 384 specs y los otros 80 goldens
  lo toleran. Revertir reintroduce la dependencia de Google en el build.
- **Criterio:** el test vuelve a verde con las fuentes propias. Es fragilidad de
  la PRUEBA ante métricas de fuente, no un defecto de producto (dibujar con LINE
  funciona en el producto vivo). El arreglo probablemente vive en cómo
  `screenPointFor` fija la caja del lienzo, no en un warm-up. **Estimación:**
  medio día de diagnóstico dirigido con trazas del motor.

### P1-2 · XATTACH por línea de comandos no puede adjuntar (falta la biblioteca)
- **Qué falla:** la orden está completa pero `context.xrefCatalog` nunca se
  provee; la vía gráfica sí adjunta (fetch asíncrono del asset del tenant).
- **Dónde:** `apps/web/src/lib/cad/engine/commands/xrefs.ts` (orden),
  `Layout3DEditor.tsx` → `fetchCadXrefSnapshot`/`attachProfessionalXref`.
- **Diseño:** petición de host asíncrona al patrón de PLOT: la orden emite
  `{kind:"xref-attach", assetId…}`, el anfitrión responde «adjuntando…»,
  reutiliza `attachProfessionalXref` y el resultado llega por `note()`. O
  bien: pre-cargar el catálogo del tenant (nombres, sin contenido) al montar
  y proveer `xrefCatalog` con snapshots bajo demanda.
- **Criterio:** `XATTACH nombre` adjunta lo mismo que la vía gráfica; el
  arnés de integridad lo reclasifica de honesto-limitado a delegado.
- **Estimación:** 1 día.

### P1-3 · BEDIT como editor real de bloques (hoy: puerta al panel)
La redefinición existe en el panel (redefine + versión propagada); falta la
edición EN SITIO de la definición. **Diseño esbozado:** modo de edición que
monta las entidades de la definición como documento temporal en el lienzo,
guarda de vuelta con `replace` de la definición + regeneración de inserciones
(el camino de `redefineProfessionalBlock` ya existe). **Criterio:** el
criterio `blocks.bedit` de la rúbrica pasa con evidencia real.
**Estimación:** 2–3 días.

### P1-5 · Marcar visibilidad por operación en el contrato OpenAPI
`x-visibility: public|internal|experimental` en las 79 operaciones de
`packages/contracts/specs/design-api.v1.yaml` + el gate del contrato exige la
marca en operaciones nuevas + publicar la lista `public` inicial (propuesta en
`docs/api/POLITICA-API-PUBLICA.md`). **Criterio:** `check:cad-contract` falla
ante operación sin marca. **Estimación:** medio día.

### P1-7 · Concurrencia de review: ~50 4xx inesperados por corrida bajo tormenta real
- **Qué falla:** `npm run evidence:review-concurrency` (rescatado 2026-08-24 de
  `claude/evidencias-pendientes`, corrido por primera vez contra Postgres real)
  mide 10 clientes concurrentes (owner/admin/member/viewer/enlace, 2 por rol)
  sobre el mismo documento y la misma sesión de revisión: **veredicto NO
  SUPERADO** — el único criterio que falla es "cero 4xx inesperados" (el 409
  del CAS es el único 4xx legítimo). ~50 errores inesperados de ~1100
  peticiones por corrida, estable en 3 corridas (51/50/49).
- **Qué SÍ pasa:** los cinco roles completan abrir/listar/comentar/resolver;
  las fronteras de rol se respetan (viewer/enlace no guardan); cada carrera
  CAS tiene un ganador y se resuelve con la fusión semántica real
  (`planCadConflictResolution`); los conteos íntegros cierran.
- **Dónde:** evidencia completa con metodología, entorno y criterios en
  `docs/cad/evidence/review-concurrency.json`; generador en
  `scripts/cad/review-concurrency-evidence.mjs` +
  `apps/api/src/load-probe/review-concurrency.main.ts`.
- **Qué falta:** identificar la ruta que produce los 4xx inesperados (no
  investigado todavía — la evidencia los cuenta pero no los clasifica por
  código/endpoint; ese es el primer paso, no adivinar la causa).
- **Criterio:** `evidence:review-concurrency` en VERDE (cero 4xx inesperados)
  en 3 corridas. **Estimación:** medio día de diagnóstico + lo que cueste el
  arreglo real.

---

## P2 — deuda que crece con intereses

### P2-1 · Techos silenciosos de snap y selección (medir antes de subir)
`maxSegments: 96` del osnap, `search(..., 48)` de candidatos, tope 300 de
`selectNative` (QSELECT grande designa 300 y no lo dice), 4_096 del boundary.
**Criterio:** cada tope o se elimina con medición de coste, o se DECLARA al
usuario al alcanzarse. **Prueba:** spec de un QSELECT con 500 coincidencias.
**Estimación:** 1 día con mediciones.

### P2-2 · Intersecciones de snap sobre teselado en vez de analíticas
`curve-model.ts` tiene intersecciones analíticas; el snap de intersección usa
segmentos teselados en trazos densos → imanta a ~px del cruce real con curvas.
**Criterio:** intersección línea-arco exacta a 1e-9 en spec. **Estimación:**
1 día.

### P2-3 · architecture@100k a SLO (25.3 s → ≤5 s; 8.57 fps → ≥30)
El criterio `performance.architecture-100k` de la rúbrica lo mantiene visible
y RESTA hasta cumplirse. La campaña de pulido atacó el cuello el 22-08
(subida por lotes, atlas, culling): re-medir tras su merge y actualizar la
evidencia con máquina declarada. **Estimación:** heredar de pulido + 1 día de
medición honesta.

### P2-4 · Los majors de dependencias diferidos (PR #87)
TS7 (migración de tsconfig ×4), ESLint 10, TypeORM 1.x, @nestjs 11.2 (esperar
peers de @nestjs/typeorm), next 16.3 (política de App Control o `--webpack`),
Playwright 1.62 + framer-motion 13 + three 0.185 + lucide 1.32 (ventana visual
dedicada con regeneración de goldens en frío), @types/node 26 (cuando el
runtime sea 26), redocly 2. El PR #87 tiene la tabla con el desbloqueo de cada
uno. **Regla:** una ventana por grupo, nunca en mitad de campañas de goldens.

### P2-5 · Bajar los avisos de lint por familias (presupuesto en `scripts/lint-budget.json`)
Web: 163 `react-hooks/refs` viven en el monolito — bajan al ritmo de
`DEUDA-MONOLITO.md`, no con parches cosméticos. API: 338 `no-unsafe-*`
concentrados en specs (tipar `response.body` con los tipos del SDK) y en
`migration-cli` + `cfdi-issuance.service.ts` (19, RUTA DE DINERO: tipar
primero). **Criterio:** el presupuesto baja en cada campaña que toque esos
archivos; `--update` committeado con el diff.

### P2-6 · CFDI contra el entorno de pruebas real del PAC
Herencia declarada: el flujo de timbrado está probado contra specs propios;
falta la corrida contra el sandbox real del proveedor. **Criterio:** un
timbrado y una cancelación reales en sandbox, con evidencia guardada.

### P2-7 · Exponer el consumo por organización (los datos YA se acumulan)
`UsageLedger` registra desde hoy documentos guardados/publicados. Falta:
métrica de almacenamiento (bytes de blobs por organización) y una pantalla o
endpoint interno «¿cuánto estamos usando?». **Estimación:** 1 día. Habilita:
responder al primer cliente enterprise.

### P2-8 · Mecanismo anti-pisado para PRs externos del corpus
Idea rescatada del PR #2 cerrado del repo de conformidad:
`pull_request_target` + verificador del commit base, para el día que se
acepten donaciones por PR de terceros. Hoy no hay superficie externa (bundles
firmados por el titular); activar SOLO con la primera donación externa.

### P2-9 · social-card y logo-geometry: dirección de imports
`lib/seo/social-card.tsx` está exento en `check:conventions` (importa
geometría del logo desde components/, y el gate del sistema de diseño lo
referencia por ruta). **Criterio:** `logo-geometry` a un módulo neutro
(config/brand), social-card junto a sus rutas OG, exención retirada (el gate
exige retirarla al sanar).

### P2-10 · El artefacto de integridad se regenera a mano
`docs/cad/evidence/command-integrity.json` se escribe con
`check:command-integrity --write`. Si el registro de comandos cambia, el
artefacto envejece hasta la siguiente corrida con --write. **Criterio:** el
gate compara el artefacto committeado contra lo computado (patrón
`dwg-evidence`) y falla si difieren. **Estimación:** 1 hora.

---

## Herencias verificables de campañas anteriores (dueño: revisar informes)

- Bloques dinámicos (R.1 de pulido, criterio `blocks.dynamic` de la rúbrica).
- Nota de crédito CFDI (reserva de pulido).
- Kernel WASM con paridad verde Y enchufado (criterio `wasm` de la rúbrica:
  hoy nadie lo importa).
- Descomposición del monolito: método y meta en
  `docs/execution/DEUDA-MONOLITO.md`; primer escalón sugerido: los
  anfitriones de selección y capas.
- `npm run doctor` (R.5): diagnóstico de entorno de desarrollador nuevo
  (Node, PG, VALLE_DWG_CORPUS_MIRROR, puertos, App Control de Windows).
- Accesibilidad del embudo público con lector de pantalla real (R.4).
- Auditoría de arranque: qué se descarga antes del primer trazo (R.3).
