# ADR-0004: DXF nativo y proveedores DWG

- Estado: aceptado
- Fecha: 2026-08-02

## Contexto

El repositorio importa/exporta DXF ASCII mediante código TS y `dxf-parser`,
con entidades semánticas, XDATA histórica, goldens y manifiesto de pérdidas.
No contiene parser, SDK, licencia, endpoint ni prueba DWG.

## Decisión

Declarar **DXF nativo parcial** y **DWG no disponible**. No etiquetar un DXF
renombrado como DWG ni improvisar ingeniería inversa. DWG solo podrá habilitarse
mediante proveedor autorizado cuyo SDK/licencia permita el uso y distribución,
después de revisión legal/seguridad, SBOM, aislamiento del conversor, límites de
recursos, corpus autorizado, round-trip, fuzzing, tenancy y pruebas E2E. El
proveedor será un adapter: el documento Valle continúa siendo canónico.

## Consecuencias

La UI/documentación debe rechazar DWG explícitamente y ofrecer DXF cuando sea
adecuado, sin prometer fidelidad total. Las pérdidas DXF permanecen visibles.

## Alternativas rechazadas

Parser DWG casero, binario opaco sin autorización, servicio externo que recibe
planos sin acuerdo de datos, y claims de compatibilidad basados solo en export.
