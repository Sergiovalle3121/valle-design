# ADR-0001: Identidad en un producto standalone

- Estado: aceptado
- Fecha: 2026-08-02

## Contexto

Design se despliega independientemente pero no tiene usuarios, login ni emisor
de tokens. El web redirige al login de Platform; el API valida JWT simétricos y
deriva tenant/permisos. Los review links producen identidad sintética acotada.

## Decisión

Mantener Design **standalone en despliegue y datos, no como autoridad de
identidad**. Platform emite la sesión; Design valida por contrato/env y consulta
`design.cad` en `platform-api`. No copiar tablas de usuario ni importar código
de Platform. El modo `allow-all` queda limitado a desarrollo. Una evolución a
JWKS/OIDC requiere ADR y transición compatible, no un segundo login.

## Consecuencias

La caída de Platform/entitlements niega acceso en producción; la rotación del
secreto debe coordinarse. Design mantiene aislamiento y puede desplegarse solo,
pero no puede autenticar nuevos usuarios sin Platform. Tests relevantes:
`cad-auth.guard`, mapa de permisos, entitlement client y tenancy PostgreSQL.

## Alternativas rechazadas

IAM propio (duplica autoridad y amplía alcance); confiar claims sin verificar;
`allow-all` productivo (fail-open).
