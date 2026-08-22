# Valle DWG codec research lab

> Investigación experimental interna de interoperabilidad; no disponible en el producto.

Este directorio contiene la gobernanza y el baseline TypeScript aislado para
una implementación propia y original de Valle. No es un importador DWG, no está
conectado a UI/API/provider y no convierte bytes en un `CadDocument`.

ADR-0007 autoriza únicamente investigación clean-room. ADR-0003 conserva un
solo documento y kernel semántico; ADR-0004 sigue gobernando la disponibilidad
del producto. La autorización del propietario no es un dictamen jurídico,
licencia sobre DWG, certificación ni permiso para consultar material
restringido.

## Estado (corte 2026-08-21, campaña DWG)

**La fuente única de claims es `CAPABILITIES.md`.** Este resumen existe para
orientar; ante cualquier discrepancia, gana la matriz.

- El package es privado, `UNLICENSED`, estricto y no tiene dependencias runtime.
- **Superficie pública** (`src/index.ts`): cinco funciones con nombres estables
  — las tres de abajo más el mapeo canónico puro
  (`dwgDatabaseToCanonicalDocument` / `canonicalDocumentToDwgEntities`, con
  manifiesto de pérdidas en ambos sentidos).
  - `probeDwg(Uint8Array, options?)` valida la firma y devuelve un union con
    variante de ÉXITO: `ok:true` cuando la versión tiene decodificador de
    laboratorio (hoy AC1015, `decoderStatus:"experimental-lab"` en
    `DWG_VERSION_REGISTRY`); las demás versiones reconocidas siguen fallando
    con `DWG_VERSION_DECODER_UNSUPPORTED`.
  - `readDwg(Uint8Array, limits?)` lee un DWG AC1015 completo a la base
    neutral (`DwgDatabase`): capas, bloques con contenido, entidades de model
    space, tipos no soportados ENUMERADOS y diagnósticos. Falla cerrado con
    errores tipados.
  - `writeDwg(options?)` emite el archivo AC1015 COMPLETO validado por
    oráculo externo (ODA File Converter 27.1 convierte 4/4 casos con
    coincidencia campo a campo; subconjunto de entidades
    line/point/circle/arc/lwpolyline/text/insert — anotación y ATTRIBs son
    pendientes declarados; sin TrustedDWG, AutoCAD muestra su aviso).
  - `writeAc1015Container(options?)` es el writer de LABORATORIO (contenedor
    con placeholders confesos, mitad emisora del round-trip propio); antes se
    exportaba como `writeDwg` y esa confusión ya no existe.
- **Evidencia independiente**: los DWG AC1015 reales del corpus admitido del
  repo hermano (`valle-design-dwg-conformance`, producidos por ODA File
  Converter 27.1 desde DXF propios) abren y su geometría se compara campo a
  campo contra los oráculos DXF (`scripts/dwg/validate-corpus.mjs`, evidencia
  en `docs/cad/evidence/dwg-corpus-validation.json`).
- **Nada de esto está en el producto** (`productionAvailable: false`): ningún
  provider, endpoint, upload, feature flag ni mapping a `CadDocument`. El
  detector web conserva `nativeSupport:false`; un gate exige paridad exacta de
  sus nueve etiquetas y que el producto siga sin importar este package.
- Promocionar cualquier pieza más allá de investigación exige ADR de promoción
  y revisión jurídica externa previa (ADR-0004/ADR-0007).

## Verificación

Desde la raíz del repositorio:

```bash
npm run check:dwg
npm run benchmark:smoke --workspace=@valle-design/dwg-codec
```

`check:dwg` valida procedencia y fixtures, ausencia de I/O, límites del package,
build/typecheck, unitarias, adversariales, fuzz determinista, paridad de firmas
y las tres specs que mantienen DWG fuera del producto. El benchmark sólo mide;
no establece un claim de rendimiento productivo.

## Documentos obligatorios

- `AGENTS.md`: reglas scoped para cualquier agente o contribuidor.
- `CLEAN_ROOM_POLICY.md`: separación, fuentes permitidas y material prohibido.
- `SOURCE_REGISTER.json`: registro estructurado antes de derivar trabajo.
- `THREAT_MODEL.md`: frontera hostil y controles requeridos.
- `CAPABILITIES.md`: claims y evidencia, sin marketing.
- `fixtures/manifest.json` y su schema: procedencia y expectativas de los 21
  fixtures sintéticos versionados.

No uses este directorio para guardar material en cuarentena. Una fuente o
fixture bloqueado se registra por metadata, pero sus bytes no entran al
repositorio.
