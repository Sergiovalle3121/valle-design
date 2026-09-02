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
entityImport: product-beta-flag-gated
cadDocumentMapping: product-beta-flag-gated
dwgExport: experimental-lab-writer
roundTrip: external-oracle-verified
productionAvailable: false
```

## Evidencia del corte 2026-08-14 (DWG-1 fases A–D4)

| Capacidad                 | Evidencia                                                                                                                                                                                                                                                                                  | Límite honesto                                                                                                                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `signatureDetection`      | `probeDwg` distingue firma truncada/inválida, dos versiones desconocidas y las nueve reconocidas; corpus 21/21 y gate de paridad con el detector web.                                                                                                                                      | Las reconocidas distintas de AC1015 siguen `decoderStatus:"unsupported"`; detectar seis bytes no valida un archivo DWG.                                                                                               |
| `boundedBinaryPrimitives` | Cursores byte/bit, códigos de bits DWG (B…H/TV/MC/MS), CRC-16, aritmética comprobada y tabla de rangos pasan límites, overflow, truncación, duplicados y solapamientos.                                                                                                                    | Fundamentos internos; la evidencia de las constantes del formato es el round-trip de laboratorio, pendiente de corpus real con derechos.                                                                              |
| `ac1015Envelope`          | Cabecera de archivo, marcos de sección con centinelas y CRC, mapa de objetos poblado con paginación y envolturas de objeto se leen y escriben con round-trip byte a byte (fases B–D1).                                                                                                     | Sólo AC1015 (R2000). Los payloads de variables de cabecera y clases siguen opacos con placeholders confesos. Sin validación contra un DWG real.                                                                       |
| `objectDatabase`          | `readAc1015Database` ensambla una base neutral de laboratorio: capas, bloques con contenido y model space. Tipos decodificados EXACTOS: LINE, POINT, CIRCLE, ARC, TEXT, LWPOLYLINE, INSERT (con su referencia a bloque resuelta), BLOCK, ENDBLK, LAYER + control y BLOCK_RECORD + control. | PARCIAL: todo otro tipo se enumera `unsupported` con handle y tipo. ATTRIB/SEQEND, estilos, linetypes, diccionarios, paper space y las variables de cabecera NO se decodifican. Evidencia sólo de corpus first-party. |
| `entityImport`            | Sin cambios: no existe importación en el PRODUCTO.                                                                                                                                                                                                                                         | Ningún provider, endpoint, upload, feature flag, UI ni mapping a `CadDocument`; las specs de frontera conservan el rechazo de `.dwg`.                                                                                 |
| `cadDocumentMapping`      | Sin cambios.                                                                                                                                                                                                                                                                               | El modelo neutral del laboratorio no toca `CadDocument`.                                                                                                                                                              |
| `dwgExport`               | Writer MÍNIMO de laboratorio: `writeAc1015Container` emite contenedores AC1015 con capas, bloques con contenido, entidades y objetos sintéticos, que el lector propio recupera exactos.                                                                                                    | Es la mitad emisora del round-trip de investigación, no un exportador: flujos de handles con placeholders confesos, sin variables de cabecera reales y sin evidencia ante software ajeno. No hay export en PRODUCTO.  |
| `roundTrip`               | Round-trip estructural completo writer→lector (236 unit + 349 adversarial + fuzz determinista): nombres, pertenencias, geometría y referencia de INSERT exactos.                                                                                                                           | Corpus generado por el mismo laboratorio: prueba consistencia interna, NO compatibilidad con archivos DWG reales ni con software de terceros.                                                                         |
| `productionAvailable`     | Las specs conservan `nativeSupport:false`, provider `available:false` y rechazo de `.dwg`; el gate encuentra cero imports runtime del laboratorio.                                                                                                                                         | La promoción más allá de investigación experimental exige revisión legal externa previa (ADR-0004/0007).                                                                                                              |

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
`docs/history/execution/CAMPANA_DWG_20260821.md`.

| Capacidad                 | Evidencia                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Límite honesto                                                                                                                                                                                                                                            |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `objectDatabase`          | Cobertura COMPLETA del corpus AC1015 (25 DWG, dibujos 01–25): toda entidad presente decodifica con geometría EXACTA contra su oráculo DXF — anotación (MTEXT, ATTRIB/ATTDEF/SEQEND atados, las 7 DIMENSION, LEADER, TOLERANCE), polilíneas clásicas (2D/3D/malla/polyface con VERTEX), curvas (ELLIPSE, SPLINE), superficies (SOLID, TRACE, 3DFACE), RAY/XLINE, MLINE, VIEWPORT y HATCH con islas. Matriz diferencial: **0 discrepancias**.                                                                                                                                                                                                                                                              | Quedan 32 objetos por archivo sin decodificar, ENUMERADOS con su nombre de clase (VISUALSTYLE, MATERIAL, estilos de tabla/vista). Paper space aún cae a model space con diagnóstico.                                                                      |
| `headerVariables`         | La sección se decodifica COMPLETA (secuencia R2000 íntegra del cap. 9 de la ODS) y el emisor espejo hace round-trip exacto; anclas validadas contra el DXF regenerado por el conversor.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Los condicionales R2004+ de la sección están pendientes de la ola de objetos familia-2004.                                                                                                                                                                |
| `symbolTables`            | STYLE, LTYPE (con trazos), DIMSTYLE completo, VPORT, APPID, VIEW/UCS/VP-ENT-HDR con controles, DICTIONARY con entradas resueltas, XRECORD, MLINESTYLE, clases y LAYOUT: 57+22+19+1 entradas comparadas contra los oráculos con 0 diferencias.                                                                                                                                                                                                                                                                                                                                                                                                                                                            | GROUP/VIEW/UCS/PLOTSETTINGS no existen en el corpus: verificados solo por round-trip de laboratorio.                                                                                                                                                      |
| `r2004Container`          | 32/32 DWG reales AC1018/24/27/32: cabecera descifrada (CRC32), mapa de páginas, mapa de secciones y descompresión con checksums en dos etapas — las CUATRO secciones AcDb:* localizadas y descomprimidas (`dwg-r2004-container.json`). Seis mediciones corrigieron a la propia ODS y están registradas. **AC1018 (2004) decodifica ENTERO: 8/8 archivos con matriz diferencial en 0 discrepancias** — variables de cabecera sabor R2004, clases, mapa con cota parametrizada y cuerpos normalizados a la forma R2000 por el adaptador medido (bit XDic-Missing, un solo bit de vínculos, CmC 2004 colapsado, BL de poseídos del BLOCK_HEADER); `DWG_VERSION_REGISTRY` declara AC1018 `experimental-lab`. | Los cuerpos R2010+ (AC1024/27/32) exigen BOT + UMC + flujo de strings UTF-16 (hechos registrados): hoy fallan CERRADOS con el motivo exacto. AC1021 (2007) queda fuera por diseño (contenedor Reed-Solomon rediseñado, uso marginal) y se rechaza tipado. |
| `dwgExport` + `roundTrip` | **Un lector ajeno abre nuestros archivos**: `writeAc1015MinimalFile` emite el archivo completo (6 registros, AuxHeader, variables reales, clases, 34 objetos canónicos, mapa, ObjFreeSpace, second header, Template) y el ODA File Converter 27.1 convierte 4/4 casos a DXF sin error, con coincidencia campo a campo (`dwg-oda-roundtrip.json`).                                                                                                                                                                                                                                                                                                                                                        | El writer emite el subconjunto line/point/circle/arc/lwpolyline/text/insert; anotación y ATTRIBs de INSERT son pendientes declarados. Sin TrustedDWG: AutoCAD mostrará su aviso — es normal y es legal.                                                   |
| `cadDocumentMapping`      | Mapeo PURO base-neutral ↔ JSON con la forma del `CadDocument` (esquema 9) con manifiesto de pérdidas en ambos sentidos y round-trip hermético verde; tablas proyectadas (patrones .lin exactos).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Tipos espejo: el codec sigue sin importar el producto (ADR-0007). El adaptador de integración y el núcleo de DIMVARs son del producto (ADR-0009).                                                                                                         |
| Blindaje                  | 1200 mutaciones estructurales de DWG reales: 0 excepciones sin tipar, 0 internal, 0 cuelgues (peor caso 87.5 ms); 8 propiedades encode/decode de bitcodes; benchmark report-only 0.69 MB/s (con la decodificación completa de tablas y diccionarios).                                                                                                                                                                                                                                                                                                                                                                                                                                                    | El corpus mutado sigue siendo derivado de dibujos propios; el corpus adversarial de archivos del mundo real es cola de reserva.                                                                                                                           |

## Evidencia del intake 2026-08-23 (AC1024/27/32: dos hechos del envoltorio, BOT bloqueado)

Intento de decodificar cuerpos de objeto R2010+ (AC1024). Dos hechos nuevos
confirmados por medición original sobre el corpus admitido (commit `a60ebe2`,
430 objetos reales) y registrados en `SOURCE_REGISTER.json` antes del código
(ADR-0007) — detalle completo en `DWG0_WORKLOG.md`:

- El marco de sección de datos R2010+ (AcDb:Header/AcDb:Classes) usa un
  campo de tamaño de 8 bytes, no 4 (`readR2004SectionFrame` acepta
  `sizeFieldWidth`). 7/7 mediciones, 0 discrepancias.
- La envoltura de objeto R2010+ dentro de AcDb:AcDbObjects NO lleva tamaño en
  bytes al frente: el CRC-16 cubre el cuerpo completo y el límite de cada
  objeto lo da el offset del siguiente en el mapa de handles. Nuevo
  `container/r2010-object-envelope.ts`. 430/430 objetos reales, coincidencia
  única, 0 discrepancias.
- Dentro de ese envoltorio se identificó de forma independiente (búsqueda bit
  a bit de sus extremos IEEE-754) el objeto LINEA real de `02-una-linea.dwg`
  (AC1024): confirma que la codificación por campo de la geometría no cambia
  para R2010+.

**Límite honesto sin suavizar** (SUPERADO el 2026-08-31 — ver el corte de
esa fecha al final de este archivo; el párrafo original se conserva porque
así se lee la historia real): la codificación BOT (2 bits + valor) del
tipo de objeto sigue **sin fuente registrada suficiente** para decodificarse
sin adivinar — el hecho ya registrado la nombra pero no fija la tabla
selector→ancho de valor. Con el LINE ya identificado, las descomposiciones
más simples de los bits que preceden a su handle propio (anchos de valor 8,
16 y 32 bits) NO reprodujeron el código LINE=0x13 ya confirmado para
R2000/AC1018. Esta línea se detiene declarada `BLOCKED_BY_SOURCE_GATE`: los
dos módulos nuevos NO se conectan a `readR2004Database`, que sigue lanzando
`DWG_VERSION_DECODER_UNSUPPORTED` para AC1024/AC1027/AC1032 sin cambio de
comportamiento observable. `DWG_VERSION_REGISTRY` mantiene las tres versiones
en `decoderStatus: "unsupported"`.

La promoción al producto sigue exigiendo la firma del ADR-0009:
`productionAvailable: false`, provider no disponible y `.dwg` rechazado.

## Evidencia del corte 2026-08-24 (integración de producto: beta V1→V3, AC1018)

Este corte SUPERA el límite `entityImport: unsupported`/`cadDocumentMapping:
experimental-lab-mapping` de la tabla del corte 2026-08-14 — para el perfil
exacto descrito abajo, no para DWG en general. El dueño firmó ADR-0009
§6-bis (2026-08-24): la importación DWG entra al producto real, detrás de
dos flags apagados por defecto en producción pública
(`NEXT_PUBLIC_DWG_NATIVE_IMPORT_BETA`, `NEXT_PUBLIC_DWG_AC1018_IMPORT_BETA`).

- **Punto único de entrada en runtime**: `apps/web/src/lib/cad/dwg-native-reader.ts`,
  el único archivo autorizado a importar `@valle-design/dwg-codec` fuera del
  propio paquete (`scripts/dwg/check-product-boundary.mjs` falla si cualquier
  otro archivo lo referencia). Consumido únicamente por
  `document-import.worker.ts` (Web Worker, import dinámico sólo para `.dwg`).
- **Perfil de entidades `AC1015_MODELSPACE_2D_V3`**: LINE, POINT, CIRCLE,
  ARC, LWPOLYLINE, TEXT, INSERT (§6-bis/V1), ELLIPSE y SPLINE no racional de
  escenario 1 (§6-ter/V2), MTEXT, DIMENSION salvo angular de dos líneas, y
  HATCH de contorno poligonal (§6-quater/V3). Model space únicamente: dentro
  de un bloque, MTEXT/DIMENSION/HATCH caen al mismo diagnóstico genérico que
  cualquier tipo sin representación ahí (tampoco lo tienen para DXF).
- **AC1018 (2004)**: mecanismo de autorización DISTINTO
  (`DWG_AC1018_BETA_AUTHORIZATION`, ADR-0009 §7), su propia variable de
  build, y exige la beta base también encendida — nunca una ampliación
  silenciosa. `readDwg` ya despachaba AC1018 al mismo `DwgDatabase` que
  AC1015 desde antes de esta integración (§1.2); el perfil de entidades no
  cambia por versión.
- **Mapeo al documento canónico**: `apps/web/src/lib/cad/dwg-document-bridge.ts`
  (más `dwg-document-bridge-primitives.ts`) proyecta la base neutral al mismo
  `CadDocument` que DXF, reutilizando los consumidores ya probados
  (`cadDxfPrimitivesToCanonicalEntities`, `cadDxfMTextsToNativeEntities`,
  `cadDxfSemanticDimensionsToNativeEntities`, `cadDxfHatchesToNativeEntities`).
  Falla cerrado si el mapeo no produce ni una entidad ni un bloque.
- **Límite honesto sin suavizar**: `productionAvailable` sigue `false` — esto
  es una beta acotada, no disponibilidad general. `legalReviewCleared` sigue
  `false` en `DWG_PROMOTION_GATES` (dictamen jurídico en paralelo, no
  resuelto). Unidades (INSUNITS) se asumen en milímetros sin poder
  confirmarlas contra el archivo — declarado como pérdida en cada
  importación, no adivinado en silencio. **Corregido el 2026-08-31**: este
  párrafo decía que el camino de LECTURA no decodificaba esa variable de
  cabecera, y desde el PR #101 sí lo hace
  (`reader/ac1015-database-reader.ts` la decodifica y la pasa a
  `assembleDatabase`, y el puente del producto la consume). Ningún corte
  posterior lo corrigió; se corrige aquí sin reescribir el corte original. `stateFlags` de capa viaja crudo por la misma razón que ya
  declaraba el corte 2026-08-14: su semántica bit a bit no está confirmada
  contra corpus real para el binario DWG. Sin exportación DISPONIBLE en el
  producto: el writer AC1015 sigue siendo capacidad de laboratorio.
  **Precisado el 2026-08-31**: decir "sin exportación conectada" se quedaba
  corto en un sentido que importa. Sí existe un segundo punto de entrada
  autorizado en el producto (`apps/web/src/lib/cad/dwg-native-writer.ts`,
  ADR-0009 §8), pero está CERRADO por su propio gate —
  `externalOracleVerified: false` en `dwg-export-flag.ts` — y no tiene
  consumidor: ningún botón, ninguna UI, ningún endpoint. Lo que abriría ese
  gate es correr el oráculo externo sobre el corpus admitido, y eso es una
  OWNER ACTION: el conversor sólo existe en la máquina del titular.

## Evidencia del corte 2026-08-25 (M5: `writeCanonicalDwg`, función pública de escritura)

ADR-0009 §8 autorizó EMPEZAR M5 (exportación DWG) el 2026-08-25, exigiendo
explícitamente, ANTES de cablear nada al producto, "que exista una función
pública de escritura en el laboratorio (equivalente a `readDwg` en
`api/read.ts`)" verificada con la misma disciplina de `check:dwg` que ya
rige la lectura (§8.2). Este corte entrega esa función — **no** la
integración de producto, que sigue siendo trabajo posterior y su propia
autorización, ni tampoco declara cumplido §8.2 (ver el límite honesto abajo).

- **`writeCanonicalDwg`** (`packages/dwg-codec/src/api/write.ts`, exportada
  desde `index.ts`): documento canónico → archivo AC1015 completo, tan
  delgada como `readDwg` — sin I/O, determinista, cero geometría propia.
  Encadena dos piezas YA VERIFICADAS: `canonicalDocumentToDwgEntities`
  (documento → entidades escribibles) y `writeAc1015MinimalFile` (entidades
  → archivo completo). Cubre las siete clases que autoriza ADR-0009 §8.1:
  LINE, POINT, CIRCLE, ARC, LWPOLYLINE, TEXT, INSERT — el mismo subconjunto
  que el writer de bajo nivel, ni una clase más.
- **POINT cerrado en `canonicalDocumentToDwgEntities`**: el mapeo
  documento-canónico→DWG tenía un `case` faltante para POINT pese a que el
  writer de bajo nivel ya lo escribía completo (confirmado leyendo
  `ac1015-entity-writer.ts` antes de tocar código) y pese a que el propio
  comentario de la función ya lo listaba como soportado — una promesa
  documentada sin implementación, cerrada en este corte, no una capacidad
  nueva más allá de lo que ADR-0009 §8.1 ya nombraba.
- **Límite ASCII declarado de nombres de capa/bloque**: el archivo mínimo
  exige `readonly number[]` (bytes), no `string`, para nombres; esta fase
  sólo resuelve nombres ASCII (1 a 255 caracteres, ninguno por encima de 127) — el mismo límite que hoy sólo vivía ad-hoc en el helper `ascii()`
  de `oda-roundtrip.mjs`, aquí hecho explícito y con pérdida declarada. Un
  nombre fuera de ese límite nunca se trunca ni se transcribe a medias: una
  capa así declarada cae a la capa "0" (pérdida `layer-name-not-ascii`, la
  entidad se sigue escribiendo) y un INSERT hacia un bloque así declarado
  se omite del archivo entero (pérdida `insert-block-name-not-ascii`) —
  insertar en "0" en vez del bloque pedido dibujaría algo distinto, así que
  ahí no hay _fallback_, sólo omisión declarada.
- **El contenido de un bloque de usuario no viaja todavía**: un INSERT
  referenciado obtiene un `BLOCK_RECORD` real y vacío (para que la
  referencia resuelva) con su propia pérdida declarada
  (`insert-block-content-not-written`); mapear `document.blocks[].entities`
  queda pendiente de una fase posterior de esta ola de escritura, no de
  este primer contrato público.
- **Round-trip PROPIO verde**: `tests/unit/write-canonical-dwg.spec.ts`
  cubre las siete clases autorizadas ida y vuelta por `writeCanonicalDwg` →
  `readDwg` (tolerancia 1e-6, la misma que usa el harness del oráculo), el
  límite ASCII de capa Y de bloque con su pérdida declarada, una clase
  fuera de perfil (`canonical-type-not-writable`, código ya existente, sin
  necesidad de uno nuevo) y determinismo. `npm run check` del paquete
  (provenance, fixtures, no-io, boundary, build, typecheck, unit,
  adversarial, fuzz) queda en verde con este contrato incluido.
- **`scripts/dwg/oda-roundtrip.mjs` ampliado, sin ejecutar aquí**: el caso
  `figuras` suma una entidad POINT (antes sin cobertura en ese harness) y
  su comparador gana un `case "point"`. Verificado de forma independiente
  contra el lector propio en este entorno (archivo bien formado, abre sin
  diagnósticos, POINT recuperado exacto) — lo único que este entorno no
  puede hacer es invocar el binario del ODA File Converter.

**Límite honesto sin suavizar — lo que este corte NO entrega**: la mitad
del oráculo EXTERNO que exige ADR-0009 §8.2 sigue PENDIENTE. El ODA File
Converter sólo corre en Windows (máquina del propietario) y no está
disponible en este entorno; el caso POINT añadido a `oda-roundtrip.mjs`
queda listo pero SIN CORRER. Los cuatro casos ya verificados en
`docs/cad/evidence/dwg-oda-roundtrip.json` son ANTERIORES a
`writeCanonicalDwg` y sólo prueban `writeAc1015MinimalFile` con sus
opciones de bajo nivel armadas a mano — no ejercitan la resolución de
nombres ni el manifiesto de pérdidas que esta función añade, así que no se
reclaman como evidencia de este contrato nuevo. Sigue sin existir ninguna
integración de producto, ningún flag, ningún botón "Exportar como DWG":
tanto el writer AC1015 de bajo nivel como `writeCanonicalDwg` siguen siendo
capacidad de laboratorio.

## Evidencia del corte 2026-08-31 (encabezado de objeto R2010+)

| Capacidad                                 | Estado             | Límite honesto                                                                                             |
| ----------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------- |
| Encabezado de objeto AC1024/AC1027/AC1032 | `experimental-lab` | Sólo el ENCABEZADO: tamaño, tamaño del flujo de handles, tipo y handle propio. El CUERPO no se decodifica. |

Lo que el corte 2026-08-23 dejó `BLOCKED_BY_SOURCE_GATE` queda **resuelto por
medición first-party**, sin fuente documental nueva y sin consultar ninguna
implementación ajena. El propio corte anterior había nombrado la salida —
_"hacen falta más identificaciones independientes (más tipos, no sólo LINE)"_ —
y esas identificaciones ya estaban en el corpus admitido: los cinco bundles
fundacionales son los mismos ocho dibujos en cinco contenedores, así que el
gemelo AC1015 da el tipo esperado de **cada** handle, no de uno.

El encabezado medido es `MS` tamaño · `UMC` tamaño EN BITS del flujo de
handles · `BOT` tipo · `H` handle propio. El sondeo anterior no podía cerrar
porque buscaba el tipo al frente del cuerpo, y delante de él van esos dos
campos.

- **Falsación primaria**, independiente de toda hipótesis sobre el tipo: el
  handle propio viaja pegado detrás del `BOT` y el mapa ya dice cuál debe ser.
  Sale exacto en **2893/2893** objetos de los 24 fixtures.
- **Falsación secundaria**: el tipo coincide con el del gemelo AC1015 en
  **1353/1413** comparaciones de tipo fijo; **AC1027 351/351** y **AC1032
  351/351** sin una sola discrepancia. Las 60 restantes son todas AC1024 y
  todas del par DICTIONARY/XRECORD en handles contiguos — el conversor los
  numeró al revés, así que el gemelo no es la misma pieza.

**Capacidad ausente declarada**: los selectores 2 y 3 del `BOT` no aparecen ni
una vez en los 2893 objetos. Sin una sola observación no se puede saber su
ancho, y un ancho inventado daría un tipo plausible y equivocado que además
desalinea todo lo que viene detrás. `readBOT` falla cerrado ante ambos.

**Nada se promueve.** `readR2004Database` sigue lanzando
`DWG_VERSION_DECODER_UNSUPPORTED` para las tres versiones y
`DWG_VERSION_REGISTRY` las mantiene en `decoderStatus: "unsupported"`. Lo que
cambia es dónde está la frontera: ya no es el TIPO sino el CUERPO, cuyo flujo
de datos separa las cadenas y cambia la cabecera común de entidad. Se probó
reconstruir la forma R2000 y reusar los decodificadores existentes barriendo
todos los `bitsize` posibles: ninguno hace decodificar una LINE real.

Evidencia: `docs/cad/evidence/dwg-r2010-object-header.json`, reproducible con
`node scripts/dwg/probe-r2010-object-header.mjs`.

## Evidencia del corte 2026-08-31 (continuación: CUERPO de objeto R2010+ para entidades sin cadenas)

| Capacidad                                                                   | Estado             | Límite honesto                                                                                                                                                    |
| --------------------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cuerpo de objeto AC1024/AC1027/AC1032 para LINE/POINT/CIRCLE/ARC/LWPOLYLINE | `experimental-lab` | Sólo estas cinco entidades, sin flujo de handles resuelto (owner/capa/xdictionary). Cualquier entidad CON cadena, o cualquier otro tipo, sigue sin decodificador. |

El corte anterior de esta misma fecha (encabezado: MS/UMC/BOT/H) dejó dicho,
sin suavizar, qué faltaba: _"decodificar el ENCABEZADO no decodifica el
CUERPO... el flujo de datos R2010+ separa las cadenas a un flujo propio y su
cabecera común de entidad difiere de la R2000"_. Este corte resuelve esa parte
para las cinco entidades que **nunca** llevan cadena — ni LINE, POINT, CIRCLE,
ARC ni LWPOLYLINE tienen un solo campo TV — con el mismo oráculo diferencial
que resolvió el encabezado: los cinco bundles fundacionales son los mismos
ocho dibujos en cinco contenedores, así que el gemelo AC1015 da geometría
exacta de cada handle de antemano.

- **Localización sin hipótesis de forma**: se buscó, bit a bit, el primer
  offset donde 8 bytes reproducen el double IEEE-754 exacto del primer campo
  geométrico del gemelo (la misma técnica que ya había identificado la LINE
  real de `02-una-linea.dwg` en el intake 2026-08-23). El resultado, sin
  asumir nada sobre la disposición interna: el dato de TIPO arranca a una
  distancia FIJA del handle propio — 39 bits en AC1024, 40 en AC1027 y
  AC1032 — la MISMA cifra para los cuatro tipos con campo inicial simple
  dentro de cada versión, pese a que cada uno resta una cantidad distinta de
  bits de su propio prefijo. Esa coincidencia ENTRE TIPOS es la falsación: un
  ancho equivocado en cualquier campo previo los habría desalineado de forma
  DISTINTA, no a la misma cifra.
- **La cabecera común de entidad R2000 no cambia de anchura** (EED, gráfico,
  modo, reactores, sin-vínculos/xdic-missing, color, escala de tipo de línea
  y banderas — hechos ya registrados de ODA-ODS-DWG-5.4.1-PUBLIC) para los 72
  objetos medidos, todos con EED ausente, sin gráfico, 0 reactores y modo de
  entidad 2 (model space directo). Tras esos 16 bits queda un tramo
  intermedio de anchura MEDIDA (23/24 bits) cuya semántica NO se identificó:
  **capacidad ausente declarada**, tratado como opaco en vez de adivinado.
- **Se reutilizan, sin cambio alguno, los MISMOS decodificadores de tipo que
  R2000** (`decodeLine`/`decodePoint`/`decodeCircle`/`decodeArc`/
  `decodeLwPolyline`) — cero decodificadores gemelos.
- **Hecho nuevo sobre el encabezado ya resuelto**: `objectSize` (el campo
  `MS`) excluye sus propios bytes y los del campo `UMC` que lo precede — el
  límite del flujo de handles se calcula con `bodyBytes.length`, nunca con
  `objectSize`. El intake del encabezado no lo necesitó notar porque nunca
  leyó más allá del handle propio.
- **El bit de presencia de cadenas** que el hecho registrado de
  ODA-ODS-DWG-5.4.1-PUBLIC ya nombraba ("AC1021+ introduce el flujo de
  STRINGS separado al final del cuerpo... el bit de presencia del final del
  dato") se localizó EXACTAMENTE un bit antes del flujo de handles, en valor
  0, en las 72 observaciones. Un objeto con ese bit en 1 falla cerrado: el
  flujo de strings no se decodifica.
- **Falsación**: geometría EXACTA (tolerancia 1e-6) contra el gemelo AC1015
  en **72/72** objetos (LINE, POINT, CIRCLE, ARC, LWPOLYLINE) de los 24
  fixtures AC1024/AC1027/AC1032, con aterrizaje EXACTO en el límite de
  handles en **72/72** — dos falsaciones independientes.

**Capacidad ausente declarada, sin suavizar**: el flujo de handles
(propietario, capa, xdictionary) NO se decodifica para R2010+ en este corte,
así que `readR2004Database` sigue sin poder ensamblar una base neutral
completa para AC1024/AC1027/AC1032 — sigue lanzando
`DWG_VERSION_DECODER_UNSUPPORTED`, ahora nombrando esa frontera exacta. La
anchura fija del tramo intermedio sólo está validada para el único caso que
este corpus ejercita (banderas por defecto); el chequeo de aterrizaje final
detecta la mayoría de los desalineamientos que un valor distinto produciría,
pero no lo garantiza matemáticamente — el mismo tipo de riesgo residual que ya
acepta el adaptador R2004→R2000 de AC1018. `readR2010EntityBody`
(`reader/r2010-entity-body.ts`) vive como capacidad de laboratorio
independiente, sin conectar a `readR2004Database` todavía.

Evidencia: `docs/cad/evidence/dwg-r2010-object-body.json`, reproducible con
`node scripts/dwg/probe-r2010-object-body.mjs`.

## Evidencia del corte 2026-08-31 (escritura: ELLIPSE/MTEXT y contenido de bloque)

Frente de ESCRITURA (una de tres sesiones paralelas). SUPERA, para el subconjunto
exacto que describe abajo, el límite «El writer emite el subconjunto
line/point/circle/arc/lwpolyline/text/insert» del corte 2026-08-21 — a nivel
de writer de BAJO NIVEL (`writeAc1015EntityBody`/`writeAc1015MinimalFile`),
NO del contrato público `writeCanonicalDwg` (ver límite honesto abajo: ese
contrato sigue en las mismas siete clases).

| Capacidad                                                       | Evidencia                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Límite honesto                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dwgExport` (bajo nivel)                                        | `ac1015-entity-writer.ts` gana ELLIPSE y MTEXT, espejo campo a campo de `decodeEllipse`/`decodeMText` — confirmado que ninguna de las dos necesita el `textStyleHandle` que sí exige TEXT ni handles extra en la cabeza del flujo, así que entran por el mismo camino genérico que CIRCLE/ARC sin tocar `ac1015-minimal-file-writer.ts`. Round-trip propio verde: `tests/unit/ac1015-entity-writer-v3.spec.ts` (9 casos — geometría exacta con −0.0 y ejes no canónicos, determinismo, dentro de un bloque, gemelos tristes).                                                                                                                                                                                                                                                                                    | Consistencia interna writer→lector propio, NO evidencia de compatibilidad con software ajeno (el ODA File Converter no corre en este entorno). DIMENSION, HATCH, SPLINE, POLYLINE clásica con VERTEX/SEQEND y ATTRIB de INSERT siguen `"Writing a ... entity is not implemented by the laboratory writer yet."`, sin cambio.                                                                                                                                                                                                                                                                                                            |
| `dwgExport` (contenido de bloque, `writeCanonicalDwg`)          | El contenido de un bloque de usuario YA VIAJA (antes: `BLOCK_RECORD` siempre vacío con pérdida `insert-block-content-not-written`). `Ac1015MinimalFileBlockSpec.entities` pasa a la misma forma `Ac1015MinimalFileEntitySpec[]` que model space (capa por índice, INSERT anidado por índice de bloque — el handle de cada `BLOCK_RECORD` ya está resuelto por adelantado, así que un bloque puede insertar OTRO declarado después en el array). `api/write.ts` reusa `canonicalDocumentToDwgEntities` — sin tocar `api/canonical.ts` — sobre un documento sintético cuyas `entities` son las del bloque. Verde en `tests/unit/ac1015-minimal-file.spec.ts` (bloque que inserta otro, referencia hacia adelante) y `tests/unit/write-canonical-dwg.spec.ts` (geometría Y capa exactas dentro del `BLOCK_RECORD`). | El contenido de un bloque sigue sujeto a las MISMAS siete clases que `canonicalDocumentToDwgEntities` mapea (line/point/circle/arc/lwpolyline/text/insert) — ELLIPSE/MTEXT nuevos de esta sesión NO llegan todavía a `writeCanonicalDwg` porque esa función de mapeo vive en `api/canonical.ts`, fuera de la frontera de archivos de esta sesión. Un INSERT dentro de un bloque (bloque que inserta OTRO bloque) se detecta y se omite con pérdida declarada (`insert-block-nested-insert-not-written`): el writer de bajo nivel ya lo resolvería, pero recorrer el grafo transitivo completo de bloques referenciados queda pendiente. |
| Botón de producto (`dwg-native-writer.ts`/`dwg-export-flag.ts`) | Sin cambios: ya estaban completos y correctos de una campaña anterior (tres estados éxito/éxito_con_pérdidas/rechazado, preflight, manifiesto de pérdidas). `DWG_EXPORT_WRITABLE_TYPES` ya es exactamente el subconjunto de siete clases que `canonicalDocumentToDwgEntities` mapea, así que sigue exacto sin tocar el archivo.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `externalOracleVerified: false` sigue en pie — sigue siendo OWNER ACTION (el conversor sólo corre en la máquina del titular). Ningún botón, ninguna UI, ningún endpoint nuevo.                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

**No alcanzado esta sesión, declarado sin suavizar**: writer AC1018 (M4 de
escritura; el contenedor R2004 que el lector ya conoce sigue sin un writer
propio), DIMENSION/HATCH/SPLINE/POLYLINE clásica/ATTRIB en el writer de bajo
nivel, y cualquier ampliación del perfil escribible de `writeCanonicalDwg`
más allá de las siete clases de §8.1 (exige tocar `api/canonical.ts`, de
otra sesión). `productionAvailable` sigue `false`.

Evidencia: `tests/unit/ac1015-entity-writer-v3.spec.ts`,
`tests/unit/ac1015-minimal-file.spec.ts`, `tests/unit/write-canonical-dwg.spec.ts`;
`npm run check --workspace=@valle-design/dwg-codec` y `npm run check:dwg`
(raíz) en verde.

## Evidencia del corte 2026-08-31 (cableado de producto propuesto: perfil 3D heredado, ADR-0009 §9)

Este corte NO añade decodificación al laboratorio: 3DFACE, POLYLINE 3D,
POLYLINE MESH y POLYLINE PFACE ya se leían con fidelidad exacta desde el
corte 2026-08-21 (`objectDatabase` de esa fecha). Lo que cambia es que,
hasta hoy, ninguno de los cuatro cruzaba al perfil de PRODUCTO
(`AC1015_MODELSPACE_2D_V3`): caían al mismo diagnóstico "fuera de perfil"
que cualquier tipo sin representación ahí — nunca "no decodificado", esa
distinción ya la exigía la disciplina del laboratorio.

- **Perfil nuevo PROPUESTO, `AC1015_3D_WIREFRAME_V1`** (ADR-0009 §9): su
  propio flag (`NEXT_PUBLIC_DWG_3D_WIREFRAME_IMPORT_BETA`), su propia
  autorización (`DWG_3D_WIREFRAME_BETA_AUTHORIZATION`), la misma
  conjunción de tres condiciones que ya usa AC1018 — **sin firmar**:
  `ownerSigned` es `false`, así que el flag no tiene efecto observable en
  ningún entorno hoy, encendido o no.
- **Cableado de producto completo, probado, con la puerta cerrada**:
  `apps/web/src/lib/cad/dwg-native-reader.ts` (filtro independiente del de
  V3, conjuntos de tipos disjuntos), `dwg-neutral-model.ts` (ocho variantes
  nuevas: los cuatro tipos de cabecera más sus VERTEX/cara hijos),
  `dwg-document-bridge.ts`/`-primitives.ts` (mapeo a `CadOpaqueEntity` con
  geometría REAL — Z verdadera, sin aplanar — declarada en el manifiesto de
  pérdidas). Dos specs nuevas verifican el filtro puro y el mapeo completo
  contra bytes hechos a mano.
- **Límite honesto sin suavizar**: el writer del laboratorio no emite estos
  cuatro tipos (sólo LINE/POINT/CIRCLE/ARC/LWPOLYLINE/TEXT/INSERT, ADR-0009
  §8.1), así que las specs nuevas no pueden usar bytes DWG reales generados
  aquí — igual que ya le pasa a ELLIPSE/SPLINE/MTEXT/DIMENSION/HATCH en
  `dwg-native-reader.spec.ts`. La evidencia contra archivos DWG reales
  depende de la ola 3 del corpus hermano (PR `valle-design-dwg-conformance#6`,
  fixtures 26–30: POLYLINE 3D con Z distinta por vértice, mallas 7×9 y 5×5
  cerrada en N, polyface con índices negativos, seis 3DFACE con banderas de
  arista), que sigue SIN ADMITIR — requiere el ODA File Converter (máquina
  del titular) y firma de revisor. No se maquilla esa ausencia.
- **No se genera `solid3d` ni `region`**: 3DFACE/PFACE no garantizan una
  malla cerrada y manifold, así que tratarlos como sólidos importados sería
  una promesa que el dato no respalda. El destino es
  `unsupportedEntities`/`CadOpaqueEntity` (`editable: false`), su primer
  productor real en el producto — antes sólo existía en el tipo y en specs
  con datos inventados (`ACAD_PROXY_ENTITY`).

Nada de esto cambia `entityImport`/`cadDocumentMapping` en la matriz de
arriba: siguen siendo `product-beta-flag-gated`, y este corte NO enciende
ningún flag — sólo dos de los tres YA firmados (V3, AC1018) tienen efecto
en producción, y siguen apagados por defecto ahí también.

## Evidencia del corte 2026-08-31 (preservación opaca ACIS: 3DSOLID/REGION/BODY — laboratorio, escalón 4a)

`packages/dwg-codec/src/objects/entities-acis.ts` (nuevo): captura el
cuerpo de un objeto ACIS (3DSOLID/REGION/BODY) como bytes crudos, sin
interpretar un solo bit de su contenido — ACIS es formato de Spatial/
Dassault, no de ODA, y este laboratorio no lo necesita entender para
preservarlo. Usa exclusivamente hechos YA REGISTRADOS (la cabecera común de
entidad y el límite `bitSize`, reutilizados sin cambios de otros veinte
tipos ya decodificados): **cero fuentes nuevas consultadas**. 7/7 specs
unitarias (`tests/unit/entities-acis.spec.ts`) verifican captura byte-exacta
sobre cuerpos sintéticos compuestos con el writer real
(`ac1015-entity-writer.ts`), incluida la reconstrucción bit a bit cuando la
cabecera común no termina alineada a byte (el caso real: el writer no la
alinea). `packages/dwg-codec/src/api/canonical.ts` gana un caso dedicado
que proyecta un objeto ACIS a `CanonicalOpaqueEntity` con el nombre de
clase real como `sourceType` (1 spec nueva).

**Límite honesto, sin suavizar — el porqué de "laboratorio" y no
"producto todavía"**: 3DSOLID/REGION/BODY son tipos de CLASE de AutoCAD
2000+, sin código BS fijo (a diferencia de LINE=0x13/CIRCLE=0x12/etc.): su
código numérico varía POR ARCHIVO según el orden de la sección CLASSES, y
se resuelve por NOMBRE. El despachador de este directorio
(`DECODED_ENTITY_TYPES` en `entities-core.ts`) es un `Set<number>` de
códigos FIJOS — no hay ningún número que darle a un tipo de clase. La
resolución por nombre YA EXISTE, pero sólo en el LECTOR de base
(`AC1015_ENTITY_BODY_TYPES`/`decodeMappedObject`/`classNames`,
`src/reader/database-assembly.ts`), territorio de otro frente de trabajo de
esta misma campaña. Conectar `decodeAcisOpaqueEntityBody` exige que ese
despachador, al resolver un objeto cuyo nombre de clase sea exactamente
"3DSOLID"/"REGION"/"BODY", lo llame en vez de cerrar como `unsupported` —
un cambio real, no cosmético, que vive fuera de este corte.

**Efecto en el producto**: ninguno. No hay integración de producto para
ACIS en este corte —a diferencia del perfil 3D heredado (ADR-0009 §9),
construir el lado de producto (`apps/web`) para una forma que
`readDwg` no puede producir todavía sería código sin evidencia ejecutable
real, justo lo que esta campaña prohíbe. `readDwg` sigue sin decodificar
3DSOLID/REGION/BODY de ningún archivo real: hoy siguen cayendo en
`unsupported`, enumerados, nunca callados — exactamente igual que antes de
este corte. `productionAvailable` no cambia.

**Corpus**: no existe todavía. La ola 3 del corpus hermano (PR
`valle-design-dwg-conformance#6`) declara ACIS explícitamente FUERA de su
alcance ("Emitir SAT válido a mano es un problema propio... Es una ola
aparte") — no hay ni un DWG real con 3DSOLID/REGION/BODY en el corpus
admitido ni pendiente. La evidencia de este corte es puramente sintética
(bytes de prueba, no ACIS real), y así se declara: prueba que la captura es
correcta dado un objeto de clase ya identificado, no que el laboratorio
reconoce 3DSOLID en un archivo de verdad.

## Evidencia del corte 2026-08-31 (continuación: FLUJO DE HANDLES del cuerpo R2010+)

Tercera entrega de la misma serie (ENCABEZADO → CUERPO → **FLUJO DE HANDLES**).
Levanta la «capacidad ausente declarada» del corte anterior, que decía
literalmente que el flujo de handles no se decodificaba y que por eso
`readR2004Database` no podía ensamblar nada.

| Capacidad                                        | Evidencia          | Límite honesto                                                                                                                                                                                                                                                           |
| ------------------------------------------------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Flujo de handles del cuerpo AC1024/AC1027/AC1032 | `experimental-lab` | Decodifica y reparte la CABEZA (propietario, reactores, xdictionary, capa, linetype, plotstyle). Las tablas de símbolos y el flujo de cadenas siguen sin decodificar, así que sigue sin haber NOMBRES de capa ni de bloque y `readR2004Database` sigue fallando cerrado. |

- **Consumo exacto**: leyendo códigos H consecutivos desde el inicio del tramo
  —que el campo UMC del encabezado ya daba verificado— hasta que restan menos
  de 8 bits, el tramo se consume **105/105**, 35/35 por versión. El residuo
  observado cubre todo el rango 0..7 bits, que es lo que produce un relleno
  hasta el byte y no lo que produciría una lectura desalineada.
- **Prefijo exacto contra el gemelo**: la secuencia reproduce, en orden, las
  referencias no nulas del gemelo AC1015 del mismo dibujo excluidos los
  enlaces a la entidad anterior y siguiente: **105/105**.
- **Cuatro modelos contrastados, no uno**: `completo` 0/105, `sinEnlaces`
  0/105, `sinNulos` 45/105, `sinEnlacesNiNulos` 90/105 con coincidencia total.
  Que los dos modelos que conservan los nulos acierten **cero** es lo que
  sostiene el hecho: en R2010+ un handle nulo no se escribe.
- **La forma se deduce del propio archivo moderno**: leyendo el prefijo común
  con el bit de xdic-missing ANTES del de sin-vínculos, los cinco campos que
  determinan la forma coinciden con el gemelo en **105/105** y predicen el
  recuento de la cabeza en **105/105**; con el orden inverso la predicción cae
  a **35/105**. Ese contraste es lo que hace de la ordenación una medición y
  no un ajuste.

**Corrección declarada, no silenciosa**: el corte anterior describió el tramo
común de 39/40 bits como opaco en su totalidad. Esta medición establece que su
**primera mitad sí decodifica** y con qué orden exacto. La segunda mitad
(23/24 bits) sigue sin semántica identificada y sigue tratada como opaca: lo
que cambia es el alcance de la afirmación, no la disciplina.

**Capacidad ausente declarada, sin suavizar**: los 5 TEXT del corpus llevan un
handle por encima de la cabeza (15 observaciones = 5 × 3 versiones) que apunta
a un registro **STYLE** (`0x35`); se devuelve en `extra` y no se interpreta.
El bit de sin-vínculos se lee pero no decide nada, y su acierto contra el
gemelo es 53/105 —una moneda al aire—: no importa porque R2010+ no escribe los
enlaces, y se dice en vez de ocultarse. EED y gráfico de previsualización están
**ausentes en los 105 objetos**, así que su disposición no está medida y el
lector falla cerrado ante ellos. `readR2010HandleStream` y
`deriveR2010HandleShape` (`reader/r2010-handle-stream.ts`) siguen siendo
capacidad de laboratorio: **no** están conectados a `readR2004Database`,
porque sin tablas de símbolos ni flujo de cadenas no hay base neutral que
ensamblar.

Evidencia: `docs/cad/evidence/dwg-r2010-handle-stream.json`, reproducible con
`node scripts/dwg/probe-r2010-handle-stream.mjs` y guardada por
`npm run check:dwg-r2010-handles`.

## Evidencia del corte 2026-08-31 (continuación: FLUJO DE CADENAS del cuerpo R2010+)

Cuarta entrega de la serie (ENCABEZADO → CUERPO → FLUJO DE HANDLES →
**FLUJO DE CADENAS**). Cierra el segundo de los dos frentes que
`readR2004Database` nombra al fallar cerrado. Sin cadenas no hay **nombres**:
ni de capa, ni de bloque, ni de estilo, ni el contenido de un TEXT.

| Capacidad                                        | Evidencia          | Límite honesto                                                                                                                                  |
| ------------------------------------------------ | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Flujo de cadenas del cuerpo AC1024/AC1027/AC1032 | `experimental-lab` | Objetos de **una sola** cadena. Varias cadenas en un mismo flujo no están medidas y el lector falla cerrado. Sin cadenas no-ASCII en el corpus. |

Disposición medida, contando hacia atrás desde el bit de presencia:

```
[ ... datos del tipo ... ]
[ flujo de cadenas: N bits ]
[ tamaño del flujo: RS de 16 bits, valor N ]
[ bit de presencia = 1 ]
[ flujo de handles ]  [ relleno hasta el byte ]
```

y dentro del flujo cada cadena es un `TU`: un `BS` con el número de
**caracteres** seguido de esos caracteres en **UTF-16LE**.

**Tres falsaciones que tendrían que fallar juntas** (15/15 objetos con cadena,
5 por versión):

1. El campo RS vale **exactamente** los bits que ocupan el `BS` de longitud más
   los datos UTF-16 — un número calculado del gemelo AC1015, no leído del
   archivo moderno: **15/15**.
2. El inicio derivado como `bitPresencia − 16 − N` cae **exactamente** donde
   empieza ese `BS`: **15/15**.
3. El texto decodificado coincide byte a byte con el del gemelo: **15/15**.

Además la forma ASCII del valor **no aparece nunca** (0/15) y la UTF-16LE
aparece exactamente una vez (15/15), y el bit de presencia vale 1 en los 15
frente a 0 en los 72 objetos sin cadena ya medidos: la semántica del bit queda
confirmada por los **dos** lados.

### Segunda pasada: varias cadenas, y los NOMBRES de las tablas de símbolos

La primera pasada midió sólo los TEXT, que llevan **una** cadena, y declaró
capacidad ausente para el resto. Al aplicar ese lector a los objetos **con
nombre** el fallo cerrado saltó en **186 de 288** — _«lleva más cadenas de las
que este laboratorio ha medido»_— en vez de devolver un nombre de capa a
medias. Eso no fue un fallo del lector: fue el guardián señalando qué medir.

Medido después: las cadenas van **consecutivas** como `TU`, y la **primera** es
el valor del TEXT o el **nombre** del objeto.

| familia                            | nombre exacto contra el gemelo |
| ---------------------------------- | -----------------------------: |
| `layer`                            |                      **54/54** |
| `block-record`                     |                      **54/54** |
| entradas de tabla (`symbol-entry`) |                    **180/180** |
| entidades con texto                |                      **15/15** |
| **total**                          |                    **303/303** |

con consumo exacto del tramo en **303/303** e histograma de cadenas por objeto
`{1: 117, 2: 78, 3: 84, 5: 24}`: el caso de varias está ejercitado de verdad,
no promovido por analogía con el de una.

**Esto es lo que convierte una capa de un handle en un nombre** — el frente que
`readR2004Database` cita como «tablas de símbolos».

**Capacidad ausente declarada, sin suavizar**: sólo la **primera** cadena tiene
significado comprobado. Las siguientes se leen y se cuentan, pero **nadie ha
medido qué son** en cada tipo: `readR2010ObjectName` expone la primera y quien
quiera el resto usa `readR2010StringStream` sabiendo que las interpreta por su
cuenta. No hay ninguna cadena no-ASCII en el corpus, así que los pares
suplentes fuera del BMP no están ejercitados y viajan crudos como unidades de
código.

**Lo que sigue faltando**: el **ensamblaje**. Con envoltura, cuerpo, handles,
cadenas y nombres medidos, lo que queda para que `readR2004Database` produzca
una base neutral completa en AC1024/AC1027/AC1032 es un camino de ensamblaje
propio para R2010+ (el actual reusa la forma R2000 vía el adaptador de AC1018)
y los campos NO-nombre de cada registro de tabla. Hasta entonces el lector
sigue fallando cerrado y estos módulos siguen siendo capacidad de laboratorio.

Evidencia: `docs/cad/evidence/dwg-r2010-string-stream.json`, reproducible con
`node scripts/dwg/probe-r2010-string-stream.mjs` y guardada por
`npm run check:dwg-r2010-strings`.

## Evidencia del corte 2026-08-31 (ENSAMBLADO R2010+: AC1024/1027/1032 abren 8/8)

Cierre de la serie M4. `readR2004Database` deja de fallar cerrado para las tres
versiones modernas: **de 0/8 a 8/8 abiertos en AC1024, AC1027 y AC1032**.

| Capacidad                         | Evidencia          | Límite honesto                                                                                                                                                                                                    |
| --------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base neutral AC1024/AC1027/AC1032 | `experimental-lab` | Abre 8/8 con **0 geometrías distintas**. INSERT y TEXT no tienen cuerpo medido; las variables de cabecera y los registros de clase **no se decodifican y se declaran ausentes**. [CORREGIDO EL 2026-09-01: el color y las banderas de capa SÍ se decodifican desde la fase 1.F, y desde el corte 2026-09-01 (b) las banderas además se INTERPRETAN — congelada y bloqueada.] |

**Lo que de verdad importa de la matriz: `geometriaDistinta = 0` en todo.** Nada
decodifica a un valor equivocado. Lo que falta, falta.

| tipo         | esperado | leído | distinto | falta | inesperado |
| ------------ | -------: | ----: | -------: | ----: | ---------: |
| `lwpolyline` |        3 | **3** |        0 |     0 |          0 |
| `point`      |        1 | **1** |        0 |     0 |          0 |
| `line`       |       15 |    10 |    **0** |     5 |          5 |
| `circle`     |        3 |     2 |    **0** |     1 |          1 |
| `arc`        |        2 |     1 |    **0** |     1 |          1 |
| `insert`     |        6 |     0 |        0 |     6 |          0 |
| `text`       |        5 |     0 |        0 |     5 |          0 |

(cifras de AC1024; AC1027 y AC1032 dan las mismas)

Los `falta` de line/circle/arc casan **uno a uno** con sus `inesperado`: son
entidades que pertenecen a un bloque y quedan en model space, que es el límite
declarado abajo — no se pierden, se colocan en otro sitio y se dice.

### Tres estratos que se encontraron abriendo, y que se declaran en vez de rellenarse

1. **[PRECISADO EL 2026-09-01 — ver el corte de variables de cabecera abajo]
   Variables de cabecera.** Leídas con la forma de AC1018 dan «A BD flag of
   0b11 is not defined by the format». Su disposición R2010+ no está medida, así
   que el marco se **valida** (centinelas + CRC, que es la comprobación que de
   verdad protege la sección) y los valores **no** se decodifican. `insunits`
   viaja `undefined`: decir 0 afirmaría que el archivo declara «sin unidades»,
   que no es lo mismo que no haberlo leído. El puente del producto lo declara
   con ese texto exacto en el manifiesto de pérdidas.
2. **Registros de clase.** Leídos con la forma de AC1018 dan «A text value
   extends outside the input»: los nombres de clase no viajan en esa forma de
   cadena. Mismo criterio — marco validado, registros no decodificados, mapa de
   clases vacío. El ensamblado R2010+ no lo consume: despacha por tipo fijo.
3. **[CORREGIDO EL 2026-09-01 — ver la sección de ese corte] Color y banderas
   de una capa.** Este documento afirmó que «las banderas de capa de R2010+ no
   son el `BS` de R2000 en ninguna posición». **Era falso**: sí lo son, y desde
   el 2026-09-01 se decodifican (54/54, tres condiciones a la vez). El párrafo
   original se conserva marcado, no se reescribe, porque el error de método que
   lo produjo es lo que hay que recordar.

**Capacidad ausente declarada, sin suavizar** _(párrafo de aquel corte;
**dos frases suyas quedaron obsoletas o eran falsas** — ver el corte
2026-09-01 más abajo: INSERT y TEXT sí tienen cuerpo medido desde entonces, y
la afirmación de que «el corpus no trae ni un objeto de modo 0» era FALSA, hay
5 LINE, 1 CIRCLE y 1 ARC)_: INSERT y TEXT no tienen cuerpo
medido en R2010+ y entran en `unsupported`, enumerados y nunca callados. La
pertenencia entidad→bloque está implementada con la MISMA regla que el
ensamblado AC1015 pero **no medida**: el corpus no trae ni un objeto de modo 0,
y cada uso deja diagnóstico. Ninguna capacidad se promueve: el corte sigue en
`experimental-lab` y ningún flag se enciende.

Evidencia: `docs/cad/evidence/dwg-corpus-validation.json`, reproducible con
`node scripts/dwg/validate-corpus.mjs`.

## Evidencia del corte 2026-09-01 (TEXT, INSERT y pertenencia a bloque en R2010+)

Continuación directa del ensamblado. La matriz de entidades de las tres
versiones modernas queda **idéntica a la de AC1015**.

| tipo         | esperado |  leído | distinto | falta | inesperado |
| ------------ | -------: | -----: | -------: | ----: | ---------: |
| `arc`        |        2 |  **2** |        0 |     0 |          0 |
| `circle`     |        3 |  **3** |        0 |     0 |          0 |
| `insert`     |        6 |  **6** |        0 |     0 |          0 |
| `line`       |       15 | **15** |        0 |     0 |          0 |
| `lwpolyline` |        3 |  **3** |        0 |     0 |          0 |
| `point`      |        1 |  **1** |        0 |     0 |          0 |
| `text`       |        5 |  **5** |        0 |     0 |          0 |

(cifras de AC1024; AC1027 y AC1032 dan las mismas). Discrepancias por versión:
**36 → 14**.

### Tres mediciones

1. **TEXT (0/5 → 5/5).** El cuerpo es la MISMA secuencia de campos de R2000
   **menos el `TV`** de la cadena, que se mudó al flujo ya medido. Dos
   falsaciones independientes, **15/15** cada una: todos los campos coinciden
   con el gemelo (inserción, altura, rotación, oblicuo, factor de anchura,
   elevación, espesor, generación y las dos alineaciones), y el dato del tipo
   aterriza **exactamente** donde empieza el flujo de cadenas. `decodeTextFields`
   acepta los bytes desde fuera en vez de duplicarse: dos copias de la
   secuencia es donde se colaría una divergencia silenciosa.
2. **INSERT (0/6 → 6/6).** Su cuerpo no cambia; lo que faltaba era el nombre
   del bloque. El puntero al `BLOCK_RECORD` es el **primer handle posterior a
   la cabeza común** —la misma posición que el gemelo lee justo tras ella— y
   resuelve el nombre correcto en **6/6**. Se resuelve en una segunda pasada
   porque el bloque puede aparecer después en el mapa.
3. **Pertenencia a bloque (7 entidades descolocadas → 0).** Ver la corrección.

### Corrección fechada de una afirmación FALSA del corte anterior

El corte del ensamblado afirmó que «el corpus admitido no ejercita ni un solo
objeto de modo 0». **Era falso.** Contando los modos con
`deriveR2010HandleShape` sobre el corpus aparecen **5 LINE, 1 CIRCLE y 1 ARC**
de modo 0 — exactamente las 7 entidades que entonces quedaban en model space
en vez de en su bloque, y que se contabilizaban como `falta` + `inesperado`.

La afirmación se hizo **sin contar**, que es la forma barata de equivocarse:
bastaba un recuento de dos minutos. Con la pertenencia resuelta, las siete caen
en su bloque y no queda ni un `falta` ni un `inesperado` en toda la matriz.

**Y una regresión propia, encontrada por un test y no por el corpus**: al
localizar el flujo de cadenas antes de tiempo, un tipo SIN cadena cuyo bit de
presencia valiera 1 pasaba de fallar `DWG_VERSION_DECODER_UNSUPPORTED`
(capacidad ausente) a `DWG_STRUCTURE_CORRUPT` (corrupción). Son cosas
distintas y el llamador actúa distinto ante cada una. Corregido en el código,
no en el test: el flujo sólo se localiza para los tipos que lo llevan.

**Lo que sigue faltando** _(cifra de aquel corte; el de más abajo baja de 14 a
2 al medir el color)_: las 14 discrepancias por versión son **campos que
este corte declara SIN MEDIR** — el color de capa (12) y los trazos de tipo de
línea (2). El validador las etiqueta «distinto» porque compara valores, y un
valor ausente no es igual a uno presente; no son geometría equivocada. Medirlos
exige un corpus con capas y tipos de línea variados, y es un intake aparte.
Ninguna capacidad se promueve: el corte sigue en `experimental-lab`.

## Evidencia del corte 2026-09-01 bis (campos de tabla en R2010+: CERO discrepancias)

**Este corte corrige una afirmación FALSA que este mismo documento publicó.**
Se escribió que las banderas de capa de R2010+ «no son el `BS` de R2000 en
ninguna posición», apoyándose en un barrido de 0..120 bits con cero aciertos.
Sí lo son. El barrido no falló por el formato, falló por cómo se preguntó:

1. **Puse un hecho medible detrás de uno inmedible.** La sonda sólo apuntaba un
   acierto de estado si ANTES coincidían los tres campos de xref — y esos tres
   valen **siempre lo mismo** en todo el corpus admitido, así que no discriminan
   nada. Una lectura equivocada de lo que no se puede falsar vetaba la lectura
   correcta de lo que sí.
2. **No reusé un hecho que el repo ya tenía medido.** La sonda leía el color
   como el `CmC` de R2000 (un simple `BS`) cuando el adaptador AC1018 de este
   mismo paquete —8/8, 0 discrepancias— ya documentaba que desde R2004 son
   **tres** campos: `BS` + `BL` + `RC`.
3. **Describí esos campos de xref como «ceros»**, y tampoco es exacto:
   `xrefRef` vale `true` en las 18 capas del gemelo. Lo que impide falsarlos no
   es que valgan cero, es que valen siempre lo mismo. Constante no es cero.

**Lo medido**: a una distancia fija del primer bit de dato —**7 bits en AC1024
y 8 en AC1027/AC1032**, la misma diferencia de un bit que ya separa el prefijo
común de entidad— va el `BS` de estado, y justo detrás el color en la forma
`CmC` de R2004. Se exigieron **tres condiciones a la vez** en las 54 capas de
las tres versiones: el estado reproduce el del gemelo AC1015 (54/54), el color
proyecta al mismo índice ACI (54/54) y el dato termina **exactamente** donde
empieza el flujo de cadenas (54/54). Los valores varían de verdad: tres estados
distintos (1008, 1009 congelada, 1016 bloqueada) y siete índices ACI. Falsación
adversa: con la cabeza desplazada **un** bit en cualquier dirección, las tres
condiciones fallan en 54/54.

**Lo que sigue sin medir, y no se finge**: qué hay exactamente en esos 7/8 bits
de cabeza. Con este corpus no puede saberse — no hay ni un objeto con EED, ni
uno con reactores, ni una entrada dependiente de xref, así que al menos dos
composiciones distintas reproducen los mismos valores. Se mide la **anchura**,
no el contenido, y los tres campos de xref **no se decodifican** en R2010+.
Esa ambigüedad no es peligrosa porque el aterrizaje exacto es obligatorio: un
archivo con otra cabeza no aterriza y el códec falla cerrado con
`DWG_VERSION_DECODER_UNSUPPORTED` en vez de devolver un color plausible y
equivocado.

**La misma cabeza sirve para el LTYPE, y eso es parte de la evidencia.** Medida
por separado sobre los tipos de línea sale **idéntica** (7/8 bits), y tras ella
van `BD` longitud del patrón, `RC` alineación, `RC` número de trazos y, por
trazo, la misma séptupla que en R2000. Patrón, alineación y trazos coinciden
con el gemelo en **78/78**. Que una misma cabeza sirva para un dato de 25 bits
(patrón vacío) y para uno de 429 (patrón con dos trazos) es lo que la convierte
en la cabeza **común** de una entrada de tabla y no en una casualidad de un
tipo.

Y una diferencia real con R2000, **medida y no supuesta**: el área de texto de
256 bytes que un LTYPE de R2000 lleva siempre al final **no está** en R2010+.
Se probaron las dos variantes sobre todo el corpus — la variante sin área
aterriza 78/78, la variante con área 0/78.

**Límite de la evidencia del LTYPE, sin suavizar**: de los 78 comparados sólo
**6** (dos por versión) llevan un patrón no vacío; los otros 72 son patrones
vacíos. Los campos por trazo que no varían en el corpus (desplazamientos,
escala, rotación y banderas) están **leídos, no falsados**.

**Efecto en el corpus**: el corpus completo queda en **cero discrepancias en
las cinco versiones** — AC1015 25/25, AC1018 8/8 y AC1024, AC1027 y AC1032 8/8
cada una, 57 archivos abiertos de 57. Las versiones modernas dejan de tener
discrepancias declaradas. Ninguna capacidad se promueve por ello: el corte
sigue en `experimental-lab` y ningún flag se enciende — que el laboratorio lea
un archivo sin discrepancias no es que el producto lo abra.

Evidencia: `docs/cad/evidence/dwg-r2010-table-fields.json`, reproducible con
`node scripts/dwg/probe-r2010-table-fields.mjs`; y
`docs/cad/evidence/dwg-corpus-validation.json` con
`node scripts/dwg/validate-corpus.mjs`.

## Evidencia del corte 2026-09-01 ter (variables de cabecera en R2010+: un resultado NEGATIVO)

Este corte **no decodifica nada nuevo**. Mide *por qué* no puede, con números,
y se publica precisamente por eso: sin él, el siguiente que mire `AcDb:Header`
en AC1024/AC1027/AC1032 repetiría el mismo intento a ciegas.

**La pregunta se hizo en el orden correcto.** Antes de barrer ninguna
disposición se contó **qué varía** en el corpus, porque una variable constante
no puede falsar ninguna posición: un decodificador equivocado que cayera sobre
su valor «acertaría» en los ocho dibujos. Es el mismo error que obligó a
corregir el barrido de las banderas de capa, y esta vez se evitó por delante en
vez de por detrás.

**Lo que el censo dice, y es el resultado principal:**

| | |
| --- | --- |
| Variables de cabecera observadas en el gemelo AC1015 | **343** |
| De ellas, que **varían** entre los ocho dibujos | **6** |
| De esas seis, reescritas por el conversor (marcas de tiempo, GUID, handles renumerados) | **5** |
| **Anclas utilizables como oráculo diferencial** | **1** — `textsize` |
| Valores distintos de **INSUNITS** en el corpus | **1** — `0` en los ocho |

Con **una** sola ancla no se falsa una secuencia de 343 campos: se **ajusta**,
que es otra cosa. Y `INSUNITS` —la única variable que el producto realmente
consume— es constante, así que ni se puede falsar ni cambiaría nada
decodificarla: `0` significa «el archivo no declara unidades», que es
exactamente lo que el puente ya declara hoy.

**Lo que sí se midió en positivo, con esa única ancla.** `textsize` aparece
**una sola vez** y en un offset **estable por versión** dentro del marco de
`AcDb:Header` — bit **327** en AC1018, **335** en AC1024, **338** en AC1027 y
AC1032 — en **24/24** archivos modernos, y sus dos valores distintos (0.2 en
siete dibujos, 2.5 en `06-texto`) caen en el **mismo** offset.

**Y una hipótesis barata, falsada.** La cabecera de R2010+ **no** es la de
AC1018 con un prólogo más largo. Desplazar el marco moderno los bits que
predice el ancla y leerlo con el decodificador de AC1018 —que sí funciona
8/8— lanza `A BD flag of 0b11 is not defined by the format`, y **ningún**
desplazamiento de 0 a 64 bits decodifica ningún archivo. La divergencia está
**dentro** de los primeros 327 bits, no delante de ellos.

**Qué desbloquea esto, exactamente.** No es un problema de decodificación sino
de corpus: hacen falta dibujos con cabeceras **distintas entre sí** — INSUNITS
distinto de 0 y distinto entre archivos, límites, escalas y estilos variados.
Es un intake de corpus, no más barridos. Hasta entonces el códec **falla
cerrado** y el puente declara la suposición, en vez de inventar unidades.

Evidencia: `docs/cad/evidence/dwg-r2010-header-variables.json`, reproducible con
`node scripts/dwg/probe-r2010-header-variables.mjs`.

## Corte 2026-09-01 quater — las versiones modernas llegan a la FRONTERA del producto

Hasta este corte pasaba algo que conviene decir sin adornos: **el códec leía
AC1024, AC1027 y AC1032 con cero discrepancias y el producto las rechazaba.**
`readDwgNeutralDatabase` admitía exactamente `AC1015` y `AC1018`, así que un
DWG de AutoCAD 2018 —el formato de guardado **por defecto** de AutoCAD
2018–2026, o sea lo que produce un cliente real al pulsar Guardar— chocaba
contra un mensaje de "esta beta sólo lee AutoCAD 2000".

Leer bien y no dejar entrar es justo la distancia entre un laboratorio y un
producto. Este corte cierra **el cableado**, no la puerta.

**Lo que se construyó**, siguiendo el patrón EXACTO que ya usaban AC1018 y el
perfil 3D, sin inventar mecanismos nuevos:

| pieza | qué hace |
| --- | --- |
| `DWG_MODERN_BETA_AUTHORIZATION` | autorización **propia**, perfil `AC1024_AC1027_AC1032_MODELSPACE_2D_V1` |
| `dwgModernBetaImportIsEnabled()` | la **misma** conjunción de tres condiciones: bandera + firma + beta base |
| `allowModern` en `readDwgNeutralDatabase` | la puerta **acumula** versiones concretas en vez de abrir por familia |
| `NEXT_PUBLIC_DWG_MODERN_IMPORT_BETA` | su variable propia, declarada en `.env.example`, Dockerfile y su validador |
| `dwg-native-reader-modern.spec.ts` | vigila **las dos direcciones** |

**Esto NO es una firma.** `ownerSigned` es literalmente `false` y está tipado
`boolean` —no el literal `true` de AC1015 y AC1018— precisamente para que
cambiarlo a mano haga **fallar** un spec en vez de dejar de compilar. Nadie ha
tenido con el titular la conversación que sí tuvieron V1/V2/V3 y M3. Que el
códec las lea perfectamente **no basta**: medir y autorizar son cosas
distintas, y ésta es la segunda.

**Por qué un mecanismo separado y no ampliar el de AC1018.** Comparten el
contenedor R2004, así que colgar las tres versiones nuevas del flag que ya
existe era la comodidad evidente — y es exactamente lo que el diseño de estos
flags existe para impedir. Son cinco versiones con cinco riesgos distintos y
cada una entra por su puerta. El spec lo comprueba: con `allowAc1018: true` y
sin permiso moderno, las tres modernas **siguen fuera**.

**La spec vigila las dos direcciones a propósito.** Que sin firma no entre
nada es la mitad fácil; probar sólo eso dejaría pasar un cableado que no
cablea nada. Así que también comprueba que con `allowModern` entran
**exactamente** las tres, y que `AC1021` —que nadie ha autorizado nunca— sigue
rechazándose con todos los permisos encendidos.

**Una frase caducada, corregida en su sitio.** El bloque de AC1018 en
`dwg-interop-flag.ts` afirmaba que «sólo AC1018 decodifica objetos hoy, la
familia AC1024/1027/1032 abre el contenedor pero no sus cuerpos». Dejó de ser
cierto y se corrige con su adenda fechada, porque una frase caduca sobre lo
que el códec sabe hacer es justo la que lleva a ampliar un flag en silencio
—«total, si ya lo lee»—.

### Y una contradicción del propio códec, encontrada al cablear

Al montar el cableado apareció algo que ningún gate veía y que lo habría
dejado inservible: **`probeDwg` declaraba `unsupported` las tres versiones
modernas mientras `readDwg` abría el mismo archivo sin problema.**

Medido sobre `08-plano-mini.dwg`, el mismo dibujo en las cinco versiones:

| versión | `probe.ok` (antes) | `readDwg` |
| --- | --- | --- |
| AC1015 / AC1018 | `true` | 5 capas, 3 bloques |
| AC1024 / AC1027 / AC1032 | **`false`** | **5 capas, 3 bloques** |

El origen era un dato caducado: `version-registry.ts` seguía marcando
`decoderStatus: "unsupported"` para las tres, y `api/probe.ts` falla por ese
campo. O sea que el códec **se desmentía a sí mismo delante del llamador**, y
cualquier consumidor que sondeara antes de leer —que es lo sensato— concluía
que no se podía. El cableado del producto llama a `probeDwg` primero, así que
sin esta corrección `allowModern` no se habría alcanzado nunca.

Corregido a `experimental-lab`, que es lo que el corpus mide. **AC1021 (R2007)
se queda en `unsupported` y no por olvido**: su contenedor Reed-Solomon se
rechaza por diseño, con error tipado.

La corrección obligó a actualizar tres guardianes que habían congelado la
afirmación falsa como si fuera un invariante —el test del registro, el
adversario del probe y el generador determinista de fixtures—. Las fixtures se
**regeneraron con la herramienta del repo**, nunca a mano: editar el manifiesto
directamente lo detecta `check:fixtures`, y lo detectó.

**Lo que sigue esperando, sin suavizar:** una firma del titular para esta
familia. No es ingeniería: el cableado está hecho y probado, y el día que esa
conversación ocurra, encender la familia moderna es cambiar una constante y
una variable de entorno, no escribir código.

## Corte 2026-09-01 (b) — el estado de una capa deja de ser un número crudo

**CORRECCIÓN DE DOS AFIRMACIONES DE ESTE MISMO DOCUMENTO.** Arriba se lee, en
el corte del 2026-08-21, que «los `stateFlags` de capa siguen crudos», y en el
del 2026-08-24 que su semántica «no está confirmada contra corpus real para el
binario DWG». Ambas eran ciertas cuando se escribieron y **han dejado de
serlo**. No se reescriben: se corrigen aquí, fechadas, como exige la
disciplina del repo.

**Qué se midió.** El corpus admitido trae `04-capas`, un dibujo construido a
propósito con una capa `CONGELADA` y una `BLOQUEADA`, y **su DXF fuente dice
cuál es cuál antes de mirar el binario**. Eso convierte la semántica en una
hipótesis contrastable contra un hecho externo, no en una lectura plausible.

| | resultado |
| --- | --- |
| capas comparadas | **98**, de 57 fixtures, en las **cinco** versiones |
| bit de congelada | **0** — acierta en 98/98 (5 positivos, 93 negativos) |
| bit de bloqueada | **3** — acierta en 98/98 (5 positivos, 93 negativos) |
| hipótesis rivales | las **16** posiciones de bit; ninguna otra separa nada |
| bits constantes | 1, 2 y 4..15 — **sin significado atribuido** |

**Se probaron todos los bits, no el que uno espera.** Un bit sólo se acepta si
acierta siempre **y** es separable —al menos un positivo y un negativo—, porque
un bit constante acierta en bloque sin falsar nada. Es exactamente la
disciplina que hubo que aplicar para corregir el barrido de banderas de la
fase 1.F.

**La trampa que habría caído sola.** El grupo 70 del DXF marca «bloqueada» con
el valor 4 —el **bit 2**— y el DWG la marca en el **bit 3**. Copiar la
convención del DXF por analogía habría acertado en congelada y fallado en
bloqueada: el peor error posible, el que funciona a medias y nadie mira dos
veces. Sólo se ve midiendo.

**Qué cambia en el producto.** Una capa congelada entra **congelada** y una
bloqueada entra **bloqueada**, en las cinco versiones. Hasta hoy toda capa
llegaba al lienzo `visible: true, locked: false` con una pérdida declarada —
correcto mientras no se ha medido, y falso cuando sí. **Ninguna capacidad se
promueve y ningún flag se enciende**: esto no amplía qué archivos entran,
mejora lo que se hace con los que ya entraban.

**Congelada viaja en `frozen`, no plegada en `visible`.** El producto ya
modelaba la congelación como un estado propio —ni se dibuja, ni se regenera,
ni entra en selección, `cad-layer-visibility.ts`— y usar `visible: false` para
transportarla habría dicho «esta capa está apagada», que es **más de lo que se
sabe**. La capa canónica del laboratorio gana el mismo campo por la misma
razón.

**Un criterio, no dos.** El estado se resuelve **en el ensamblado**, en el
origen, y viaja resuelto en el dato hasta el lienzo. Se consideró exportar
`interpretLayerStateFlags` en la superficie pública y **se descartó**: son
siete llamables por diseño, y el test que los congela hizo bien su trabajo.
Resolver en el origen deja al documento canónico y al adaptador del producto
con el mismo criterio sin que ninguno descifre el `BS` por su cuenta.

**Lo que NO se afirma, y no es un detalle.** La **capa apagada** no se mide y
no se dice. El DXF la codifica con color negativo y en el corpus admitido no
hay **ni una sola** capa apagada, así que el estado apagado/encendido no es
falsable con esta evidencia: una capa apagada de un dibujo real entraría
visible. Se declara como pérdida en la capa concreta en vez de dejar que el
usuario lo descubra en el lienzo. Y los casos positivos vienen de **un solo
dibujo**: lo que multiplica la evidencia son las cinco versiones y las capas
normales de los otros siete. Todo el corpus sigue siendo salida del ODA File
Converter — lo medido es cómo **ese** productor codifica el estado.

## Corte 2026-09-01 (c) — qué capa usa qué tipo de línea

El códec decodificaba la tabla LTYPE **entera** —patrón, alineación y trazos,
en las cinco versiones— y también la tabla de capas. Lo que **no** sabía es
**quién usa cuál**: el registro de capa no llevaba ninguna referencia al tipo
de línea. Los dos extremos estaban leídos y el puente entre ellos no existía,
así que una capa de ejes con `TRAZOS` salía del import sin tipo de línea y una
reexportación a DXF ya no lo llevaba.

**Dónde vivía el dato.** El hecho de que el tipo de línea viaja **por handle**
en el flujo final de la entrada ya estaba registrado
(`ODA-ODS-DWG-5.4.1-PUBLIC`); ese flujo se contabilizaba como tramo opaco —
posición exacta, contenido sin interpretar—, que es la regla del laboratorio
para lo que no se ha medido. Lo que faltaba era **su posición**.

| | resultado |
| --- | --- |
| capas comparadas | **98**, de 57 fixtures, en las **cinco** versiones |
| posición del tipo de línea | **4** — acierta en 98/98 |
| hipótesis rivales | posiciones 0–3: **0/98**, y ninguna resuelve a un LTYPE |
| tipos en juego | **4** distintos: CONTINUOUS, TRAZOS, OCULTA-VALLE, TRAZOS-VALLE |

**Una posición, dos lectores.** R2000/R2004 la encuentra en el tramo opaco que
el decodificador de LAYER ya localizaba; R2010+ en su flujo de handles propio,
el ya medido en 105/105 objetos. Que una sola posición sirva para las cinco
versiones es un **resultado medido**, no una analogía.

**Tres caminos y no dos.** AC1015 y AC1018 comparten la forma del objeto pero
**no el contenedor**, y además un cuerpo AC1018 debe pasar por el adaptador a
forma R2000 antes de decodificarse. Omitirlo no da error visible: el
decodificador no reconoce el tipo y las ocho capas de AC1018 quedan fuera de la
medición **en silencio**. Se detectó porque la sonda declaraba cuatro versiones
en vez de cinco.

### Alcance honesto: qué gana el producto y qué NO

Esto **no** hace que el lienzo dibuje la capa discontinua. Se comprobó antes de
escribirlo: `applyLinetype` no lo usa nadie fuera de su propio módulo, y el
trazo del lienzo no consulta el tipo de línea de la capa. Lo que sí gana:

- el nombre del tipo de línea **llega al documento** desde el DWG;
- **sobrevive la exportación DXF** (`dxf-document-export.ts`), así que un
  DWG→DXF deja de perder el tipo de línea de todas sus capas;
- entra en la huella de norma de oficina (`office-standard.ts`).

**Limitaciones que se declaran, no se tapan.** El desplegable del gestor de
capas muestra `CONTINUOUS` para cualquier nombre fuera de `CAD_LINETYPE_NAMES`
—`TRAZOS` entre ellos—; es previo a este corte y afecta igual al import DXF.
Y el **writer** AC1015 del laboratorio emite los cinco handles del flujo final
**nulos** (placeholders confesos), así que hoy el códec **lee** el tipo de
línea de una capa y **no lo escribe**: una asimetría real, ahora visible.

**Nunca `CONTINUOUS` por defecto.** Un handle que la tabla LTYPE del dibujo no
trae, o un handle nulo, dejan el nombre **ausente** y lo declaran como pérdida
nombrando a qué apuntaba. `CONTINUOUS` es un tipo de línea real, no un «no sé».

## Corte 2026-09-01 (d) — el oráculo externo verifica ahora el writer PÚBLICO

**Una precondición firmada que no se estaba cumpliendo.** ADR-0009 §8.2 exige,
**antes de cablear exportación al producto**, que exista una función pública de
escritura y que **su salida** se verifique contra el ODA File Converter con la
disciplina de `check:dwg`; dice, con esas palabras, que la evidencia previa «no
nombra un contrato de API público». `scripts/dwg/oda-roundtrip.mjs` —el gate
que sólo el titular puede correr, y del que depende mover
`externalOracleVerified`— escribía sus cuatro casos con el writer **interno**
`writeAc1015MinimalFile`. La corrida no podía satisfacer la precondición.

**Y no era formalismo.** Al exigirla apareció un fallo real y silencioso: el
camino público **perdía el color de cada capa**. Una capa cian (ACI 4) salía
escrita como blanca (ACI 7), y **nada** aparecía en el manifiesto de pérdidas.

| | |
| --- | --- |
| causa | `writeCanonicalDwg` recibe el color en **hexadecimal** (documento canónico) y empujaba la capa con su nombre y nada más |
| por qué nadie lo veía | el writer **interno** recibe el índice ACI ya resuelto y siempre estuvo bien; verificar sólo uno de los dos no podía verlo |
| medición | de los cuatro casos, **tres** salían byte a byte idénticos por ambos caminos y **`capa-linea` no** — el único con una capa de color |
| tras el arreglo | **4/4 byte a byte idénticos** |

**La tabla ACI vive ahora en un solo sitio, en las dos direcciones**
(`objects/aci-basic.ts`). Dos tablas separadas es donde una divergencia entre
leer y escribir no la ve ninguna prueba: la de ida diría cian y la de vuelta
blanco. El blanco `#FFFFFF` es a la vez el 7 y el 255; gana el menor, que es el
convencional. Un color fuera de la tabla básica **no se aproxima al más
cercano**: se declara como pérdida, porque aproximar convertiría «no sé
escribir este color» en «este color es gris».

**Qué corre ahora el titular.** Ocho casos en vez de cuatro: los mismos cuatro
dibujos escritos por el writer interno **y** por la API pública, cada uno como
un caso independiente ante el conversor. Se comparan contra las mismas
expectativas. Van los dos aunque hoy salgan idénticos: decir «son iguales, con
verificar uno basta» es exactamente el atajo que dejó este agujero abierto.

**Lo que sigue sin poder hacerse aquí.** El binario ODA es del titular y sólo
él puede correrlo; `externalOracleVerified` sigue en `false` y esto no lo mueve.
Lo que cambia es que, cuando lo corra, verificará **lo que el ADR nombra**.

## Corte 2026-09-01 (e) — escribir el estado de la capa, y declarar el tipo de línea que no se sabe escribir

**Lo que se medía perdido.** Con el color ya arreglado, un round-trip por el
camino público (`writeCanonicalDwg` → `readDwg`) seguía perdiendo tres cosas de
cada capa, **con el manifiesto de pérdidas vacío**:

| escrito | volvía como | |
| --- | --- | --- |
| `CONGELADA` frozen=**true** | frozen=**false** | perdido, sin declarar |
| `BLOQUEADA` locked=**true** | locked=**false** | perdido, sin declarar |
| `EJES` linetype=**TRAZOS** | **Continuous** | **valor equivocado**, no ausencia |

El tercero era el peor: no decía «no sé», decía *Continuous*. Una capa de ejes
discontinua volvía sólida y con aspecto de dato bueno.

**Causa, corregida respecto de un diagnóstico propio.** Al abrir el código
resultó que hay **dos** writers de LAYER y que el que viaja en el archivo
—`writeAc1015ResolvedLayerBody`— ya resolvía sus handles; los cinco nulos son
del writer de tabla de la fase D3, que **no** es el que se escribe. Los huecos
reales eran otros dos: al writer que sí viaja **nunca se le pasaba el estado**
(caía al 1008 por defecto), y su `linetypeHandle` está fijado a Continuous
porque el archivo mínimo **sólo lleva esa entrada LTYPE**.

**Qué cambia.** El estado se compone con `encodeLayerStateFlags`, que vive
junto a la función que lo lee: el mismo módulo, las dos direcciones. Si la
lectura y la escritura tuvieran cada una su idea de qué bit es congelada, la
divergencia no la vería ninguna prueba — se escribiría una cosa y se leería
otra, y las dos serían coherentes consigo mismas. Los valores esperados en la
spec son los **medidos en el corpus** (1008, 1009, 1016), no los que produzca
la implementación.

Resultado del mismo round-trip: **congelada y bloqueada sobreviven**, y el tipo
de línea no emitible sale ahora con su pérdida `layer-linetype-not-writable`.

**Lo que sigue sin poder hacerse, y queda dicho.** El archivo mínimo emite una
sola entrada LTYPE, así que `TRAZOS` **se sigue escribiendo continuo** — la
diferencia es que ahora se declara en vez de fingirse. Emitir entradas LTYPE
propias con su patrón de trazos es un corte aparte y más grande.

**Ante el oráculo.** El harness gana un caso, `capa-estado`, con una capa
congelada y una bloqueada. El parser DXF del oráculo compara capas por nombre y
color y **no** proyecta el estado, así que lo que ese caso pregunta a un lector
ajeno es que el archivo con esos bits encendidos siga abriendo y convirtiendo
limpio; que el estado *signifique* lo que decimos lo prueba el round-trip
propio. Con el gemelo público de cada caso, el titular corre ahora **diez**.

## Corte 2026-09-01 (f) — el patrón de trazos se escribe de verdad

El corte anterior dejó dicho lo que faltaba: el archivo mínimo emitía **una
sola** entrada LTYPE, Continuous, así que una capa con `TRAZOS` se exportaba
sólida y —leída de vuelta— decía «Continuous». No una ausencia: **un valor
equivocado con aspecto de dato bueno**. Eso se cierra aquí.

**El writer de LTYPE tenía tres constantes donde debía haber datos**:
`emitBD(0)` de longitud, `emitRC(0x41)` de alineación y `emitRC(0)` de **cero
trazos**. Ahora emite el patrón real, con la MISMA séptupla por trazo que el
lector ya medía —longitud `BD`, código de forma `BS`, dos desplazamientos `RD`,
escala `BD`, rotación `BD`, banderas `BS`— y en el mismo orden. La red que hace
innecesario confiar en ese orden ya existía: el lector exige que el área de
texto de 256 bytes llene el tamaño declarado, así que un trazo de más o de
menos lo detecta él solo.

**El archivo lleva ahora las entradas del dibujo.** El plan de handles les
reserva sitio, el LTYPE CONTROL las lista —una entrada que el control no liste
queda huérfana— y **cada capa apunta a la suya** en vez de al Continuous fijo.
Un detalle que descubrió el propio writer al intentarlo: sus handles salen del
tramo dinámico, así que emitirlas junto a las fijas rompe el invariante de
orden creciente; van al principio del tramo dinámico, antes que las capas que
las referencian.

**Ida y vuelta, con los valores del corpus real** (`04-capas`: `TRAZOS`,
longitud 1, trazos `[0.75, -0.25]`) — no unos inventados, porque un emisor y un
lector que se equivocaran del mismo modo serían coherentes entre sí y estarían
los dos mal:

| | |
| --- | --- |
| patrón definido por el documento | **se escribe y vuelve idéntico** |
| capa que lo pide | **apunta a su entrada**, no a Continuous |
| capa que no pide nada | sigue en Continuous — no se le presta el patrón de otra |
| tipo de línea **nombrado pero no definido** | continua, **con su pérdida declarada** |

Esa última fila es la línea que no se cruza: al que no trae patrón **no se le
inventan trazos**. La diferencia entre «no sé» y un dato falso.

**Ante el oráculo.** Nuevo caso `capa-tipo-de-linea`, y éste **sí** lo comprueba
campo a campo: el parser DXF del oráculo ya extrae la tabla LTYPE con su
longitud y sus trazos, así que si el patrón escrito no fuera el declarado, el
cotejo lo diría. Con el gemelo público de cada caso, el titular corre **doce**.

## Corte 2026-09-01 (g) — lo que el códec sabe escribir llega por fin al archivo que exporta el producto

Los cuatro cortes anteriores enseñaron al códec a escribir el color, la
congelación, el bloqueo y el patrón de trazos de una capa. **Nada de eso
llegaba al DWG que exporta el producto**, y no por una limitación del códec:
`toCanonicalDocument` (`apps/web/src/lib/cad/dwg-native-writer.ts`) mapeaba las
capas como `{id, name, color, visible, locked}` y dejaba `styles` vacío, de
modo que **tiraba el estado y el tipo de línea antes de que el códec los
viera** — y sin declarar nada.

Medido con `exportCadDocumentToDwg` sobre un documento con capa congelada,
bloqueada y de ejes:

| | antes | ahora |
| --- | --- | --- |
| `CONGELADA` frozen | **false** — perdido en silencio | **true** |
| `BLOQUEADA` locked | true | true |
| `EJES` linetype | **Continuous** — perdido en silencio | **TRAZOS** |
| tabla LTYPE del archivo | sin el patrón | **lleva `TRAZOS`** |
| color | correcto | correcto |

**Lo que el documento nombra pero no define** sigue cayendo a Continuous, y eso
**se declara**: la capa aparece en el manifiesto con
`layer-linetype-not-writable` y la exportación termina en
`exito_con_perdidas`. La diferencia entre «no sé» y un dato falso.

**Por qué importa este corte más que los cuatro anteriores.** Los otros
ampliaron lo que el laboratorio *puede* hacer; éste es el único que hace que un
usuario que dibuja en el producto y exporta un DWG **se lleve su plano
completo**. Sin él, todo lo anterior se quedaba en la API del códec.

Sigue en pie lo de siempre: **ningún flag encendido**, `externalOracleVerified`
en `false`, y la exportación DWG cerrada tras su gate hasta que el titular
corra el oráculo.

## Corte 2026-09-01 (h) — la capa «0» del archivo dejaba de existir al importar

El corte (g) arregló el sentido de SALIDA. Éste arregla el de ENTRADA, y es la
misma clase de pérdida: silenciosa, y en el adaptador, no en el códec.

`mapLayers` (`apps/web/src/lib/cad/dwg-document-bridge-layers.ts`) anteponía una
capa «0» **sintética** de ACI 7 y sembraba con `"0"` el conjunto de nombres ya
vistos. Consecuencia: cuando llegaba la capa «0» **real del archivo**, la línea
de deduplicación la descartaba **entera** —color, congelación, bloqueo y tipo de
línea— y ganaba el bootstrap. Sin declarar ni una pérdida: el manifiesto callaba
porque el dato no faltaba, se tiraba.

Medido sobre un AC1032 real del corpus (`04-capas.dwg`), leído por el códec y
pasado por el puente del producto:

| | antes | ahora |
| --- | --- | --- |
| capas «0» en el documento | 1 | 1 (no se duplica) |
| `frozen` de la capa «0» | **ausente** | `false` — el valor **medido** |
| `linetype` de la capa «0» | **ausente** | `CONTINUOUS` — el del archivo |
| color de la capa «0» | `#ffffff` | `#ffffff` |

**Alcance de la pérdida, medido y no supuesto.** Los **57** fixtures del corpus
traen capa «0» con tipo de línea resuelto (`CONTINUOUS` ×27, `Continuous` ×30):
los 57 lo perdían. En cambio **ninguno** trae la capa «0» con color distinto de
ACI 7, congelada ni bloqueada — de las 131 capas del corpus, las 131 tienen
color decodificado. Así que la mitad grave de esta pérdida (un color o un estado
REALES sustituidos por los del bootstrap, que es un dato **falso**, no una
ausencia) es un camino **alcanzable y no ejercido por el corpus**: se cierra y
se prueba con fixtures, y no se afirma haberlo medido en un archivo real.

El respaldo sintético **sigue existiendo** cuando el archivo no trae capa «0» —
toda entidad cuya capa no resuelve cae ahí, así que tiene que estar—, y sigue
siendo la primera del documento.

**Segundo hallazgo, del mismo sitio.** El comentario de esa función afirmaba
desde siempre que el gris neutro de una capa sin color decodificado «lo declara
la pérdida `layer-color-not-decoded` en el manifiesto». **Ese código de pérdida
no existía**: se pintaba el gris y el usuario no se enteraba. Ahora existe
(`dwg_layer_color_not_decoded`) y se emite. El corpus tampoco ejerce este
camino, y también se declara como alcanzable y no medido.

## Corte 2026-09-01 (i) — el 3D heredado SÍ estaba medido, y el checklist decía que no

Los dos cortes anteriores arreglaron la capa en los dos sentidos. Éste no
arregla código: **corrige una afirmación falsa sobre lo que ya estaba medido**,
que es la tercera vez esta jornada que un documento de gobernanza se queda por
debajo de lo que el código hace.

`ADR-0009 §9.3` llevaba la fila «Fidelidad medida contra corpus admitido» en
**☐ PENDIENTE de la admisión de la ola 3**, y §9.2 decía que las specs del
perfil corren «contra bytes sintéticos hechos a mano, no contra el corpus
admitido». Leídas juntas sugieren que del 3D heredado no hay nada medido
contra bytes reales admitidos. **El propio ADR ya lo desmentía cuatro párrafos
antes**: §9.1 afirma fidelidad exacta contra el corpus admitido. El documento
se contradecía consigo mismo.

Lo cierto: `validate-corpus.mjs` —gate bloqueante— ya compara las cuatro
clases contra el oráculo DXF del mismo dibujo con XYZ completo. Corrida del
2026-09-01: `face3d` 2/2, `polyline3d` 1/1, `polymesh` 1/1, `polyfaceMesh` 1/1,
**0 discrepancias**. El dato estaba enterrado en una matriz de 39 tipos donde
nadie lo miraba.

**Y sin embargo la evidencia es delgada.** Cero discrepancias sobre un corpus
exigente y cero sobre uno que no prueba casi nada se ven idénticas desde la
matriz agregada. La sonda nueva `probe-3d-legacy-coverage.mjs` (gate
`check:dwg-3d-heredado`) separa las dos mitades y mide los casos:

| dimensión | estado |
| --- | --- |
| 3DFACE con Z real en las esquinas | **completo** (`[0,0,15,15]`, `[0,5,20,10]`) |
| 3DFACE: combinaciones de banderas de arista | **parcial** (2 de 6; sin triángulo degenerado) |
| POLYLINE 3D con Z distinta por vértice | **completo** (`[0,10,20,5]`) |
| POLYLINE 3D abierta y cerrada | **parcial** (sólo cerrada) |
| POLYLINE MESH: tamaños de malla | **parcial** (una sola, `3x4`) |
| POLYFACE con índice negativo (arista invisible) | **ausente** |

**Fidelidad 5/5 campo a campo; cobertura 2/6 completas, 3 parciales, 1
ausente.** Ése es el número honesto, y es el que el titular necesita para
decidir si firma el perfil o espera a la ola 3.

De paso, una corrección concreta: entre lo que §9.2 atribuye a la ola 3,
«POLYLINE 3D con Z distinta por vértice» **ya está** en el corpus admitido. Lo
que la ola 3 sigue aportando de verdad son las seis combinaciones de banderas,
el 3DFACE degenerado, las mallas 7×9 y 5×5 cerrada en N, y los índices
negativos.

Nada de esto mueve una firma: `DWG_3D_WIREFRAME_BETA_AUTHORIZATION.ownerSigned`
sigue en `false`, el perfil sigue sin ampliarse y el 3D heredado sigue llegando
al producto como objeto opaco con su pérdida declarada.

## Corte 2026-09-01 (j) — el camino PÚBLICO de escritura pasa de siete clases a ocho

**Lo que había.** `ac1015-entity-writer.ts` —el writer interno— emitía nueve
tipos: line, point, circle, arc, lwpolyline, text, insert, **ellipse** y
**mtext**. Pero `canonical-to-dwg.ts`, que es el camino **público**, sólo
enrutaba siete y mandaba el resto al `default`, declarándolo
`canonical-type-not-writable`. La lista del producto
(`DWG_EXPORT_WRITABLE_TYPES`) reflejaba fielmente ese siete, así que la brecha
**no estaba en el producto ni en el writer**, sino en la traducción de en medio.

**Lo que cambia.** ELLIPSE se enruta. Sus cinco campos mapean uno a uno en toda
la cadena (`center`, `majorAxis`→`majorAxisEndpoint`, `ratio`→`axisRatio`,
`startParameter`→`startAngle`, `endParameter`→`endAngle`), sin convertir nada
y sin inventar nada.

**La trampa que apareció al enrutarla, y que estuvo a punto de colarse.** Los
parámetros de la elipse están en **GRADOS** en el documento del producto
—`curve-edit.ts` los normaliza con `normalizeDeg`, `curve-model.ts` con
`norm360`, y `paper-space.ts` compara la vuelta entera contra `359.999`— y en
**RADIANES** en el canónico, como el resto de ángulos. Enrutarla sin convertir
habría exportado **toda elipse recortada con el arco equivocado**, en silencio
y sin pérdida declarada. Medido antes y después:

| | antes | ahora |
| --- | --- | --- |
| ¿la elipse llega al archivo? | **no** | **sí** |
| centro / eje mayor / razón | — | exactos |
| arco de 90° | — | **1.570796 rad** (π/2) |
| pérdida declarada | `canonical-type-not-writable` | `ellipse-extrusion-not-carried` |

**La extrusión es lo único que se pierde, y ahora SE DICE en los dos sentidos.**
El canónico no modela el plano de una elipse. Al escribir se emite el plano XY
y se declara; al **leer** se descartaba en silencio, y desde este corte se
declara `ellipse-extrusion-dropped` cuando el plano NO es el XY —sólo entonces,
para no llenar el manifiesto de ruido en el caso normal, que es el de las dos
elipses del corpus admitido, ambas con `(0,0,1)`.

**Dos guardianes de la carencia, reescritos y no debilitados.** Había dos
pruebas que usaban una elipse como ejemplo de «clase no escribible». Se cambian
por SPLINE, que sigue sin emitirse de verdad, y se añaden las dos mitades
nuevas: que la elipse se proyecta, y que va y vuelve exacta por el lector
público con un arco RECORTADO —una vuelta entera habría disimulado justo el
fallo de unidades.

**Corrección de una afirmación falsa.** `oda-roundtrip.mjs` declaraba entre sus
limitaciones que «MTEXT… sigue siendo pendiente declarado del writer:
`writeAc1015EntityBody` aún no las emite». Es falso: `emitMText` existe y es
espejo campo a campo de `decodeMText`. Lo que de verdad falta de MTEXT es el
**camino público**, y por una razón concreta que ahora consta: el canónico no
transporta ni la alineación ni el interlineado que el producto sí modela, así
que enrutarla hoy los aplanaría en silencio. Se declara en vez de hacerlo.

Sigue en pie: **ningún flag encendido**, `externalOracleVerified` en `false`, y
un caso nuevo (`elipse`) esperando al titular en el harness del oráculo, con su
gemelo público.

## Corte 2026-09-02 — la novena clase escribible: el HATCH de relleno SÓLIDO

El corte anterior enrutó la elipse, que era enrutado puro: el writer ya la
emitía. Éste es distinto — el writer **no** emitía HATCH en absoluto—, y con
un límite que el propio formato dicta.

**Por qué sólo el sólido.** `decodeHatch` lee el bloque de definición del
patrón —ángulo, escala, doble trama y las líneas con sus trazos— **sólo cuando
`solidFill` es falso**. Un relleno sólido salta ese bloque entero. El documento
canónico transporta el **nombre** del patrón, no su geometría, así que un
sombreado con patrón sólo se podría escribir **inventándose** esa definición.
Se escribe el sólido; el de patrón se declara `hatch-pattern-not-writable`
nombrando el patrón concreto.

**Medido de punta a punta** con `exportCadDocumentToDwg` sobre un documento con
los dos:

| | resultado |
| --- | --- |
| preflight | `writableCount: 1`, `unwritableByType: {hatch: 1}` |
| sombreados en el archivo | **1 de 2** — el sólido, con sus 4 vértices y su cierre |
| pérdidas | `hatch-authoring-defaults` y `hatch-pattern-not-writable` |

**El preflight pasa a ser por INSTANCIA, no por tipo.** Hasta ahora cada clase
era escribible entera o nada, y un `Set` de tipos bastaba. El HATCH lo rompe: un
conjunto por tipo tendría que **mentir en una de las dos direcciones** —incluir
`hatch` prometería sombreados con patrón que luego se pierden; excluirlo daría
por perdidos los sólidos que sí viajan—. Como el preflight existe justamente
para que la pérdida no sorprenda DESPUÉS, ahora pregunta por la entidad
concreta (`cadEntityIsDwgWritable`).

**Lo que se declara sin ser una pérdida del origen.** Asociatividad, estilo,
tipo de patrón y puntos semilla no viajan en el canónico: se escriben en su
valor neutro y se declara `hatch-authoring-defaults`. Son decisiones de autoría,
como la extrusión de la elipse, y aun así constan: quien reexporte un sombreado
asociativo de un archivo ajeno tiene que leer que dejó de serlo.

**Lo que el round-trip propio NO puede probar, y por eso importa el oráculo.**
El lector propio acepta lo que el writer propio escriba. Que un sombreado con
cero semillas, estilo 0 y sin asociatividad sea un sombreado que **otro
programa** abre sólo lo dice un lector ajeno: caso `sombreado-solido` nuevo en
el harness, con su gemelo público. El titular corre ahora **dieciséis**.

**Dos particiones por presupuesto de monolito, ninguna presupuestada.**
`ac1015-entity-writer.ts` (842 líneas) se parte en `ac1015-entity-emitters.ts`:
allá queda decidir QUÉ entidad se escribe —validación, código de tipo, prólogo
común, handles—, aquí el saber concreto de cada clase, que es lo que crece al
aprender una más. `oda-roundtrip.mjs` (861) se parte en
`oda-roundtrip-cases.mjs`: el arnés no cambia al añadir un caso; los dibujos sí.

Sigue en pie: **ningún flag encendido** y `externalOracleVerified` en `false`.
