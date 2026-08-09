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

## Estado de la fase 2

- El package es privado, `UNLICENSED`, estricto y no tiene dependencias runtime.
- La única función pública es `probeDwg(Uint8Array, options?)`. Hace snapshot de
  bytes propios, reconoce nueve firmas `AC10xx` y distingue truncación, firma
  inválida, versión desconocida y versión reconocida sin decoder.
- Toda firma reconocida devuelve `DWG_VERSION_DECODER_UNSUPPORTED`; no existe
  `parseDwg`, object database completa, importación de entidades ni writer.
- Cursores acotados, aritmética comprobada, rangos y modelos neutrales son
  fundamentos internos todavía desconectados de la frontera de producto.
- El detector web conserva `nativeSupport:false`; un gate exige paridad exacta
  de sus nueve etiquetas y que el producto siga sin importar este package.
- La matriz exacta está en `CAPABILITIES.md`.

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
