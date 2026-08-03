# Troubleshooting

## Arranque y conectividad

| Síntoma                                    | Comprobación                                     | Acción segura                                                                                                                                        |
| ------------------------------------------ | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| API no arranca en producción               | Error sobre PG, synchronize, rate limit u outbox | Define PostgreSQL, `SYNCHRONIZE=false`, `IDENTITY_RATE_LIMIT_KEY_SECRET` y todas las variables `OUTBOX_*`; no habilites SQLite ni desactives guards. |
| `Production session cookies require HTTPS` | `req.secure`, TLS y `X-Forwarded-Proto`          | Configura el primer proxy para sobrescribir `X-Forwarded-Proto=https`; no elimines `Secure`/`__Host-`.                                               |
| Web llama un host viejo                    | Valor usado en el build                          | Reconstruye Next con `NEXT_PUBLIC_API_URL` correcto; reiniciar el mismo bundle no basta.                                                             |
| CORS                                       | `Origin` exacto y `ALLOWED_ORIGIN`               | Añade el origen sin path/slash ambiguo y redespliega el API; las cookies requieren `credentials: include`.                                           |
| Error de migración                         | Tabla de migraciones, versión SQL y log          | Detén rollout/escrituras, conserva backup y corrige forward o usa sólo un `down` ya probado. Nunca uses synchronize para reconciliar producción.     |

## Identidad y acceso

| Síntoma                           | Comprobación                                           | Acción segura                                                                                                                       |
| --------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Registro 202 pero no llega correo | `email_outbox` por estado/edad, worker y receptor      | Corrige `OUTBOX_*`, TLS o receptor. No extraigas el token de la base ni expongas el harness.                                        |
| Login 401                         | Email verificado, contraseña, cookie revocada/expirada | Usa verificación/reset normal. No reveles si una cuenta existe ni copies valores de sesión.                                         |
| Mutación devuelve CSRF inválido   | Cookie `valle_csrf`, header y sesión actual            | Vuelve a leer la cookie después de login/rotación/reset; no reutilices el token anterior.                                           |
| 403 `entitlement_required`        | Organización activa, membresía, plan y suscripción     | Activa una organización de la que el usuario sea miembro; corrige el estado local o trial. No inyectes tenant/rol desde el cliente. |
| Viewer no puede guardar/publicar  | Rol y permisos derivados                               | Es el RBAC esperado; cambia membresía por un flujo administrativo autorizado, no por un header.                                     |
| 429                               | `retryAfterSeconds`, reloj PG y secreto entre réplicas | Espera la ventana y unifica `IDENTITY_RATE_LIMIT_KEY_SECRET`; no borres contadores para permitir brute force.                       |
| Harness email devuelve 404        | `NODE_ENV`, flags, clave, recipient/tenant exactos     | Úsalo sólo en test no productivo con clave ≥32; 404 es el comportamiento seguro cuando falta cualquier condición.                   |

## Outbox

Consulta sólo metadatos operativos:

```sql
SELECT status, count(*), min(created_at) AS oldest
FROM email_outbox
GROUP BY status;

SELECT status, count(*), min(created_at) AS oldest
FROM domain_outbox
GROUP BY status;
```

| Síntoma                          | Comprobación                                         | Acción segura                                                                                                                  |
| -------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Backlog `pending`/`failed` crece | Worker, conexión PG, URLs, DNS/TLS, timeout          | Repara transporte/receptor y deja que los retries conserven la idempotency key. No marques filas `sent`.                       |
| Receptor dice firma inválida     | Raw body, timestamp exacto y secreto                 | Calcula HMAC de `<timestamp>.<raw-body>` sin reserializar JSON y compara constante; rota secretos coordinadamente si difieren. |
| Email/evento duplicado           | Registro durable de `Idempotency-Key`                | Deduplica antes del efecto. At-least-once permite repetir un POST tras perder el 2xx.                                          |
| Filas `dead`                     | Intentos/clase de fallo, sin abrir payload en logs   | Corrige causa, preserva evidencia y usa un replay auditado/idempotente; el runtime no ofrece replay automático.                |
| Lease perdido                    | Latencia receptor, timeout, carga/pausas del proceso | Reduce latencia o ajusta timeout dentro de límites; no ejecutes dispatcher sobre SQLite.                                       |

## CAD, CAS e importación

| Síntoma                         | Comprobación                                  | Acción segura                                                                                                           |
| ------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `409` al guardar                | Versión esperada vs actual                    | Conserva estado sucio, abre la versión actual, compara/resuelve y reintenta. Nunca edites el contador.                  |
| Autosave queda pendiente        | Red, estado offline/error y cola de guardado  | Recupera conexión y guarda manualmente antes de cambiar/cerrar. `pagehide` es best effort.                              |
| Documento >1 MB no abre         | Puntero, blob del mismo tenant, SHA y tamaños | Preserva filas/logs, verifica integridad y límites. No ejecutes GC ni copies un blob entre tenants.                     |
| Import se cancela o excede 45 s | Tamaño, extensión, worker y contenido         | Usa DXF de texto ≤12 MB o JSON canónico ≤20 MB; divide/corrige el archivo, no aumentes límites sin análisis de memoria. |
| JSON rechazado                  | Profundidad/nodos, schema o claves inseguras  | Corrige al `CadDocument` canónico; no ignores la validación ni `__proto__`/`constructor`.                               |
| DXF pierde entidades            | Warnings/loss manifest y corpus               | Conserva el original, revisa entidades soportadas y añade golden antes de ampliar un claim.                             |
| DWG no abre                     | Capacidad ausente                             | Convierte con una herramienta/proveedor autorizado a DXF de texto; no renombres la extensión.                           |
| CIDE responde `available:false` | `CIDE_BASE_URL`, modelo y red                 | Configura el proveedor o acepta degradación. `AI_MOCK=1` es sólo prueba.                                                |

## Pruebas y release

| Síntoma                         | Comprobación                                  | Acción segura                                                                                            |
| ------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Suites PG se saltan             | `TEST_DATABASE_URL`, `REQUIRE_POSTGRES_TESTS` | Usa PostgreSQL 16 y fija `REQUIRE_POSTGRES_TESTS=true`; SQLite no sustituye el gate.                     |
| Playwright real se salta        | `E2E_REAL_API`, API/PG y build URL            | Arranca API migrada, construye web con su origen y ejecuta Chromium y Firefox.                           |
| Golden pasa pero E2E real falla | Intercepción de red del golden                | Trata el fallo full-stack como bloqueante; el golden caracteriza UI/motor, no identidad, API ni DB.      |
| Benchmark 100k varía            | Hardware, navegador, dataset y carga          | Conserva artefacto/metadata y compara en la misma configuración. Los umbrales amplios no prueban 60 FPS. |

## Comandos de diagnóstico

```bash
npm run check:cad
npm run typecheck
npm test
npm run lint
npm run build
npm run test:pg --workspace=valle-design-api
npm run smoke:bootstrap --workspace=valle-design-api
git diff --check
```

Para el gate PostgreSQL define `TEST_DATABASE_URL` y
`REQUIRE_POSTGRES_TESTS=true`. Para E2E full-stack usa las variables declaradas
en `.github/workflows/ci.yml`; no interceptes `/v1` en el spec real.

Ante pérdida, corrupción, exposición cross-tenant o secreto comprometido,
continúa con `RUNBOOK.md` y `docs/guides/backup-restore.md`.
