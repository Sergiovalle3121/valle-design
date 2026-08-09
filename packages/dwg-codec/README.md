# Valle DWG codec research lab

> Investigación experimental interna de interoperabilidad; no disponible en el producto.

Este directorio contiene la gobernanza y, después de superar sus gates, el
laboratorio aislado para una implementación propia y original de Valle. No es
un importador DWG, no está conectado a UI/API/provider y no convierte bytes en
un `CadDocument`.

ADR-0007 autoriza únicamente investigación clean-room. ADR-0003 conserva un
solo documento y kernel semántico; ADR-0004 sigue gobernando la disponibilidad
del producto. La autorización del propietario no es un dictamen jurídico,
licencia sobre DWG, certificación ni permiso para consultar material
restringido.

## Estado del corte de gobernanza

- No hay package manifest, parser, writer, provider ni integración runtime en
  este PR.
- El detector web existente reconoce cabeceras `AC10xx`, pero mantiene
  `nativeSupport:false` y no se importa desde este directorio.
- La duplicación futura de esa gramática sólo se admite temporalmente y bajo un
  gate de paridad; una integración runtime requeriría autorización separada.
- La matriz exacta está en `CAPABILITIES.md`.

## Documentos obligatorios

- `AGENTS.md`: reglas scoped para cualquier agente o contribuidor.
- `CLEAN_ROOM_POLICY.md`: separación, fuentes permitidas y material prohibido.
- `SOURCE_REGISTER.json`: registro estructurado antes de derivar trabajo.
- `THREAT_MODEL.md`: frontera hostil y controles requeridos.
- `CAPABILITIES.md`: claims y evidencia, sin marketing.
- `fixtures/manifest.schema.json`: procedencia obligatoria de cada fixture.

No uses este directorio para guardar material en cuarentena. Una fuente o
fixture bloqueado se registra por metadata, pero sus bytes no entran al
repositorio.
