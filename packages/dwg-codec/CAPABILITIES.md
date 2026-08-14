# Matriz de capacidades DWG

Esta es la fuente de claims del laboratorio. Describe evidencia técnica del
repositorio, no disponibilidad en el producto. Una promoción exige código,
tests y evidencia independiente del límite relevante.

```text
signatureDetection: supported
boundedBinaryPrimitives: supported
ac1015Envelope: experimental-lab
objectDatabase: experimental-lab-partial
entityImport: unsupported
cadDocumentMapping: unsupported
dwgExport: experimental-lab-writer
roundTrip: experimental-lab-own-corpus
productionAvailable: false
```

## Evidencia del corte 2026-08-14 (DWG-1 fases A–D4)

| Capacidad                 | Evidencia                                                                                                                                                                                                                                                                                     | Límite honesto                                                                                                                                                                                                        |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `signatureDetection`      | `probeDwg` distingue firma truncada/inválida, dos versiones desconocidas y las nueve reconocidas; corpus 21/21 y gate de paridad con el detector web.                                                                                                                                          | Las reconocidas distintas de AC1015 siguen `decoderStatus:"unsupported"`; detectar seis bytes no valida un archivo DWG.                                                                                               |
| `boundedBinaryPrimitives` | Cursores byte/bit, códigos de bits DWG (B…H/TV/MC/MS), CRC-16, aritmética comprobada y tabla de rangos pasan límites, overflow, truncación, duplicados y solapamientos.                                                                                                                        | Fundamentos internos; la evidencia de las constantes del formato es el round-trip de laboratorio, pendiente de corpus real con derechos.                                                                              |
| `ac1015Envelope`          | Cabecera de archivo, marcos de sección con centinelas y CRC, mapa de objetos poblado con paginación y envolturas de objeto se leen y escriben con round-trip byte a byte (fases B–D1).                                                                                                          | Sólo AC1015 (R2000). Los payloads de variables de cabecera y clases siguen opacos con placeholders confesos. Sin validación contra un DWG real.                                                                       |
| `objectDatabase`          | `readAc1015Database` ensambla una base neutral de laboratorio: capas, bloques con contenido y model space. Tipos decodificados EXACTOS: LINE, POINT, CIRCLE, ARC, TEXT, LWPOLYLINE, INSERT (con su referencia a bloque resuelta), BLOCK, ENDBLK, LAYER + control y BLOCK_RECORD + control. | PARCIAL: todo otro tipo se enumera `unsupported` con handle y tipo. ATTRIB/SEQEND, estilos, linetypes, diccionarios, paper space y las variables de cabecera NO se decodifican. Evidencia sólo de corpus first-party. |
| `entityImport`            | Sin cambios: no existe importación en el PRODUCTO.                                                                                                                                                                                                                                              | Ningún provider, endpoint, upload, feature flag, UI ni mapping a `CadDocument`; las specs de frontera conservan el rechazo de `.dwg`.                                                                                 |
| `cadDocumentMapping`      | Sin cambios.                                                                                                                                                                                                                                                                                    | El modelo neutral del laboratorio no toca `CadDocument`.                                                                                                                                                              |
| `dwgExport`               | Writer MÍNIMO de laboratorio: `writeAc1015Container` emite contenedores AC1015 con capas, bloques con contenido, entidades y objetos sintéticos, que el lector propio recupera exactos.                                                                                                        | Es la mitad emisora del round-trip de investigación, no un exportador: flujos de handles con placeholders confesos, sin variables de cabecera reales y sin evidencia ante software ajeno. No hay export en PRODUCTO.  |
| `roundTrip`               | Round-trip estructural completo writer→lector (236 unit + 349 adversarial + fuzz determinista): nombres, pertenencias, geometría y referencia de INSERT exactos.                                                                                                                                | Corpus generado por el mismo laboratorio: prueba consistencia interna, NO compatibilidad con archivos DWG reales ni con software de terceros.                                                                          |
| `productionAvailable`     | Las specs conservan `nativeSupport:false`, provider `available:false` y rechazo de `.dwg`; el gate encuentra cero imports runtime del laboratorio.                                                                                                                                             | La promoción más allá de investigación experimental exige revisión legal externa previa (ADR-0004/0007).                                                                                                              |

Reconocer una firma no significa leer R2000 completo. Leer la base de
laboratorio no significa importar geometría al producto. Un fixture generado
por el mismo código no demuestra compatibilidad con ningún software ajeno y
no se afirma ninguna. El writer es evidencia de round-trip, no un exportador.
