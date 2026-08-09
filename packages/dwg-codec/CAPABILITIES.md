# Matriz de capacidades DWG

Esta es la fuente de claims del laboratorio. Describe evidencia técnica del
repositorio, no disponibilidad en el producto. Una promoción exige código,
tests y evidencia independiente del límite relevante.

```text
signatureDetection: supported
boundedBinaryPrimitives: supported
researchFactRegistry: supported
compatibilityMatrixV1: scope-governed
classRegistryComplete: false
corpusIntake: governed
ac1015Envelope: unsupported
objectDatabase: unsupported
entityImport: unsupported
cadDocumentMapping: unsupported
dwgExport: unsupported
roundTrip: unsupported
productionAvailable: false
```

## Evidencia del corte 2026-08-09

| Capacidad                   | Evidencia                                                                                                                                                                                                                                                                  | Límite honesto                                                                                                                                               |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `signatureDetection`        | `probeDwg` distingue firma truncada/inválida, dos versiones desconocidas y las nueve reconocidas; el baseline actual conserva 21 fixtures sintéticos.                                                                                                                      | Las reconocidas siguen `decoderStatus:"unsupported"`; detectar seis bytes no valida un archivo DWG.                                                          |
| `boundedBinaryPrimitives`   | Cursores byte/bit, endian, alineación, aritmética y tabla de rangos pasan límites, overflow, truncación, duplicados y solapamientos.                                                                                                                                       | Son fundamentos internos; todavía no interpretan un envelope, sección, objeto o entidad DWG.                                                                 |
| `researchFactRegistry`      | `FACT_REGISTER.json`, schema y gates enlazan facts con fuentes, snapshots físicos, términos, hash, revisión y derivados. El manifest DWG-0 fija 80 paths por SHA-256/tamaño contra `98a5b18`; sólo 31 cambios DWG-1 format-neutral tienen admisión exacta y fact conocido. | El registro actual contiene un solo fact de gobernanza y cero facts técnicos del formato; ampliar la admisión exige primero un cambio de tooling revisado.   |
| `compatibilityMatrixV1`     | El gate expande 9 versiones × 2 direcciones × 63 propiedades acotadas por 19 familias y exige cobertura/evidencia por propiedad exacta.                                                                                                                                    | Son 1.134 celdas de **alcance**, no una matriz cerrada de clases DWG. `classRegistryComplete:false` obliga todas a `not-started`; hay cero evidence records. |
| `corpusIntake`              | El gate publicable exige bytes, intake y oracle físicos content-addressed, derechos/privacy, cronología y segundo revisor distinto; el contrato privado valida unicidad y paths/hash.                                                                                      | No se incorporó corpus autorizado o privado. El companion y su CI todavía no existen ni invocan el checker; el baseline 21/109 no es evidencia externa.      |
| `ac1015Envelope` y restante | No hay layout derivado de una fuente permitida ni vector DWG real independiente.                                                                                                                                                                                           | Los fixtures existentes sólo prueban consistencia interna y seguridad de la frontera.                                                                        |
| `dwgExport` y `roundTrip`   | ADR-0008 y la directiva del propietario autorizan investigar e implementar writer first-party bajo los mismos gates.                                                                                                                                                       | No existe writer, byte de salida, validación externa ni round-trip; autorización de programa no equivale a implementación.                                   |
| `productionAvailable`       | Las specs conservan `nativeSupport:false`, provider `available:false` y rechazo de `.dwg`; el gate encuentra cero imports runtime del laboratorio.                                                                                                                         | No hay provider, endpoint, upload, feature flag, UI, adapter, importación, exportación ni mapping a `CadDocument`.                                           |

Reconocer una firma no significa leer R2000. Leer metadata o un directorio de
secciones no significa importar geometría. Un fixture generado por el mismo
código no demuestra compatibilidad. Reader y writer están autorizados como
programa de investigación, pero ambos siguen sin implementarse.
