# PR draft: Ola P0 — billing fail-closed, RLS de design_blobs, imagen web completa, config productiva fail-closed

**Rama:** `claude/p0-integration` → `main` (NO fusionar automáticamente — draft para revisión humana)
**SHA de la rama:** `4f91641` (bitácora) sobre integración de código en `f6a13d1`
**Rama base:** `claude/pulido-ola0` (== `main` real en GitHub, confirmado por `git fetch`)
**Compone:** `claude/p0-billing-entitlements` + `claude/p0-tenant-rls` + `claude/p0-deploy-release` + `claude/p0-commercial-surface`, fusionadas `--no-ff` sin conflictos, más wiring transversal del coordinador.

## Resumen

Cuatro hallazgos de seguridad/producto confirmados por lectura directa de código (no supuestos) antes de tocar nada, cada uno arreglado con metodología rojo→verde, y verificado por un revisor adversarial independiente que no confió en el autoreporte:

1. **P0-A** — un owner/admin de la organización cliente podía confirmar su propio `upgrade-intent` y activar su suscripción sin ninguna evidencia de pago real. Retirado por completo (403 universal); la activación real ya ocurre por webhook de Stripe verificado (`BillingWebhookService`, ADR-0006).
2. **P0-B** — `design.cad` se concedía a cualquier suscripción `status='active'`, sin comparar `currentPeriodEnd`. Ahora exige estado Y vigencia; `currentPeriodEnd` ausente falla cerrado por semántica SQL.
3. **P0-C** — `design_blobs` (bytes del plano) no tenía ninguna capa de RLS. Cerrado, igualado a las otras 8 tablas CAD. El rol runtime no-dueño `valle_app` queda preparado (ADR-0013) pero **deliberadamente sin activar** — activarlo hoy, sin `SET LOCAL app.tenant_id` por transacción (que no existe en ningún punto de la app), apagaría el acceso legítimo de la aplicación a sus propios datos.
4. **P0-D** — `apps/web/Dockerfile` no copiaba `apps/web/public` al runtime; 404 real para el kernel WASM y los logos en cualquier imagen construida. Corregido y verificado en vivo con servidores reales (con y sin el fix).
5. **P0-F** (cierre transversal, coordinador) — el validador de config productiva (`check:production-config`) existía pero no se ejecutaba en ningún punto del pipeline real (`Dockerfile`/`release.yml`); un `git tag v1.2.3 && git push --tags` de hoy habría publicado una imagen con marca/contacto placeholder sin bloqueo. Cableado en el Dockerfile (falla el build) y en `release.yml` (elimina el fallback `'https://api.example.com'`, antes usado tanto para dispatch manual como, por accidente, alcanzable en un release real).

## Threat model (resumen por hallazgo)

- **P0-A/B**: actor = cualquier owner/admin autenticado de una organización cliente (sin necesitar privilegios especiales). Antes: podía autoconcederse acceso pagado sin pasar dinero, o conservarlo indefinidamente tras vencer. Ahora: fail-closed en ambos casos, sin bypass encontrado por el revisor tras intentarlo activamente (grep de todo escritor de `Subscription`, búsqueda de un segundo binding de `ENTITLEMENT_SERVICE`, revisión de si el propio usuario puede inyectar `currentPeriodEnd`).
- **P0-C**: actor = cualquier código con acceso al pool de conexión de la app (bug, query cruda, futuro endpoint mal filtrado). Antes y (parcialmente) después: la app sigue conectando como el rol dueño, exento de RLS por diseño de PostgreSQL — la protección real hoy sigue siendo `TenantScopedRepository` en TypeScript, no la base de datos. El cambio cierra la brecha de *cobertura* (design_blobs ahora tiene política, igual que las otras 8) pero NO cierra la brecha de *aplicación* (el dueño sigue sin sujetarse) — eso requiere el corte a `valle_app` + `SET LOCAL app.tenant_id`, que es un cambio de ciclo de vida de conexión de toda la API, marcado como decisión pendiente.
- **P0-D**: actor = cualquier usuario final del sitio construido con la imagen sin el fix. Sin impacto de seguridad (es un 404 de asset), pero sí de producto/confianza (kernel WASM y logos rotos en producción).
- **P0-F**: actor = el propio pipeline de release. Sin el wiring, cualquier release real (tag `v*`) publica marca/contacto placeholder sin que nada lo detecte hasta que un cliente reciba un correo que rebota.

## Migración / rollback

- **P0-B**: sin migración de esquema. Efecto de datos: cualquier suscripción en producción con `status='active'` y `currentPeriodEnd` NULL (herencia del flujo `confirmUpgradeIntent` ya retirado) perderá `design.cad` al desplegar este cambio — comportamiento fail-closed correcto y buscado, pero requiere decisión de backfill/aviso antes de desplegar (ver decisiones pendientes).
- **P0-C**: migración nueva `20260823120000-TenantRuntimeRoleAndDesignBlobsRls.ts`, aditiva, con `down()` reversible (revoca grants deterministamente; sólo hace `DROP ROLE` si ningún otro esquema depende de él, con lock de advisory contra condiciones de carrera entre tests paralelos). Verificada up/down/up de nuevo contra Postgres real. El rol `valle_app` se crea SIN contraseña a propósito — un operador debe fijarla fuera de control de versiones antes de cualquier uso real.
- **P0-D/P0-F**: sin migración de datos. Rollback = revertir el commit del Dockerfile/`release.yml` (ningún dato persistente involucrado).

## Evidencia (SHA `f6a13d1`, entorno: Node v22.18.0, Windows, PostgreSQL 16 portable local)

| Gate | Resultado |
|---|---|
| `typecheck` | PASS (71s) |
| `build` | PASS (96s) |
| `lint` | PASS (213s) |
| `test` (API + web + dwg-codec) | PASS (534s) — API 682/843 (0 fallos, 161 skipped por falta de entorno externo), web 0 fallos |
| `check:cad` (con `VALLE_DWG_CORPUS_MIRROR`) | PASS (261s) |
| `check:dwg` | PASS (66s) |
| `check:deploy` | PASS |
| `sbom` / `check:licenses` | PASS |
| Suite `.pg.spec.ts` de Frente B (13 tests, RLS/valle_app) | PASS contra PostgreSQL 16 real, corrida dos veces en bases aisladas propias, creadas y borradas |
| P0-A confirmado con HTTP real (sesión+cookie+CSRF sobre SQLite) | PASS 4/4 |
| P0-D confirmado en vivo (servidor Next standalone real, con/sin el fix) | PASS — 404→200 en WASM/SVG, `NEXT_PUBLIC_API_URL` embebida verificada contra todos los chunks servidos |
| Suite `.pg.spec.ts` completa (sin filtro) | **NOT RUN — MISSING EXTERNAL EVIDENCE** (recursos del entorno; ver bitácora) |
| Docker build/smoke real | **NOT RUN — MISSING EXTERNAL EVIDENCE** (Docker no disponible en este entorno) |
| E2E navegador real | **NOT RUN — MISSING EXTERNAL EVIDENCE** |

Bitácora completa con el detalle de cada frente, sus verificaciones adversariales independientes, y los rojos de integración encontrados y cerrados: `docs/campaigns/paid-beta-readiness-2026-08.md`.

## Claims afectados

Ninguno de los claims comerciales existentes se ve afectado por este PR — no toca páginas públicas de marketing. Sí introduce un **bloqueo nuevo**: producción no arranca/compila con marca/contacto/API URL en dominio placeholder (esto es intencional, es P0-F).

## Riesgos restantes

1. `design_blobs` y las otras 8 tablas CAD siguen sin protección de base de datos real en runtime (la app corre como dueño) — ver threat model P0-C arriba.
2. Tablas tenant fuera del dominio CAD (`subscriptions`, `invoices`, `cfdi_receipts`, `legal_acceptances`, etc.) siguen sin ninguna capa de RLS — fuera de alcance de esta ola, dejado visible por un test de constancia, no silencioso.
3. Suscripciones en producción con `status='active'` y `currentPeriodEnd` NULL perderán acceso al desplegar — requiere decisión de backfill antes de desplegar.
4. No existe hoy un principal interno/staff para checkout asistido sin pasarela de pago — si hay necesidad de negocio real de vender sin Stripe, requiere diseño nuevo (fuera de esta ola).
5. Ningún gate de esta lista corrió con Docker real ni E2E de navegador real en este entorno.
6. El `main` remoto de GitHub tiene un CI rojo preexistente y no relacionado (`check:dwg-evidence`, ver bitácora §0bis) — este PR va a heredarlo hasta que se resuelva por separado.

## Decisiones para Sergio (no tomadas por esta campaña, ver `docs/campaigns/decisiones-pendientes-sergio.md`)

- ¿Backfill o aviso para suscripciones `active`/`currentPeriodEnd` NULL antes de desplegar P0-B?
- ¿Vale la pena diseñar un principal interno para checkout asistido, o queda retirado indefinidamente?
- Aprobar (o no) activar el corte a `valle_app` + `SET LOCAL app.tenant_id` como frente siguiente — es el cambio de mayor riesgo operativo pendiente.
- Fijar la contraseña de `valle_app` fuera de control de versiones antes de cualquier uso real.
- Configurar las variables de repo `RELEASE_API_URL` y las 17 `RELEASE_BRAND_*` en GitHub (Settings → Variables) — sin ellas, cualquier release real fallará limpio en el paso nuevo `check:production-config`, que es el comportamiento correcto pero requiere que alguien las llene.
