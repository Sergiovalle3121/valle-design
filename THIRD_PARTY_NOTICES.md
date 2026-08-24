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

## Datos incorporados que no salen del lockfile

### Fuentes vectoriales Hershey (dominio público)

`apps/web/src/lib/cad/fonts/hershey-simplex-data.ts` transcribe el juego
«Simplex» de las fuentes de trazos creadas por el Dr. Allen V. Hershey en 1967
en el National Bureau of Standards de EE.UU. (hoy NIST). Son obra del gobierno
federal de los Estados Unidos y por tanto **dominio público**; su
digitalización clásica circula libre desde su publicación en Usenet
(mod.sources, 1986). La transcripción se hizo mecánicamente desde el arreglo C
`simplex[95][112]` de la recopilación de Paul Bourke
(<https://paulbourke.net/dataformats/hershey/>), partiendo cada glifo en
polilíneas por las marcas de pluma alzada del formato. Los glifos compuestos
del español y del dibujo técnico (áéíóúü, ñÑ, °, ±, Øø, ¿¡) son añadidos
propios de `hershey-fonts.ts` sobre esos trazos, no de la colección original.

Ningún byte proviene de fuentes `.shx` de Autodesk ni de conversiones de
ellas: cuando un DXF nombra `txt.shx`, `simplex.shx`, `romans.shx`,
`isocp.shx` o `monotxt.shx`, el producto DECLARA la sustitución por su familia
Hershey (`mtext-fonts.ts`, disposición `substituted`) y dibuja con los trazos
Hershey, que son un linaje distinto y libre.
