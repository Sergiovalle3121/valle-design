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

## Estado del baseline DWG-1

- El package es privado, `UNLICENSED`, estricto y no tiene dependencias runtime.
- Las fronteras públicas `probeDwg`, `readDwg` y `writeDwg` son contratos
  fail-closed. El probe hace snapshot de bytes propios y reconoce nueve firmas;
  lectura y escritura no devuelven documento o bytes parciales y permanecen
  explícitamente `unsupported`.
- `getDwgCapabilities()` refleja la matriz v1 por versión, dirección, familia y
  propiedad. Un gate exige paridad exacta con el JSON gobernado y mantiene
  `probe` separado de reader/writer.
- ADR-0008 autoriza construir reader y writer first-party, pero no promueve
  capacidad alguna. `COMPATIBILITY_MATRIX.v1.json` mantiene sus 1.134 celdas
  versión × dirección × familia × propiedad en `not-started` y
  `productionAvailable:false`. Son celdas de alcance, no la matriz cerrada de
  clases: `classRegistryComplete:false` bloquea toda promoción hasta registrar
  `classIds` con facts técnicos autorizados en una revisión futura del schema.
- `FACT_REGISTER.json` impide derivar implementación de hechos sin fuente,
  términos, hash y revisión humana; actualmente no contiene facts técnicos DWG.
- `DWG0_CONTENT_BASELINE.v1.json` fija path, SHA-256 y tamaño de los 80 archivos
  del package en `98a5b18`. Cambios o paths nuevos sólo pasan por una admisión
  exacta, sin globs, ligada al fact concreto; el propio manifest está fijado por
  hash y tamaño dentro del verifier.
- De las 66 rutas admitidas por DWG-1, 65 tienen SHA-256 y tamaño canónico
  fijados. Sólo el módulo que contiene esa tabla no puede fijar su propio hash.
  Reutilizar cualquier otra ruta con contenido distinto falla; actualizar el
  ancla requiere un cambio de tooling separado y revisión humana previa. El
  checker ejecutado desde el mismo candidate no puede demostrar por sí solo esa
  secuencia: branch protection debe impedir fusionar este corte hasta que el
  ancla exista en una base protegida y haya revisión humana independiente.
- El corpus publicable es extensible bajo intake, hash, permiso y oracle. El
  corpus no redistribuible se reserva al repositorio privado compañero y no ha
  sido incorporado en este corte. El companion privado existe vacío; su checker
  y CI endurecidos permanecen en PRs borrador y todavía no admiten bundles.
- Cursores acotados, aritmética comprobada, rangos y modelos neutrales son
  fundamentos internos todavía desconectados de la frontera de producto.
- El protocolo experimental interno de worker no se exporta desde el barrel
  público. Valida cada operación y su resultado de forma explícita, rechaza
  `SharedArrayBuffer` y toma una copia propia antes de entregar bytes al worker.
  Una respuesta hostil o incompleta sólo produce un error tipado; no existe un
  cast genérico que pueda promover un documento parcial. Su presupuesto portable
  es acumulado entre las copias visible, privada, transferida y de respuesta;
  cada transfer list está acotada y sus entradas se cobran. La respuesta sólo
  cruza una frontera first-party que debe presupuestar y transferir sus buffers
  antes de `postMessage`; el marker del adapter declara ese contrato, no lo
  demuestra frente a código hostil.
- Los perfiles de recursos son explícitos: browser limita memoria concurrente a
  128 MiB, objetos a 250 000 y pared a 45 s; API limita memoria a 512 MiB,
  objetos a 1 000 000 y permite reducir/configurar el timeout hasta un tope duro
  de 5 min. Tamaño de archivo, memoria, expansión y trabajo determinista son
  budgets distintos. Estos valores son controles fail-closed, no benchmarks.
- La contabilidad de objetos, colecciones, copias y strings usa estimaciones
  deliberadamente conservadoras y overflow-safe. No pretende medir el heap ni
  la presión de GC exactos de un motor JavaScript; el aislamiento externo sigue
  siendo el backstop para costos que el núcleo no puede observar.
- Los parsers y schedulers del protocolo son componentes first-party internos.
  Una callback síncrona no cooperativa no puede ser interrumpida por JavaScript;
  el límite duro exige ejecutar la operación dentro de un worker real.
- El detector web conserva `nativeSupport:false`; un gate exige paridad exacta
  de sus nueve etiquetas y que el producto siga sin importar este package.
- La matriz exacta está en `CAPABILITIES.md`.

## Verificación

Desde la raíz del repositorio:

```bash
npm run check:dwg
npm run benchmark:smoke --workspace=@valle-design/dwg-codec
```

`check:dwg` valida procedencia, facts, matriz y fixtures, ausencia de I/O,
límites del package, build/typecheck, unitarias, adversariales, fuzz
determinista, paridad de firmas y las tres specs que mantienen DWG fuera del
producto. El benchmark sólo mide; no establece un claim de rendimiento
productivo.

## Flujo para PR posteriores

1. Registra primero la fuente en `SOURCE_REGISTER.json`; no derives nada hasta
   que sus términos y `status:"allowed"` tengan revisión humana.
2. Congela cada hecho mínimo en `FACT_REGISTER.json`, repitiendo source ID,
   locator, SHA-256, tamaño, términos, revisor y todos los `derivedFiles`.
3. En un cambio previo de tooling, admite cada path nuevo de forma exacta y
   declara el fact concreto requerido; no se admiten globs. Después añade el
   archivo tanto al `derivedFiles` del fact como al de la fuente que lo autoriza.
   `check:provenance` falla cerrado ante cambios legacy, borrados, paths no
   admitidos o archivos huérfanos.
4. Registra evidencia física content-addressed en
   `COMPATIBILITY_MATRIX.v1.json` y divide
   selectores de familia/propiedad antes de cambiar el estado de una celda; los
   rows no pueden solaparse ni dejar huecos y cada evidencia debe cubrir la
   propiedad exacta. Productor, herramienta, versión, reviewer y fuentes no se
   infieren de `independent:true`.
5. Todo archivo técnico nuevo requiere un fact `allowed` no-gobernanza y una
   fuente técnica con snapshot verificable. Mientras
   `classRegistryComplete:false`, conserva todas las celdas en `not-started`.

Este flujo de dos cambios permite incorporar nuevos archivos o facts sin que el
mismo candidate pueda ampliar su propia admisión, ni convertir la directiva del
propietario en una fuente técnica.

## Documentos obligatorios

- `AGENTS.md`: reglas scoped para cualquier agente o contribuidor.
- `CLEAN_ROOM_POLICY.md`: separación, fuentes permitidas y material prohibido.
- `SOURCE_REGISTER.json`: registro estructurado antes de derivar trabajo.
- `FACT_REGISTER.json`: hechos mínimos aprobados, hasheados y trazables.
- `COMPATIBILITY_MATRIX.v1.json`: alcance de 9 versiones × 2 direcciones × 63
  propiedades acotadas por sus 19 familias; 1.134 celdas, todavía sin catálogo
  de clases completo.
- `CORPUS_INTAKE.md`: proceso para fixtures públicos y corpus privado.
- `THREAT_MODEL.md`: frontera hostil y controles requeridos.
- `CAPABILITIES.md`: claims y evidencia, sin marketing.
- `fixtures/manifest.json` y su schema: procedencia y expectativas del corpus
  publicable; el baseline actual contiene 21 fixtures sintéticos versionados.

No uses este directorio para guardar material en cuarentena. Una fuente o
fixture bloqueado se registra por metadata, pero sus bytes no entran al
repositorio.
