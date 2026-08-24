# Campaña DWG producto — bitácora de ejecución

Estado: **EN CURSO**. Este archivo es estado vivo mientras la campaña corre
(ver la regla de archivado en `AGENTS.md` § "cierre de ramas 2026-08-24" —
se archiva a `docs/history/execution/` en el mismo commit que publique un
informe de cierre `INFORME_*`).

## 0. Desviaciones registradas respecto al prompt original

El prompt que originó esta campaña pedía trabajo directo sobre `main`, sin
ramas ni PR, y asumía un reloj de pared de 540 minutos controlado por esta
sesión. Dos cosas de eso no se siguen, registradas aquí para que quede
trazable:

1. **Rama + PR, no push directo a `main`.** Esta sesión (Claude Code
   remoto) está configurada con una rama de feature obligatoria
   (`claude/valle-design-dwg-main-lnqf7t`) para ambos repos y la regla
   "nunca push a otra rama sin permiso explícito", más el requisito
   estándar de abrir PR tras cada push. Esto tiene precedencia sobre la
   instrucción del prompt de trabajar directo en `main`. Todo el resto de
   la disciplina pedida (commits atómicos, sin force-push, sin reescribir
   historia, decisiones conservadoras fail-closed, máximo 3 subagentes
   read-only, veracidad estricta) se sigue sin cambios.
2. **"Nueve horas continuas" se trata como orden de prioridad (P0→P7), no
   como reloj literal.** Esta sesión no controla tiempo de pared como un
   daemon; se registra hora real en cada checkpoint, no un reloj simulado.

## 1. Reloj y estado inicial (verificado, no asumido)

- Hora local al arrancar: 2026-08-24 18:15:35 UTC (entorno en UTC).
- `valle-design`: HEAD local tras reset limpio = `origin/main` =
  `946c5dbe2ac1b4e3d783090cb45cd3de0ec50dcb` — coincide exactamente con el
  SHA que el brief cita como "último corte auditado".
- `valle-design-dwg-conformance`: HEAD local = `origin/main` =
  `3c456d7efb1017517ddf6996255a957262dacc90` — coincide exactamente con el
  SHA del brief.
- Node v22.22.2, npm 10.9.7, git 2.43.0.
- Docker 29.3.1 instalado pero **el daemon no está disponible en este
  entorno** (`docker info` falla). Bloqueo externo real — ver §3.
- PostgreSQL: cliente `psql` 16.13 presente; **no hay servidor Postgres
  corriendo** en este entorno (`pg_isready` → sin respuesta). Bloqueo
  externo real — ver §3.
- Playwright: Chromium preinstalado en `/opt/pw-browsers`.
- PR #95 (`DWG_NATIVE_IMPORT_BETA` V1) confirmado **merged** vía GitHub API
  — coincide con el brief.
- PR #94 (campaña 3D, ajena a DWG): el brief lo describe abierto/draft.
  **Realidad actual: CLOSED, unmerged**, cerrado ~27 min antes de esta
  sesión. Diferencia registrada; sigue fuera de alcance de todos modos, no
  se toca.

## 2. Lo que cambió entre el brief y `main` real (hallazgo mayor)

El brief se escribió sobre el estado justo después del merge de PR #95
(perfil V1: LINE/POINT/CIRCLE/ARC/LWPOLYLINE/TEXT/INSERT). Entre ese merge
y el arranque de esta sesión, **otras sesiones autónomas empujaron directo
a `main` el mismo día** (2026-08-24) y avanzaron sustancialmente más de lo
que el brief asume:

- `a095635` — perfil ampliado a `AC1015_MODELSPACE_2D_V2` (+ ELLIPSE,
  SPLINE escenario 1 no racional) — ADR-0009 §6-ter.
- `09faee7` — perfil ampliado a `AC1015_MODELSPACE_2D_V3` (+ MTEXT,
  DIMENSION salvo angular de dos líneas, HATCH de contorno poligonal) —
  ADR-0009 §6-quater.
- `485840e` — AC1018 (2004) aceptado con flag propio
  (`NEXT_PUBLIC_DWG_AC1018_IMPORT_BETA`, `DWG_AC1018_BETA_AUTHORIZATION`) —
  ADR-0009 §7.
- `d3a71e5` — ADR de "vía propia única" renumerado de 0013 a **0014**
  (0013 quedó ocupado por "rol runtime valle_app no dueño", tema distinto).
  El brief cita "ADR-0014" — correcto pese al roce de numeración.
- Campaña de cierre de ramas (`4459dce`…`d018b26`) fusionó P0 (RLS,
  facturación, deploy gates), fuentes Hershey MTEXT, probes de evidencia
  operacional, y dejó registrado en
  `docs/execution/INFORME_CIERRE_RAMAS_20260824.md` que **el borrado de
  ramas está bloqueado por protección de rama (`allowDeletions:false`)** —
  no accionable por esta sesión.

Verificado leyendo código real, no sólo los ADR: `dwg-native-reader.ts`
implementa el filtro V3 completo (`BETA_PROFILE_ENTITY_KINDS`,
`toBetaProfileGeometry`, exclusiones declaradas de spline racional/fit,
DIMENSION angular de dos líneas, HATCH curvo) con `allowAc1018`. Esto es
sustancialmente más de lo que el brief pedía "cerrar" en fidelidad de
entidades — ya está hecho y gobernado por ADR-0009 §6-bis/ter/quater/§7.

**Consecuencia para la priorización de esta sesión:** no se repite trabajo
ya hecho. Se verifica el estado real de cada frente (Docker/release,
límites, E2E, corpus, seguridad, docs) y se corrige lo que de verdad sigue
roto — que, verificado abajo, es sobre todo el frente de despliegue.

## 3. Bloqueos externos reales (registrados, no evadidos)

| Bloqueo | Cómo se comprobó | Gate afectado | Riesgo | Paso humano exacto |
| --- | --- | --- | --- | --- |
| Docker daemon no disponible en este entorno remoto | `docker info` → exit≠0, "DOCKER_DAEMON_UNAVAILABLE" | `docker build` real de las dos imágenes (DoD Fase 1) | Medio: la corrección del Dockerfile se valida estáticamente (`validate-dockerfiles.mjs`) y por build equivalente de Next.js local, pero no hay build de imagen ni contenedor arrancado real en esta sesión | Ejecutar `docker build` de `apps/web/Dockerfile` con ambos perfiles de flags en un entorno con Docker (o en el workflow `release.yml` vía `workflow_dispatch`) y confirmar arranque + healthcheck |
| No hay servidor PostgreSQL en este entorno | `pg_isready` sin respuesta; sin `DATABASE_URL`/`TEST_DATABASE_URL` apuntando a una instancia viva | E2E real contra API+Postgres (Fase 4), `test:pg` | Alto para la Fase 4: no se puede demostrar persistencia real sin Postgres real | Levantar Postgres 16 local (`docker compose` o servicio nativo), exportar `TEST_DATABASE_URL`/`REQUIRE_POSTGRES_TESTS=true`, re-correr el E2E real y `test:pg` |
| Corpus real donado por despachos (independiente de Valle) | `SOURCE_REGISTER.json`/`CORPUS_POLICY.md` del repo hermano — sin archivos de terceros con permiso registrado | Independencia de evidencia (indicador 2) | No se puede llegar a 10/10 de independencia sin esto | El titular gestiona donación con despachos reales (procedimiento ya existe: "Mecanismo de donación de planos" en el repo hermano) |

Ninguno de estos bloqueos detiene la campaña: se sigue con los frentes que
no los requieren mientras están registrados.

## 4. Tareas y estado

Ver TaskCreate/TaskList de la sesión para el desglose vivo; resumen aquí:

- [ ] P1 — Docker/build/release: copiar+construir `dwg-codec`, cablear
      `NEXT_PUBLIC_DWG_NATIVE_IMPORT_BETA` / `NEXT_PUBLIC_DWG_AC1018_IMPORT_BETA`
      en Dockerfile y `release.yml`, extender `validate-dockerfiles.mjs`.
- [ ] P2 — Unificar límites de tamaño/tiempo (24 MB UI vs 16 MiB códec vs
      2 s budget vs 45 s worker) con mensajes de error distinguibles.
- [ ] P3 — Verificar fidelidad real (unidades/capas/bloques/texto) contra
      lo que V3 ya implementa; cerrar huecos reales, no reabrir lo hecho.
- [ ] P4 — E2E no circular con API/Postgres reales (bloqueado parcialmente
      por falta de Postgres local — ver §3).
- [ ] P5 — Corpus y evidencia: mejorar intake/oráculo: sin descargar ni
      fabricar archivos de terceros.
- [ ] P6 — Seguridad/robustez/rendimiento: correr y ampliar adversarial,
      fuzz, límites, cancelación.
- [ ] P7 — Coherencia de documentación: `AGENTS.md` raíz todavía dice "DWG
      remains unsupported in UI, API and providers" — contradice la beta
      ya wireada. Corregir.
- [ ] Gates finales secuenciales + informe de cierre.

## 5. Comandos y resultados (se agrega cronológicamente)

### 5.1 Fase 1 — Docker/build/release (CERRADA)

Commits en `claude/valle-design-dwg-main-lnqf7t` (push a `origin` exitoso,
`origin/main` no se movió durante la fase — verificado con `git fetch
origin` antes de cada push):

- `9f5ac4e` — docs(dwg): abre bitácora de campaña.
- `4a11676` — fix(dwg): construye el códec DWG en Docker y cablea sus
  flags de build. Root cause reproducido ANTES de tocar código:
  `cd apps/web && node -e "require.resolve('@valle-design/dwg-codec')"` →
  `Cannot find module '.../dist-cjs/index.js'`.
- `3962355` — docs(governance): registra la campaña en el log asistido.

PR abierto (draft, en curso, recibirá más commits):
https://github.com/Sergiovalle3121/valle-design/pull/98 — suscrito a sus
eventos.

Comandos y resultados exactos:

| Comando | Exit | Nota |
| --- | --- | --- |
| `npm ci` (raíz) | 0 | 1055 paquetes |
| `node -e "require.resolve('@valle-design/dwg-codec')"` (pre-fix, cwd apps/web) | 1 | `Cannot find module '.../dist-cjs/index.js'` — reproducción del hallazgo |
| `npm run build --workspace=@valle-design/dwg-codec` | 0 | genera `dist/` y `dist-cjs/` |
| `npm run build --workspace=@valle-design/contracts && npm run build --workspace=@valle/design-sdk && NEXT_PUBLIC_API_URL=... NEXT_PUBLIC_DWG_NATIVE_IMPORT_BETA=true NEXT_PUBLIC_DWG_AC1018_IMPORT_BETA=true npm run build --workspace=web` | 0 | "✓ Compiled successfully in 13.8s"; `document-import.worker.*.ts` presente en `.next/static/media` |
| ídem, sin los dos flags DWG (default apagado) | 0 | compila limpio también |
| `node scripts/deploy/validate-dockerfiles.spec.mjs` | 0 | 34 comprobaciones (antes: 21; +13 de los 3 checks nuevos y sus fixtures) |
| `node scripts/deploy/validate-dockerfiles.mjs` | 0 | 29 invariantes / 3 archivos |
| `npm run check:deploy` | 0 | spec + validador |
| `npm run check:dwg` | 0 | paquete dwg-codec completo + boundary (9 firmas, 5 specs de producto, 0 no autorizados) + corpus (honesto: "sin VALLE_DWG_CORPUS_MIRROR... cero bundles admitidos") |
| `npm run check:governance` | 0 | 9 registros asistidos |

**Bloqueo externo confirmado y no evadido:** Docker daemon no disponible en
este entorno (`docker info` falla) — no se pudo ejecutar `docker build` real
de ninguna de las dos imágenes. La verificación usó el equivalente exacto de
la secuencia del Dockerfile vía `npm run build` local, más el validador
estático. Falta, para cerrar 100% la DoD de Fase 1: `docker build` real +
arranque de contenedor + healthcheck HTTP real, en un entorno con Docker.

**Reutilizado, no repetido:** el perfil de entidades (V1→V2→V3), AC1018, y
los ADR de autorización YA estaban completos antes de esta sesión (ver §2).
Esta fase NO tocó `dwg-native-reader.ts`, `dwg-interop-flag.ts` ni ningún
ADR — sólo Docker/release/validador.

### 5.2 Hallazgos de los 3 subagentes read-only (consolidados)

**Subagente A (límites/deploy/Railway):**
- `MAX_DWG_IMPORT_BYTES = 24_000_000` en la UI
  (`apps/web/src/lib/cad/document-import.ts:47`) vs `DEFAULT_DWG_LIMITS.maxFileBytes
  = 16_777_216` en el códec (`packages/dwg-codec/src/api/limits.ts:20-33`) — un
  archivo de ~20 MB pasa la UI y el códec lo rechaza. PEOR: el mensaje que ve
  el usuario en ese caso es **incorrecto** — `dwg-native-reader.ts:242-247`
  interpreta cualquier `probe.probe===null` (incluido el rechazo por tamaño)
  como "firma inválida o archivo truncado", nunca "archivo demasiado grande".
- `maxWallTimeMs=2000` interno vs 45000ms de timeout del worker — dirección
  correcta (margen amplio bajo el externo), no es el bug.
- Cancelación NO es cooperativa: `readDwg`/`readAc1015Database`/`readR2004Database`
  no aceptan `signal`/`deadlineMs` (sólo `probeDwg` sí). Único mecanismo real:
  `worker.terminate()`, que mata el worker entero sin que el códec coopere.
  `DWG_CANCELLED` existe como código pero es inalcanzable hoy.
- Mensajes de error DISTINTOS existen para varios casos, pero
  `DWG_FILE_LIMIT_EXCEEDED`/`DWG_WORK_LIMIT_EXCEEDED`/`DWG_DEADLINE_EXCEEDED`/
  `DWG_STRUCTURE_CORRUPT`/`DWG_INTERNAL_ERROR` se colapsan en un solo mensaje
  genérico en `dwg-native-reader.ts:270-274` (descarta `.detail.code`).
- Pruebas de frontera existen pero con límites SINTÉTICOS (6 bytes), nunca
  con el default real de 16.777.216 ni los 24.000.000 de la UI.
- Railway: cero menciones en todo el repo. `DEPLOYMENT.md` documenta VPS
  único + Compose + Caddy en detalle, pero §3.3/§4 mezclan comandos de
  Kubernetes (`kubectl set image`/`scale`/`rollout status`) que contradicen
  el resto del documento — inconsistencia real, no sólo ausencia de Railway.

**Subagente B (fidelidad/manifiesto de pérdidas):**
- **Unidades (ALTO):** `dwg-document-bridge.ts:709` fija `unit:"mm"`
  incondicional. El códec sabe decodificar INSUNITS pero SÓLO en el camino
  de escritura (`ac1015-header-writer.ts`); en lectura,
  `ac1015-database-reader.ts:103` sólo consume centinelas del frame de la
  sección de cabecera, no su contenido — `Ac1015NeutralDatabase` no expone
  unidad. Esto es más profundo que un cable suelto: falta decodificación de
  contenido en el camino de LECTURA.
- **Capas (ALTO):** `mapLayers` (`dwg-document-bridge.ts:599-634`) YA RECIBE
  `colorIndex`/`stateFlags` reales (`dwg-native-reader.ts:167-172` los pasa)
  pero los IGNORA: asigna una paleta rotatoria de 5 colores por posición y
  fuerza `visible:true,locked:false`. Esa misma paleta falsa está duplicada
  en el importador DXF (`document-import.ts:429`) — y DXF sí propaga
  `frozen` desde el código 70 mientras DWG no lo intenta pese a tener el
  dato. Este SÍ es un cable suelto contenido y de bajo riesgo — arreglable.
- **Bloques/INSERT (MEDIO-ALTO):** `basePoint:{x:0,y:0}` hardcodeado
  (línea 649) sin generar NINGUNA entrada en `losses` (0 de 10 `losses.push`
  la mencionan). scale/rotation sí se conservan. ATTRIB: el comentario del
  puente es inexacto — el laboratorio SÍ decodifica `attributes`, pero
  `DwgNeutralEntityRecord` (la frontera del producto) no tiene ese campo, así
  que se descarta ANTES de llegar al puente.
- **TEXT (ALTO):** sólo insertion+text+textHeight pasan; rotation, alignment,
  widthFactor, obliqueAngle existen en `DwgNeutralText` pero se pierden SIN
  entrada en `losses`. MTEXT sí conserva rotación.
- **LWPOLYLINE (MEDIO):** bulges/closed conservados; elevation/widths/
  constantWidth/thickness/extrusion existen en el modelo pero no llegan a la
  primitiva ni generan pérdida.
- **DIMENSION/HATCH:** mayoría con handle+contexto real declarado; único
  hueco es que la exclusión por perfil (fuera de V3) no nombra la subrazón
  exacta, sólo el tipo genérico.
- **Éxito vacío (ALTO, confirmado con test):** `dwgNeutralDatabaseToCadDocument`
  nunca comprueba `entities.length===0`; `dwg-document-bridge.spec.ts:225-229`
  afirma EXPLÍCITAMENTE que una base vacía produce un documento vacío
  "exitoso". Contraste: DXF y SHP en el mismo archivo SÍ fallan cerrado ante
  cero entidades útiles (comentario propio: "éxito silencioso... la peor
  forma de fallar"). Asimetría real y deliberada que contradice el propio
  principio del producto.
- Manifiesto de pérdidas: SÍ persiste con el documento (campo de
  `CadDocument`, sobrevive `commitChange`), no es sólo un toast efímero —
  verificado sin problema.

**Subagente C (E2E/corpus):**
- `apps/web/e2e/dashboard-dwg-import-beta.spec.ts`: fixture DWG es una
  constante base64 CONGELADA (generada offline por `writeDwg`, no en la
  prueba) — circular por diseño, aunque no regenerada en vivo.
  Intercepta TODO `/v1/cad/**` + auth/orgs/legal con `context.route` — cero
  API real (`API_ORIGIN` por defecto apunta a un puerto muerto). Login vía
  cookies inyectadas, no registro/login real. Corre en modo "goldens"
  (`playwright.config.ts` lo documenta como "hermético: sin NestJS ni base
  de datos") — ni Postgres ni SQLite. La prueba termina al abrir Studio y
  comprobar la URL: CERO selección, edición, guardado o recarga.
  Corrección a mi hipótesis inicial: este spec NO está en la lista
  `expectedSpecs` de `check-product-boundary.mjs` (ese boundary corre 5
  specs de Node, ninguno es este E2E) — sólo se menciona en un comentario.
- Corpus hermano: 57 DWG totales, TODOS `tool-converted-original` (ODA File
  Converter desde DXF propio). Cero sintético puro, cero donado real —
  `docs/DONACIONES.md` ya lo declara honestamente ("todavía ninguna").
  Bug real encontrado: `DONACIONES.md` instruye `origin:"donated"` pero
  `build-manifest.mjs` sólo acepta `"donated-original"` — la primera
  donación real fallaría el intake tal como está hoy (task #9, Fase 5).

### 5.3 Fase 2 — límites (CERRADA con un gap conocido registrado)

Implementado, usando los hallazgos exactos del subagente A:

1. **Fuente única del tope de bytes**: `apps/web/src/lib/cad/dwg-import-limits.ts`
   (nuevo) declara `DWG_MAX_IMPORT_BYTES = 16 * 1024 * 1024`, igual al
   `DEFAULT_DWG_LIMITS.maxFileBytes` real del códec. `document-import.ts`
   ahora deriva `MAX_DWG_IMPORT_BYTES` de ahí (antes: `24_000_000`
   independiente). Comprobación cruzada en `dwg-native-reader.spec.ts`
   (único spec autorizado a importar el códec) que falla si diverge.
   **No se creó un import directo al códec desde el archivo nuevo**: el
   boundary de producto (`check-product-boundary.mjs`) lo prohíbe — ni
   siquiera se puede mencionar la ruta del paquete en un comentario sin que
   el gate lo marque (lo aprendí en rojo dos veces y lo corregí).
2. **Mensajes distinguibles por código tipado**: `dwg-native-reader.ts` gana
   `describeDwgErrorCode(code)` y lee `probe.error.code` /
   `error.detail.code` (por forma, sin depender de una clase no exportada)
   en vez de colapsar todo en "firma inválida o archivo truncado". Ahora
   "demasiado grande", "presupuesto de trabajo agotado", "tiempo interno
   agotado", "cancelado", "corrupto", "firma truncada" y "firma inválida"
   son mensajes DISTINTOS. Preserva sin debilitar la prueba de regresión
   preexistente que esperaba `/estructura interna/` para bytes basura con
   AC1018.
3. **Pruebas de frontera con el número REAL** (no sintético): exacto, uno
   por debajo, uno por encima de 16.777.216 en `document-import.spec.ts`;
   archivo de 16.777.217 bytes y firma truncada de 3 bytes en
   `dwg-native-reader.spec.ts`.

**Gap conocido, registrado y NO cerrado esta fase** (decisión conservadora:
no reescribir el núcleo del parser bajo presión de tiempo sin auditoría
propia primero): la cancelación NO es cooperativa a nivel códec.
`readDwg`/`readAc1015Database`/`readR2004Database` no aceptan
`signal`/`deadlineMs` (sólo `probeDwg` sí, y `dwg-native-reader.ts` no se
lo pasa). El único mecanismo real hoy es `worker.terminate()` — efectivo
para detener el hilo, pero no cooperativo con el códec (no hay forma de que
el parser note la cancelación y retorne limpio). Cerrar esto de verdad
exige tocar los tres puntos de entrada del lector, que esta sesión no ha
auditado a profundidad; se deja para una sesión dedicada a esa superficie
específica, no se improvisa aquí. Tampoco se añadió una prueba E2E de
"cancelación efectiva + terminación del worker" (nivel navegador, no
Node) — se prioriza en la Fase 4 si el tiempo alcanza.

Comandos y resultados:

| Comando | Exit | Nota |
| --- | --- | --- |
| `npx tsx src/lib/cad/dwg-native-reader.spec.ts` (cwd apps/web) | 0 | incl. las 3 pruebas nuevas de Fase 2 |
| `npx tsx src/lib/cad/document-import.spec.ts` | 0 | incl. las 3 pruebas de frontera nuevas |
| `npx tsx src/lib/cad/dwg-document-bridge.spec.ts` | 0 | sin regresión |
| `node scripts/dwg/check-product-boundary.mjs` | 0 | tras corregir 2 rojos reales de referencias prohibidas en comentarios (ver arriba) |
| `npx tsc --noEmit -p apps/web/tsconfig.json` | 0 | tras corregir un error real de estrechamiento de tipos (`probe.ok` como discriminante) |
| `npm run check:dwg` | 0 | |
| `npm run lint --workspace=web` | 0 | 202 warnings preexistentes, 0 en archivos tocados, 0 errores |

### 5.4 Fase 3 — fidelidad (CERRADA para lo verificado seguro; unidades queda con warning explícito, no resuelto de raíz)

Usando los hallazgos exactos del subagente B (fidelidad/manifiesto de
pérdidas), implementado en `dwg-document-bridge.ts` (y extraído a
`dwg-document-bridge-primitives.ts` por presupuesto de monolito — ver
abajo):

1. **Capas: color ACI real, no paleta rotatoria inventada.** `mapLayers`
   usaba `palette[definitions.length % palette.length]` (5 colores fijos por
   POSICIÓN, no por dato). Ahora usa `aciToHex(layer.colorIndex)` —
   reutiliza `apps/web/src/lib/cad/plot/aci-palette.ts`, la tabla ACI↔RGB
   real ya usada por plotting, exactamente lo que el propio códec pide en su
   comentario ("la tabla ACI completa es del adaptador de integración").
   ACI 1-9/250-255 exactos, 10-249 por rampa reproducible documentada.
2. **Capas: `stateFlags` — declarado, NO adivinado.** Verifiqué
   directamente el código del laboratorio: `stateFlags` viaja CRUDO a
   propósito ("la semántica bit a bit... queda pendiente de corpus real; el
   modelo expone el valor ENTERO sin fingir interpretarlo"). Interpretar
   bits de apagada/congelada/bloqueada aquí habría sido exactamente la
   adivinanza que esa regla prohíbe — aunque la semántica DXF (código 70)
   sea bien conocida, la codificación BINARIA de DWG no está confirmada
   contra corpus real para este códec. Se declara una pérdida específica por
   capa cuando `stateFlags!==0`, con el valor crudo, y la capa se importa
   visible/desbloqueada en vez de fingir un estado.
3. **Unidades: de `unit:"mm"` silencioso a `unit:"mm"` DECLARADO.**
   Verificado: el camino de LECTURA del códec no decodifica INSUNITS en
   absoluto (`ac1015-database-reader.ts` sólo consume centinelas del frame
   de cabecera, no su contenido — la decodificación de INSUNITS existe pero
   sólo la usa el camino de ESCRITURA). Cerrar esto de raíz exigiría nueva
   decodificación en el laboratorio bajo el protocolo completo de
   registro-de-hecho-antes-de-código, que esta sesión no va a improvisar
   bajo presión de tiempo. Se aplicó la alternativa conservadora que la
   propia campaña prescribe: la suposición de milímetros ahora genera una
   entrada de pérdida SIEMPRE presente, prominente y persistente (vive en
   `document.lossManifest`, no en un toast), en vez de una suposición
   silenciosa. **Gap real, registrado, no cerrado.**
4. **Bloques: punto base `{0,0}` — declarado.** Antes: hardcodeado sin
   ninguna entrada en `losses` (confirmado: 0 de 10 `losses.push` lo
   mencionaban). Ahora cada bloque declara la suposición con su handle y una
   advertencia de que un INSERT puede aparecer desplazado.
5. **TEXT/LWPOLYLINE: propiedades descartadas, declaradas una por una.**
   `CadDxfPrimitive` (compartida con DXF) no representa rotación/factor de
   ancho/ángulo oblicuo/alineación/generación de TEXT ni elevación/grosor/
   ancho constante/anchos-por-vértice de LWPOLYLINE. Nuevas funciones
   `droppedTextProperties`/`droppedLwPolylineProperties` (puras) detectan
   cuándo el valor real difiere del default y declaran EXACTAMENTE qué se
   perdió, por entidad — nunca un aviso genérico, y CERO ruido cuando el
   archivo sólo usaba valores por defecto (verificado con la entidad "SALÓN"
   de la base de prueba, que es todo-default y no genera pérdida nueva).
6. **Éxito vacío: cerrado.** `dwgNeutralDatabaseToCadDocument` ahora falla
   cerrado (`throw new Error`) cuando el mapeo no produce ni una entidad ni
   un bloque — mismo criterio que ya usan DXF y shapefile en el mismo
   módulo. Antes: `dwg-document-bridge.spec.ts` afirmaba EXPLÍCITAMENTE que
   una base vacía producía un documento "exitoso" — ese test se corrigió
   para esperar el fallo (no se debilitó ninguna aserción: se corrigió una
   que codificaba el comportamiento incorrecto). Una base con SÓLO un bloque
   definido (sin nada en model space) sigue contando como contenido real —
   mismo criterio que DXF.
7. **ATTRIB (hallazgo del subagente, NO cerrado esta fase):** el comentario
   del puente decía "los ATTRIB no los decodifica el laboratorio" — inexacto:
   el laboratorio SÍ los decodifica (`Ac1015DatabaseEntityRecord.attributes`),
   pero `DwgNeutralEntityRecord` (la frontera de producto) no tiene ese
   campo, así que se descarta antes de llegar al puente. El cuello de
   botella está en `dwg-native-reader.ts`/`dwg-neutral-model.ts`, no aquí.
   Registrado para una fase futura; no se tocó esta sesión (fuera del
   alcance ya cerrado de esta fase, y tocar la frontera del perfil V3
   exigiría su propia evidencia end-to-end antes de ampliar, por la misma
   disciplina de ADR-0009 que ya rige el resto del perfil).

**Efecto colateral real: presupuesto de monolito.** Los cambios llevaron
`dwg-document-bridge.ts` de ~770 a 920 líneas (máximo 800 para un archivo
no presupuestado). Se corrigió por EXTRACCIÓN, no por ampliar el
presupuesto (la opción que `AGENTS.md` pide explícitamente): nuevo archivo
`dwg-document-bridge-primitives.ts` (385 líneas) con el mapeo puro por
entidad (`dwgGeometryToPrimitive`, `dwgMTextToCadDxfMText`,
`dwgDimensionToCadDxfSemanticDimension`, `dwgHatchToCadDxfHatch`, los dos
`dropped*Properties` nuevos, y los helpers `decodeCodePageBytes`/`point2`/
`degrees`), reexportado desde el módulo principal (581 líneas) para que
`dwg-document-bridge.spec.ts`/`dwg-document-bridge-entities.spec.ts` no
cambien su import. Límite acíclico verificado: el archivo nuevo no importa
nada del principal. Precedente directo en el propio repo:
`dwg-document-bridge-entities.spec.ts` ya se había separado de
`dwg-document-bridge.spec.ts` por la misma razón, documentado en su propio
encabezado.

Comandos y resultados:

| Comando | Exit | Nota |
| --- | --- | --- |
| `npx tsx src/lib/cad/dwg-document-bridge.spec.ts` | 0 | incl. 8 bloques de pruebas nuevas de Fase 3 |
| `npx tsx src/lib/cad/dwg-document-bridge-entities.spec.ts` | 0 | sin regresión |
| `npx tsx src/lib/cad/dwg-native-reader.spec.ts` | 0 | sin regresión |
| `npx tsx src/lib/cad/document-import.spec.ts` | 0 | sin regresión |
| `node scripts/dwg/check-product-boundary.mjs` | 0 | tras corregir 1 rojo real (mención de ruta del paquete en un comentario) |
| `npx tsc --noEmit -p apps/web/tsconfig.json` | 0 | |
| `node scripts/cad/check-monolith-budget.mjs` | 0 | 1759 archivos, tras la extracción |
| `npm run check:dwg` | 0 | |
| `npm run check:cad` | 0 | tras corregir el presupuesto de lint (23→18 avisos: 5 imports de tipo que quedaron sin uso tras la extracción) |

### 5.5 Fase 4 — E2E real no circular (API + PostgreSQL): un bug de producto real, PREVIO a esta sesión, encontrado por dejar de mockear

Infraestructura levantada de verdad para esta fase (nada de esto existía al
empezar la sesión, y nada estaba en el brief como disponible):
PostgreSQL 16 arrancado (estaba instalado pero apagado), rol `valle` con
`CREATEROLE`/superusuario en este sandbox desechable, las 34 migraciones
corridas contra él, API NestJS real en `:4000`
(`IDENTITY_TEST_HARNESS=true`), build de producción de `apps/web` con
`NEXT_PUBLIC_API_URL=http://localhost:4000` y ambos flags DWG en `true`,
servida con `E2E_PROD=1`. `VALLE_DWG_CORPUS_MIRROR` apuntando al clon local
de `valle-design-dwg-conformance` para leer el fixture real
`valle.fundacional.ac1015.001/fixtures/08-plano-mini.dwg` sin copiarlo al
árbol (sus términos de redistribución lo prohíben).

Nuevo spec: `apps/web/e2e/real/dwg-import-real.spec.ts` — a diferencia del
spec DWG existente (`dashboard-dwg-import-beta.spec.ts`, modo GOLDENS,
`.dwg` generado por el propio `writeDwg` del laboratorio, circular por
diseño, intercepta TODO `/v1/cad/**`), este habla con la API real y
PostgreSQL real, verifica conteos de entidad contra un oráculo DXF
independiente (parseado aquí mismo, no con el importador DXF del
producto), y prueba seleccionar→editar→guardar→cerrar sesión→nueva
sesión→confirmar persistencia contra PostgreSQL, no sólo contra la URL.

**Tres problemas reales de UI corregidos en el camino** (deriva de la UI
frente al spec de referencia `e2e/real/studio-real-api.spec.ts`, no bugs
nuevos): verificación de correo ahora se auto-envía al montar con el token
de la URL (ya no hay botón que pulsar); el formulario de alta de
organización se rediseñó (selector de dos tarjetas, `Nombre del despacho`
sin campo de slug separado, botón "Crear organización"); la compilación
bajo demanda de Turbopack en modo dev del chunk del worker + códec DWG
excede cualquier timeout razonable de prueba — diagnosticado
diferencialmente (el worker SÍ cargaba, el mismo spec en modo GOLDENS
fallaba rápido por una razón no relacionada, así que el entorno no estaba
roto en general) y evitado corriendo contra un build de producción
(`E2E_PROD=1`) en vez de dev.

**El hallazgo real, con la infraestructura ya funcionando**: al llegar a
`PUT /v1/cad/documents/:id/content` (guardar el documento canónico que
produce la importación DWG), la API real respondía:

```json
{"message":"CadDocument schema no soportado.","error":"Bad Request","statusCode":400,"requestId":"..."}
```

Root-caused sin adivinar (secuencia real, cada paso verificado antes del
siguiente):

1. `apps/api/src/modules/cad-documents/cad-document-validation.ts` rechaza
   cualquier `meta.schema` fuera de `[1, CAD_DOCUMENT_MAX_SCHEMA]`, y
   `CAD_DOCUMENT_MAX_SCHEMA` valía `9`.
2. `apps/web/src/lib/cad/cad-document-shared.ts` declara
   `CAD_DOCUMENT_SCHEMA = 10` — el número que el cliente escribe en
   `meta.schema` de CADA documento nuevo o migrado, DWG o no.
3. `git log -p -S"CAD_DOCUMENT_SCHEMA = 10"` identifica el commit exacto:
   `b3fada9` ("Las cotas dibujan lo que prometen: el esquema 10 lleva los
   DIMVARs hasta el render"), 2026-08-23 — un día antes de esta sesión,
   autoría de Sergio Valle Zarate con Claude Opus 5. `git show b3fada9 --
   apps/api/src/modules/cad-documents/cad-document-validation.ts` no
   devuelve nada: ese commit NUNCA tocó el techo del servidor.
4. **Esto no es un bug de DWG.** No toqué `cad-document.ts`,
   `layoutToCadDocument` ni `migrateCadDocument` en las fases 1-3, y el
   patrón de llamada del puente DWG a esas funciones ya existía antes de
   esta sesión. Desde que `b3fada9` se fusionó, **cualquier guardado de
   CUALQUIER documento nuevo** (DXF, JSON, dibujo en blanco, no sólo DWG)
   habría chocado con este mismo 400 contra la API real — el propio
   comentario que ya vivía junto a `CAD_DOCUMENT_MAX_SCHEMA` lo describe
   literalmente: *"un servidor que se quedara en el anterior convertiría
   cada guardado en un 400 sin que nada estuviera roto"*. Nadie lo había
   visto porque el E2E existente para esta ruta corre mockeado.
5. La propia prueba que hacía de gate del techo anterior
   (`cad-schema4-invariants.spec.ts`) CODIFICABA el bug como correcto: tras
   `b3fada9`, seguía en verde afirmando `toThrow(BadRequestException)` para
   `meta.schema: 10` — el mismo patrón que el "éxito vacío" que corregí en
   Fase 3 (una prueba que blinda el comportamiento incorrecto en vez de
   detectarlo). Confirmado corriéndola ANTES de tocar código: verde
   (`Tests: 12 passed, 12 total`, exit 0) — verde significaba "el techo
   viejo sigue en pie", no "no hay bug".
6. Grep repo-completo encontró un TERCER lugar con el mismo número
   duplicado: `packages/contracts/src/design-contracts.ts`,
   `CAD_DOCUMENT_LIMITS.maxSchema`, documentado en su propio comentario
   como "espejo de `cad-document-validation.ts`" — pero con el valor `3`,
   ocho subidas de esquema por detrás. Confirmado con grep que este
   `CAD_DOCUMENT_LIMITS` NO se importa desde ningún código de runtime de
   `apps/web` ni `apps/api` (sólo desde su propio archivo y desde
   `packages/design-sdk/src/compat.spec.ts`), así que no participa en el
   400 real — es documentación de contrato muerta, no un segundo gate
   activo. Y ese mismo spec de compatibilidad confirma que `minSchema`/
   `maxSchema` NUNCA estuvieron en su arreglo de comprobación contra el
   YAML (`expectations`), a diferencia de `maxEntities`/`maxBlocks`/etc.:
   por eso su deriva nunca hizo fallar nada.

**Corrección quirúrgica aplicada** (mismo patrón que las subidas 7→8→9 ya
en el repo, sin inventar mecanismo nuevo):

- `CAD_DOCUMENT_MAX_SCHEMA`: `9` → `10`, comentario actualizado explicando
  que el 10 es puramente aditivo (7 campos opcionales-ausentes sobre
  `dimension`, igual que `frozen`/`layerStates` en el 9 — ningún campo
  nuevo exige una invariante propia, mismo criterio que el propio código ya
  aplicaba para el 9).
- Tres pruebas que codificaban el techo viejo como correcto, corregidas
  para trinquetear un paso adelante (9 y 10 aceptados, 11 —el futuro— se
  rechaza), con un comentario explícito de qué pasó y por qué:
  `cad-schema4-invariants.spec.ts`, `cad-solid-invariants.spec.ts`,
  `cad-viewport-view-invariants.spec.ts`. Verificado ROJO antes (la
  aserción `toThrow` para `schema:10` pasaba porque el bug era real) y
  VERDE después en cada una.
- `packages/contracts/src/design-contracts.ts`:
  `CAD_DOCUMENT_LIMITS.maxSchema` `3` → `10` — corrección de exactitud del
  contrato documentado (no corrige el 400 real, que ya vivía sólo en la
  API; corrige que el "espejo" mienta sobre lo que el backend acepta).
  **NO** se tocó `CAD_DOCUMENT_LIMITS.maxArchiveBytes` (`128 MiB`) ni la
  cota `maximum: 134217728` del YAML de OpenAPI
  (`packages/contracts/specs/design-api.v1.yaml:4093`), aunque ambas están
  IGUAL de obsoletas frente al techo real de la API
  (`CAD_DOCUMENT_MAX_ARCHIVE_BYTES = 32 * 1024 * 1024`, bajado en la
  campaña 2026-08-20): es un hallazgo real, separado, pre-existente, de la
  MISMA clase (un número que dejó de estar sincronizado) pero de un tema
  distinto (bytes, no versión de esquema) que tocar exige regenerar el SDK
  y verificar igualdad de bytes contra el router real (archivo delicado
  por `AGENTS.md`) — fuera del alcance quirúrgico de esta corrección.
  Queda anotado en los próximos 10 pendientes del informe de cierre, no
  fabricado ni resuelto a medias aquí.

Comandos y resultados:

| Comando | Exit | Nota |
| --- | --- | --- |
| `npm test --workspace=valle-design-api -- cad-schema4-invariants.spec.ts` (ANTES del fix) | 0 | verde codificando el bug: `schema:10` esperaba y obtenía 400 |
| `npm test --workspace=valle-design-api -- cad-schema4-invariants.spec.ts` (DESPUÉS) | 0 | verde real: 9 y 10 aceptados, 11 rechazado |
| `npm test --workspace=valle-design-api -- cad-documents` (con las 3 specs sin corregir) | 1 | 2 rojos reales: `cad-solid-invariants.spec.ts`, `cad-viewport-view-invariants.spec.ts`, mismo patrón, encontrados por no limitar el grep a un solo archivo |
| `npm test --workspace=valle-design-api -- cad-documents` (las 3 corregidas) | 0 | 21 suites, 181 tests, 0 fallos |
| `npm test --workspace=valle-design-api` (suite completa) | 0 | 81 suites, 682 tests, 31 suites Postgres-only omitidas (`REQUIRE_POSTGRES_TESTS` no fijado en esta corrida) |
| `npm test --workspace=@valle/design-sdk` | 0 | 9/9 — el compat spec no referencia `minSchema`/`maxSchema`, confirmado que no se rompió nada al corregir el valor |

E2E real (`dwg-import-real.spec.ts`, `--project=chromium`): primer intento
sin `E2E_API_ORIGIN` — error de configuración de ESTA sesión, no del
producto (`fixtures/first-party.ts` habló contra el origen mockeado
`:4010` por defecto en vez de la API real). Reintentado con el entorno
completo. Test 1 y test 2 en verde: registro/verificación/login/organización
funcionan, y **el 400 de `meta.schema` está cerrado de verdad** —
`PUT /v1/cad/documents/:id/content` respondió `200` con el documento
DWG-importado real (log: `[response] 200 PUT
http://localhost:4000/v1/cad/documents/1bc3a3a9-.../content`), donde antes
del fix de esta sección respondía `400`.

### 5.6 Segundo hallazgo real de Fase 4: `type:"text"` no es una entidad nativa de Studio — para NINGÚN formato, no es un bug de DWG

Test 3 (abrir Studio, seleccionar la entidad "COCINA" por su texto) falló:
`getByText("COCINA", {exact:true})` nunca apareció, con timeout de 30s. El
panel "Entidades nativas" del snapshot de error mostraba exactamente 6
entidades (`dwg:entity:000000` POLYLINE, `000001`/`000002` LINE,
`000005` LINE, `dwg:insert:000000`/`000001` INSERT) — un salto en la
numeración (`000002`→`000005`) que delataba dos entidades consumiendo
índice sin aparecer.

Root-caused sin adivinar, siguiendo la cadena real hasta la causa (cada
paso confirmado antes de seguir al siguiente, con `npx tsx` contra el
fixture real y consultas directas a PostgreSQL — nunca inferido):

1. El oráculo DXF (`08-plano-mini.dxf`) tiene 8 entidades en ENTITIES:
   POLYLINE, LINE×3, INSERT×2, TEXT×2 ("SALA" en (20,45), "COCINA" en
   (80,45), ambas capa TEXTOS, sin rotación/ancho/alineación — de las más
   simples posibles).
2. El códec (`readDwg`, invocado directo contra el fixture) decodifica los
   DOS TEXT exactos: `valueBytes` decodifica a "SALA"/"COCINA" byte a byte,
   inserción y altura correctas. `toBetaProfileDatabase` los deja pasar sin
   diagnóstico (TEXT está en el perfil V3).
3. `dwgNeutralDatabaseToCadDocument` (el puente completo, invocado directo)
   produce el documento CORRECTO: 8 entidades, `dwg:entity:000003 text
   SALA`, `000004 text COCINA`, `importedEntityCount: 8`, sin hueco en la
   numeración.
4. `SELECT cad_document->'entities' FROM cad_documents WHERE id=...`
   directo a PostgreSQL confirma que lo PERSISTIDO tiene los 8, con
   `"text":"SALA"`/`"COCINA"` intactos. **Decodificación, mapeo y guardado
   están completos y correctos** — el corte no está ahí.
5. La causa real vive en Studio: `entity-runtime.ts` declara
   `CadNativeEntity` como una unión explícita de tipos con adaptador
   registrado (`line, polyline, circle, arc, ellipse, spline, hatch, mtext,
   dimension, mleader, insert, point, xline, ray, solid, wipeout, image,
   attdef, table, solid3d, region, wall, opening`) — **`"text"` no está en
   esa lista, y no existe ningún `textAdapter`** en todo el árbol de
   `apps/web/src` (sí existe `mtextAdapter`, para MTEXT). `Layout3DEditor.tsx`
   construye `nativeEntities` filtrando `document.entities` por
   `CAD_ENTITY_REGISTRY.supports(entity)` en los CINCO puntos donde carga o
   aplica un documento — un `type:"text"` nunca sobrevive ese filtro, así
   que nunca llega al lienzo, al panel ni a la selección. Sin renderer, sin
   hitTester, sin grips, sin propiedades: no es que falle, es que la
   entidad NUNCA se registró como nativa.
6. **No es un hueco de DWG.** `apps/web/src/lib/cad/dxf-import.ts:521-527`
   colapsa el TEXT y el MTEXT de un DXF real al MISMO `kind:"text"` — el
   importador de PRODUCCIÓN de DXF, la vía que `AGENTS.md` describe como
   soportada sin beta, produce el mismo `type:"text"` que este fixture DWG.
   Un DXF real con una entidad TEXT (no MTEXT) tiene, con altísima
   probabilidad, este mismo hueco — nadie lo había visto porque ningún test
   existente (goldens ni E2E) intentaba seleccionar en un Studio
   REALMENTE renderizado una entidad importada de tipo `text` por su
   contenido. Esta campaña lo encontró por ser DWG la primera vía cuyo E2E
   real llegó tan lejos.

**Decisión de alcance, no arreglo apurado**: implementar `textAdapter`
completo (renderer + hitTester + grips + snaps + properties + commands,
igual que cualquier otro tipo en `CadEntityAdapter`) es una función nueva
de calado general — toca selección, render 3D, snapping, historial y el
panel de propiedades para CUALQUIER importador, no sólo DWG — y exige su
propia batería de goldens y pruebas adversariales, igual que cada uno de
los 22 adaptadores ya registrados las tiene. Improvisarla ahora, bajo
presión de tiempo y fuera del alcance ya cerrado `DWG-M1-PRODUCT-RC`,
violaría la misma disciplina que esta campaña ha seguido en las fases
1-3 ("no amplíes soporte de formato antes de cerrar los gates de nivel de
producto" — y esto ni siquiera es soporte de formato, es una capacidad
general del editor). Se registra aquí como hallazgo verificado y se corrige
SÓLO lo que estaba mal en mi propio spec: `dwg-import-real.spec.ts` ya NO
asume que `"text"` es seleccionable — el test 2 verifica el contenido
decodificado de "SALA"/"COCINA" contra la API (prueba que la
decodificación de página de códigos sigue siendo correcta, sin depender de
render), y los tests 3-5 seleccionan/editan/verifican persistencia sobre
una LINE real (tipo SÍ nativo), con `cad-native-property-endX` en vez de la
propiedad de TEXT. Candidato directo para el próximo-10 del informe de
cierre.

### 5.7 Tercer hallazgo real de Fase 4: el ciclo de guardado corrompe la capa de cualquier entidad `text` presente — consecuencia directa del hallazgo 5.6, no un bug nuevo independiente

Con el spec ajustado (test 3 seleccionando la LINE `dwg:entity:000001` en
vez de "COCINA"), test 3 pasó — pero segundos después, sin que el test
pidiera ningún guardado todavía, apareció en el log:

```
[request] PUT http://localhost:4000/v1/cad/documents/660423ae-.../content
[response] 400 PUT http://localhost:4000/v1/cad/documents/660423ae-.../content
[response body 400] {"message":"CadDocument: la entidad dwg:entity:000003
referencia la capa inexistente Text.","statusCode":400,...}
```

`dwg:entity:000003` es el TEXT "SALA" — su `layer` real es `"TEXTOS"`, pero
el documento que intentó guardarse llevaba `layer:"Text"` (el bucket inglés
del sistema de anotaciones LEGADO). Test 4 quedó colgado 60 s esperando una
respuesta `2xx` a `PUT .../content` que nunca llegó (todo intento posterior
choca con el mismo 400: el documento queda efectivamente NO GUARDABLE en
Studio en cuanto se abre, para cualquier edición, no sólo para el TEXT).

Rastreado (sin llegar a fijar la línea exacta — ver más abajo por qué se
decidió no seguir):

1. `entity-runtime.ts` no registra `"text"` como `CadNativeEntity` (hallazgo
   5.6). Como consecuencia, `Layout3DEditor.tsx` trata cualquier
   `type:"text"` del documento canónico como una anotación del sistema
   LEGADO (`Asset`/`Annotation`), no como una entidad nativa.
2. Ese sistema legado tiene su propio snapshot invertible
   (`cadDocumentToEditorSnapshot`/`editorSnapshotToCadDocument`,
   `editor-snapshot.ts`) para el historial de deshacer, con un bucket de
   capa por defecto `TEXT_LAYER = "Text"` para anotaciones de texto SIN
   capa asignada explícita. Leí las dos direcciones del round-trip
   (`cadDocumentToEditorSnapshot` líneas 248-252, `editorSnapshotToCadDocument`
   líneas 166-175, más `cadDocumentToLayout`/`layoutToCadDocument` en
   `cad-document-legacy-adapter.ts`): cada tramo, LEÍDO AISLADO, parece
   preservar `"TEXTOS"` correctamente (la condición `e.layer !== TEXT_LAYER`
   es cierta para `"TEXTOS"`, así que sí se escribe en el mapa de capas por
   objeto). No aislé el tramo exacto donde la capa real se pierde y cae al
   bucket por defecto — probablemente un tramo adicional no leído
   (`CanonicalHistory`, o cómo se reconstruye el payload de guardado a
   partir de `layerAssignmentsRef` en vez de `loadedCadDocumentRef.current`
   directamente).
3. **Decisión de alcance**: no seguí acotando la línea exacta ni apliqué un
   parche puntual al mecanismo de snapshot legado. La causa RAÍZ es la
   misma del hallazgo 5.6 (`"text"` nunca se integró al sistema nativo), y
   la reparación correcta y completa es la misma: el adaptador nativo de
   texto — no un parche aislado a un mecanismo de historial que sirve a
   otros 20+ tipos y que un cambio apresurado, sin el mismo nivel de
   pruebas que tiene cada adaptador ya registrado, podría romper de forma
   más amplia y más difícil de detectar que el bug que arregla.

**Consecuencia para esta prueba**: el ciclo completo
seleccionar→editar→guardar→cerrar sesión→recargar→confirmar persistencia
NO se puede demostrar hoy sobre `08-plano-mini.dwg` (por las dos entidades
TEXT que trae). Se añadió una segunda importación real en el mismo test
(`04-capas.dwg`, mismo bundle admitido, oráculo DXF propio, 5 LINE + 1
CIRCLE en 6 capas reales, CERO entidades TEXT — verificado antes de
escribir la prueba) exclusivamente para los tests 3-5, dejando
`08-plano-mini.dwg` para lo que el test 2 ya verifica (conteo de entidad,
manifiesto de pérdidas, contenido decodificado de los dos TEXT contra la
API). Ningún test se debilitó para evitar el hallazgo: se documentó, se
decidió no arreglarlo por estar fuera de alcance quirúrgico, y se demostró
el ciclo completo con un fixture real donde el hallazgo no aplica.

Los tres hallazgos de Fase 4 (techo de esquema, adaptador de texto
ausente, corrupción de capa al guardar) son PRE-EXISTENTES a esta campaña:
ninguno lo introdujeron las fases 1-3 de trabajo DWG de esta sesión. Los
tres se hicieron visibles porque esta es la primera vez que un E2E real
(API + PostgreSQL, sin mocks) ejecuta el ciclo completo de guardado sobre
un documento con contenido real — exactamente la tesis que motivó la Fase
4 del brief.

### 5.8 Fase 5 — calidad del intake de corpus/evidencia (verificado, no fabricado)

Auditoría directa de `valle-design-dwg-conformance` (repositorio hermano,
misma sesión, misma rama `claude/valle-design-dwg-main-lnqf7t`):

1. **`packages/dwg-codec/SOURCE_REGISTER.json`** (valle-design; el registro
   de hechos-antes-de-código de ADR-0007, no un registro de corpus): 8
   entradas, todas con `owner`/`title`/`terms`/`status`/`factsConsulted`/
   `derivedFiles`/`reviewer`/`reviewedAt` presentes. Comprobación
   automática (no visual) de las 8: campos requeridos completos en todas.
   7 de 8 no llevan `origin.sha256` — verificado que NO es un hueco: esas
   7 usan `origin.type: "first-party-repository"|"original-measurement"
   |"public-documentation"` con la URL apuntando a un COMMIT SHA exacto
   (equivalente en garantía a un hash de contenido) o, para el único caso
   sin ancla criptográfica (`ODA-ODS-DWG-5.4.1-PUBLIC`, un PDF público sin
   commit ni hash), sólo URL + fecha de acceso — más débil que el resto
   pero no fabricado, y de severidad menor (un documento público de
   referencia, no una autorización ni un corpus).
2. **Verificación de hashes del corpus, no asumida**: recalculé
   SHA-256 y `byteLength` de los 8 fixtures de `valle.fundacional.ac1015.001`
   contra sus bytes reales en disco (no contra el manifest) — 8/8 coinciden
   exactamente. `npm run check` del propio repositorio de conformidad
   (`scripts/check-corpus.mjs`, cubre los 7 bundles admitidos, no sólo el
   que yo inspeccioné a mano): `{"bundles":7,"status":"ok"}`.
3. **Formato de oráculo**: verificado empíricamente en las Fases 2-4 de
   esta misma sesión (parseo manual de grupos DXF contra 3 fixtures reales
   distintas — `08-plano-mini`, `04-capas`, y antes `03-figuras-basicas`
   para ground-truth de test) — consistente, parseable sin el importador
   del producto, sin sorpresas.
4. **Guía de donación (`docs/DONACIONES.md`) — completa como proceso, pero
   con un bug real que habría bloqueado la primera donación**: el
   documento pide, promete y detalla un procedimiento de 4 pasos, pero
   instruía `origin: "donated"` — un valor que
   `scripts/build-manifest.mjs` (`ORIGINS`) NUNCA aceptó (sólo
   `donated-original`). Cero donaciones reales existían para chocar con
   esto (tabla de registro vacía, confirmado, no asumido), pero el primer
   donante real sí lo habría hecho — lo opuesto exacto de lo que el propio
   documento afirma ("el mecanismo queda listo antes que el primer
   cliente"). **Corregido** en PR draft #4 de
   `valle-design-dwg-conformance` (rama `claude/valle-design-dwg-main-lnqf7t`,
   nueva — este repositorio no tenía commits de esta campaña antes de este
   punto): las dos menciones del valor incorrecto, más una aclaración
   nueva de que el par de validaciones independientes que exige el esquema
   para un `donated-original` no puede apoyarse en un oráculo DXF fuente
   (ese gemelo sólo existe para `tool-converted-original`) — el par
   concreto para cada donado real queda a criterio documentado de su
   propio revisor, sin inventar aquí un procedimiento sin un donado real
   delante que lo ponga a prueba. `npm test` 24/24, `npm run check` verde
   tras el cambio.
5. **Bloqueo externo real, registrado sin fabricar evidencia**: el corpus
   independiente admitido sigue siendo enteramente `tool-converted-original`
   (7 bundles, 0 `donated-original`, 0 `licensed-third-party`) — el
   caveat de representatividad que `CORPUS_POLICY.md` ya declara por
   escrito ("ODA File Converter... no es AutoCAD... ninguna evidencia
   derivada de este corpus puede afirmar «compatible con AutoCAD»") sigue
   plenamente vigente. Este bloqueo no se puede cerrar dentro de esta
   sesión: depende de que un despacho real done un archivo, que es
   exactamente lo que el mecanismo recién reparado en el punto 4 existe
   para permitir. Registrado como pendiente real, no como "resuelto".

Comandos y resultados:

| Comando | Exit | Nota |
| --- | --- | --- |
| Verificación de hash (script ad hoc, 8 fixtures de `valle.fundacional.ac1015.001` contra bytes reales) | — | 8/8 sha256+byteLength coinciden |
| `npm run check` (valle-design-dwg-conformance) | 0 | `{"bundles":7,"status":"ok"}`, antes y después del fix de DONACIONES.md |
| `npm test` (valle-design-dwg-conformance) | 0 | 24/24, antes y después |
| `git push -u origin claude/valle-design-dwg-main-lnqf7t` (valle-design-dwg-conformance) | 0 | rama nueva; PR draft #4 abierto y suscrito |
