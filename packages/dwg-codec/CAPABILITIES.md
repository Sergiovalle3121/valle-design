# Matriz de capacidades DWG

Esta es la fuente de claims del laboratorio. Describe evidencia técnica del
repositorio, no disponibilidad en el producto. Una promoción exige código,
tests y evidencia independiente del límite relevante.

```text
signatureDetection: supported
boundedBinaryPrimitives: unsupported
ac1015Envelope: unsupported
objectDatabase: unsupported
entityImport: unsupported
cadDocumentMapping: unsupported
dwgExport: unsupported
roundTrip: unsupported
productionAvailable: false
```

## Evidencia del corte 2026-08-09

| Capacidad             | Evidencia                                                                                                       | Límite honesto                                                                                              |
| --------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `signatureDetection`  | El detector web first-party reconoce `AC10xx` en offset 0; su spec pasa 12/12 y mantiene `nativeSupport:false`. | Todavía no existe implementación del laboratorio ni distinción tipada de truncada/desconocida/no soportada. |
| Resto                 | Ninguna implementación aceptada en el laboratorio.                                                              | Gobernanza y schemas no son un decoder.                                                                     |
| `productionAvailable` | Provider de arranque devuelve `available:false`; import/export fallan y el dashboard rechaza `.dwg`.            | No hay provider, endpoint, upload, feature flag, UI ni adapter desde el laboratorio.                        |

Reconocer una firma no significa leer R2000. Leer metadata o un directorio de
secciones no significa importar geometría. Un fixture generado por el mismo
código no demuestra compatibilidad. No se implementa writer en DWG-0.
