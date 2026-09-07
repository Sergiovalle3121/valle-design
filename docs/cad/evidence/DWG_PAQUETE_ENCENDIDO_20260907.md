# Paquete de encendido DWG — corte 2026-09-07

> **Frente DWG-Encendido.** Este documento es un **paquete de lectura**, no un
> ADR y no un gate. No reemplaza ni modifica ningún ADR existente
> (`0004`, `0007`, `0009`, `0012`, `0014`, `0015`): **enlaza** a ellos y a la
> evidencia real en `docs/cad/evidence/`, y cuando una cifra ya vive en un
> bloque generado de otro documento (`docs/cad/evidence/dwg-firma-encendido-20260904.md`,
> mantenido por `node scripts/dwg/check-firma-package.mjs`), este documento la
> **cita con su fecha de corte** en vez de volver a calcularla.
>
> **Aviso de vigencia.** A diferencia de `dwg-firma-encendido-20260904.md`,
> este documento **no tiene un gate que lo regenere**. Cada cifra citada aquí
> lleva la fecha del artefacto de donde salió y el comando exacto para
> refrescarla. Si ese comando produce un número distinto del que aparece aquí,
> el comando tiene razón, no esta página — exactamente la regla 4 de la
> campaña de cimientos (`AGENTS.md`).
>
> **Ninguna bandera se tocó para escribir este documento.**
> `apps/web/src/lib/cad/dwg-interop-flag.ts` y
> `apps/web/src/lib/cad/dwg-export-flag.ts` siguen exactamente como estaban:
> `DWG_IMPORT_FLAG = false`, `DWG_EXPORT_FLAG = false`. Verificado leyendo
> ambos archivos el 2026-09-07, no supuesto.

## 0. De dónde sale cada cifra de este documento

| Artefacto | Generado | Qué mide |
| --- | --- | --- |
| `docs/cad/evidence/dwg-decoder-matrix.json` | 2026-09-01T07:08:33.709Z | Censo de tipos que el laboratorio decodifica y cuáles tienen verificación independiente; corpus fijado por commit |
| `docs/cad/evidence/dwg-corpus-validation.json` | ver campo `generadoEn` del archivo | Matriz de fidelidad **por versión** (AC1015/1018/1024/1027/1032) contra el oráculo DXF del corpus |
| `docs/cad/evidence/dwg-corpus-rewrite.json` | ver campo `generadoEn` del archivo | Qué reescribe el writer sobre el MISMO material ajeno, y qué queda anclado al DXF del oráculo |
| `docs/cad/evidence/dwg-oda-roundtrip.json` | 2026-08-21T16:04:21.826Z | Casos verificados por el conversor ODA (oráculo externo real) sobre la API pública de escritura |
| `docs/cad/evidence/dwg-structural-fuzz.json` | ver campo `generadoEn` del archivo | Fuzzing estructural sobre DWG reales mutados |
| `docs/cad/evidence/dwg-firma-encendido-20260904.md` | corte 2026-09-04 | Paquete de firma ya redactado por el frente F1 de «Superar a AutoCAD completo»; matriz por clase generada, pasos exactos del titular, commit del encendido |
| `apps/web/src/lib/cad/dwg-interop-flag.ts` / `dwg-export-flag.ts` | leídos en vivo | Valor real de banderas y gates |
| `node scripts/dwg/check-oracle-evidence.mjs` | corrido 2026-09-07 en esta sesión | Estado real del oráculo de exportación (no supuesto, ejecutado) |

Comando para refrescar el censo del laboratorio antes de confiar en cualquier
cifra de este documento:

```sh
node scripts/dwg/dwg-evidence.mjs --check
```

## 1. Matriz de soporte real por versión y por clase de entidad

### 1.1 Censo del laboratorio (`dwg-decoder-matrix.json`)

Cifras citadas del campo `resumen` y `capacidades` del archivo, corte
2026-09-01T07:08:33.709Z, corpus commit `0688fb9c395b9cac4169d1ee9c23a7370cc28cf3`
(repo hermano `valle-design-dwg-conformance`, 7 bundles admitidos, 57
fixtures, 14 validaciones independientes autorizadas, 71 oráculos
independientes según el campo `corpus.oraculosIndependientes`):

| Métrica | Valor real |
| --- | --- |
| Tipos de entidad/objeto decodificados en el laboratorio | **65** |
| — con verificación independiente (contra oráculo ajeno) | **51** |
| — sin verificación independiente todavía | **14**: `SEQEND`, `DICTIONARY`, `VIEW_CONTROL`, `VIEW`, `UCS_CONTROL`, `UCS`, `VPORT_CONTROL`, `VPORT`, `APPID_CONTROL`, `APPID`, `VP_ENT_HDR_CONTROL`, `VP_ENT_HDR`, `GROUP`, `XRECORD` |
| Geometrías con proyección al modelo neutral del producto | **24** (`geometriasNeutrales`) |
| Capacidades evaluadas bajo la regla de promoción del laboratorio | **11** |
| Capacidades que esa regla PROMUEVE | **2 de 11**: `signatureDetection`, `boundedBinaryPrimitives` |

**Qué significa que sólo 2 de 11 estén "promovidas".** La regla de promoción
del propio laboratorio (`reglaDePromocion` en el JSON) exige que el
laboratorio declare la capacidad `supported` en su matriz interna
(`CAPABILITIES.md`) — no `experimental-lab`, no `product-beta-flag-gated` — y
que tenga bundle admitido y ≥2 validaciones independientes. Bajo ese
criterio, HOY, **nada de lo que realmente lee o escribe un DWG cuenta como
promovido**: `ac1015Envelope`, `objectDatabase`, `headerVariables`,
`symbolTables` y `r2004Container` siguen `experimental-lab`; `entityImport` y
`cadDocumentMapping` (lo que sí llega al producto por la beta) están en
`product-beta-flag-gated` — un estatus DISTINTO de "promovido", que exige su
propio ADR de promoción (ADR-0009) en vez de la regla genérica del
laboratorio; `dwgExport` sigue `experimental-lab-writer`; `roundTrip` sigue
`external-oracle-verified` sin llegar a `supported`. Las dos únicas
promovidas son primitivas internas (detección de firma, aritmética binaria
acotada), no capacidad DWG utilizable. Esto **no contradice** que la beta de
producto exista: la beta corre por el mecanismo separado y más estrecho de
ADR-0009 (`DWG_BETA_AUTHORIZATION`), no por esta regla de promoción del
laboratorio.

### 1.2 Matriz REAL por versión (`dwg-corpus-validation.json`) — la asimetría que importa

Este es el hecho que la sección 1.1 no muestra por sí sola: **el corpus que
respalda "0 discrepancias" no es del mismo tamaño para las cinco versiones.**

| Versión | Archivos DWG reales | Abiertos | Tipos de entidad distintos ejercitados | Discrepancias |
| --- | --- | --- | --- | --- |
| AC1015 (2000) | 25 | 25/25 | **26** tipos (line, insert, circle, arc, point, lwpolyline, text, attrib, attdef, dimension×1 agregado, hatch, mtext, leader, tolerance, mline, viewport, ellipse, spline, ray, xline, face3d, solid, trace, polyline3d, polymesh, polyfaceMesh) | 0 |
| AC1018 (2004) | 8 | 8/8 | **7** tipos (line, arc, circle, point, lwpolyline, text, insert) | 0 |
| AC1024 (2010) | 8 | 8/8 | **7** tipos (los mismos 7) | 0 |
| AC1027 (2013) | 8 | 8/8 | **7** tipos (los mismos 7) | 0 |
| AC1032 (2018) | 8 | 8/8 | **7** tipos (los mismos 7) | 0 |

Verificado directamente contra `resumen.porVersion` del JSON: el bloque
`matrizEntidades` de AC1018/1024/1027/1032 sólo trae las claves `line`,
`arc`, `circle`, `point`, `lwpolyline`, `text`, `insert` — exactamente los
mismos siete fixtures espejo del mismo dibujo AC1015, convertidos por el ODA
File Converter a cada contenedor. AC1015 es el único con el corpus rico de
26 tipos (dimensiones, hatch, mtext, splines, mallas, sólidos…).

**Por qué esto importa para la decisión de encendido:** "cero discrepancias"
en AC1024/AC1027/AC1032 es una afirmación real y medida, pero mide una
superficie mucho más angosta que la misma frase para AC1015. Un despacho que
reciba un AC1032 con hachurados, cotas, splines o mallas — el caso normal de
un archivo real de AutoCAD 2018-2026 — está entrando a territorio que este
corpus **no ejercita en ninguna versión moderna**, aunque el contenedor y las
siete clases básicas midan perfecto.

### 1.3 Qué de ese censo entra realmente al perfil de PRODUCTO hoy

El perfil vigente en el código es `AC1015_MODELSPACE_2D_V3`
(`BETA_PROFILE_ENTITY_KINDS`, `apps/web/src/lib/cad/dwg-native-reader.ts`
líneas 60-73, leído en esta sesión): sólo 12 tipos de entidad de nivel
superior entran al documento canónico —`line, point, circle, arc,
lwpolyline, text, insert, ellipse, spline (sólo escenario 1 no racional),
mtext, dimension (salvo angular de dos líneas), hatch`—, y sólo en
**model space**. El resto de los 65 tipos que el laboratorio decodifica
(§1.1) se declara "fuera de perfil" (`dwg_beta_profile_entity_excluded`,
severidad `info`) cuando aparece en un archivo real, nunca se descarta en
silencio.

La matriz por CLASE con las cinco columnas medidas (lectura de laboratorio,
¿en el perfil de importación?, escritura, anclaje al oráculo, límite
declarado) ya está construida, generada y verificada por gate en
`docs/cad/evidence/dwg-firma-encendido-20260904.md` §3 — no se repite aquí
letra por letra porque esa tabla tiene su propio gate
(`node scripts/dwg/check-firma-package.mjs --check`) que la mantiene honesta;
duplicarla a mano en este documento sería crear una segunda copia que puede
envejecer sin que nada lo note (regla 4, `AGENTS.md`). Resumen de lectura de
esa tabla, sin copiar sus fracciones exactas: de las 27 clases que mide, 12
entran al perfil de importación, 15 quedan fuera a propósito con pérdida
declarada, y de las 27 sólo 12 son escribibles hoy por el writer
(`regrabada-integra`) — las otras 15 fallan cerrado con
`DWG_VERSION_DECODER_UNSUPPORTED`.

**Versiones que el perfil de PRODUCTO acepta hoy, con su firma real** (leído
de `dwg-interop-flag.ts` y `dwg-native-reader.ts` en esta sesión, no
supuesto):

| Firma | ¿Firmada por el titular? | ADR | Mecanismo | Variable de build | ¿Wireada en Dockerfile? |
| --- | --- | --- | --- | --- | --- |
| AC1015 | **Sí** (`DWG_BETA_AUTHORIZATION.ownerSigned: true`) | ADR-0009 §6-bis/ter/quater | siempre aceptada por `readDwgNeutralDatabase` | `NEXT_PUBLIC_DWG_NATIVE_IMPORT_BETA` | Sí (`apps/web/Dockerfile` ARG+ENV, validado por `scripts/deploy/validate-dockerfiles.mjs`) |
| AC1018 | **Sí** (`DWG_AC1018_BETA_AUTHORIZATION.ownerSigned: true`) | ADR-0009 §7 | requiere `allowAc1018: true` | `NEXT_PUBLIC_DWG_AC1018_IMPORT_BETA` | Sí |
| AC1024/1027/1032 | **No** (`DWG_MODERN_BETA_AUTHORIZATION.ownerSigned: false`) | propuesto, sin firmar | `dwgModernBetaImportIsEnabled` siempre `false` | `NEXT_PUBLIC_DWG_MODERN_IMPORT_BETA` | Sí, pero sin efecto: la conjunción de tres condiciones se cierra en la firma que falta |
| Perfil 3D heredado (3DFACE/POLYLINE 3D/MESH/PFACE) | **No** (`ownerSigned: false`) | ADR-0009 §9, sin firmar | `dwg3dWireframeBetaImportIsEnabled` siempre `false` | `NEXT_PUBLIC_DWG_3D_WIREFRAME_IMPORT_BETA` | Sí, sin efecto por la misma razón |

**Hallazgo que vale la pena decir con todas sus letras**: la beta de AC1015
(perfil V3) **ya tiene la firma del titular** desde 2026-08-24
(ADR-0009 §6-bis/ter/quater) y su variable de entorno ya está integrada en el
pipeline de despliegue. Lo único que falta para que un tenant específico vea
la puerta abierta para AC1015 es que su despliegue defina
`NEXT_PUBLIC_DWG_NATIVE_IMPORT_BETA=true` en tiempo de build — no un nuevo
ADR, no una nueva firma. La bandera `DWG_IMPORT_FLAG` de
`dwg-interop-flag.ts` es una vía DISTINTA y hoy irrelevante para esto: es el
gate de promoción GENERAL (§5 de ADR-0009), gobernado por
`DWG_PROMOTION_GATES`, que sigue en cero en los siete campos. Ver §5 de este
documento para el porqué exacto.

## 2. Límites reales de hoy

### 2.1 Import — qué NO entra aunque la beta AC1015/1018 esté encendida

- **Nada fuera de model space.** Espacio papel, layouts, viewports de papel:
  no se leen (VIEWPORT decodifica en el laboratorio pero está fuera del
  perfil V3 — confirmado en la matriz de §1.3).
- **Xrefs**: ni se resuelven ni se incrustan. Confirmado en
  `dwg-firma-encendido-20260904.md` §4.
- **TABLE** (clase R2005+): no existe en AC1015; el corpus admitido no la
  ejercita.
- **SPLINE racional o de puntos de ajuste (escenario 2)**: el laboratorio SÍ
  los decodifica; el perfil de producto sólo admite escenario 1 no racional
  (`toBetaProfileGeometry` en `dwg-native-reader.ts`, línea 113-114).
- **DIMENSION angular de dos líneas**: excluida explícitamente por riesgo de
  vértice al infinito (mismo criterio que ya aplica el importador DXF a
  cotas ajenas sin XDATA propia).
- **HATCH con contorno curvo** (línea/arco/arco elíptico/spline): sólo
  contorno poligonal entra.
- **XDATA de cotas propias** (precisión, unidades, prefijo/sufijo, flecha):
  DWG no tiene ese canal para un archivo que no pasó por el exportador de
  este producto — nunca lo tendrá para archivo ajeno.
- **AC1021 (2007)**: contenedor Reed-Solomon distinto, detectado y
  rechazado con mensaje propio; no está en la hoja de ruta.
- **AC1024/1027/1032 (2010/2013/2018)**: el contenedor abre y el censo del
  laboratorio los lee con las mismas 7 clases básicas medidas (§1.2), pero
  `readDwgNeutralDatabase` los sigue **rechazando** hoy porque
  `DWG_MODERN_BETA_AUTHORIZATION.ownerSigned` es `false` — no hay firma, así
  que ni siquiera con las tres variables de entorno encendidas un cliente
  puede importar un AC1032 en este release.

### 2.2 Import — "preservación opaca" vs "no soportado", la distinción real

El producto tiene **un solo mecanismo real de preservación opaca hoy**, y
está SIN FIRMA: el perfil 3D heredado propuesto (ADR-0009 §9). Si algún día
se firma, 3DFACE/POLYLINE 3D/POLYLINE MESH/POLYLINE PFACE entrarían como
`CadOpaqueEntity` (JSON estructurado con Z real, `provider:
"dwg-neutral-bridge"`) — visibles e inspeccionables, pero sin renderizar,
sin grips, sin snap, sin comandos de edición. Mientras `ownerSigned` sea
`false` (hoy lo es), este camino no tiene ningún efecto observable en
producción: la conjunción de tres condiciones en
`dwg3dWireframeBetaImportIsEnabled` se cierra por la firma que falta,
así que estas cuatro clases caen exactamente al mismo diagnóstico genérico
"fuera de perfil" que cualquier otro tipo no soportado, no a preservación
opaca real.

Todo lo demás que el laboratorio decodifica pero el perfil V3 no proyecta
(HATCH curvo, SPLINE racional, DIMENSION angular de dos líneas, y las
15 clases fuera de perfil de la matriz de §1.3) es **"no soportado, con
pérdida declarada"** — no preservación opaca: el objeto no viaja al
documento en ninguna forma, sólo se registra en el manifiesto de pérdidas
con su handle y su motivo. La diferencia práctica para un usuario: con
preservación opaca el objeto sigue en el archivo (JSON inspeccionable, Z
real conservada); sin ella, el objeto simplemente no está en el documento
importado.

### 2.3 Export — el estado es mucho más angosto que import

- El writer (`writeCanonicalDwg` en el laboratorio) escribe **AC1015
  únicamente**, siempre — nunca AC1018+ (un archivo de origen moderno se
  "baja de versión" a AC1015 al exportar, no hace round-trip real).
- Subconjunto escribible medido sobre material ajeno
  (`dwg-corpus-rewrite.json`): de 327 entidades vistas del corpus, **284
  (86.9%) se regraban**, **43 no son escribibles** y fallan cerrado con
  `DWG_VERSION_DECODER_UNSUPPORTED`. Clases íntegras:
  `arc, attrib, circle, ellipse, hatch, insert, line, lwpolyline, mtext,
  point, text, viewport`. Clases no escribibles:
  `attdef, dimension, face3d, leader, mline, polyfaceMesh, polyline2d,
  polyline3d, polymesh, ray, solid, spline, tolerance, trace, xline`.
- **Sin cotas en export.** `dimension` se lee completa por el perfil de
  importación y NO se puede escribir — un plano exportado a DWG pierde sus
  cotas, justo lo que un despacho notaría primero.
- **Sin directriz** (`leader`) en export, aunque el producto sí modela
  `mleader` nativamente.
- **Cero botón de producto.** A diferencia de import, la exportación no
  tiene NINGÚN componente de UI que la consuma: `check-product-boundary.mjs`
  sólo autoriza `dwg-native-writer.ts` y su propia spec — ningún componente
  de React lo importa. No hay variable `NEXT_PUBLIC_DWG_EXPORT_*` en
  `.env.example` ni en `apps/web/Dockerfile` (verificado con `grep`, cero
  resultados). Encender `DWG_EXPORT_FLAG` hoy no tendría NADA que cablear del
  lado de interfaz: la puerta ni siquiera existe todavía.
- **El oráculo externo de exportación sigue sin cerrar** — ver §4.

## 3. Riesgos

### 3.1 Riesgos legales

- **Ingeniería inversa / procedencia (ADR-0007).** El laboratorio se
  construyó citando únicamente la especificación pública Open Design
  Specification 5.4.1 (`status: allowed`, "facts only, no redistribution")
  y mediciones sobre corpus propio; cero código, comentario, tabla o test
  copiado de ODA SDK/RealDWG/LibreDWG/Autodesk (`SOURCE_REGISTER.json`,
  `CLEAN_ROOM_POLICY.md`). El riesgo real no es que el laboratorio haya
  hecho algo prohibido — la disciplina de registro-antes-de-derivar está
  para demostrar que no— sino que **encender el producto expone esa
  investigación al escrutinio externo por primera vez**: hoy nadie fuera del
  repositorio depende de que el clean-room sea impecable; con el flag
  encendido, un cliente real sí.
- **`legalReviewCleared` sigue `false`, sin fecha.** ADR-0009 §6-bis.2 acordó
  encargar el dictamen jurídico externo EN PARALELO a la construcción, no
  antes — es una decisión ya tomada por el titular, no un olvido. Pero
  encender las banderas de este documento no mueve ese campo ni un bit, y la
  ausencia de dictamen sigue siendo el riesgo legal más grande sin gate que
  lo cierre (`dwg-firma-encendido-20260904.md` §5.4 lo dice con las mismas
  palabras).
- **TrustedDWG.** El writer NO emite ni imita el watermark de Autodesk;
  AutoCAD mostrará su aviso "no TrustedDWG" en archivos nuestros. Es legal y
  esperado, pero es una superficie de soporte al cliente (§3.3) tanto como
  legal.
- **Un solo oráculo externo, no dos.** La política interna
  (`DWG_REQUIRED_INDEPENDENT_VALIDATIONS = 2`) pide dos validaciones
  independientes; hoy sólo existe una (ODA File Converter 27.1). El intento
  de cablear un segundo (LibreDWG) está documentado como fallido en esta
  máquina —no empaquetado, sin snap/flatpak, sin acceso a artefactos por el
  proxy— y explícitamente se decidió NO compilar LibreDWG desde fuente en la
  misma máquina que escribe el clean-room, porque eso sería precisamente la
  contaminación que ADR-0007 prohíbe (`dwg-firma-encendido-20260904.md` §6).

### 3.2 Riesgos de producto (qué se rompe si se enciende HOY)

- **Encender `DWG_IMPORT_FLAG` en `dwg-interop-flag.ts` a secas no rompe
  nada — porque no hace nada.** `dwgImportIsEnabled()` sigue devolviendo
  `false` mientras `DWG_PROMOTION_GATES` tenga cualquiera de sus siete
  campos en su valor cerrado (los siete lo están hoy). El riesgo de producto
  real no está en esa bandera: está en la variable de entorno
  `NEXT_PUBLIC_DWG_NATIVE_IMPORT_BETA`, que si un despliegue la pone en
  `true` **sí abre la puerta de AC1015 hoy mismo**, porque
  `DWG_BETA_AUTHORIZATION.ownerSigned` ya es `true`.
- **Si ese despliegue ocurre**, el riesgo de producto concreto es: un
  archivo AC1015 real con HATCH de contorno curvo, SPLINE racional, cota
  angular de dos líneas, xrefs o cualquier objeto de las 15 clases fuera de
  perfil llega y produce un documento parcial con manifiesto de pérdidas —
  comportamiento por diseño, no un bug, pero un usuario que espera "abrí mi
  DWG" y recibe "abrí una fracción de mi DWG" es una experiencia de producto
  que hay que anunciar con el mismo cuidado que ya exige AGENTS.md
  ("ninguna capacidad se anuncia sin evidencia del límite").
- **Presupuestos de recursos son sólo reducibles, nunca ampliables**
  (`DWG_LIMIT_BOUNDS`): 16 MiB por archivo, 2 s de pared, 1M objetos por
  defecto. Un despacho con planos grandes reales (arquitectura con muchos
  bloques, ingeniería con mallas densas) puede chocar contra ese techo el
  primer día — es un límite conocido, no un descubrimiento, pero es soporte
  al cliente en cuanto hay un cliente real.
- **El fuzzing cubre mutaciones del corpus admitido, no un corpus
  adversarial de terceros.** `dwg-structural-fuzz.json`: 1200 mutaciones
  sobre 25 DWG reales, cero excepciones sin tipar, cero
  `DWG_INTERNAL_ERROR`, cero cuelgues — evidencia real y sólida, pero sobre
  el mismo corpus fundacional, no sobre proxies, verticales AEC ni objetos
  custom de terceros (la cola de reserva R.5 de ADR-0009, sin fecha).
- **Encender `DWG_EXPORT_FLAG` hoy literalmente no puede romper nada en
  producción** porque no hay ningún componente de UI que lo consuma
  (§2.3) — el riesgo de producto de exportación es enteramente futuro,
  del día en que exista el botón.

### 3.3 Riesgos de soporte al cliente

- **"Interoperable con ODA, no verificado contra AutoCAD real."** Esta
  advertencia de representatividad (`CORPUS_POLICY.md` del repo de
  conformidad) tiene que viajar íntegra en cualquier texto de producto que
  describa la beta, y hoy es fácil de omitir por accidente en un primer
  copy de marketing o de ayuda.
- **Un cliente que reporta "mi DWG no abrió bien" no tiene forma de saber si
  cayó en un límite declarado o en un bug real** sin leer el manifiesto de
  pérdidas — soporte necesitará entrenamiento específico en los códigos de
  diagnóstico (`dwg_beta_profile_entity_excluded`,
  `DWG_VERSION_DECODER_UNSUPPORTED`, etc.) antes del día uno.
- **Rollout por organización, nunca activación global** es la mitigación ya
  decidida (ADR-0009 §10 / `dwg-firma-encendido-20260904.md` §1 y §9): limita
  el radio de un problema de soporte a los tenants que explícitamente lo
  pidieron, pero exige que exista ya un mecanismo operativo de flag por
  tenant — que hoy es una variable de build de todo el contenedor
  (`NEXT_PUBLIC_*`), no un flag por organización en runtime. Ese es un hueco
  de ingeniería entre "lo que el ADR promete" y "lo que el Dockerfile puede
  hacer hoy" que vale la pena que el titular vea antes de encender nada.

## 4. Checklist de gates — por su script real

Todos verificados por nombre en `package.json` en esta sesión, no
inventados:

| Gate | Comando real | Qué verifica | Estado citado |
| --- | --- | --- | --- |
| Censo del laboratorio al día | `npm run check:dwg-evidence` (`dwg-evidence.spec.mjs && dwg-evidence.mjs --check`) | Que `dwg-decoder-matrix.json` sigue coincidiendo con el código del laboratorio | Parte de `check:cad` |
| Frontera de producto | `node scripts/dwg/check-product-boundary.mjs` | Que sólo `dwg-native-reader.ts`/`dwg-native-writer.ts` y sus specs referencian el códec en runtime; que sólo el worker de importación consume el reader | Parte de `check:dwg` |
| Corpus admitido presente | `npm run check:dwg-corpus` | Que el espejo del repo de conformidad (`VALLE_DWG_CORPUS_MIRROR`) está fijado por commit y hash | Parte de `check:dwg` |
| Cabecera/cuerpo/handles/cadenas/tablas R2010+ | `check:dwg-r2010-header/body/handles/strings/tablas/cabecera` | Hechos medidos del contenedor moderno (M4) | Parte de `check:dwg` |
| Capa/tipo de línea, 3D heredado, MTEXT | `check:dwg-capa-estado`, `check:dwg-capa-ltype`, `check:dwg-3d-heredado`, `check:dwg-mtext` | Fidelidad de sondas específicas | Parte de `check:dwg` |
| **Oráculo de exportación** | `npm run check:dwg-oraculo` (`check-oracle-evidence.mjs`) | Que `externalOracleVerified` no afirme más de lo que el conversor ajeno respalda | **Corrido en esta sesión (2026-09-07): dice `false`, 4/24 casos respaldados, 20 sin respaldo** — ver salida exacta abajo |
| **Paquete de firma no envejecido** | `npm run check:dwg-firma` (`check-firma-package.spec.mjs && check-firma-package.mjs`) | Que `dwg-firma-encendido-20260904.md` no afirme de más ni quede atrás de la evidencia; falla si alguna bandera ya está en `true` | Debe estar verde antes de tocar cualquier bandera |
| Gate agregado de DWG completo | `npm run check:dwg` | Encadena TODOS los anteriores + `npm run check --workspace=@valle-design/dwg-codec` | Requiere `VALLE_DWG_CORPUS_MIRROR` apuntando al clon local (`AGENTS.md`) o "los gates DWG mienten por entorno" |
| Gate agregado de producto | `npm run check:cad` | Incluye `check:dwg-evidence` pero **NO** incluye la cadena completa de `check:dwg` (verificado leyendo `package.json` línea 59 vs línea 86: son cadenas distintas) | — |

Salida real de `node scripts/dwg/check-oracle-evidence.mjs`, corrida en esta
sesión, sin editar:

```
check-oracle-evidence: evidencia de docs/cad/evidence/dwg-oda-roundtrip.json
  generada            : 2026-08-21T16:04:21.826Z
  casos exigidos      : 24 (cada caso del harness y su gemelo -publico)
  casos respaldados   : 4
  producto declara    : externalOracleVerified = false

  La exportación sigue cerrada, y con razón: la evidencia no cubre todos
  los casos.
```

**Antes de encender cualquier bandera**, el orden real de gates es:

1. `npm run check:cad` verde sobre el árbol quieto (committeado).
2. `npm run check:dwg` verde, con `VALLE_DWG_CORPUS_MIRROR` apuntando al
   clon real del repo hermano de conformidad.
3. Si el objetivo es exportación: `ODA_FILE_CONVERTER` + `VALLE_DWG_CORPUS_MIRROR`
   configurados, `node scripts/dwg/oda-roundtrip.mjs` corrido de verdad, y
   `npm run check:dwg-oraculo` diciendo que la evidencia ya alcanza. Esto es
   OWNER ACTION: sólo corre en una máquina con el conversor con licencia,
   que esta sesión no tiene.
4. `npm run check:dwg-firma` verde, confirmando que
   `dwg-firma-encendido-20260904.md` sigue sin envejecer.

## 5. El commit exacto de una línea — preparado, NO aplicado

**Esto no se aplicó. Ningún archivo de código se tocó en esta sesión. Se
requiere la firma del titular antes de aplicar cualquiera de los dos
cambios siguientes.**

### 5.1 `DWG_IMPORT_FLAG` → `true`

```diff
--- a/apps/web/src/lib/cad/dwg-interop-flag.ts
+++ b/apps/web/src/lib/cad/dwg-interop-flag.ts
@@ -35,7 +35,7 @@
  * el compilador estrecharía cada comprobación a `never` y las specs que vigilan el
  * encendido dejarían de compilar en cuanto alguien la cambiara. Se prefiere que
  * el spec FALLE a que el spec no compile.
  */
-export const DWG_IMPORT_FLAG: boolean = false;
+export const DWG_IMPORT_FLAG: boolean = true;
```

**Efecto real de aplicar SÓLO esto, hoy:** ninguno observable en producción.
`dwgImportIsEnabled()` sigue devolviendo `false` porque
`DWG_PROMOTION_GATES` (líneas 70-78 del mismo archivo) tiene sus siete
campos en el valor que cierra la puerta:
`promotionAdrSigned: false, legalReviewCleared: false,
securityReviewCleared: false, admittedCorpusBundles: 0,
independentValidations: 0, labEntityImportSupported: false,
canonicalMappingVerified: false`. Cambiar sólo la bandera sin tocar esos
siete campos es exactamente el "un momento, para probar" que el propio
comentario del archivo dice que existe para impedir.

### 5.2 `DWG_EXPORT_FLAG` → `true`

```diff
--- a/apps/web/src/lib/cad/dwg-export-flag.ts
+++ b/apps/web/src/lib/cad/dwg-export-flag.ts
@@ -25,7 +25,7 @@
  */

 /** La bandera. Nace apagada; `boolean` y no literal por la razón del import. */
-export const DWG_EXPORT_FLAG: boolean = false;
+export const DWG_EXPORT_FLAG: boolean = true;
```

**Efecto real de aplicar SÓLO esto, hoy:** ninguno. `dwgBetaExportIsEnabled`
exige además `DWG_EXPORT_GATES.externalOracleVerified`, que sigue `false`
(§4 de este documento, verificado con `check:dwg-oraculo` en esta sesión) —
y aunque los tres factores fueran `true`, no hay ningún componente de
interfaz que consuma esta bandera (§2.3): no existe el botón que se
habilitaría.

### 5.3 Lo que un encendido REAL exige — no una línea, y ya está escrito

El commit real que abriría AC1015 de verdad no es ninguno de los dos diffs
de arriba en aislamiento. Ya está especificado, paso a paso, en
`docs/cad/evidence/dwg-firma-encendido-20260904.md` §9 ("El commit del
encendido, exacto"): regenerar `dwg-oda-roundtrip.json` con cobertura
completa, poner `externalOracleVerified: true` en `dwg-export-flag.ts`,
mover los campos de `DWG_PROMOTION_GATES` que la evidencia ya sostiene
(`admittedCorpusBundles`, `independentValidations`,
`labEntityImportSupported`, `canonicalMappingVerified`) — dejando
`promotionAdrSigned`, `legalReviewCleared` y `securityReviewCleared` para
que el titular los ponga, nunca un programa —, encender las dos banderas
CON rollout por organización, dar de alta el módulo de interfaz en
`check-product-boundary.mjs`, y enlazar todo desde una sección nueva de
ADR-0009. Este documento no repite esos pasos: los cita.

**Camino alterno, ya firmado, que no pasa por `DWG_IMPORT_FLAG` en
absoluto:** para el perfil AC1015 (V3) específicamente, la firma del
titular YA EXISTE (ADR-0009 §6-bis/ter/quater). Un despliegue que defina
`NEXT_PUBLIC_DWG_NATIVE_IMPORT_BETA=true` en su build de contenedor abre esa
puerta hoy, sin tocar `dwg-interop-flag.ts`, para ese despliegue únicamente
— es la vía que ya está diseñada para rollout por tenant, y es un cambio de
configuración de despliegue, no un commit de código.

## 6. Recomendación honesta

**¿Está el producto listo para encender el import de AC1015 hoy mismo?**
**No de forma general, pero el "no" tiene una excepción concreta ya
firmada.**

**Lo que YA está listo, con cifras reales:**

- La firma del titular para AC1015, perfil V3, existe desde 2026-08-24
  (ADR-0009 §6-bis/ter/quater) y no requiere ninguna acción nueva del
  titular para ACTIVARSE en un despliegue de prueba — sólo una variable de
  entorno ya wireada en el Dockerfile.
- 25/25 archivos AC1015 reales del corpus admitido abren con **0
  discrepancias** contra 26 tipos de entidad distintos (§1.2) — la
  cobertura de fidelidad más rica y más ancha de las cinco versiones.
- Seguridad: presupuestos inmutables, worker supervisado, y 1200 mutaciones
  de fuzzing estructural sin una sola excepción sin tipar ni cuelgue
  (§3.2).
- `check:dwg-evidence` y `check:dwg` existen como gates reales, corribles
  hoy, y el segundo exige explícitamente el corpus hermano fijado por commit
  — no hay forma de mentir por accidente sobre qué se probó.

**Lo que NO está listo, con la misma honestidad:**

- **Un solo oráculo externo, no dos**, y el intento de cablear el segundo
  falló por razones documentadas (no por falta de esfuerzo) — la política
  interna del propio códec pide dos y hoy da cero en ese campo específico
  de `DWG_PROMOTION_GATES` (`independentValidations: 0`, aunque la beta
  angosta no dependa de ese campo).
- **`legalReviewCleared` sigue sin fecha.** Es una decisión ya tomada
  (dictamen en paralelo, no antes), pero sigue siendo cierto que ningún
  abogado externo ha mirado esto todavía.
- **El corpus de fidelidad para AC1018/1024/1027/1032 es siete clases
  básicas, no 26.** "Cero discrepancias" en esas cuatro versiones es
  literalmente cierto y completamente insuficiente para decir que el
  producto "abre archivos modernos de AutoCAD" sin calificar exactamente
  qué se probó — que es justo lo que la regla 3 de la campaña de cimientos
  exige (ninguna capacidad se anuncia sin su límite al lado).
- **El rollout por organización que el ADR promete todavía no tiene
  mecanismo de runtime**: hoy es una variable de build de todo el
  contenedor, no un flag por tenant en el sistema de entitlements. Encender
  para "un cliente piloto" hoy significa, en la práctica, un despliegue de
  contenedor separado para ese cliente — funciona, pero no es lo que "por
  organización" sugiere que ya existe.
- **Exportación no está ni cerca**: un solo booleano (`externalOracleVerified`)
  bloquea todo, y su comando de resolución (`oda-roundtrip.mjs`) sólo puede
  correrlo el titular con el conversor licenciado — OWNER ACTION explícita,
  no trabajo de ingeniería pendiente.

**La recomendación:** encender `NEXT_PUBLIC_DWG_NATIVE_IMPORT_BETA=true`
para un tenant piloto acotado (no producción pública general) es defendible
HOY con la evidencia que existe, porque la firma ya está y el perfil V3 es
el más medido de los cinco. Encender `DWG_IMPORT_FLAG` (la vía de promoción
general) o `DWG_EXPORT_FLAG` de forma que abra algo real **no** lo es
todavía: al primero le faltan seis de siete campos de gate con dueños
distintos (jurídico, seguridad, un segundo oráculo), y al segundo le falta
un botón entero además del oráculo. Ninguna de las tres cosas se resuelve
escribiendo código nuevo — se resuelven con una firma, un dictamen legal, o
un binario que hoy no está disponible en este entorno.
