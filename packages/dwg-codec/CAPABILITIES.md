# Matriz de capacidades DWG

Esta es la fuente de claims del laboratorio. Describe evidencia técnica del
repositorio, no disponibilidad en el producto. Una promoción exige código,
tests y evidencia independiente del límite relevante.

```text
signatureDetection: supported
boundedBinaryPrimitives: supported
ac1015Envelope: unsupported
objectDatabase: unsupported
entityImport: unsupported
cadDocumentMapping: unsupported
dwgExport: unsupported
roundTrip: unsupported
productionAvailable: false
```

## Evidencia del corte 2026-08-09

| Capacidad                   | Evidencia                                                                                                                                             | Límite honesto                                                                                                     |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `signatureDetection`        | `probeDwg` distingue firma truncada/inválida, dos versiones desconocidas y las nueve reconocidas; corpus 21/21 y gate de paridad con el detector web. | Las reconocidas siguen `decoderStatus:"unsupported"`; detectar seis bytes no valida un archivo DWG.                |
| `boundedBinaryPrimitives`   | Cursores byte/bit, endian, alineación, aritmética y tabla de rangos pasan límites, overflow, truncación, duplicados y solapamientos.                  | Son fundamentos internos; todavía no interpretan un envelope, sección, objeto o entidad DWG.                       |
| `ac1015Envelope` y restante | No hay layout derivado de una fuente permitida ni vector DWG real independiente.                                                                      | Los 21 fixtures son sintéticos y sólo prueban consistencia interna y seguridad de la frontera.                     |
| `productionAvailable`       | Las specs conservan `nativeSupport:false`, provider `available:false` y rechazo de `.dwg`; el gate encuentra cero imports runtime del laboratorio.    | No hay provider, endpoint, upload, feature flag, UI, adapter, importación, exportación ni mapping a `CadDocument`. |

Reconocer una firma no significa leer R2000. Leer metadata o un directorio de
secciones no significa importar geometría. Un fixture generado por el mismo
código no demuestra compatibilidad. No se implementa writer en DWG-0.
