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

## Nombres XDATA de DXF — retirados de la ESCRITURA

`AXOS_DIM`, `AXOS_MLEADER` y `AXOS_BLOCK` forman parte de archivos ya
exportados bajo el nombre de producto anterior.

El exportador ya no los escribe: emite `VALLE_DIM`, `VALLE_MLEADER` y
`VALLE_BLOCK` (`packages/contracts/src/dxf-xdata-apps.ts`). Estos tres
literales sobreviven aquí como **lectura únicamente**, y ésa es la mitad del
contrato que no puede retirarse todavía: un archivo guardado antes del cambio
tiene que seguir abriéndose con la misma semántica.

Dos gates lo sostienen:

- `apps/web/src/lib/cad/dxf-xdata-golden.spec.ts` congela bytes reales con los
  nombres anteriores y exige que el importador los lea.
- `apps/web/src/lib/cad/dxf-xdata-app-names.spec.ts` exporta un dibujo,
  reescribe sólo las marcas XDATA al nombre anterior y compara las dos
  importaciones campo a campo; además prohíbe que el exportador reintroduzca
  el nombre retirado.

Retirar también la lectura exigiría una migración verificable de los archivos
de los clientes, cosa que el producto no controla. Hasta entonces, se quedan.

No hay compatibilidad de autenticación en este módulo. Valle Design usa
sesiones first-party y permisos `cad:*` derivados de membresías verificadas.
