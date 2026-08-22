# Avisos de terceros

Valle Design es software propietario (`UNLICENSED` en `package.json`; términos
en `LICENSE`) y distribuye dependencias de terceros bajo sus propias licencias.
El inventario autoritativo de una compilación se genera desde el lockfile:

```bash
npm ci
npm run sbom
npm run check:licenses
```

El SBOM CycloneDX resultante (`sbom.cdx.json`) enumera componentes y licencias;
CI lo conserva como artefacto y rechaza licencias de producción fuera de la
allowlist de `scripts/check-dependency-licenses.mjs`. No se versiona aquí una
lista copiada porque divergiría del lockfile. Conservar en cada distribución
el SBOM de esa build, los textos de licencia exigidos por cada componente y
este aviso. DXF es un formato interoperado por código propio y `dxf-parser`;
no hay SDK/proveedor DWG incluido.

## Fuentes tipográficas autohospedadas

`apps/web/src/fonts/` versiona Inter (© The Inter Project Authors,
https://github.com/rsms/inter) y JetBrains Mono (© The JetBrains Mono Project
Authors, https://github.com/JetBrains/JetBrainsMono), ambas bajo SIL Open Font
License 1.1. Se descargaron una vez (2026-08-22) para que el build no dependa
de Google Fonts; detalles y procedencia exacta en
`apps/web/src/fonts/LICENSE.txt`. La OFL permite redistribuirlas con software
propietario conservando su aviso; no se venden por separado.
