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

Ver secciones siguientes de este documento a medida que se ejecutan.
