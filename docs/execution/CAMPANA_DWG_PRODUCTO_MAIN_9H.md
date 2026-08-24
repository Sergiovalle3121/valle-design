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
