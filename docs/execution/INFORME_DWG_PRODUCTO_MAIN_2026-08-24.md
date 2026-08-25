# Informe de cierre — Campaña DWG producto (2026-08-24)

Este es el informe de cierre mandatado por el prompt maestro que originó
esta campaña. No se archiva (regla de `AGENTS.md` § "cierre de ramas
2026-08-24"): permanece en `docs/execution/` porque es evidencia medida,
no un plan vencido. El diario día-a-día que lo respalda se archivó, en
este mismo commit, a
`docs/history/execution/CAMPANA_DWG_PRODUCTO_MAIN_9H.md`.

## 0. Desviaciones respecto al prompt original (repetidas aquí por completitud)

1. **Rama + PR, no push directo a `main`.** Esta sesión (Claude Code
   remoto) tiene una rama de feature obligatoria
   (`claude/valle-design-dwg-main-lnqf7t`, ambos repos) y la regla "nunca
   push a otra rama sin permiso explícito", más el requisito estándar de
   abrir PR tras cada push — configuración de la sesión, con precedencia
   sobre la instrucción del prompt de trabajar directo en `main`. Todo el
   resto de la disciplina pedida (commits atómicos, sin force-push, sin
   reescribir historia, decisiones conservadoras fail-closed, máximo 3
   subagentes read-only, veracidad estricta) se siguió sin cambios.
2. **"Nueve horas continuas" tratado como orden de prioridad (P1→P6), no
   reloj literal.** Esta sesión no controla tiempo de pared como un
   daemon; se registró hora real en cada checkpoint.

## 1. Reloj

- Inicio: 2026-08-24 18:15:35 UTC.
- Cierre de este informe: 2026-08-24 ~21:10 UTC (ver marca de commit final
  para el instante exacto).
- Duración real de sesión: del orden de 3 horas de trabajo activo
  (no 9 horas de reloj de pared — ver desviación §0.2).

## 2. SHAs y estado de push (verificado con `git`, no de memoria)

| Repositorio | SHA base (inicio) | SHA final (este informe) | Commits de esta campaña | Rama | Push |
| --- | --- | --- | --- | --- | --- |
| `valle-design` | `946c5dbe2ac1b4e3d783090cb45cd3de0ec50dcb` | `3aae1cd066f4499597b18847d4476bb51fa970cc` (antes de este commit) | 13 | `claude/valle-design-dwg-main-lnqf7t` | Empujado, `origin` al día |
| `valle-design-dwg-conformance` | `3c456d7efb1017517ddf6996255a957262dacc90` | `1bbf2fa8050dd53d270ce7d93cc6dca32c7b4fd3` | 1 | `claude/valle-design-dwg-main-lnqf7t` (rama nueva de esta sesión) | Empujado, `origin` al día |

**PRs**: `valle-design#98` (draft, abierto, sigue recibiendo commits de
esta campaña — pasa a "ready for review" con este informe). Draft
`valle-design-dwg-conformance#4` (abierto, suscrito). **Ningún otro
branch ni worktree se creó** — verificado con `git worktree list`/
`git branch -a` en ambos repos: exactamente una rama local
(`claude/valle-design-dwg-main-lnqf7t`) y un worktree (el checkout
principal) por repositorio; las demás ramas remotas visibles
(`claude/valle-design-3d-campaign-t0zzad`, `claude/corpus-entidades`,
`claude/corpus-fundacional`, `claude/hungry-williamson-6fa0b4`,
`claude/productor-de-manifiestos`) son de sesiones anteriores ajenas a
esta campaña, no tocadas.

## 3. Lista de commits

### `valle-design` (13, en orden)

1. `9f5ac4e` — abre bitácora de campaña DWG producto
2. `4a11676` — construye el códec DWG en Docker y cablea sus flags de build
3. `3962355` — registra la campaña DWG producto en el log asistido
4. `e83e397` — cierra Fase 1 en la bitácora, consolida hallazgos de 3 subagentes
5. `cf4d1b3` — unifica el tope de bytes y distingue mensajes de error por código
6. `f1a25fa` — cierra Fase 2 en la bitácora
7. `28cbca1` — cierra fidelidad real de capas/bloques/texto y elimina el éxito vacío
8. `b992a77` — corrige AGENTS.md y CAPABILITIES.md, ya no contradicen la beta
9. `60d91c1` — sube el techo de esquema del servidor a 10, hallado por E2E real
10. `7fe695d` — regenera la evidencia DWG, desactualizada desde la Fase 7
11. `d38f0c5` — E2E real de importación DWG contra API + PostgreSQL (Fase 4)
12. `ee9c22e` — cierra Fase 5 en la bitácora — auditoría de intake de corpus/evidencia
13. `3aae1cd` — cierra Fase 6 en la bitácora — seguridad/robustez/perf re-verificadas

24 archivos, +2533/−382 líneas (`git diff --stat` base..HEAD antes de este
commit y el de archivado).

### `valle-design-dwg-conformance` (1)

1. `1bbf2fa` — corrige `origin: "donated"` a `"donated-original"` en DONACIONES.md

## 4. Capacidades: funcionando de punta a punta vs. sólo en laboratorio

**De punta a punta, con evidencia real (API NestJS real + PostgreSQL 16
real, sin mocks, esta sesión)**:

- Importar un `.dwg` AC1015 real (bundle admitido
  `valle.fundacional.ac1015.001`, origen `tool-converted-original`) por el
  picker del dashboard → decodificar → mapear al `CadDocument` canónico →
  **guardar en PostgreSQL real** (`PUT /v1/cad/documents/:id/content`).
- Verificación de conteo de entidad contra un oráculo DXF independiente
  (parseado a mano, sin el importador DXF del producto): exacto.
- Manifiesto de pérdidas persistido y verificado vía API: `dwg_unit_assumed`
  y `dwg_layer_state_flags_unmapped` presentes siempre que corresponde.
- Contenido de texto decodificado (página de códigos Latin-1) verificado
  contra la API: exacto ("SALA", "COCINA").
- Abrir el documento importado en Studio, **seleccionar una entidad LINE
  real, editar su coordenada `endX`, guardar por CAS, cerrar sesión, abrir
  una sesión NUEVA, y confirmar la persistencia** tanto por UI como por
  lectura directa a la API (que lee PostgreSQL) — no sólo que cambió la
  URL.
- Colores de capa ACI reales (no paleta inventada), bloques con punto base
  declarado, propiedades TEXT/LWPOLYLINE no-default declaradas una por una.
- Build de producción de Docker/Next con los dos flags DWG encendidos y
  apagados: ambos compilan limpio (Docker real no disponible en este
  entorno; réplica exacta de la secuencia del Dockerfile con `next build`
  local, registrado como bloqueo externo).

**Sólo en laboratorio / no conectado al producto**:

- Exportación DWG (`writeAc1015MinimalFile` y familia): capacidad de
  laboratorio con round-trip verificado contra un lector EXTERNO (ODA File
  Converter 27.1), pero sin ningún botón, endpoint ni flag de producto.
- AC1024/AC1027/AC1032: el contenedor R2010+ decodifica parcialmente
  (cabecera, mapas, envoltorio de objeto) pero el cuerpo de objeto
  (codificación BOT) sigue bloqueado por fuente insuficiente — cierra en
  `DWG_VERSION_DECODER_UNSUPPORTED` sin cambio de comportamiento.
- AC1021: rechazado tipado por diseño (contenedor Reed-Solomon distinto).
- Paper space, xrefs, bloques dinámicos DWG: no se leen (caen a model
  space con diagnóstico, o no se representan).
- ATTRIB de INSERT: el laboratorio los decodifica pero la frontera de
  producto (`DwgNeutralEntityRecord`) los descarta antes del puente —
  hallazgo del subagente de Fase 1, no cerrado esta campaña.

**Nuevo: seleccionable en UI pero SIN adaptador nativo (hallazgo real de
esta campaña, no específico de DWG)**:

- Entidades `type:"text"` (DWG **y** DXF: mismo código compartido) se
  decodifican, mapean y persisten correctamente, pero no se registran como
  `CadNativeEntity` en `entity-runtime.ts` — no son seleccionables,
  editables ni visibles en el lienzo de Studio hoy. Consecuencia
  encadenada: guardar un documento que contenga una entidad `text`
  corrompe su capa al pasar por el snapshot del editor legado y el
  guardado subsiguiente responde 400. Root-caused, NO arreglado (función
  nueva de alcance general — implementar el adaptador — fuera del alcance
  quirúrgico de una campaña de DWG). Ver §5.6-5.7 de la bitácora
  archivada para la cadena de evidencia completa.

## 5. Versiones, entidades y propiedades exactas que el producto acepta hoy

- **Versiones DWG**: AC1015 (R2000) siempre; AC1018 (R2004) sólo con
  `NEXT_PUBLIC_DWG_AC1018_IMPORT_BETA=true` Y la beta base también
  encendida (conjunción, nunca ampliación silenciosa). Cualquier otra
  versión reconocida (AC1021, familia 2010+) se rechaza con mensaje
  tipado nombrando la versión detectada.
- **Perfil de entidades `AC1015_MODELSPACE_2D_V3`**: LINE, POINT, CIRCLE,
  ARC, LWPOLYLINE, TEXT, INSERT, ELLIPSE, SPLINE no racional de escenario
  1, MTEXT, DIMENSION (salvo angular de dos líneas), HATCH de contorno
  poligonal. Sólo model space: dentro de un bloque, MTEXT/DIMENSION/HATCH
  caen al mismo diagnóstico genérico que cualquier tipo sin
  representación ahí.
- **Límite de tamaño**: 16 MiB (`DWG_MAX_IMPORT_BYTES`, única fuente de
  verdad compartida con el códec, cruzada por prueba).
- **Pérdidas declaradas siempre**: unidad asumida en milímetros (INSUNITS
  no se decodifica en el camino de lectura); `stateFlags` de capa crudo
  (semántica bit a bit no confirmada contra corpus real); punto base de
  bloque asumido en `{0,0}`; rotación/factor de ancho/alineación de TEXT y
  elevación/ancho constante de LWPOLYLINE cuando difieren del valor por
  defecto.
- **Falla cerrado**: un archivo cuyo mapeo no produce ni una entidad ni un
  bloque se rechaza con error, no con un documento "exitoso" vacío.

## 6. Resultados de gates, con exit code exacto

Corridos sobre el árbol QUIETO (committeado hasta `3aae1cd`), en este
entorno declarado (Linux, Node v22.22.2, 4 núcleos, sin Docker daemon, sin
acceso a red pública salvo lo ya declarado).

| Gate | Exit | Nota |
| --- | --- | --- |
| `npm run check:dwg` | 0 | `packages/dwg-codec` completo (provenance+fixtures+no-io+boundary+build+typecheck+349 tests adversariales+fuzz 20k) + boundary de producto + corpus |
| `npm run check:cad` | 0 | incl. `check:dwg-evidence`, `check:command-integrity`, rubric — matriz competitiva regenerada sin diff adicional |
| `npm run typecheck` | 0 | 7 paquetes del monorepo (turbo) |
| `npm run test` | 0 | monorepo completo (turbo: contracts, dwg-codec, design-sdk, api, web) |
| `npm run lint` | 0 | monorepo completo (turbo) |
| `npm run check:deploy` | 0 | 29 invariantes sobre 3 Dockerfiles; imagen reproducible |
| `npm run smoke:deploy` | 0† | primer intento exit 2 por omisión propia de `DATABASE_URL` en esa invocación — no un fallo del producto (mensaje explícito: "Falta DATABASE_URL"); reintentado con PostgreSQL real: **17/17 comprobaciones OK** (arranque fail-closed sin config completa, `/health`+`/health/ready`, `/metrics` protegido, apagado ordenado con drenaje). Bloque E (activos estáticos) marcado explícitamente "no medido" — falta `SMOKE_WEB_BASE_URL`, no se cuenta como aprobado |
| `npm run build` | 0 | 5 paquetes, Next.js + NestJS compilan limpio |
| `npm run sbom` | 0 | 147 componentes de producción |
| `npm run check:licenses` | 0 | 139 permitidas, 3 en revisión legal (`@img/sharp-libvips-*`, LGPL-3.0-or-later/Apache-2.0+MIT — no retiradas automáticamente, no bloqueadas), 0 bloqueadas, 0 desconocidas |
| E2E real DWG (`dwg-import-real.spec.ts`, chromium) | 0 | 6/6 passed (9s), API real puerto 4000 + PostgreSQL 16 + build de producción |
| CI de GitHub, `Gitleaks` (PR #98, SHA `3aae1cd`) | 0 | success |
| CI de GitHub, `Contrato · Build · Test · Lint · Smoke` (PR #98, SHA `3aae1cd`) | 0 | success — un intento anterior sobre `b992a77` fue rojo por la misma causa que `chore(dwg): regenera la evidencia DWG` ya corrigió (`60d91c1`/`7fe695d` la preceden en este head) |
| CI de GitHub, `Despliegue · Imagen reproducible + arranque productivo` (PR #98, SHA `3aae1cd`) | 0 | success — mismos dos scripts que `check:deploy`+`smoke:deploy` arriba, no un build Docker real (este runner sí tiene Docker, pero este job en particular no lo invoca) |
| CI de GitHub, `E2E Playwright (PostgreSQL · Chromium + Firefox)` (PR #98, SHA `3aae1cd`) | *no mandatado por el prompt original — añadido como verificación extra propia* | en curso al momento de escribir este informe; no es uno de los gates locales que el prompt maestro exige con exit code, así que no bloquea el cierre de este documento. Esta sesión sigue suscrita a PR #98 y seguirá esta corrida (y cualquier corrida futura) hasta que el PR se fusione o cierre, per las reglas de la sesión — cualquier hallazgo (incl. algo específico de Firefox, dado que el spec nuevo sólo se corrió en Chromium localmente) se atenderá fuera de este informe, sin reabrirlo |

†Exit code de la corrida QUE CUENTA (con `DATABASE_URL` real); el primer
intento sin esa variable se registra arriba explícitamente para no ocultar
que existió, con su causa exacta — no se descarta en silencio.

## 7. Cuatro indicadores de madurez — antes/después, nunca conflados

Regla de la propia campaña: estos cuatro NUNCA se combinan en un solo
número, y "paridad general con AutoCAD" la computa
`node scripts/cad/rubric.mjs` — este informe ENLAZA esa cifra, no la
copia a mano (`docs/competitive/autocad-2027-gap-matrix.md`).

1. **Preparación de ingeniería (DWG import, beta acotada)**:
   ANTES de esta sesión: build de Docker roto (el Dockerfile no
   construía el códec), límites de tamaño duplicados con literal
   independiente, capas con paleta inventada, éxito vacío enmascarado como
   documento válido, cero E2E no-circular. DESPUÉS: Docker/build reparado
   con gate de regresión, límites unificados con prueba cruzada, colores
   ACI reales, fail-closed real, y — el cambio cualitativo mayor — un E2E
   real (API+PostgreSQL) que encontró y (donde el alcance lo permitía)
   cerró tres defectos reales previos a esta campaña. Sigue habiendo un
   hallazgo real sin cerrar (adaptador de texto nativo ausente) y un gap
   de cancelación cooperativa sin cerrar, ambos documentados con su propia
   cadena de evidencia, no escondidos.
2. **Independencia de evidencia**: a nivel PRODUCTO, subió de
   "sólo E2E mockeado/circular para DWG" a "E2E real contra API y
   PostgreSQL reales, con oráculo DXF independiente del importador". A
   nivel CORPUS, sin cambio: sigue siendo enteramente
   `tool-converted-original` (7 bundles, 0 `donated-original`, 0
   `licensed-third-party`) — el caveat de `CORPUS_POLICY.md` ("ODA File
   Converter no es AutoCAD") sigue plenamente vigente. El mecanismo de
   donación que permitiría cerrar esto se reparó (bug real de naming que
   habría bloqueado la primera donación), pero cero donaciones reales
   existen todavía.
3. **DWG comercial (disponibilidad para clientes reales)**: SIN CAMBIO.
   `productionAvailable: false` antes y después; ambos flags apagados por
   defecto en producción pública antes y después; `legalReviewCleared:
   false` en `DWG_PROMOTION_GATES` antes y después. Esta campaña no tenía
   mandato ni evidencia para mover este indicador, y no lo infla.
4. **Paridad general con AutoCAD**: ver
   `docs/competitive/autocad-2027-gap-matrix.md`, generado por
   `node scripts/cad/rubric.mjs` sobre el árbol de este commit — la fila
   "Import/export DWG" muestra 6/7, sin cambio de puntaje crudo en esta
   campaña (el punto que falta exige gates legales/de seguridad
   superados, fuera del alcance de ingeniería de esta sesión), aunque la
   evidencia que sostiene ese 6 mejoró sustancialmente (ver indicador 1).

## 8. Próximas 10 tareas, ordenadas por valor comercial

1. **Implementar el adaptador nativo de `text`** (renderer, hitTester,
   grips, snaps, properties, commands en `entity-runtime.ts`) — cierra
   simultáneamente el hallazgo 5.6 y su consecuencia 5.7 (corrupción de
   capa al guardar). Sin esto, CUALQUIER documento DWG o DXF con texto
   plano importado es defectuoso en Studio — el bloqueador de mayor valor
   comercial encontrado esta campaña, y no es específico de DWG.
2. **Cerrar la cancelación cooperativa** en los tres puntos de entrada del
   lector (`readDwg`/`readAc1015Database`/`readR2004Database`) con
   `signal`/`deadlineMs` reales — hoy sólo `worker.terminate()` detiene el
   hilo, sin que el códec note la cancelación. Sesión dedicada, con
   auditoría propia antes de tocar el núcleo del parser.
3. **Conseguir la primera donación real** vía `DONACIONES.md` (ya
   reparado) — es la única vía para que el corpus deje de ser
   100% `tool-converted-original` y el indicador de independencia de
   evidencia (§7.2) se mueva de verdad.
4. **Decodificar INSUNITS en el camino de LECTURA** del códec (hoy sólo
   el de escritura lo usa) — cierra la pérdida `dwg_unit_assumed` que hoy
   viaja en TODA importación DWG.
5. **AC1024/AC1027/AC1032**: registrar la fuente que fija la codificación
   BOT (2 bits + ancho de valor) del tipo de objeto R2010+ — el bloqueo
   está nombrado y con hechos parciales ya registrados
   (`SOURCE_REGISTER.json`), falta la fuente que complete la tabla
   selector→ancho.
6. **ATTRIB de INSERT**: exponer el campo ya decodificado por el
   laboratorio (`Ac1015DatabaseEntityRecord.attributes`) en
   `DwgNeutralEntityRecord`, la frontera de producto — hoy se descarta
   antes del puente sin razón técnica, sólo porque el tipo no lo declara.
7. **Dictamen legal** (`legalReviewCleared`) — el único gate que, al
   cerrarse, permitiría evaluar activar los flags en producción pública;
   fuera del alcance de ingeniería, pero es la dependencia real de todo
   "DWG comercial".
8. **Ampliar `manifest.schema.json`/`DONACIONES.md`** con una guía
   concreta (no genérica) de qué par de validaciones independientes sirve
   para un `donated-original` real, una vez exista un primer caso real
   que la ponga a prueba (deliberadamente no inventada en esta campaña).
9. **Extender el corpus admitido con más escenarios AC1015/AC1018**
   (bloques anidados, HATCH con islas reales, DIMENSION con estilos no
   default) para ampliar la cobertura de fidelidad más allá de los 8
   fixtures fundacionales actuales.
10. **E2E real para Firefox** (hoy sólo Chromium tiene el spec real
    `dwg-import-real.spec.ts` corrido; `AGENTS.md` pide Chromium y
    Firefox para el release E2E) — extender el spec nuevo al segundo
    navegador.

## 9. Confirmación explícita

- **Ningún branch, worktree ni PR se creó fuera de lo ya nombrado en este
  informe** (§2-3): verificado con `git worktree list` y `git branch -a`
  en ambos repositorios inmediatamente antes de escribir esta sección, no
  de memoria.
- **Nunca se hizo push directo a `main`, force-push, ni reescritura de
  historia**, en ningún repositorio.
- **Ninguna cifra de este informe se midió sólo una vez sin verificación
  independiente** donde una estaba disponible: hashes recalculados contra
  bytes reales (no contra el manifest), conteos de entidad contra un
  oráculo DXF parseado a mano, persistencia verificada por lectura directa
  a PostgreSQL vía API, no sólo por la URL del navegador.
- **Cada capacidad declarada arriba lleva su límite al lado** — ninguna
  afirmación de "funciona" sin la afirmación paralela de qué NO cubre
  todavía.

---

*Nota de cierre: cada exit code de §6 es real, tomado de una corrida
verificada sobre el SHA final — ninguno es un placeholder. La única fila
sin exit code (el E2E de CI en Firefox) lo declara explícitamente como "en
curso, no mandatado", no como un resultado inventado ni omitido en
silencio.*

## 10. Adenda posterior al cierre (misma sesión, misma suscripción a PR #98)

El job de CI mencionado en la nota de arriba terminó en rojo (`26b4490`,
E2E Playwright, 5 tests fallidos) minutos después de publicado este
informe. Investigado en la MISMA sesión, vía la suscripción activa al PR:
ninguno de los 5 fallos está en `dwg-import-real.spec.ts`. Dos compartían
la misma deriva de UI (verificación de correo / alta de organización) ya
encontrada y corregida en el spec nuevo de esta campaña — corregidos con
el mismo patrón ya probado, verificados contra API real + PostgreSQL, y
empujados en `ddbc9ae`. Los otros tres (un redirect `/studio`→`/dashboard`
tras activar el trial, un "No existe un documento histórico compatible"
en la capa de compatibilidad de `/legacy/studio`, y un timeout de
simulación de `Page.crash` vía CDP en el runner de CI) son root-caused
pero deliberadamente NO corregidos: ninguno lo toca esta campaña de DWG, y
cada uno exige entender una superficie ajena (routing de `/studio`,
la capa legada, el sandbox del runner) que esta sesión no auditó a
profundidad. Detalle completo y decisión explícita en el comentario de
cierre de PR #98 en GitHub, no duplicado aquí.

No se re-abre ninguna sección anterior de este informe por esto: los diez
gates locales mandatados (§6) y los cuatro indicadores (§7) siguen siendo
exactamente lo que se midió al cerrar la campaña. Esta adenda documenta
trabajo de seguimiento sobre la suscripción al PR, que continúa
independientemente de que el informe de cierre ya esté publicado.

## 11. Cascada de continuación (misma sesión, directiva "dale con la
    siguiente fase") — las diez tareas de §8, una a una

Directiva del titular tras fusionar el PR de esta campaña: "mergea y dale
con la siguiente fase" y, más tarde en la misma sesión, "mergea y vete en
cascada no te detengas, dale con la siguiente fase hasta llegar al 10/10 en
el DWG". Esta sección cierra el lazo de las diez tareas de §8: qué se
implementó, qué se confirmó genuinamente bloqueado y por qué — ninguna se
deja sin tocar en silencio.

**Implementadas y fusionadas (2 PR, 6 commits atómicos, verificación
independiente en cada una — no sólo el resultado reportado por quien
implementó):**

1. **Tarea #1 (adaptador nativo de `text`)** — PR #98 (esta campaña) más
   PR #100: el adaptador, y dos defectos reales de captura/guardado de capa
   en `Layout3DEditor.tsx` que sólo un comando nativo sobre un TEXT podía
   disparar y que este adaptador dejó alcanzables.
2. **Tarea #4 (INSUNITS en lectura)** — PR #101. El lector de variables de
   cabecera existía y estaba probado, pero ningún lector de base de datos lo
   invocaba. Conectado; efecto colateral encontrado y cerrado (el
   placeholder de pruebas del writer nunca fue decodificable de verdad, 12
   tests lo daban por válido sólo a nivel de marco).
3. **Tarea #10 (E2E real para Firefox)** — PR #101, reencuadrada. El pedido
   original suponía un spec limitado a Chromium; la investigación encontró
   que el job `e2e` de CI nunca ejercitaba `dwg-import-real.spec.ts` EN
   ABSOLUTO, en ningún navegador, desde que existe — dos variables de
   entorno ausentes. Cableado y verificado (9/9 local contra el stack real
   tras reconstruir el build). Firefox en sí sigue sin verificar: bloqueo de
   infraestructura del sandbox de ejecución (descarga de Playwright
   rechazada por la política de salida de red), no del producto.
4. **Tarea #2 (cancelación cooperativa)** — PR #101. `ResourceBudget` ya
   tenía el contrato completo; los tres lectores no lo usaban, y la segunda
   pasada de ensamblado (`assembleDatabase`) no tocaba el presupuesto en
   absoluto. Cerrado lo auditado como seguro (parámetro aditivo,
   `assembleDatabase` ahora cobra por objeto); el cruce hasta el worker del
   producto queda declarado fuera de alcance — el parseo corre en una sola
   pila síncrona y un mensaje de cancelación no se entregaría hasta que
   termine, así que cerrarlo de verdad exige trocear el bucle caliente para
   ceder al bucle de eventos, cambio estructural mayor que esta tarea no
   audita.
5. **Tarea #6 (ATTRIB de INSERT)** — PR #101. Expuesto por el mismo camino
   que ya usa DXF (`attributes: Record<string,string>`), sin mapeo
   paralelo. `positionedAttributes` (con geometría real) queda sin poblar:
   ni DXF lo hace en import ni el propio mapeador de referencia del
   laboratorio lo intenta. Ningún fixture DWG real del corpus admitido
   contiene un ATTRIB hoy — la evidencia es unitaria, no de un `.dwg` real,
   y se declara así.

**Confirmadas genuinamente bloqueadas por un acto externo real, no por
falta de esfuerzo de ingeniería — evaluadas de nuevo en esta sesión, no
asumidas del informe original:**

6. **Tarea #3 (primera donación real)** — sigue en cero. El mecanismo
   (`DONACIONES.md`) está reparado desde P5b, pero conseguir una donación
   real exige un donante externo real con permiso escrito; ningún agente
   puede fabricar eso. `incoming/` del repo hermano sigue vacío.
7. **Tarea #5 (fuente de la codificación BOT R2010+)** — reconfirmada
   bloqueada, con una lectura completa de `SOURCE_REGISTER.json` en esta
   sesión, no repetida de memoria. El intake 2026-08-23 ya intentó de forma
   exhaustiva derivar la codificación por búsqueda bit a bit contra el
   propio corpus (3 anchos de valor probados contra un tipo LINE conocido,
   430 mediciones de envoltura sin discrepancias en OTRAS piezas del
   formato) y **falló**, documentándolo como frontera declarada, no como
   hecho. La única fuente que resolvería esto de verdad es la especificación
   de ODA/RealDWG/LibreDWG — exactamente lo que la política clean-room de
   este laboratorio excluye por nombre. No existe una especificación pública
   independiente de esas tres. Repetir la búsqueda empírica sin datos ni
   técnica nuevos no sería "intentarlo más", sería adivinar sin poder
   falsarlo — lo que la disciplina de este mismo archivo prohíbe
   explícitamente ("sin evidencia, cero").
8. **Tarea #9 (extender el corpus admitido)** — bloqueada en este entorno de
   ejecución por dos razones acumulativas, ambas verificadas, no supuestas:
   la única herramienta que la política del repo hermano autoriza para
   producir bytes DWG de autoría propia (ODA File Converter 27.1) es un
   instalador `.msi` de Windows, ausente de este sandbox Linux y no apto
   para instalarse aquí sin la vigilancia deliberada que `CORPUS_POLICY.md`
   ya exige para esa herramienta exacta; y la admisión de CUALQUIER bundle
   — incluido el origen más laxo, `tool-converted-original` — exige por
   política firmada un revisor-propietario humano, que ningún agente puede
   sustituir. Autor DXF de escena nueva sin poder convertirlo ni admitirlo
   no sería progreso real, sería inventario a medias.
9. **Tarea #7 (dictamen legal)** — sin cambio, ya declarada fuera del
   alcance de ingeniería en §7.3 del cierre original. Ningún programa firma
   un dictamen jurídico.
10. **Tarea #8 (ampliar guía de `DONACIONES.md`)** — sigue dependiendo de la
    tarea #3: la propia tarea original pide NO inventarla hasta que exista
    un primer caso real que la ponga a prueba. Diseñarla contra un caso
    hipotético sería exactamente la anticipación sin evidencia que este
    archivo lleva evitando desde §0.

**Ningún indicador de madurez (§7) cambia por esta adenda** salvo lo ya
verificado con evidencia ejecutable: el indicador 1 (preparación de
ingeniería) mejora con el cierre de las tareas #1/#2/#4/#6; el indicador 2
(independencia de evidencia) NO se mueve — sigue 100% `tool-converted-
original`, exactamente lo que la tarea #3 bloqueada explica; el indicador 3
(DWG comercial) NO se mueve — depende de la tarea #7, fuera de alcance; el
indicador 4 (paridad AutoCAD) se recalcula con `node scripts/cad/rubric.mjs`
sobre cada commit, no se copia a mano aquí.
