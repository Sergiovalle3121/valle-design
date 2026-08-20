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

## Estado (corte DWG-1, fases A–D4)

**La fuente única de claims es `CAPABILITIES.md`.** Este resumen existe para
orientar; ante cualquier discrepancia, gana la matriz. La versión anterior de
este bloque decía «no existe object database ni writer» cuando las fases B–D4
ya los habían construido: un README que niega lo que el laboratorio ya hizo es
tan engañoso como uno que promete lo que no hay.

- El package es privado, `UNLICENSED`, estricto y no tiene dependencias runtime.
- **La superficie pública sigue siendo sólo `probeDwg(Uint8Array, options?)`**
  (más límites, registro de versiones y tipos). Reconoce nueve firmas `AC10xx`
  y distingue truncación, firma inválida, versión desconocida y versión
  reconocida; toda firma reconocida sigue devolviendo
  `DWG_VERSION_DECODER_UNSUPPORTED` porque ningún decoder está promocionado.
- **En el laboratorio, NO exportados por `src/index.ts`:** un lector AC1015
  (`src/reader/ac1015-database-reader.ts`, `readAc1015Database`) que ensambla
  una base neutral PARCIAL —LINE, POINT, CIRCLE, ARC, TEXT, LWPOLYLINE, INSERT
  con referencia a bloque resuelta, BLOCK/ENDBLK y las tablas LAYER y
  BLOCK_RECORD; todo lo demás se enumera `unsupported` con handle y tipo— y un
  writer mínimo (`src/writer/ac1015-container-writer.ts`,
  `writeAc1015Container`) que emite contenedores AC1015 que el lector propio
  recupera exactos.
- **El round-trip es de consistencia interna**: corpus generado por el mismo
  laboratorio. No demuestra compatibilidad con archivos DWG reales ni con
  software de terceros, y no se afirma ninguna. La validación contra corpus
  first-party con derechos (fase de corpus) está pendiente.
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
