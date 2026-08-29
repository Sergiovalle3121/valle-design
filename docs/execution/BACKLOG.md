# BACKLOG — ordenado por lo que impide vender

Actualizado: 2026-08-29, campaña de ingeniería frontend
(`docs/execution/INFORME_CAMPANA_FRONTEND_20260829.md`).
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

### P1-F1 · `reset-password` sigue con el campo de contraseña sencillo
- **Qué falla:** la campaña de firma puso `PasswordField` —mostrar/ocultar,
  `autoComplete` correcto y medidor de entropía— en registro y login, pero NO en
  `/reset-password`, que es la OTRA pantalla donde alguien elige una contraseña.
  Quien llega ahí lo hace después de haber olvidado la anterior, es decir en el
  peor momento posible para teclear a ciegas doce caracteres.
- **Dónde:** `apps/web/src/components/IdentityActionForm.tsx` (el `Input
  type="password"` con `label="Contraseña nueva"`).
- **Por qué no se hizo en la campaña:** límite de alcance, no de diseño. Ese
  formulario lo conducen tres pruebas de navegador (`studio-real-api.spec.ts`
  entre ellas) y no se abre esa puerta en el cierre de una campaña.
- **Criterio de aceptación:** el campo usa `PasswordField` con
  `autoComplete="new-password"` y `showStrength`; `studio-real-api.spec.ts`
  sigue verde con su localizador ANCLADO (`/^Contrase/iu`), porque el botón de
  mostrar/ocultar vuelve a introducir la ambigüedad de nombre accesible que
  costó tres corridas de CI.
- **Estimación:** 30 minutos.

### P1-F5 · Dar de alta el segundo factor sólo pide la sesión; quitarlo pide la contraseña
- **Qué falla:** `POST /v1/auth/mfa/setup` y `/mfa/activate` se contentan con
  sesión + CSRF, mientras `disableMfa` y `regenerateBackupCodes` exigen la
  contraseña. La asimetría va al revés de lo que el propio módulo argumenta
  para desactivar: «no basta con estar dentro». Dar de alta un segundo factor
  cambia los requisitos de autenticación de la cuenta tanto como quitarlo.
- **Escenario:** quien roba una sesión (XSS, cookie copiada, portátil abierto)
  ata SU propio autenticador a la cuenta ajena. El dueño legítimo conserva la
  contraseña y puede desactivarlo, así que no es un secuestro permanente — pero
  es acceso persistente para el atacante y una pantalla de «segundo factor
  activo» que el dueño no reconoce.
- **Por qué no se arregló en la campaña de firma:** exige contraseña en el
  cuerpo de dos operaciones, o sea cambio de contrato (OpenAPI + SDK + consola)
  más la pantalla de alta. Es el mismo criterio que dejó OAuth fuera: media
  reautenticación es peor que ninguna, y esto merece su propio pase.
- **Criterio de aceptación:** las cuatro operaciones que tocan el segundo factor
  exigen contraseña reciente; `check:cad-contract` verde; la prueba que hoy
  cubre «desactivar exige contraseña» tiene su gemela para dar de alta.
- **Estimación:** medio día con contrato.

### P1-F2 · Invitación por lote en el servidor
- **Qué falla:** `/equipo` manda las invitaciones de una en una contra
  `POST /v1/organizations/:id/invitations`, en serie. Funciona y es honesto,
  pero el límite de asientos se descubre en la invitación número doce en vez de
  antes de mandar ninguna, y no hay atomicidad: veinte entran y diez no.
- **Dónde:** `apps/api/src/modules/organizations/organizations.controller.ts`;
  consumo en `apps/web/src/app/equipo/TeamRoom.tsx`.
- **Criterio de aceptación:** una operación de lote en la OpenAPI (con su SDK y
  su consola regenerados, el gate `check:cad-contract` verde) que valide los
  asientos UNA vez para toda la lista y responda qué entró y qué no; la pantalla
  deja de iterar.
- **Estimación:** medio día, contrato incluido.

### P1-F3 · Entrar con Google y Microsoft
- **Qué falla:** el alta sólo admite correo y contraseña. Es lo que más subiría
  la conversión del embudo.
- **Terreno mapeado (campaña de frontend, 2026-08-29):** no hay NADA de OAuth —
  ni ruta en el contrato (19 rutas `/v1/auth`, ninguna federada), ni botón, ni
  bandera, ni dependencia; `AuthModule` está vacío. La sesión de hoy es un token
  opaco cuyo SHA-256 vive en `identity_sessions`, servido en dos cookies (sesión
  `httpOnly` `SameSite=Lax`, y `valle_csrf` legible por JS para el doble envío),
  con el hash argon2id en `identity_credentials` y el acceso bloqueado hasta que
  un token de un solo uso de 24 h sella `User.emailVerifiedAt`. La colisión de
  correo se resuelve hoy con silencio deliberado —202 `{accepted:true}`, sin
  correo y con la misma pantalla de «revisa tu correo»— que es exactamente lo
  que deja **sin definir** qué hacer cuando el correo de Google ya tiene cuenta.
  Las specs `.pg` siguen un patrón único (`*.pg.spec.ts` + `createPostgresHarness`
  con esquema desechable) y se corren con
  `TEST_DATABASE_URL=… npm run test:pg --workspace=valle-design-api`.
- **Por qué NO se hizo:** OAuth no es una pantalla, es un proveedor de
  identidad. Antes de la primera línea hay que decidir y probar: fusión de
  cuentas cuando alguien se registró con contraseña y luego entra con Google
  desde el mismo correo; verificación de correo heredada del proveedor; qué
  ocurre si el proveedor deja de confirmarlo; revocación; y el segundo factor
  cuando el proveedor ya hizo uno. Media implementación crea un segundo camino
  de autenticación con la mitad de las defensas del primero.
- **Decisión del titular que lo desbloquea:** qué hacer cuando el correo del
  proveedor coincide con una cuenta de contraseña ya verificada.
- **Criterio de aceptación:** campaña propia, con suite contra los dos
  proveedores reales y las cinco decisiones de arriba probadas una a una.
- **Estimación:** una campaña, no un ítem.

### P1-F4 · Encender el modo universitario
- **Qué falta:** dos decisiones que no son técnicas — qué dominios
  institucionales se aceptan y con qué capacidad de soporte se atiende el pico
  de altas de principio de semestre.
- **Qué YA está listo:** `apps/api/src/modules/education/education-mode.ts` con
  su lista por segmentos de etiqueta (probada contra el ataque del dominio
  parecido), el aviso al arrancar la API que dice qué falta, y la prueba que
  impide sembrar el plan en el catálogo mientras esté apagado.
- **Criterio de aceptación:** `EDUCATION_MODE=true` y `EDUCATION_EMAIL_DOMAINS`
  en el despliegue, más una migración revisada que dé de alta la fila del plan
  con `EDUCATION_PLAN_CODE`; `/educacion` deja de decir «todavía no está
  abierto».
- **Estimación:** una hora de código una vez tomadas las dos decisiones.

---

### ~~P1-FE1 · Los umbrales de rendimiento de Lighthouse están sin calibrar~~ · CERRADO 2026-08-29

- **Cerrado.** Los cuatro umbrales de las dos pasadas **bloquean**, con el número
  del runner medido delante:

  | Categoría | Escritorio | Móvil | Medido en el runner | Margen |
  | --- | ---: | ---: | ---: | ---: |
  | Rendimiento | **0,90** | **0,70** | 94 / 73 | 4 y 3 puntos |
  | Accesibilidad | 0,95 | 0,95 | 100 | 5 puntos |
  | Buenas prácticas | **0,90** | **0,90** | 96 | 6 puntos |
  | SEO | **0,90** | **0,90** | 100 | 10 puntos |

- **La medida** (`ubuntu-latest`, run 33252353725 sobre `3ffc7a1`, mediana de tres
  corridas por ruta): escritorio **94 / 94 / 94** con LCP 1,62-1,69 s; móvil
  **73 / 74 / 75** con LCP 8,87-9,17 s; accesibilidad 100 y SEO 100 en las seis.
- **Lo que se aprendió, y desmonta la razón por la que esta entrada existía:** el
  runner y el contenedor de desarrollo dan **el mismo número** —móvil idéntico,
  escritorio un punto—. El estrangulamiento de Lighthouse es *simulado*, no
  aplicado, así que normaliza la máquina; la premisa de que «el número del
  contenedor no se traslada a un runner más pequeño y compartido» era falsa. Sólo
  se supo midiendo, y para poder medirlo hubo que arreglar cuatro fallos
  encadenados en la cadena de publicación (ver la sección 1.5 de la bitácora de
  campaña). El job `resumen-lighthouse` publica ahora esa tabla en cada corrida,
  en un log de veinte líneas, para que la próxima recalibración no cueste lo
  mismo.
- **El móvil se fija en 0,70 y no en 90** porque el producto no está en 90.
  Bajar el listón en silencio no vale; dejar el gate en aviso tampoco, porque un
  gate que no bloquea no es un gate. Sube cuando suba el producto: lo que hay que
  adelgazar es **P1-FE6**.
- **Comprobado que muerde:** subiendo el umbral móvil a 0,80 contra los informes
  reales, `lhci assert` falla en las tres rutas y devuelve 1; con 0,70 pasa.

### P1-FE2 · El monolito del editor: los tres bloques que quedan
- **Qué falta:** `Layout3DEditor.tsx` bajó de 20 220 a 19 137 líneas con siete
  cuadros extraídos, pero el objetivo declarado de la campaña (< 18 500 y
  `useState` < 130) NO se alcanzó, y el motivo está medido.
- **Dónde:** el mapa completo, con el acoplamiento de cada bloque y el comando
  para volver a medirlo, está en `docs/execution/DEUDA-MONOLITO.md`.
- **Por qué NO se forzó:** el bloque grande que falta —el paquete premium de
  entrega, 525 líneas— toca ~40 variables del cierre del componente. Un
  componente con cuarenta props no es una extracción: es el monolito con otra
  sintaxis. Y los `useState` no bajan extrayendo cuadros porque los cuadros
  pintaban estado ajeno; bajarlos exige mover la propiedad del estado.
- **Cómo se cierra:** primero `usePaperSpaces` (controlador de espacios-papel),
  y con él el cuadro sale con dos props. Después los otros tres controladores
  identificados (exportación DXF, versiones, validación), que suman ~23
  `useState`.
- **Criterio de aceptación:** monolito < 18 500 y `useState` < 130, con el
  trinquete bajado en el mismo commit y los goldens verdes.
- **Estimación:** una ola de campaña por controlador.

### P1-FE3 · Web Vitals de campo: falta el endpoint, no el medidor
- **Qué falta:** `lib/cad/telemetry/interaction-latency.ts` ya mide la latencia
  de interacción en el navegador con la API que define INP, y su aritmética
  tiene spec. Lo que no existe es **dónde publicarla**: la API tiene una capa de
  métricas completa pero 100 % de servidor —registro Prometheus en proceso, dos
  endpoints JSON protegidos por `METRICS_TOKEN`— y ni tabla, ni entidad, ni
  endpoint de escritura para telemetría de cliente.
- **Por qué NO se hizo en esta campaña:** es una cadena completa, no una
  pantalla: entidad + migración (con sus tres puntos de aterrizaje obligatorios,
  incluido el alta en `ALL_MIGRATIONS` de `migration-chain.pg.spec.ts`) +
  controlador Nest + ruta en el contrato OpenAPI + regeneración del SDK, y el
  gate `check:cad-contract` exige biyección **exacta** entre las tres cosas.
  Además hay una decisión de producto delante: un endpoint de escritura sin
  sesión es superficie nueva de abuso, y hoy los únicos que existen son los de
  identidad (limitados por IP) y los webhooks firmados por HMAC.
- **Criterio de aceptación:** el navegador publica CLS/LCP/INP reales, la tabla
  los guarda con retención declarada, y el panel interno los enseña por
  percentil. Con límite de tasa y sin dato personal.
- **Estimación:** media campaña.

### P1-FE4 · La trampa de foco de los cuadros del estudio
- **Qué falta:** `CadDialogShell` da `role="dialog"`, `aria-modal`,
  `aria-labelledby` y cierre con Escape a los siete cuadros extraídos — que
  antes no tenían nada de eso. Lo que **no** hace es mover el foco al abrir,
  atraparlo dentro ni devolverlo al cerrar.
- **Por qué NO se hizo a medias:** un foco que salta a un sitio equivocado deja
  a quien navega con teclado peor que antes. `Modal` (el de `components/ui`) sí
  lo hace y es la referencia a copiar.
- **Criterio de aceptación:** los cuadros del estudio pasan el mismo test de
  trampa de Tab que ya pasa el diálogo de comentarios en
  `e2e/a11y/teclado-embudo.spec.ts`.
- **Estimación:** medio día, la mayor parte en pruebas.

### P1-FE5 · Veintisiete controles del estudio se pueden enfocar y no se ven
- **Qué falla:** `globals.css` define el anillo de foco en `@layer base` con
  `:focus-visible`, pero Tailwind v4 emite `outline-none` en la capa
  `utilities`, que gana a `base`. Cualquier clase con `outline-none` apaga el
  anillo del sistema, y si no pone otro en su lugar deja un control que recibe
  el foco **sin ninguna señal de tenerlo**. Para quien navega con teclado, eso
  es no saber dónde está.
- **Cuántos y dónde:** 27 clases, medidas por
  `src/components/ui/foco-visible.spec.ts`. Casi todas son campos de texto de
  las paletas del editor CAD (hatch, xref, colaboración, línea de comandos) y
  del propio `Layout3DEditor.tsx`.
- **Por qué no lo cazaba nada:** no es un color mal elegido (gate de contraste),
  no es un token fuera de escala (gate del sistema de diseño), y axe no lo ve
  porque mira una página concreta y estos controles viven detrás de paletas que
  hay que abrir.
- **Estado:** hay **trinquete** desde 2026-08-29 —`foco-visible-budget.json`,
  27, y sólo baja—. No se puso en cero para no romper el repo de golpe y
  provocar una lista de excepciones, que es como se muere un gate.
- **Cómo se cierra:** cada paleta que salga del monolito (P1-FE2) se lleva sus
  campos y les pone `focus-visible:ring-2 ring-ring`; el trinquete baja en el
  mismo commit.
- **Criterio de aceptación:** el presupuesto llega a 0 y el gate pasa a
  prohibición.
- **Estimación:** se paga a plazos, con las extracciones.

### P1-FE6 · El 74 % de la portada son tipografías, y por eso el móvil da 74

- **Qué pasa:** medido con Lighthouse en el contenedor de desarrollo, máquina en
  reposo, mediana de tres corridas (ver la tabla completa en
  `docs/execution/CAMPANA_FRONTEND_20260829.md`, sección 1.5): en **móvil** la
  portada da **73** de rendimiento con un **LCP de 8,9 s**. Escritorio da 93. La
  diferencia no es misteriosa y no está en el JavaScript.
- **El desglose de bytes de la portada** (misma corrida, `/`, emulado móvil):

  | Tipo | Peso transferido |
  | --- | ---: |
  | **Tipografías** | **1 093,1 KB** |
  | Script | 262,3 KB |
  | Documento | 55,9 KB |
  | Imagen | 26,2 KB |
  | Hoja de estilo | 21,1 KB |
  | Resto | 17,6 KB |
  | **Total** | **1 476,3 KB** |

  **El 74 % de la portada son tipografías.** El presupuesto de bundle y el gate
  de bytes descargados estaban vigilando los 262 KB de script mientras el
  megabyte largo pasaba por delante sin que nadie lo mirara.
- **Y la fase lo confirma:** el desglose del LCP de ese informe da **TTFB 458 ms,
  Load Delay 0, Load Time 0, Render Delay 8 333 ms (95 %)**. El elemento LCP es
  un párrafo de texto (`p.type-lead` del hero), no una imagen: no hay nada que
  descargar para pintarlo. Las tres familias van con `display: "swap"`, así que
  el texto pinta pronto con el respaldo —FCP 1,1 s, Speed Index 1,7 s, CLS 0—
  pero **vuelve a pintar cuando llega la variable**, y ese repintado es el que
  se anota como LCP. Con 1,09 MB de fuentes en una red 4G estrangulada, eso cae
  a los ocho segundos y pico.
- **Dónde está el peso, fichero a fichero** (`apps/web/src/fonts/`):

  | Fichero | Formato | Peso |
  | --- | --- | ---: |
  | `InterVariable-Italic.woff2` | WOFF2 | 378,9 KB |
  | `InterVariable.woff2` | WOFF2 | 344,0 KB |
  | `JetBrainsMono-Italic-wght.ttf` | **TTF** | 301,6 KB |
  | `JetBrainsMono-wght.ttf` | **TTF** | 293,1 KB |
  | `SpaceGrotesk-wght.ttf` | **TTF** | 133,5 KB |

- **Las tres cosas que se ven a simple vista, en orden de rendimiento por
  esfuerzo:**
  1. **Tres de las cinco fuentes se sirven en TTF, no en WOFF2** (728 KB de las
     1 093). WOFF2 es el mismo contorno con compresión Brotli: la conversión no
     toca el diseño de la letra ni la identidad, y suele dejar el fichero en
     torno a un tercio. Es la mitad del problema y no cambia ni un píxel.
  2. **Las dos cursivas suman 681 KB** y la portada no usa cursiva. `next/font`
     precarga todas las variantes declaradas en el `layout`, se usen o no en la
     ruta que se está sirviendo.
  3. **JetBrains Mono es del estudio, no de la portada**: existe por la línea de
     órdenes, las coordenadas del cursor y las cifras en columna. Un visitante
     que sólo lee la portada se descarga 595 KB de una mono que no aparece.
- **Lo que NO se hace:** cambiar las familias. La voz tipográfica la fijó la
  campaña de firma y no se reabre por rendimiento; lo que se ataca es el formato
  y el alcance, no el diseño.
- **Cuidado con el gate que ya existe:** `check:fonts` prohíbe que
  `next/font/google` vuelva. La conversión a WOFF2 y el recorte de variantes se
  hacen dentro de `next/font/local`, con los ficheros versionados en el repo,
  sin tocar esa prohibición.
- **Criterio de aceptación:** la portada baja de 1 093 KB de tipografía a menos
  de 350 KB, el LCP móvil baja de 8,9 s a menos de 4 s, y el rendimiento móvil
  medido en reposo sube por encima de 85. Los tres números se publican con su
  máquina y sus condiciones, como todos los demás.
- **Estimación:** 2 horas — la conversión es mecánica, el recorte de alcance
  pide mirar dónde se usa cada familia.

### P2-FE5 · Las plantillas no se pueden diferir desde la paleta
- **Qué se descubrió:** `lib/cad/templates.ts` son 4 982 líneas de datos que
  parecían un `import()` fácil. No lo son: `lib/cad/engine/index.ts` importa
  `CAD_LAYOUT_COMMANDS`, que importa `CAD_LAYOUT_TEMPLATES`, y el motor de
  comandos es núcleo del estudio. Diferir las plantillas exige diferir los
  **manejadores de comandos pesados**, uno a uno, detrás de un `import()` en su
  `run`.
- **Criterio de aceptación:** el chunk del editor baja de forma medible en
  `e2e/performance/frontend-load-budget.spec.ts` sin que ningún comando pierda
  su prueba.
- **Estimación:** campaña propia.

## P2 — deuda que crece con intereses

### P2-F5 · El barrido de cables sueltos es sensible al orden en el par 2D/3D
- **Qué falla:** `cables-sueltos.spec.ts` pulsa los 76 controles del estudio en
  serie y SIN restaurar el estado entre uno y otro, así que en el par
  «Vista de plano 2D» / «Vista 3D» el que resulte inerte depende de en qué modo
  esté el visor al llegar a él. Medido: en dos corridas locales consecutivas del
  MISMO commit el inerte cambió de uno al otro; en CI sale siempre el 2D, que es
  lo que coincide con el estado real de carga (una sonda sobre el estudio recién
  abierto devuelve la clase de activo en «2D»).
- **Por qué importa:** un gate que cambia de veredicto sin que cambie el código
  es un gate que la gente aprende a re-ejecutar hasta que pase, y entonces deja
  de proteger.
- **Criterio de aceptación:** el barrido deja el visor en un modo conocido antes
  de medir cada control de vista —o mide ese par aparte, declarando el modo de
  partida—, y dos corridas seguidas dan el mismo conjunto de inertes.
- **Estimación:** 1 hora, más una corrida de 7 minutos por verificación.

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
