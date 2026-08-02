# Seguridad

## Controles comprobados

- JWT Bearer validado con `JWT_SECRET`/`SESSION_SECRET`; producción falla si el
  secreto falta o mide menos de 16 caracteres. Design no emite identidades.
- Tenant derivado de credencial, scoping automático y pruebas PostgreSQL de
  aislamiento. Review tokens se guardan como hash, expiran y son revocables.
- `ValidationPipe` whitelist/forbid, Helmet, límite JSON, CORS allowlist y
  consultas de entitlement fail-closed.
- Gitleaks sobre historial, SBOM CycloneDX y gate de licencias en CI.

## Reglas operativas

No registrar JWT, review tokens, claves CIDE, URLs con credenciales ni dibujos
de clientes. Rotar el secreto coordinadamente con Platform. En producción usar
PostgreSQL, `SYNCHRONIZE=false`, TLS verificable cuando exista CA y una
`ALLOWED_ORIGIN` explícita. `allow-all`, `AI_MOCK` y el secreto dev no son
configuración productiva.

## Límites/riesgos

El secreto JWT es simétrico y compartido; no hay JWKS en el código actual. El
blob store vive en la base. CIDE puede recibir geometría/imagen: enviar solo lo
mínimo permitido. `npm audit` y dependencias deben revisarse en cada cambio; no
usar `audit fix --force` sin validar incompatibilidades.

## Reporte

No publicar vulnerabilidades ni datos reales en issues. Comunicar al propietario
del repositorio por un canal privado y aportar versión, impacto, reproducción
mínima y mitigación; no incluir secretos ni archivos de cliente.
