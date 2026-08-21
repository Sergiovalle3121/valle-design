# Matriz de capacidades DWG

Esta es la fuente de claims del laboratorio. Describe evidencia técnica del
repositorio, no disponibilidad en el producto. Una promoción exige código,
tests y evidencia independiente del límite relevante.

```text
signatureDetection: supported
boundedBinaryPrimitives: supported
ac1015Envelope: experimental-lab
objectDatabase: experimental-lab
headerVariables: experimental-lab
symbolTables: experimental-lab
r2004Container: experimental-lab
entityImport: unsupported
cadDocumentMapping: experimental-lab-mapping
dwgExport: experimental-lab-writer
roundTrip: external-oracle-verified
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

## Evidencia del intake 2026-08-20 (ola E2): primer corpus DWG independiente

Este corte SUPERA dos límites de la tabla anterior — «Sin validación contra
un DWG real» (`ac1015Envelope`) y «Evidencia sólo de corpus first-party»
(`objectDatabase`) — para el LECTOR, con el primer corpus independiente
admitido: 40 DWG generados por ODA File Converter 27.1 desde DXF de autoría
propia (repo hermano de conformidad, commit `dae5e77`, verificado por hash).

- **Veredicto del harness** (`scripts/dwg/validate-corpus.mjs`, evidencia en
  `docs/cad/evidence/dwg-corpus-validation.json`): los 8 AC1015 reales
  ABREN y las 35 entidades esperadas por los oráculos DXF se leen con
  geometría EXACTA — line 15/15, insert 6/6, circle 3/3, arc 2/2, point
  1/1, lwpolyline 3/3, text 5/5 —, las capas (7/7 y 5/5) con nombre y color
  exactos, y los bloques MARCO-A y PUERTA con su contenido correcto. Cero
  discrepancias abiertas.
- **El corpus corrigió el codec 4 veces** antes de ese veredicto (hechos en
  `VALLE-CORPUS-AC1015-INTAKE-DAE5E77` y DWG0_WORKLOG): el CRC de cabecera
  viaja SIN máscara XOR, el BLOCK HEADER lleva un bit extra antes del punto
  base, la extrusión del INSERT es 3BD y el bit de sin-vínculos a 0 añade
  los punteros anterior/siguiente al flujo. Cada hecho se registró ANTES de
  tocar el código (ADR-0007).
- **Límites que siguen en pie**: los 32 DWG de otras versiones (AC1018/24/
  27/32) NO se abren — otro contenedor. Los estados de la matriz `text` no
  cambian: la promoción de capacidades sigue gobernada por la regla de
  `CORPUS_POLICY.md` y la disponibilidad en producto sigue `false`. Los
  tipos no decodificados se enumeran (159–172 objetos `unsupported` por
  archivo: diccionarios, estilos, linetypes…), los marcadores BLOCK/ENDBLK
  de los espacios quedan sin atar (modo 1/2, sin propietario en el flujo) y
  los `stateFlags` de capa siguen crudos. El corpus es tool-converted desde
  DXF propios: nada aquí afirma compatibilidad con archivos de terceros
  arbitrarios ni con ningún software ajeno.

## Evidencia del corte 2026-08-21 (campaña DWG propio)

Este corte supera varios límites del anterior. Evidencia en
`docs/cad/evidence/` (corpus-validation, decoder-matrix, oda-roundtrip,
roundtrip, r2004-container, structural-fuzz, read-benchmark) y bitácora en
`docs/execution/CAMPANA_DWG_20260821.md`.

| Capacidad | Evidencia | Límite honesto |
| --- | --- | --- |
| `objectDatabase` | Cobertura COMPLETA del corpus AC1015 (25 DWG, dibujos 01–25): toda entidad presente decodifica con geometría EXACTA contra su oráculo DXF — anotación (MTEXT, ATTRIB/ATTDEF/SEQEND atados, las 7 DIMENSION, LEADER, TOLERANCE), polilíneas clásicas (2D/3D/malla/polyface con VERTEX), curvas (ELLIPSE, SPLINE), superficies (SOLID, TRACE, 3DFACE), RAY/XLINE, MLINE, VIEWPORT y HATCH con islas. Matriz diferencial: **0 discrepancias**. | Quedan 32 objetos por archivo sin decodificar, ENUMERADOS con su nombre de clase (VISUALSTYLE, MATERIAL, estilos de tabla/vista). Paper space aún cae a model space con diagnóstico. |
| `headerVariables` | La sección se decodifica COMPLETA (secuencia R2000 íntegra del cap. 9 de la ODS) y el emisor espejo hace round-trip exacto; anclas validadas contra el DXF regenerado por el conversor. | Los condicionales R2004+ de la sección están pendientes de la ola de objetos familia-2004. |
| `symbolTables` | STYLE, LTYPE (con trazos), DIMSTYLE completo, VPORT, APPID, VIEW/UCS/VP-ENT-HDR con controles, DICTIONARY con entradas resueltas, XRECORD, MLINESTYLE, clases y LAYOUT: 57+22+19+1 entradas comparadas contra los oráculos con 0 diferencias. | GROUP/VIEW/UCS/PLOTSETTINGS no existen en el corpus: verificados solo por round-trip de laboratorio. |
| `r2004Container` | 32/32 DWG reales AC1018/24/27/32: cabecera descifrada (CRC32), mapa de páginas, mapa de secciones y descompresión con checksums en dos etapas — las CUATRO secciones AcDb:* localizadas y descomprimidas (`dwg-r2004-container.json`). Seis mediciones corrigieron a la propia ODS y están registradas. **AC1018 (2004) decodifica ENTERO: 8/8 archivos con matriz diferencial en 0 discrepancias** — variables de cabecera sabor R2004, clases, mapa con cota parametrizada y cuerpos normalizados a la forma R2000 por el adaptador medido (bit XDic-Missing, un solo bit de vínculos, CmC 2004 colapsado, BL de poseídos del BLOCK_HEADER); `DWG_VERSION_REGISTRY` declara AC1018 `experimental-lab`. | Los cuerpos R2010+ (AC1024/27/32) exigen BOT + UMC + flujo de strings UTF-16 (hechos registrados): hoy fallan CERRADOS con el motivo exacto. AC1021 (2007) queda fuera por diseño (contenedor Reed-Solomon rediseñado, uso marginal) y se rechaza tipado. |
| `dwgExport` + `roundTrip` | **Un lector ajeno abre nuestros archivos**: `writeAc1015MinimalFile` emite el archivo completo (6 registros, AuxHeader, variables reales, clases, 34 objetos canónicos, mapa, ObjFreeSpace, second header, Template) y el ODA File Converter 27.1 convierte 4/4 casos a DXF sin error, con coincidencia campo a campo (`dwg-oda-roundtrip.json`). | El writer emite el subconjunto line/point/circle/arc/lwpolyline/text/insert; anotación y ATTRIBs de INSERT son pendientes declarados. Sin TrustedDWG: AutoCAD mostrará su aviso — es normal y es legal. |
| `cadDocumentMapping` | Mapeo PURO base-neutral ↔ JSON con la forma del `CadDocument` (esquema 9) con manifiesto de pérdidas en ambos sentidos y round-trip hermético verde; tablas proyectadas (patrones .lin exactos). | Tipos espejo: el codec sigue sin importar el producto (ADR-0007). El adaptador de integración y el núcleo de DIMVARs son del producto (ADR-0009). |
| Blindaje | 1200 mutaciones estructurales de DWG reales: 0 excepciones sin tipar, 0 internal, 0 cuelgues (peor caso 87.5 ms); 8 propiedades encode/decode de bitcodes; benchmark report-only 0.69 MB/s (con la decodificación completa de tablas y diccionarios). | El corpus mutado sigue siendo derivado de dibujos propios; el corpus adversarial de archivos del mundo real es cola de reserva. |

La promoción al producto sigue exigiendo la firma del ADR-0009:
`productionAvailable: false`, provider no disponible y `.dwg` rechazado.
