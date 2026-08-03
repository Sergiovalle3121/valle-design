# ADR-0001: Identidad first-party para el producto standalone

- Estado: aceptado
- Fecha: 2026-08-02

## Contexto

Valle Design debe poder registrar, autenticar y autorizar a sus usuarios sin
una dependencia runtime en otro producto. La aplicación necesita verificación
de correo, recuperación de contraseña, revocación de sesiones, organizaciones
y un límite de tenant comprobable. Transportar credenciales largas en el
navegador o aceptar claims de tenant/rol ampliaría el impacto de XSS y permitiría
que datos obsoletos eludieran cambios de membresía.

## Decisión

Valle Design es la autoridad de su identidad first-party:

- Usuarios, credenciales Argon2id, sesiones, tokens de un solo uso y auditoría
  viven en PostgreSQL del producto.
- El navegador recibe una cookie de sesión opaca; el servidor guarda sólo su
  hash. Producción usa una cookie `__Host-`, HttpOnly y Secure.
- Toda mutación requiere double-submit CSRF ligado al hash de la sesión.
- Verificación, reset, invitación y revocación son transaccionales. Los tokens
  se almacenan por hash y no aparecen en respuestas normales.
- Los endpoints de recuperación son no enumerativos y tienen rate limits. En
  PostgreSQL, el contador es atómico y compartido entre réplicas.
- Organización, tenant, rol y permisos se derivan server-side desde la sesión y
  la membresía actual.

## Consecuencias

El producto puede operar y desplegarse solo, pero asume la responsabilidad de
proteger credenciales, entregar correo y responder a incidentes de cuenta. La
base y el outbox pasan a ser parte del límite crítico de identidad. El API
productivo debe estar detrás de HTTPS correctamente propagado por el proxy y no
puede usar SQLite para rate limiting multi-réplica.

Cambiar contraseña revoca sesiones; cambiar una membresía se refleja sin
reemitir una credencial del navegador. Los clientes usan `credentials:
"include"` y no almacenan tokens de sesión.

## Alternativas rechazadas

- Delegar login y permisos a otro producto: contradice el despliegue standalone
  y crea un punto de fallo externo.
- Tokens de sesión legibles por JavaScript: aumentan el impacto de XSS y
  facilitan persistencia insegura.
- Confiar tenant, rol o permisos del request: permite escalación y estado
  obsoleto.
- Rate limiting sólo en memoria: no coordina réplicas ni sobrevive reinicios.
