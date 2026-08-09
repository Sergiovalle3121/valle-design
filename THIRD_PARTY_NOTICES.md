# Avisos de terceros

Valle Design es software propietario (`UNLICENSED` en `package.json`; términos
en `LICENSE`) y distribuye dependencias de terceros bajo sus propias licencias.
El inventario autoritativo de una compilación se genera desde el lockfile:

```bash
npm ci
npm run sbom
npm run check:licenses
```

El SBOM CycloneDX resultante (`sbom.cdx.json`) enumera dependencias de runtime y
desarrollo, con sus licencias. CI lo conserva como artefacto y rechaza licencias
bloqueadas o desconocidas mediante `scripts/check-dependency-licenses.mjs`; las
familias que requieren decisión humana se muestran explícitamente. No se
versiona aquí una lista copiada porque divergiría del lockfile. Conservar en cada
distribución el SBOM de esa build, los textos de licencia exigidos por cada
componente distribuido y este aviso. DXF es un formato interoperado por código
propio y `dxf-parser`; no hay SDK/proveedor DWG incluido.
