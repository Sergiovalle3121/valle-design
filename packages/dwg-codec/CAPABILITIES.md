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
| Base neutral AC1024/AC1027/AC1032 | `experimental-lab` | Abre 8/8 con **0 geometrías distintas**. INSERT y TEXT no tienen cuerpo medido; el color y las banderas de capa, las variables de cabecera y los registros de clase **no se decodifican y se declaran ausentes**. |

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

1. **Variables de cabecera.** Leídas con la forma de AC1018 dan «A BD flag of
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
3. **Color y banderas de una capa.** Se intentaron medir con la MISMA técnica
   que resolvió el cuerpo de entidad —barrer la anchura del prólogo de objeto—
   y el barrido completo de 0..120 bits dio **cero** aciertos: las banderas de
   capa de R2010+ no son el `BS` de R2000 en ninguna posición. El modelo
   relajado que suelta el color «acierta» 18/18 en **cuatro** anchuras a la vez
   (4, 24, 53 y 59 en AC1024), y eso **no es evidencia**: los tres campos de
   xref valen su defecto en todo el corpus, así que coincidir con ellos es
   coincidir con ceros. Medirlos exige un corpus con capas de colores y estados
   variados: es un intake aparte. `colorIndex` y `stateFlags` viajan
   `undefined` y el lienzo pinta un gris neutro deliberadamente distinto de
   cualquier ACI, con su pérdida declarada.

**Capacidad ausente declarada, sin suavizar**: INSERT y TEXT no tienen cuerpo
medido en R2010+ y entran en `unsupported`, enumerados y nunca callados. La
pertenencia entidad→bloque está implementada con la MISMA regla que el
ensamblado AC1015 pero **no medida**: el corpus no trae ni un objeto de modo 0,
y cada uso deja diagnóstico. Ninguna capacidad se promueve: el corte sigue en
`experimental-lab` y ningún flag se enciende.

Evidencia: `docs/cad/evidence/dwg-corpus-validation.json`, reproducible con
`node scripts/dwg/validate-corpus.mjs`.
