# BACKLOG — ordenado por lo que impide vender

Actualizado: 2026-08-27, campaña Paridad (`docs/execution/CAMPANA_PARIDAD_20260827.md`).
Cada entrada dice qué falla,
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
- **Runbook listo para ejecutar en cuanto se decida:** `docs/ops/runbook-repo-protection.md`
  (rescatado 2026-08-24 de `claude/pulido-ola0`) trae los comandos exactos —
  confirmar visibilidad actual, convertir a privado, verificar que branch
  protection/CODEOWNERS sobrevivan el cambio, escanear secretos en TODO el
  historial (no sólo HEAD, un repo público pudo haber sido clonado/forkeado
  antes), inventariar forks/releases/packages ya expuestos.
- **Criterio de aceptación:** la baseline registra la decisión con fecha y el
  gate `check:governance` la refleja; NOTICE y REPOSITORY_PROTECTION dejan de
  tener un asterisco.
- **Estimación:** 15 minutos una vez decidido.

### P0-3 · Las dos rutas de importación DXF divergen — encuadre de cámara YA cerrado; el re-encuadre de datos y el alcance de "unificar" quedan acotados por investigación real
- **Qué decía originalmente:** dos rutas con comportamiento distinto; una
  re-encuadra el plano automáticamente SIN registrar el desplazamiento
  (pérdida de georreferencia silenciosa — viola la garantía 5 del contrato de
  interop); tope de 50,000 entidades (`apps/web/src/lib/cad/dxf-import.ts:267`)
  y corte de ~850 objetos en la ruta editable, ninguno declarado.
- **Parte YA CERRADA — encuadre de cámara** (2026-08-25, campaña post-3D-M1,
  PR #99 + #102): el sub-hallazgo de encuadre de cámara (hallado cerrando
  P0-2, mismo origen) resultó ser dos cosas DISTINTAS, no una — investigado a
  fondo antes de tocar código (`docs/execution/CAMPANA_3D_POST_M1_20260825.md`).
  "Ajustar a la planta" (Shift+F) usa el footprint declarado A PROPÓSITO; NO
  es un bug. El bug real, más angosto: sólo el **encuadre inicial** al abrir
  un documento ignoraba el contenido — arreglado con un `useEffect` que
  reencuadra sobre el contenido real cuando es disjunto del footprint
  (`boundsIntersect`); los seis presets de cámara con nombre tenían el mismo
  problema y se cerraron en la misma fase (`camera-view-presets.ts`, quinto
  parámetro `content`). `e2e/golden/57-cad-utm-precision.spec.ts` ya no rodea
  el gap: prueba el arreglo con un footprint de sitio real (12×10 m).
- **Parte YA CERRADA — re-encuadre silencioso de DATOS al convertir** (mismo
  día, mismo PR de seguimiento): un agente de exploración read-only mapeó las
  dos rutas con cita `file:line` antes de tocar nada (evita repetir el error
  de asumir la causa desde la prosa del backlog). Hallazgo: hay realmente
  CUATRO caminos de lectura DXF, agrupables en dos — Route A (`DXFIN` +
  importación del dashboard, `dxf-import.ts`/`dxf-cad-document.ts`, proyección
  IDENTIDAD, sin re-encuadre) y Route B (`convertDxfPrimitivesToEditable` en
  `Layout3DEditor.tsx`, conversión del DXF de fondo a entidades editables +
  `Asset` de muro/zona heredados). El re-encuadre silencioso vive SÓLO en
  Route B, en `projectDxfPoint`/`dxfPrimitiveBounds`: resta el rectángulo
  envolvente del DXF para alinear con el backdrop, y ese desplazamiento nunca
  quedaba registrado. Cerrado: `describeDxfOriginOffsetLoss`/
  `buildDxfConversionLossManifest`
  (`components/cad/interop/dxf-editable-import-losses.ts`, 20 aserciones
  unitarias) declara el desplazamiento exacto (`dxf_import:origin_shifted`)
  en `document.lossManifest` — visible en el paquete de entrega y en el
  preflight de exportación, igual que el resto de las pérdidas de este mismo
  flujo. `e2e/golden/27-cad-dxf-loss-manifest.spec.ts` extendido, 3 corridas
  verdes. **Honesto sobre el límite:** esta ruta nunca fue un importador fiel
  de ida y vuelta (medio de lo que produce son `Asset` sin representación DXF
  propia, texto truncado a 80 caracteres) — el desplazamiento queda
  DECLARADO, no auto-revertido al reexportar; prometer lo segundo sería
  fingir una fidelidad que Route B nunca tuvo.
- **Hallazgo que CORRIGE la redacción original — los topes YA estaban
  declarados:** la misma investigación confirmó, cita por cita, que los
  cuatro topes numéricos del código (50.000 en `dxf-import.ts:267`, 40.000 en
  `components/cad/interop/dxf.ts:20`, 850 en `Layout3DEditor.tsx` y 1.500 en
  `dxf-walls.ts`) YA se declaraban al usuario cada uno por el mecanismo que le
  corresponde a su ruta (informe de fidelidad / `lossManifest` / toast — el
  modelo `Asset` heredado no tiene `lossManifest`, así que el toast es su
  mecanismo correcto, no uno degradado). El backlog original afirmaba lo
  contrario sin haberlo verificado contra el código; corregido aquí en vez de
  dejarlo pasar.
- **Qué queda abierto de verdad:** "UNA ruta" en el sentido literal de
  eliminar Route B no es el arreglo correcto — es una función de TRAZADO
  deliberadamente distinta (simplifica a muros/zonas editables desde un
  backdrop), no un segundo importador fiel compitiendo con `DXFIN`. Lo que
  sigue pendiente, si alguien lo prioriza: (a) reversión automática del
  desplazamiento de Route B al reexportar a DXF — exigiría un campo nuevo a
  nivel de documento (bump de esquema) más lógica de exportación, deuda
  aparte, no bloqueante; (b) el propio `parseDxf` (`components/cad/interop/dxf.ts`)
  también re-encuadra en silencio, pero sólo afecta el backdrop de referencia
  —de su propio comentario: "para usar como fondo, no para re-ingenierarlo"—
  nunca escribe en `CadDocument`, así que no es el defecto de pérdida de
  datos que temía esta entrada.
- **Prueba:** `components/cad/interop/dxf-editable-import-losses.spec.ts`
  (20/20) + `e2e/golden/27-cad-dxf-loss-manifest.spec.ts` (3/3 corridas
  vivas). **Estado:** cerrado en el alcance real verificado; lo que queda
  (a/b arriba) es deuda de seguimiento, no bloquea nada hoy.

---

## P1 — bloquea flujos que un despacho espera

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

### P1-6 · El cuadro de cantidades SUB-factura fábrica en cada esquina (~1,4%)
- **Qué falla:** `buildCadBimSchedule` (`bim-schedule.ts`) calcula el volumen
  de fábrica de un muro restando el solape de unión medido por
  `cadWallJunctionOverlaps`, pero el sólido 3D real (`wallSolidBodyLocal`) NO
  recorta ese mismo volumen sin más: el inglete de esquina EXTIENDE la cara
  EXTERIOR del muro y RECORTA la interior en la misma medida (conserva el
  área propia de cada muro en planta). El cuadro resta la extensión interior
  y nunca suma de vuelta la exterior equivalente — sub-factura fábrica real.
  Cuantificado (campaña Paridad, 2026-08-27, OLA 0.5/1.3): en un cuarto de
  5,0×4,0 m con muros de 250 mm y una puerta, el cuadro da 10,178 m³ y el
  sólido real da 10,328 m³ — 1,45% de brecha, del mismo orden que la cifra
  original investigada (cuarto sin puerta: 10,65 vs 10,80 m³, 1,39%).
- **Dónde:** `apps/web/src/lib/cad/bim-schedule.ts` (líneas ~187-216, el
  descuento de `junctionVolumeByWall`); el sólido real de referencia vive en
  `wall-solid.ts` (`wallSolidBodyLocalWithDiagnostics`) +
  `lib/brep/mass-properties.ts` (`bodyMassProperties`).
- **Por qué no se arregló ya:** cambiar la fórmula cambia qué se FACTURA por
  muro — decisión de negocio (¿se cobra la extensión exterior de esquina o
  no?), no una corrección técnica unilateral. Se midió y se puso un gate de
  regresión (`wall-takeoff-solid-parity.spec.ts`, techo 2%) para que la
  brecha NUNCA CREZCA en silencio mientras nadie decide arreglarla; el
  arreglo en sí necesita que el titular decida el criterio de facturación.
- **Criterio de aceptación:** el titular decide la fórmula correcta de
  esquina (probablemente: sumar de vuelta la extensión exterior en vez de
  sólo restar el solape interior) y `wall-takeoff-solid-parity.spec.ts`
  pasa con una brecha ~0% en vez de con un techo de tolerancia.
- **Estimación:** medio día una vez decidido el criterio de facturación.

### ~~P1-7 · Canal "algo salió mal" dentro del producto, vía outbox~~ — CERRADO (campaña de lanzamiento, OLA 4.2)

> Cerrado el 2026-08-27. El estudio tiene el botón, con su cuadro que enseña
> campo por campo lo que va a mandar, la casilla de autorización del plano
> apagada por defecto y entrega por el outbox transaccional. Evidencia:
> `support-incident.payload.spec.ts` (10), `support-incident.pg.spec.ts` (7,
> contra PostgreSQL real) y `e2e/real/primera-hora.spec.ts` prueba 5, que pulsa
> el botón en el navegador y lee el reporte del outbox. El aviso de privacidad
> lo declara (versión 2026-08-27.2).

### P1-7 (histórico) · Canal "algo salió mal" dentro del producto, vía outbox (OLA 3.2 de Paridad)
- **Qué falta:** hoy el único canal de soporte es pasivo — `apps/web/src/app/support/page.tsx`
  es un `mailto:` a `COMMERCIAL_CONTACTS.support` y un enlace a la página de
  contacto. No hay forma de reportar un problema DESDE el editor con
  contexto automático (qué comando corría, qué documento, qué versión) —
  el usuario tiene que describirlo de memoria en un correo aparte, y
  la mayoría de los "algo salió mal" silenciosos nunca se reportan.
- **Investigado antes de diseñar a ciegas:** el producto YA tiene un
  patrón de outbox maduro para entrega asíncrona —
  `apps/api/src/modules/commercial/outbox-dispatcher.service.ts` +
  `outbox-worker.service.ts` (leases anti-doble-entrega en PostgreSQL,
  corre dentro del proceso de la API, documentado en
  `docs/ops/railway.md`), y `webhook-outbox.transport.ts`/
  `email-outbox.controller.ts` como los dos consumidores existentes
  (webhooks firmados, correo). Un canal de reporte de errores debería
  ser un TERCER tipo de evento del MISMO outbox, no un mecanismo de
  entrega nuevo.
- **Diseño esbozado (no implementado):**
  1. Un comando/botón en el editor ("Reportar problema") que arma un
     paquete de diagnóstico: documento actual (o su id, nunca el
     contenido completo sin consentimiento explícito — ver riesgo de
     privacidad abajo), los últimos N comandos del historial, versión
     del producto, navegador. Captura, NO envía sola: el usuario
     confirma qué se manda antes de mandarlo.
  2. Un endpoint nuevo en `apps/api` (patrón de
     `email-outbox.controller.ts` para la forma, no para el propósito)
     que valida el payload y encola un evento de outbox tipo
     `UserReportedIssue`.
  3. El dispatcher existente lo entrega — probablemente a un correo/canal
     del titular, reusando `WebhookCommercialOutboxTransport` o un
     transporte de correo ya existente en vez de escribir uno nuevo.
  4. Migración nueva para el tipo de evento si el esquema de outbox lo
     exige (revisar `20260820100000-WebhookReceipts.ts` y similares
     antes de asumir que hace falta una tabla aparte).
- **Por qué no se implementó ya en esta campaña:** toca DOS aplicaciones
  (api + web), una migración de base de datos potencial, y una decisión
  de privacidad real (qué parte del documento del cliente viaja en un
  reporte de bug) que merece la misma disciplina de prueba negativa que
  el resto de esta campaña — apurarlo sin esa disciplina para cerrar la
  ola sería exactamente el tipo de atajo que esta campaña existe para
  no tomar.
- **Criterio de aceptación:** un usuario reporta un problema desde el
  editor sin salir de la aplicación; el reporte incluye contexto útil
  con consentimiento explícito sobre qué se envía; llega al titular por
  el outbox existente, no por un canal paralelo.
- **Estimación:** 2-3 días (incluye la decisión de privacidad, que no es
  sólo código).

---

## P2 — deuda que crece con intereses

### P2-1 · Techos silenciosos de snap (medir antes de subir)
`maxSegments: 96` del osnap, `search(..., 48)` de candidatos, 4_096 del
boundary. **Cerrado 2026-08-27 (campaña Paridad, OLA 0.3/1.1):** el tope
300 de `selectNative` y el tope 200 de `selectCadLayerObjects` —los que
mentían al usuario (designaban menos de lo que el mensaje anunciaba)—
se ELIMINARON, no se declararon; ver
`docs/execution/CAMPANA_PARIDAD_20260827.md` y
`e2e/golden/59-cad-selection-no-truncation.spec.ts` (350 coincidencias,
QSELECT y "Sel" de capa, prueba negativa real). Quedan abiertos los tres
topes de snap/boundary de arriba, que son técnicos (coste de cómputo),
no mentiras al usuario. **Criterio:** cada tope o se elimina con
medición de coste, o se DECLARA al usuario al alcanzarse. **Estimación:**
1 día con mediciones.

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

### P2-4 · Los majors de dependencias diferidos
TS7 (migración de tsconfig ×4), ESLint 10, TypeORM 1.x, next 16.3 (política de
App Control o `--webpack`), @types/node 26 (cuando el runtime sea 26),
Playwright 1.62 (ventana dedicada con regeneración de goldens en frío). Tabla
completa con el desbloqueo verificado de cada uno en
`docs/deps-majors-bloqueados.md` (migrado 2026-08-24 desde el PR #87, cerrado
sin fusionar — su `package.json` fijaba versiones bloqueadas, fusionarlo
habría sido una regresión). **Regla:** una ventana por grupo, nunca en mitad
de campañas de goldens.

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

### P2-11 · Auditoría de veracidad de los `.md` vivos + índice de 30 segundos
- **Qué falta:** no hay una pasada sistemática que confirme que cada `.md`
  vivo bajo `docs/` (fuera de `docs/history/`, que ya se sabe archivo)
  describe el estado REAL del repo y no residuo de una decisión superada; ni
  un `docs/README.md` que oriente en 30 segundos a quien llega, con el mismo
  patrón que `docs/history/README.md` ya usa para sí mismo ("la verdad de
  hoy empieza en `IDENTITY.md` y sigue en `ARCHITECTURE.md`, `PRODUCT.md`,
  `REPOSITORY_SCOPE.md`…").
- **Origen:** se inició con subagentes en paralelo durante la campaña de
  cierre de ramas del 2026-08-24, pero no sobrevivió a una compactación de
  contexto (sin hallazgos recuperables en disco) y no respondía a un pedido
  explícito del titular — se documenta aquí en vez de relanzarse a ciegas
  sobre una premisa no verificada o perderse en silencio.
- **Alcance si se retoma:** pasada doc por doc bajo `docs/` contra el
  código/tests reales (no asumir, verificar cada afirmación como el resto de
  esta campaña); escribir `docs/README.md`.
- **Estimación:** medio día de auditoría + lo que cueste cada corrección
  real que aparezca.

### P2-12 · Espacio papel DXF: el arreglo cubre 6 de 7 familias de entidad
- **Qué falta:** el cierre de la fuga de espacio papel DXF (campaña Paridad,
  2026-08-27) lee el código de grupo 67 en primitivas (línea/polilínea/
  círculo/arco/elipse/spline/texto), HATCH, MTEXT, cotas y directrices
  semánticas, e INSERT de nivel superior — `paperSpace?: boolean` en
  `dxf-import.ts`/`dxf-read-annotations.ts`, excluidas por
  `dxf-model-space-scope.ts`. NO cubre los ocho tipos del esquema 4
  (POINT/XLINE/RAY/SOLID/WIPEOUT/IMAGE/ATTDEF, leídos en
  `dxf-read-schema4.ts` sobre pares crudos con su propia clase
  `EntityPairs`): una IMAGE de logotipo o un WIPEOUT de cajetín en espacio
  papel todavía se cuela al espacio modelo sin declararse. Menos frecuente
  que líneas/textos de marco, pero la misma clase de mentira.
- **Dónde:** `apps/web/src/lib/cad/dxf-read-schema4.ts` — añadir
  `paperSpace` a `CadDxfPrimitive` (ya existe el campo) leyendo
  `entity.first(67) === "1"` en cada uno de los seis `primitives.push(...)`;
  ya lo filtraría `dxf-model-space-scope.ts` sin cambios (los primitivos de
  esquema 4 llegan con `primitiveSources: "entity"`, el mismo camino que
  línea/círculo/arco).
- **Criterio de aceptación:** un spec con un WIPEOUT o IMAGE con código 67=1
  no aparece en `document.entities` ni en `modelSpace.entityIds`, y
  `dxfReport` lo declara con el mismo código `dxf_paper_space_excluded`.
- **Estimación:** una hora — el patrón y el módulo de recorte ya existen;
  falta repetir la lectura del código 67 en el sexto parser.

### P2-13 · Oráculo geométrico unificado de ida y vuelta (DXF/DWG/PDF/GLB)
- **Qué falta:** OLA 0.1 de la campaña Paridad (2026-08-27) pedía un arnés
  único que tome UN documento fijo, lo exporte a los cuatro formatos, lo
  vuelva a importar y compare geometría contra el original — para cazar
  clases enteras de bug (como los tres que sí se encontraron y cerraron esa
  campaña: ángulos DWG en grados-como-radianes, fuga de espacio papel DXF,
  escala GLB sin corregir) con una sola prueba en vez de una por formato.
  No se construyó: el tiempo de la campaña se fue en los tres defectos
  reales que la investigación inicial ya había confirmado, y duplicar
  cobertura que las specs de round-trip existentes
  (`dwg-native-writer.spec.ts`, `dxf-roundtrip.spec.ts`,
  `dxf-paper-space-scope.spec.ts`, `glb-export.spec.ts`) ya ejercen por
  separado no valía más que cerrar los bugs reales primero.
- **Alcance si se retoma:** un documento de fixture con geometría de los
  cuatro tipos con ángulo (arco, elipse, inserción rotada) más muros/masas
  3D; cuatro pares exportar/reimportar; una función de comparación de
  geometría con tolerancia compartida por los cuatro. Vive bien como spec
  nuevo, no como script aparte — así corre en `npm test` como el resto.
- **Estimación:** medio día.

### P2-14 · Los hosts 3D no escopan por `modelSpace.entityIds` (1.6 de la campaña Paridad)
- **Qué falta:** `wall-solid-host.ts:153`, `room-solid-host.ts:74`,
  `solid-shade-host.ts:322` y `solid-snap-host.ts:110` recorren
  `document.entities` DIRECTO — sin filtrar por
  `document.modelSpace.entityIds`. Sólo `render-pipeline-host.ts` (2D) sí
  escopa por `modelSpace.entityIds` (línea 304-310). `CadPaperSpace` ya
  declara su PROPIO `entityIds: string[]` (`cad-paper-viewport.ts:269`) —
  entidades que viven en `document.entities` pero pertenecen a una hoja,
  no al modelo (un texto de nota escrito directo sobre el layout, por
  ejemplo). Investigado sin encontrar HOY un camino de comando que cree
  una entidad exclusivamente en `paperSpaces[i].entityIds` sin también
  sumarla a `modelSpace.entityIds` — así que el hueco es LATENTE, no
  manifestado: el día que "anotar directo sobre la hoja" se cablee de
  verdad (`paper-space.ts` ya trae el modelo de datos y el plotter),
  esa nota se colaría a la vista 3D sin que ningún test lo cazara.
- **Dónde:** los cuatro archivos de host arriba, mismo patrón que ya
  usó esta campaña para 0.4/1.2 (invariante de capa aplicado a TODOS
  los hosts vía `cad-layer-visibility.ts`) — aquí el invariante es
  "sólo `modelSpace.entityIds`", no capa.
- **Por qué no se tocó en esta campaña:** verificar que
  `modelSpace.entityIds` sea de verdad el invariante correcto para
  CADA host (algunos podrían depender de recorrer bloques/inserciones
  cuyos hijos no tienen id propio en `modelSpace.entityIds`) exige
  leer los cuatro anfitriones a fondo antes de tocar código de
  render 3D en producción — más riesgo que el resto de los cierres de
  esta campaña, que tocaban módulos puros con specs de Node. Con OLA
  FINAL obligatoria por delante, se prioriza cerrar la ola completa
  antes que profundizar en un hueco que hoy no se manifiesta.
- **Criterio de aceptación:** un spec por host con un documento que
  tenga una entidad SOLO en `paperSpaces[0].entityIds` (nunca en
  `modelSpace.entityIds`) confirma que el host correspondiente NO la
  materializa en 3D.
- **Estimación:** medio día (cuatro hosts, uno por uno, con su prueba
  negativa cada uno).

### P2-15 · `10-cad-native-entities.spec.ts` sólo pasa en modo prod, no en `npm run dev`
- **Qué falla:** el golden falla de forma reproducible y determinista con
  `npm run dev` (modo desarrollo, el default de `playwright.config.ts`)
  con `expect(browserErrors).toEqual([])`: React emite en cada carga de
  página "eval() is not supported in this environment... React requires
  eval() in development mode for various debugging features" —un aviso
  del PROPIO React sobre su mecanismo de depuración bajo CSP, sin
  relación con CAD/DXF—. La propia librería dice "React will never use
  eval() in production mode", y `playwright.config.ts` documenta que CI
  corre con `E2E_PROD=1` (`next start`), así que en CI este golden
  debería pasar limpio.
- **Investigado antes de tocar el test (campaña Paridad, OLA FINAL,
  2026-08-27):** confirmado que NINGÚN otro golden usa
  `collectBrowserErrors`/verifica `browserErrors` — es el único de los
  64 con esta aserción, sin filtro de ningún tipo (ni un solo mensaje
  exento), lo que explica por qué es el único que la detecta. No se
  relajó la aserción (regla 5 de la campaña): un `toEqual([])` que
  ignorara mensajes de React sería exactamente el tipo de gate
  debilitado que esta campaña existe para no crear. Se intentó
  reproducir en modo `E2E_PROD=1` para confirmar la hipótesis con
  certeza total, pero la build de este sandbox no tiene el
  `NEXT_PUBLIC_API_URL` que el arnés e2e espera en producción (falla
  antes, en `cad-native-entity-list` sin cargar) — la hipótesis queda
  fundamentada por lectura de código (React declara explícitamente que
  el mensaje es exclusivo de desarrollo) y por descarte (ningún cambio
  de esta campaña toca CSP, cabeceras o configuración de Next), no por
  reproducción directa en prod local.
- **Dónde:** `apps/web/e2e/golden/10-cad-native-entities.spec.ts:91-98`
  (`collectBrowserErrors`, sin filtro) y :153 (la aserción).
- **Criterio de aceptación:** o bien confirmar con una corrida
  `E2E_PROD=1` real (arreglando primero el `NEXT_PUBLIC_API_URL` del
  build local) que el golden pasa limpio en prod, cerrando esto como "no
  es un defecto, es una limitación conocida de correr goldens con
  `next dev`"; o bien, si algún día se corre goldens en dev por defecto
  en CI, filtrar EXPLÍCITAMENTE este mensaje exacto de React (nunca un
  filtro genérico que trague avisos reales).
- **Estimación:** 1 hora si el `NEXT_PUBLIC_API_URL` de build local se
  resuelve rápido; si no, es sólo lectura de un log de CI ya existente.

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
