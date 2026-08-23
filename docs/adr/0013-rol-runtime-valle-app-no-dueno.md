# ADR-0013: rol runtime `valle_app`, no dueño, para que RLS sujete a la app

- Estado: aceptado (preparado; el corte de tráfico a `valle_app` NO se activa
  en este cambio — ver «Consecuencias» y «Lo que este ADR NO hace»)
- Fecha: 2026-08-23
- Relacionadas: ADR-0005 (`organization.id` es el tenant ID), migración
  `TenantIntegrityRls` (2026-08-20)

## Contexto

`TenantIntegrityRls` (20260820120000) activó Row-Level Security con política
`tenant_id = current_setting('app.tenant_id', true)` en 8 tablas CAD. Esa
migración documenta, en su propio comentario, la limitación que motiva este
ADR: **la aplicación corre como el rol DUEÑO de las tablas** (el mismo rol que
migra), y en PostgreSQL el dueño de una tabla no queda sujeto a sus propias
políticas RLS salvo que la tabla lleve `FORCE ROW LEVEL SECURITY`. Hoy ninguna
tabla la lleva. Consecuencia verificada dos veces en esta revisión:

1. **`design_blobs` (bytes gzip del plano, creada en `CreateDesignBlobs`,
   2026-08-01) se quedó fuera de `RLS_TABLES`.** No tiene `ENABLE ROW LEVEL
   SECURITY` ni política. Es la única tabla de las nueve candidatas sin
   ninguna capa de RLS — ni siquiera la protección "de segunda línea" que
   `TenantIntegrityRls` ya le dio a las otras ocho contra una credencial
   secundaria filtrada.
2. **Ningún camino de la aplicación ejecuta `SET LOCAL app.tenant_id`.** Se
   buscó en todo `apps/api/src` (`grep app.tenant_id`) y el único lugar donde
   aparece es dentro de las migraciones/tests de RLS mismos.
   `TenantScopedRepository` (el mecanismo real de aislamiento hoy) inyecta
   `WHERE tenant_id = <ctx>` por cada consulta — funciona, pero vive en
   TypeScript, no en PostgreSQL: un ORM mal usado, un `queryBuilder` crudo o
   un `manager.getRepository(Entity)` sin envolver se saltan esa capa sin que
   ninguna prueba lo note, porque la base no exige nada. `TenantInterceptor`
   además abre el contexto por `AsyncLocalStorage`, no por transacción — no
   hay una transacción de request contra la que atar `SET LOCAL`
   (`SET LOCAL` sólo dura la transacción actual; cada llamada TypeORM toma su
   propia conexión del pool sin transacción explícita).

Sin (2), añadir `FORCE ROW LEVEL SECURITY` HOY sería incorrecto: forzaría la
política también sobre el rol dueño (la app de producción), que nunca fija
`app.tenant_id` — toda query legítima devolvería cero filas, un apagón total,
no un endurecimiento. Es exactamente el riesgo que motivó tratar este frente
con el mayor cuidado.

## Decisión

1. **Existe un rol runtime `valle_app`, NO dueño de las tablas, sin
   `BYPASSRLS`, sin `SUPERUSER`/`CREATEDB`/`CREATEROLE`, con privilegios
   mínimos**: `SELECT, INSERT, UPDATE, DELETE` sobre las nueve tablas tenant
   identificadas hoy (las 8 de `TenantIntegrityRls` + `design_blobs`) y nada
   más — ni `ALTER DEFAULT PRIVILEGES` sobre el esquema, ni `GRANT ... ON ALL
   TABLES`. Deliberadamente más estrecho que el borrador de `DEPLOYMENT.md`
   §3.2: ese borrador otorga sobre TODAS las tablas del esquema; ampliar
   `valle_app` a otras tablas (identidad, comercial, auditoría) es una
   decisión posterior explícita y con su propio ADR/migración, no un default
   heredado de "todas las tablas públicas".
2. **`design_blobs` recibe `ENABLE ROW LEVEL SECURITY` y la misma política**
   que las otras ocho tablas: `tenant_id = current_setting('app.tenant_id',
   true)`, en `USING` y `WITH CHECK`. Sin `app.tenant_id` fijado, la política
   no devuelve ninguna fila — cerrado por defecto, igual que las demás.
3. **`valle_app` se crea SIN contraseña.** La migración no puede llevar un
   secreto (regla de la campaña: nada de secretos en código ni en logs); el
   operador fija `ALTER ROLE valle_app WITH PASSWORD '<secreto real>'` fuera
   de control de versiones antes de apuntar cualquier `DATABASE_URL` a este
   rol.
4. **Ningún `FORCE ROW LEVEL SECURITY` en este cambio**, en ninguna de las
   nueve tablas. Ver "Lo que este ADR NO hace".
5. **Un escaneo automático (`tenant-rls-coverage.pg.spec.ts`)** enumera, en el
   esquema real, toda tabla `cad_*`/`sf_cad_blocks`/`design_blobs` con columna
   `tenant_id` y falla si a alguna le falta `relrowsecurity` o política — para
   que una tabla CAD nueva (como pasó con `design_blobs`) no vuelva a colarse
   en silencio.

## Lo que este ADR NO hace (y por qué queda así, a propósito)

- **No cambia qué rol usa `DATABASE_URL` en producción.** `valle_app` queda
  creado y con permisos, pero la aplicación sigue conectando como el rol
  dueño hasta un cambio de despliegue aparte, deliberado y reversible
  (rotar `DATABASE_URL`, verificar `/health/ready`, monitorear 5xx).
- **No añade `FORCE ROW LEVEL SECURITY`.** Activarlo hoy —mientras la app
  sigue corriendo como dueño y no fija `app.tenant_id`— apagaría el acceso
  legítimo de la aplicación a sus propios datos: el escenario que esta
  campaña pidió evitar por encima de todo. `FORCE` sólo importa para que la
  política también alcance al DUEÑO; `valle_app`, al no ser dueño, YA está
  sujeto a la política con `ENABLE` simple — no necesita `FORCE` para quedar
  protegido. `FORCE` es una capa adicional de defensa en profundidad (cubre
  un dueño comprometido o un superusuario con `BYPASSRLS` revocado) que sólo
  tiene sentido añadir DESPUÉS de que el corte a `valle_app` esté verificado
  en producción, como migración de seguimiento separada.
- **No implementa `SET LOCAL app.tenant_id` por transacción en la
  aplicación.** Requiere que cada request tenga una transacción propia contra
  la que atar el `SET LOCAL` — hoy `TenantInterceptor` abre contexto por
  `AsyncLocalStorage`, pero cada acceso a datos toma conexión del pool sin
  transacción explícita envolvente. Cablear esto bien toca el ciclo de vida
  de conexión de TODA la API (no sólo CAD), es un cambio de arquitectura con
  radio de impacto grande, y verificarlo con confianza no cabía en esta
  sesión. Sin esta pieza, cortar `DATABASE_URL` a `valle_app` dejaría a la
  aplicación viendo cero filas en las nueve tablas (fail-closed también sobre
  tráfico legítimo) — por eso el corte tampoco se activa aquí.

**Orden seguro para completar el endurecimiento** (ninguno de estos pasos
está hecho todavía; se listan para quien continúe):

1. Diseñar y cablear el `SET LOCAL app.tenant_id` por transacción (probablemente
   un interceptor que abre una transacción de request y expone su `manager` en
   vez de dejar que cada repo tome conexión suelta del pool), con pruebas
   PostgreSQL de que el valor no se filtra entre requests concurrentes.
2. Fijar la contraseña de `valle_app` fuera de control de versiones y
   verificar en un entorno de staging que TODA ruta CAD sigue funcionando con
   `DATABASE_URL` apuntando a `valle_app` y `MIGRATIONS_RUN=false`.
3. Sólo entonces, considerar una migración de seguimiento con `FORCE ROW
   LEVEL SECURITY` como defensa en profundidad adicional sobre el dueño.

## Consecuencias

- `design_blobs` deja de ser la única tabla candidata sin ninguna capa de
  RLS; el aislamiento de aplicación (`TenantScopedRepository`) sigue siendo
  la primera línea real hasta que se complete el orden de arriba.
- El escaneo automático convierte "una tabla CAD nueva se olvida de RLS" en
  un rojo de CI, no en un hallazgo de auditoría meses después.
- `valle_app` existe pero es inerte en producción hasta el corte explícito de
  `DATABASE_URL` — no cambia el comportamiento actual de la app.
- Rollback operacional documentado en el header de la migración: `down()`
  revoca los privilegios de `valle_app`, apaga RLS en `design_blobs` y
  elimina el rol (falla limpio si aún hay sesiones activas con ese rol — en
  ese caso, cortar `DATABASE_URL` de vuelta al dueño ANTES de correr `down`).

## Alternativas rechazadas

- **Añadir `FORCE ROW LEVEL SECURITY` ya, junto con el resto.** Rechazado: ver
  arriba — produce un apagón mientras el rol runtime no esté cableado.
- **Otorgar a `valle_app` sobre `ALL TABLES IN SCHEMA public` con `ALTER
  DEFAULT PRIVILEGES`,** como en el borrador de `DEPLOYMENT.md`. Rechazado
  para este cambio: viola "privilegios mínimos" y silenciosamente le daría a
  `valle_app` acceso a tablas de identidad/comercial que este frente no
  audita. Queda como decisión explícita futura, no un default.
- **Cablear `SET LOCAL app.tenant_id` con un truco de fire-and-forget por
  query individual** (fijar la variable de sesión al inicio de cada método de
  repositorio, sin transacción). Rechazado: `SET LOCAL` fuera de una
  transacción explícita se comporta como `SET` de sesión completa sobre una
  conexión de POOL compartida — el tenant de un request quedaría pegado a la
  conexión y podría filtrarse al siguiente request que la reutilice. Es
  exactamente el tipo de bug de aislamiento que esta campaña existe para
  prevenir, no para introducir.
