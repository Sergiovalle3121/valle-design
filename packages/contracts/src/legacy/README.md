# `legacy/` — identificadores CAD persistidos

Este módulo contiene únicamente literales CAD que ya viven fuera del código:
en filas existentes o en archivos DXF exportados. Renombrarlos no es un
refactor; requiere migración o compatibilidad bidireccional.

## Centinelas del estudio histórico

`LEGACY_CAD_STUDIO_MODEL=AXOS-CAD-STUDIO` y
`LEGACY_CAD_STUDIO_REVISION=UNIVERSAL` identifican documentos anteriores al
enrutado moderno por UUID. Sólo se usan bajo `/legacy/studio`. Los documentos
modernos jamás se crean con esos valores.

Para retirarlos se necesita un backfill verificable, lectura bidireccional
durante la transición, conteo cero del valor anterior en todos los entornos y
rollback probado. El gate está en
`apps/web/src/lib/cad/persisted-identifiers.spec.ts`.

## Nombres XDATA de DXF

`AXOS_DIM`, `AXOS_MLEADER` y `AXOS_BLOCK` forman parte de archivos ya
exportados. Cambiar exportador e importador a la vez produciría tests verdes,
pero rompería silenciosamente los archivos históricos.

Para retirarlos se requiere un lector bidireccional, una nueva versión del
formato canónico y un golden congelado del nombre anterior. El gate está en
`apps/web/src/lib/cad/dxf-xdata-golden.spec.ts`.

No hay compatibilidad de autenticación en este módulo. Valle Design usa
sesiones first-party y permisos `cad:*` derivados de membresías verificadas.
