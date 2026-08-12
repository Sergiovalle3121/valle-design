# Runbook operativo

## Señales mínimas

Monitorea por separado disponibilidad web/API, conexión y saturación de
PostgreSQL, latencia/error por ruta, 401/403/409/429, backlog y edad del outbox,
filas `dead`, latencia del webhook, conflictos CAS y tiempos de apertura,
serialización y escena. Las métricas y logs no deben contener correos, tokens,
cuerpos CAD, tenant IDs, firmas ni respuestas del proveedor.

`GET /health/metrics/commercial` expone sin autenticación (como los probes de
`/health`) el subconjunto comercial de estas señales listo para scrapear:
backlog y edad por cola del outbox, filas `dead`, contadores y latencia
`claimed→sent` del dispatcher por clase de error, y 401/403/409/429 por PATRÓN
de ruta. Todo son agregados: sin URLs reales, payloads ni identificadores. Los
contadores viven en memoria del proceso y se reinician con cada despliegue; el
backlog sale de la base y es consistente entre réplicas.

## Triage inicial

1. `curl -fsS https://API/health` separa indisponibilidad del API de un fallo
   del web. Si falla, conserva el log de arranque completo.
2. Comprueba conexión PostgreSQL, migraciones aplicadas y
   `SYNCHRONIZE=false`. No habilites SQLite o synchronize para recuperar
   producción.
3. Comprueba que el proxy entrega HTTPS al API y que `ALLOWED_ORIGIN` contiene
   el origen exacto del web.
4. Revisa backlog de outbox por estado y edad, sin consultar payloads:

```sql
SELECT 'email' AS queue, status, count(*) FROM email_outbox GROUP BY status
UNION ALL
SELECT 'domain', status, count(*) FROM domain_outbox GROUP BY status;

SELECT 'email' AS queue, min(created_at) AS oldest
FROM email_outbox WHERE status IN ('pending', 'failed')
UNION ALL
SELECT 'domain', min(created_at)
FROM domain_outbox WHERE status IN ('pending', 'failed');
```

5. Correlaciona la regresión con versión, migración y despliegue; no edites
   filas manualmente antes de conocer el alcance y tomar un snapshot.

## Respuestas comunes

- **API no arranca:** valida PostgreSQL, `SYNCHRONIZE=false`, secreto de rate
  limit y todas las variables `OUTBOX_*`. En producción, desactivar el worker
  no es una mitigación: dejaría verificación, reset e invitaciones varadas.
- **Login no crea cookie:** confirma TLS y `X-Forwarded-Proto=https`. El API
  falla si no puede emitir la cookie `__Host-` segura.
- **401:** confirma que la cookie se envía con `credentials: include`, no
  expiró ni fue revocada y el usuario verificó el correo. No extraigas ni
  copies tokens a `localStorage` para depurar.
- **CSRF inválido:** la cookie `valle_csrf` y `X-CSRF-Token` deben coincidir con
  la sesión actual. Tras login, rotación, logout o reset vuelve a leer las
  cookies; no reutilices un CSRF antiguo.
- **403 al abrir CAD:** consulta la organización activa, membresía/rol y el
  estado comercial. Deben coincidir `organizationId` y tenant, el plan debe
  estar activo y la suscripción ser `active` o un trial vigente.
- **404 de otro tenant:** es comportamiento fail-closed. No cambies la consulta
  a global para verificar; reproduce con dos cuentas/organizaciones en un
  entorno aislado.
- **429:** respeta `retryAfterSeconds`. Verifica hora PostgreSQL, conexión
  compartida y el mismo `IDENTITY_RATE_LIMIT_KEY_SECRET` en todas las réplicas.
- **Outbox crece:** comprueba worker habilitado, PostgreSQL, DNS/TLS y latencia
  del receptor. Valida firma/dedup con un mensaje de prueba en staging. No
  marques filas `sent`, reinicies intentos o reenvíes payloads a mano.
- **Filas `dead`:** conserva IDs internos y clase de fallo, corrige el receptor
  y decide una herramienta de replay auditada e idempotente. El runtime no
  promete replay manual automático.
- **409/CAS:** preserva el estado local, abre la versión actual, compara y
  reintenta desde esa versión. Nunca incrementes el contador ni sobreescribas
  directamente la fila.
- **Autosave pendiente/offline:** evita cerrar o cambiar de documento, recupera
  conectividad y ejecuta guardado manual. Un flush de `pagehide` es best effort,
  no una garantía de red.
- **Documento grande no abre:** preserva documento, puntero y blob; verifica
  tenant, SHA-256, bytes comprimidos/expandidos y límites antes de cualquier GC.
- **Importación falla:** admite sólo `.dxf` de texto y `.json` canónico. Revisa
  límites, timeout, corrupción y warnings; no cambies extensión de DWG.
- **CIDE `available:false`:** valida URL/modelo/red o acepta la degradación. No
  habilites `AI_MOCK` en producción.
- **CORS:** reconstruir el web no corrige el API; ajusta `ALLOWED_ORIGIN` exacto.
  Si el web llama un host viejo, reconstruye con `NEXT_PUBLIC_API_URL` correcto.

## Incidentes

### Sospecha de acceso cross-tenant

Detén escrituras si existe exposición activa, preserva logs y snapshot, revoca
sesiones afectadas y reproduce con las suites PostgreSQL de aislamiento. Acota
tablas, blobs, versiones, outboxes y receptores externos. No repares filas hasta
tener una consulta y rollback revisados.

### Token o secreto expuesto

Revoca sesiones/tokens relacionados, rota el secreto afectado en API y receptor
de forma coordinada, inspecciona outbox/logs sin divulgar payloads y ejecuta
gitleaks sobre historial completo. Si el secreto llegó a Git, una eliminación
del archivo actual no basta.

### Pérdida o corrupción

Pon el servicio en mantenimiento, toma snapshot forense, restaura el último dump
en una base nueva y valida hashes, hidratación >1 MB, versiones, CAS, identidad,
organizaciones y outbox antes de conmutar. Sigue
`docs/guides/backup-restore.md`.

### Migración fallida

Detén el rollout y nuevas escrituras. Conserva error SQL, versión y backup.
Usa `down` sólo si fue probado para esa migración y no hubo escrituras
incompatibles; de lo contrario corrige hacia delante. Nunca enciendas
`synchronize` para “arreglar” el esquema.

## Gates antes de cerrar un incidente

Ejecuta contrato/SDK, typecheck, tests, lint, build, PostgreSQL/migraciones,
bootstrap compilado, audit/SBOM/licencias/gitleaks y el recorrido full-stack con
PostgreSQL real en Chromium y Firefox. Documenta cualquier gate no ejecutado;
un golden con backend simulado no demuestra recuperación operativa.

Diagnóstico ampliado: `docs/guides/troubleshooting.md`.
