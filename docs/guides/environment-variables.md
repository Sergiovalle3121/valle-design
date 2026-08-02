# Variables de entorno

Fuente de ejemplo: `.env.example` y `apps/web/.env.example`.

| Variable                                                                                                      | Runtime   | Comportamiento comprobado                                        |
| ------------------------------------------------------------------------------------------------------------- | --------- | ---------------------------------------------------------------- |
| `DATABASE_URL` o `DB_HOST` + `DB_*`                                                                           | API       | PostgreSQL; sin ambas usa SQLite solo fuera de producción        |
| `SYNCHRONIZE`                                                                                                 | API       | debe ser `false` explícito en producción                         |
| `MIGRATIONS_RUN`                                                                                              | API       | aplica migraciones al arrancar cuando no sincroniza              |
| `DB_SSL_STRICT`                                                                                               | API       | valida certificado si es `true`; SSL también depende de prod/URL |
| `SQLITE_PATH`                                                                                                 | API dev   | ruta del fallback local                                          |
| `JWT_SECRET`, alias `SESSION_SECRET`                                                                          | API       | verificación; primero gana; mínimo 16 en prod                    |
| `ENTITLEMENTS_MODE`                                                                                           | API       | `allow-all` dev o `platform-api`; prod default fail-closed       |
| `PLATFORM_API_URL`, `ENTITLEMENTS_TIMEOUT_MS`, `ENTITLEMENTS_CACHE_TTL_MS`                                    | API       | consulta/caché de `design.cad`                                   |
| `REVIEW_LINK_TTL_MINUTES`                                                                                     | API       | default 7 días, solicitud acotada 5 min–90 días                  |
| `PORT`, `ALLOWED_ORIGIN`                                                                                      | API       | escucha/CORS; sin allowlist no admite cross-origin fuera de dev  |
| `CIDE_BASE_URL`, `CIDE_API_KEY`, `CIDE_MODEL`, `CIDE_VISION_MODEL`, `CIDE_TIMEOUT_MS`, `AI_MAX_OUTPUT_TOKENS` | API       | IA opcional; sin base URL degrada                                |
| `AI_MOCK`                                                                                                     | pruebas   | respuestas deterministas; no producción                          |
| `TEST_DATABASE_URL`, `REQUIRE_POSTGRES_TESTS`                                                                 | pruebas   | suites PostgreSQL y fallo si falta DB                            |
| `NEXT_PUBLIC_API_URL`, alias `NEXT_PUBLIC_API_BASE`                                                           | web/build | origen API incorporado al bundle                                 |
| `NEXT_PUBLIC_PLATFORM_LOGIN_URL`                                                                              | web       | login externo; Design no tiene login                             |
| `NEXT_PUBLIC_BRAND_*`                                                                                         | web       | marca opcional                                                   |

Las variables `S3_*` documentadas son reserva de Compose: el API actual no las
lee. Para migración se usan `DATABASE_URL_SOURCE` (origen read-only) y
`DATABASE_URL_TARGET`. No guardar `.env` en Git.
