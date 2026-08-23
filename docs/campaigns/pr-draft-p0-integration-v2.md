# PR draft: Ola P0 — billing fail-closed, RLS de design_blobs, imagen web completa

**Rama:** `claude/p0-integration-v2` → `main` (NO fusionar automáticamente — draft para revisión humana)
**SHA de la rama:** `a9c87dd`
**Rama base:** `origin/main` real (verificado con `git fetch`; ya incluye `efce2ed`, el wiring de marca/contacto que Sergio fusionó en paralelo a esta campaña)
**Compone:** `claude/p0-billing-entitlements` + `claude/p0-tenant-rls` + `claude/p0-deploy-release`, fusionadas `--no-ff` sin conflictos reales (el Dockerfile tuvo un merge automático limpio contra `efce2ed`, verificado semánticamente).

**Nota de reconciliación:** esta es la SEGUNDA versión de esta rama. La primera (`claude/p0-integration`, ahora abandonada) se basaba en un `main` desactualizado y duplicaba trabajo que Sergio ya había fusionado directamente (`efce2ed`). Ver `docs/campaigns/paid-beta-readiness-2026-08.md` §5 para el detalle completo de la reconciliación. Frente D (config comercial) NO se incluye aquí — su contenido real ya está en `main` vía `efce2ed`, y su continuación (`/v1/legal/*` + checkout) sigue en curso por Sergio en `claude/p0-legal-acceptance-gate`, fuera del alcance de este PR.

## Resumen

Cuatro hallazgos de seguridad/producto confirmados por lectura directa de código (no supuestos) antes de tocar nada, cada uno arreglado con metodología rojo→verde, y verificado por un revisor adversarial independiente que no confió en el autoreporte:

1. **P0-A** — un owner/admin de la organización cliente podía confirmar su propio `upgrade-intent` y activar su suscripción sin ninguna evidencia de pago real. Retirado por completo (403 universal); la activación real ya ocurre por webhook de Stripe verificado (`BillingWebhookService`, ADR-0006).
2. **P0-B** — `design.cad` se concedía a cualquier suscripción `status='active'`, sin comparar `currentPeriodEnd`. Ahora exige estado Y vigencia; `currentPeriodEnd` ausente falla cerrado por semántica SQL.
3. **P0-C** — `design_blobs` (bytes del plano) no tenía ninguna capa de RLS. Cerrado, igualado a las otras 8 tablas CAD. El rol runtime no-dueño `valle_app` queda preparado (ADR-0013) pero **deliberadamente sin activar** — activarlo hoy, sin `SET LOCAL app.tenant_id` por transacción (que no existe en ningún punto de la app), apagaría el acceso legítimo de la aplicación a sus propios datos.
4. **P0-D** — `apps/web/Dockerfile` no copiaba `apps/web/public` al runtime; 404 real para el kernel WASM y los logos en cualquier imagen construida. Corregido y verificado en vivo con servidores reales (con y sin el fix). Este PR se fusiona limpio (sin conflicto real) contra el Dockerfile que Sergio ya extendió en `efce2ed` con las 26 variables de marca/contacto — ambos cambios tocan regiones distintas del archivo.

(P0-F — validador de config productiva cableado al pipeline real — ya está resuelto en `main` vía `efce2ed`, fusionado por Sergio en paralelo a esta campaña; no forma parte de este PR. Ver §5 de la bitácora.)

## Threat model (resumen por hallazgo)

- **P0-A/B**: actor = cualquier owner/admin autenticado de una organización cliente (sin necesitar privilegios especiales). Antes: podía autoconcederse acceso pagado sin pasar dinero, o conservarlo indefinidamente tras vencer. Ahora: fail-closed en ambos casos, sin bypass encontrado por el revisor tras intentarlo activamente (grep de todo escritor de `Subscription`, búsqueda de un segundo binding de `ENTITLEMENT_SERVICE`, revisión de si el propio usuario puede inyectar `currentPeriodEnd`).
- **P0-C**: actor = cualquier código con acceso al pool de conexión de la app (bug, query cruda, futuro endpoint mal filtrado). Antes y (parcialmente) después: la app sigue conectando como el rol dueño, exento de RLS por diseño de PostgreSQL — la protección real hoy sigue siendo `TenantScopedRepository` en TypeScript, no la base de datos. El cambio cierra la brecha de *cobertura* (design_blobs ahora tiene política, igual que las otras 8) pero NO cierra la brecha de *aplicación* (el dueño sigue sin sujetarse) — eso requiere el corte a `valle_app` + `SET LOCAL app.tenant_id`, que es un cambio de ciclo de vida de conexión de toda la API, marcado como decisión pendiente.
- **P0-D**: actor = cualquier usuario final del sitio construido con la imagen sin el fix. Sin impacto de seguridad (es un 404 de asset), pero sí de producto/confianza (kernel WASM y logos rotos en producción).

## Migración / rollback

- **P0-B**: sin migración de esquema. Efecto de datos: cualquier suscripción en producción con `status='active'` y `currentPeriodEnd` NULL (herencia del flujo `confirmUpgradeIntent` ya retirado) perderá `design.cad` al desplegar este cambio — comportamiento fail-closed correcto y buscado, pero requiere decisión de backfill/aviso antes de desplegar (ver decisiones pendientes).
- **P0-C**: migración nueva `20260823120000-TenantRuntimeRoleAndDesignBlobsRls.ts`, aditiva, con `down()` reversible (revoca grants deterministamente; sólo hace `DROP ROLE` si ningún otro esquema depende de él, con lock de advisory contra condiciones de carrera entre tests paralelos). Verificada up/down/up de nuevo contra Postgres real. El rol `valle_app` se crea SIN contraseña a propósito — un operador debe fijarla fuera de control de versiones antes de cualquier uso real.
- **P0-D**: sin migración de datos. Rollback = revertir el commit del Dockerfile (ningún dato persistente involucrado).

## Evidencia (SHA `a9c87dd`, entorno: Node v22.18.0, Windows, PostgreSQL 16 portable local)

| Gate | Resultado |
|---|---|
| `typecheck` | PASS (67s) |
| `build` | PASS (115s) |
| `lint` | PASS (150s) |
| `test` (API + web + dwg-codec) | PASS (554s) — API 682/843 (0 fallos, 161 skipped por falta de entorno externo), web 0 fallos |
| `check:cad` (con `VALLE_DWG_CORPUS_MIRROR`) | PASS (293s) |
| `check:dwg` | PASS (66s) |
| `check:deploy` | PASS (2s) |
| `sbom` / `check:licenses` | PASS |
| Suite `.pg.spec.ts` de Frente B (13 tests, RLS/valle_app) | PASS contra PostgreSQL 16 real, corrida dos veces en bases aisladas propias, creadas y borradas |
| P0-A confirmado con HTTP real (sesión+cookie+CSRF sobre SQLite) | PASS 4/4 |
| P0-D confirmado en vivo (servidor Next standalone real, con/sin el fix) | PASS — 404→200 en WASM/SVG, `NEXT_PUBLIC_API_URL` embebida verificada contra todos los chunks servidos |
| Suite `.pg.spec.ts` completa (sin filtro) | **NOT RUN — MISSING EXTERNAL EVIDENCE** (recursos del entorno; ver bitácora) |
| Docker build/smoke real | **NOT RUN — MISSING EXTERNAL EVIDENCE** (Docker no disponible en este entorno) |
| E2E navegador real | **NOT RUN — MISSING EXTERNAL EVIDENCE** |

Bitácora completa con el detalle de cada frente, sus verificaciones adversariales independientes, y los rojos de integración encontrados y cerrados: `docs/campaigns/paid-beta-readiness-2026-08.md`.

## Claims afectados

Ninguno. Este PR no toca páginas públicas de marketing ni superficie comercial.

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
