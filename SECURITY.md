# Seguridad

## Modelo de confianza

El navegador no es autoridad de identidad, tenant, organización, rol, permiso
ni entitlement. El API deriva todo el contexto desde una sesión first-party y
datos PostgreSQL actuales. Para este release, `organization.id` es el tenant ID
y una diferencia o ausencia falla cerrada.

## Identidad y sesiones

- Las contraseñas se validan con límites explícitos y se guardan con Argon2id.
- El valor de sesión es opaco y sólo su hash se persiste. En producción la
  cookie es `__Host-valle_session`, `HttpOnly`, `Secure`, `SameSite=Lax`, ruta
  `/` y sin atributo `Domain`. El API rechaza emitirla si la solicitud no se
  considera HTTPS.
- Cada sesión tiene un secreto CSRF ligado a su hash. Una mutación exige que la
  cookie legible `valle_csrf`, el header `X-CSRF-Token` y el hash de sesión
  coincidan mediante comparación constante.
- Verificación de email, reset e invitaciones usan tokens aleatorios de un solo
  uso guardados por hash. Los endpoints normales no devuelven esos tokens.
- Reset de contraseña revoca las sesiones existentes. La interfaz permite
  listar, rotar, revocar una sesión o revocar las demás.
- Resend y forgot responden igual exista o no la cuenta. Nunca registrar correo
  junto con el resultado de autenticación ni usar mensajes distintos que
  permitan enumeración.

## Rate limiting

Los endpoints sensibles usan ventanas fijas y claves HMAC opacas. Con
PostgreSQL, `identity_rate_limits` aplica un upsert atómico compartido por todas
las réplicas y purga contadores vencidos en lotes acotados. Producción requiere
`IDENTITY_RATE_LIMIT_KEY_SECRET` compartido, aleatorio y de al menos 32
caracteres. SQLite usa memoria local sólo para desarrollo y no es una defensa
válida en un despliegue multi-réplica.

## Organizaciones, RBAC y acceso comercial

- La organización activa sólo cambia tras comprobar una membresía del usuario.
- Los roles `owner`, `admin`, `member` y `viewer` se traducen a permisos
  `cad:*` en el servidor. El cliente no puede elevarlos mediante headers o
  cuerpos.
- El acceso CAD requiere además `design.cad` en un plan activo y una
  suscripción efectiva. Sólo `active` o un `trialing` no expirado conceden
  acceso; el resto falla cerrado.
- Repositorios, query builders, blobs, versiones, auditoría, uso y outbox deben
  incluir el mismo tenant. Un identificador de otro tenant devuelve una
  respuesta no enumerativa y nunca una consulta global.
- Review links se guardan por hash, expiran y son revocables. El contexto
  canjeado está limitado a la superficie de review y al documento compartido.

## CSRF, CORS y entradas

El API habilita credenciales CORS sólo para `ALLOWED_ORIGIN`, usa Helmet,
compresión, un límite JSON y `ValidationPipe` con whitelist y rechazo de campos
desconocidos. El primer salto de reverse proxy es confiado; el proxy debe
sobrescribir `X-Forwarded-For` y `X-Forwarded-Proto` y no aceptar esos headers
directamente de Internet.

Importar es tratar datos hostiles. DXF/JSON se procesan en un Web Worker con
límites de archivo, tiempo, profundidad y cantidad de nodos; claves de
prototype pollution se rechazan. El servidor valida esquema, cardinalidad,
números finitos, gzip, tamaño expandido y hash para evitar payloads sin límite
y zip bombs. El producto rechaza DWG y no lo envía al laboratorio.

La investigación aislada de `packages/dwg-codec/` trata cada byte como hostil,
sin red, filesystem implícito, telemetría ni ejecución de contenido embebido.
Debe usar cursores y aritmética comprobados, budgets inmutables, errores tipados
y pruebas adversariales deterministas. Esa investigación no es una afirmación
de seguridad ni autoriza integración runtime; su threat model y procedencia
están gobernados por ADR-0007 y las reglas scoped del package.

## Outbox y webhooks firmados

Los emails y eventos se escriben de forma idempotente dentro de la transacción
de dominio. El worker productivo sólo funciona con PostgreSQL y entrega con
semántica at-least-once, leases, heartbeat, reintentos, backoff y estado
`dead`. Un fallo externo no debe revertir un cambio ya confirmado ni perder el
mensaje pendiente.

Cada POST webhook incluye:

- `Idempotency-Key`: estable entre reintentos.
- `X-Valle-Timestamp`: instante ISO-8601 usado en la firma.
- `X-Valle-Signature: sha256=<hex>`: HMAC-SHA256 de
  `<timestamp>.<raw-body>` con `OUTBOX_WEBHOOK_SECRET`.

El receptor debe conservar los bytes crudos, rechazar timestamps fuera de una
ventana corta, validar la firma en tiempo constante antes de parsear/actuar y
deduplicar la idempotency key de forma durable. La respuesta debe ser 2xx sólo
después de aceptar durablemente el efecto. En producción los endpoints deben
ser HTTPS y no pueden incluir credenciales ni fragmentos en la URL.

Los payloads de email pueden contener tokens de verificación, reset o
invitación. No registrar cuerpo, recipient, tenant, organization,
idempotency key, firma, respuesta del proveedor ni texto de excepciones. Las
métricas del dispatcher exponen sólo conteos, IDs internos y clases de fallo.

## Datos y operación

- PostgreSQL 16 y migraciones versionadas son obligatorios en producción.
  `SYNCHRONIZE=true` está prohibido.
- `design_blobs` contiene planos comprimidos; backup, cifrado, retención y
  restore deben cubrirlo en el mismo snapshot que documentos/versiones.
- CIDE puede recibir texto, geometría o imagen. Habilitarlo sólo con un acuerdo
  de datos adecuado, enviar el mínimo y proteger `CIDE_API_KEY`.
- El harness `_development/email-outbox` requiere flags y clave explícitos,
  está bloqueado en producción y nunca debe exponerse en staging público.
- Gitleaks sobre historial completo, SBOM CycloneDX, gate de licencias,
  `npm audit` y revisión del lockfile forman parte del release.

## Reporte privado

No publiques vulnerabilidades, tokens, dumps ni archivos de clientes en un
issue. Comunícalos al propietario del repositorio por un canal privado e
incluye versión, impacto, reproducción mínima y mitigación sin datos reales.
