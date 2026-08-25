# ADR-0009: Paquete de promoción del códec DWG propio

- Estado: ACEPTADA — firmada por el dueño 2026-08-24 para el alcance
  acotado de §6-bis (beta de importación `AC1015_MODELSPACE_2D_V1`),
  ampliada el mismo día por §6-ter a `AC1015_MODELSPACE_2D_V2`, por
  §6-quater a `AC1015_MODELSPACE_2D_V3`, y por §7 a aceptar TAMBIÉN AC1018
  (`AC1018_MODELSPACE_2D_V1`, mismo perfil de entidades V3); el 2026-08-25,
  §8 autoriza EMPEZAR M5 (exportación DWG, subconjunto V1, AC1015
  únicamente, su propio flag apagado por defecto) — no lo da por cumplido,
  sólo abre la puerta a construirlo con evidencia propia; ninguna de estas
  es la promoción general de §5, que sigue con gates pendientes
- Fecha: 2026-08-21 (paquete); firma real 2026-08-24 (§6-bis); ampliaciones
  2026-08-24 (§6-ter, §6-quater, §7); autorización M5 2026-08-25 (§8)
- Decide sobre: llevar la importación DWG del laboratorio clean-room al
  producto, detrás de un feature flag apagado
- No preautorizado por: ADR-0004 (DWG fuera del producto), ADR-0007 (el
  laboratorio no promueve nada por sí mismo)

## Qué se decide

Este documento es el paquete que el dueño firma —o no— para convertir el
códec DWG de investigación experimental en una capacidad del producto. La
integración misma NO se hizo en la campaña 2026-08-21: este ADR deja la
decisión lista para tomarse con evidencia, no con promesas.

## 1. Qué existe hoy (con su evidencia)

La fuente única de claims técnicos es `packages/dwg-codec/CAPABILITIES.md`;
la evidencia citada vive en `docs/cad/evidence/`.

### 1.1 Lectura AC1015 (AutoCAD 2000) — completa para el corpus

- **25/25 DWG reales** del corpus admitido abren y su contenido compara
  campo a campo contra los oráculos DXF de autoría propia:
  **0 discrepancias** en la matriz completa
  (`dwg-corpus-validation.json`). Tipos con geometría EXACTA: LINE, POINT,
  CIRCLE, ARC, TEXT, LWPOLYLINE, INSERT (con ATTRIB/SEQEND atados), MTEXT,
  ATTDEF, las siete variantes de DIMENSION, POLYLINE 2D/3D/malla/polyface
  con sus VERTEX, ELLIPSE, SPLINE, RAY, XLINE, SOLID, TRACE, 3DFACE,
  LEADER, TOLERANCE, MLINE, VIEWPORT y HATCH (islas incluidas).
- **Variables de cabecera**: decodificación completa de la secuencia R2000
  (152+ variables), validada contra archivos reales con anclas exactas.
- **Tablas y objetos** (STYLE, LTYPE, DIMSTYLE, VPORT, APPID, diccionarios,
  XRECORD, LAYOUT, clases): ver la matriz de capacidades al corte final de
  la campaña.
- Todo tipo no decodificado se ENUMERA con handle y tipo — nada se
  descarta en silencio.

### 1.2 Contenedor familia 2004 (2004/2010/2013/2018)

Ver `dwg-r2004-container.json`: estado real de descifrado de cabecera,
descompresión y localización de secciones sobre los 32 DWG reales de esas
versiones. AC1021 (2007) queda explícitamente FUERA (contenedor rediseñado,
uso real marginal): se detecta y rechaza con mensaje claro.

### 1.3 Escritura AC1015 con oráculo externo

Ver `dwg-roundtrip.json`: el harness escribe archivos 100% con código
propio y los pasa por el ODA File Converter 27.1 (binario oráculo, no
dependencia). El reporte declara cuántos casos acepta el lector ajeno y la
comparación campo a campo del DXF regenerado.

### 1.4 Seguridad

- Todo byte es hostil: cursores acotados, aritmética comprobada,
  presupuestos inmutables (`DwgLimits`), errores tipados con offset, fallo
  cerrado. Cero dependencias runtime.
- Fuzz determinista + suites adversariales en verde; fuzzing estructural
  sobre DWG reales mutados con casos congelados como regresión (OLA 5).

## 2. Estado legal del clean-room

- **Fuentes**: `packages/dwg-codec/SOURCE_REGISTER.json` registra cada
  fuente y hecho consultado ANTES de derivar código. Fuentes de código:
  ninguna ajena. Fuentes de hechos: la Open Design Specification 5.4.1
  (descarga pública oficial; "facts only, no redistribution") y mediciones
  first-party sobre nuestro propio corpus.
- **Corpus**: 100% de autoría propia (dibujos DXF originales de Valle)
  convertidos por herramienta independiente; política y doble validación en
  el repo `valle-design-dwg-conformance` (`CORPUS_POLICY.md`), admisión por
  hash y commit fijado.
- **Oráculos**: binarios de terceros EJECUTADOS, jamás inspeccionados. Cero
  consulta de LibreDWG/ODA SDK/RealDWG u otra implementación.
- **TrustedDWG**: nuestro writer NO emite ni imita el watermark de
  Autodesk. AutoCAD mostrará su aviso "no TrustedDWG" en archivos nuestros:
  es normal y es legal.
- **Qué falta si el dueño lo quiere**: dictamen jurídico externo
  independiente (ADR-0004/0007 lo exigen antes de disponibilidad
  comercial). Este paquete deja el expediente listo para ese dictamen.

## 3. Límites honestos

- Corpus tool-converted desde DXF propios: la evidencia demuestra
  compatibilidad con lo que ese corpus ejercita, no con cualquier DWG del
  mundo real (proxies, verticales AEC, objetos custom). La cola de reserva
  R.5 define el corpus adversarial que cerraría ese hueco.
- Presupuestos por defecto: 16 MiB por archivo, 2 s de pared, 1M objetos
  (`DEFAULT_DWG_LIMITS`; sólo reducibles).
- AC1021 (2007) fuera. IMAGE/WIPEOUT pendientes de corpus con imagen.
  MLEADER no existe en AC1015 (clase R2007+).
- La escritura cubre el subconjunto que el writer declara; lo no escribible
  falla cerrado y declarado (`DWG_VERSION_DECODER_UNSUPPORTED`).

## 4. Diseño de integración propuesto (cuando se firme)

1. **Parsing en Web Worker**: `readDwg` es puro y worker-compatible
   (`superviseWorker` ya existe); el hilo de UI jamás toca bytes hostiles.
2. **Mismo flujo que DXF**: el import DWG entra por el
   `CadInteroperabilityProvider` existente como un formato más; el detector
   web pasa a ser adaptador del límite binario (elimina la tabla duplicada
   de firmas, como exige ADR-0007).
3. **Mapeo canónico**: el adaptador base-neutral↔`CadDocument` del
   laboratorio (funciones puras, manifiesto de pérdidas por entidad) se
   invoca del lado del producto; el códec sigue sin importar nada del
   producto.
4. **Feature flag `DWG_IMPORT` apagado por defecto**; rollout por tenant.
5. **Telemetría de pérdida**: el `lossManifest` del mapeo se muestra al
   usuario en el import (como hace DXF) y se agrega para priorizar tipos.

## 5. Checklist de gates (ADR-0007) — estado al cierre de campaña

| Gate | Estado |
| --- | --- |
| Revisión jurídica externa | ☐ PENDIENTE (decisión del dueño) |
| Corpus redistribuible independiente | ✅ repo hermano, política y doble validación |
| Fuzzing | ✅ determinista + estructural con regresiones congeladas |
| Límites de recursos | ✅ `DwgLimits` inmutables, fallo cerrado |
| Fidelidad medida | ✅ matriz diferencial campo a campo en 0 discrepancias (AC1015) |
| Manifiesto de pérdidas | ✅ mapeo canónico con pérdidas declaradas |
| Tenancy | ☐ en la integración (el códec es puro; tenancy es del producto) |
| Mapping al documento canónico | ✅ en laboratorio; adaptador de producto en la integración |
| Importación real + CI/E2E | ☐ en la integración |
| Operación (telemetría, rollback) | ☐ en la integración (flag por tenant) |

## 6. Qué firma el dueño

1. Autorizar la integración descrita en §4 (un sprint de producto, no un
   proyecto de investigación).
2. Decidir si encarga el dictamen jurídico externo antes o en paralelo.
3. Aceptar los límites de §3 como estado inicial del feature.

Sin la firma, todo lo anterior permanece como investigación:
`productionAvailable: false`, provider no disponible y `.dwg` rechazado en
el producto — exactamente como hoy.

## 6-bis. Firma real — 2026-08-24

El titular firma, en conversación directa registrada en la sesión de
trabajo de esa fecha:

1. **Autoriza** la integración descrita en §4, acotada al perfil
   `AC1015_MODELSPACE_2D_V1` (importación únicamente; modelspace 2D;
   layers, colores y propiedades básicas; LINE/POINT/CIRCLE/ARC/
   LWPOLYLINE/TEXT/INSERT según lo que el reader actual entrega completo).
   Ver `docs/adr/0014-dwg-via-propia-unica.md` para el retiro simultáneo de
   la vía de proveedor licenciado que ADR-0012 dejaba abierta (numerada
   0014: otro frente registró, el mismo día, una ADR-0013 distinta y no
   relacionada — rol runtime `valle_app` para RLS).
2. **Decide** encargar el dictamen jurídico externo EN PARALELO, no antes:
   la integración técnica avanza ya, detrás de un flag apagado en
   producción pública por defecto, mientras el dictamen se gestiona por
   separado. `legalReviewCleared` en `DWG_PROMOTION_GATES` sigue `false`
   — no se falsea. La autorización de esta beta vive en un mecanismo
   DISTINTO y más estrecho, `DWG_BETA_AUTHORIZATION`
   (`apps/web/src/lib/cad/dwg-interop-flag.ts`), con el mismo patrón de
   riesgo aceptado por escrito que la Enmienda 2026-08-20 de
   `CORPUS_POLICY.md` en el repositorio de conformidad. La promoción
   general de §5 sigue exigiendo `legalReviewCleared: true` sin excepción.
3. **Acepta** los límites de §3 como estado inicial: cobertura AC1015
   parcial y sin escritura, sin AC1018+, sin espacio papel, sin XDATA, sin
   objetos proxy, un solo oráculo (ODA File Converter) detrás del corpus
   admitido, y la advertencia de representatividad de `CORPUS_POLICY.md`
   (interoperable con ODA, no verificado contra AutoCAD real) se traslada
   íntegra a cualquier texto de producto que describa esta beta.

Lo que esta firma NO autoriza: disponibilidad pública/GA, exportación DWG,
ni ninguna afirmación de compatibilidad general con DWG o con AutoCAD.
`productionAvailable` global permanece `false` hasta que §5 esté completo
y firmado aparte.

## 6-ter. Ampliación de perfil — 2026-08-24 — `AC1015_MODELSPACE_2D_V2`

§6-bis ya autorizaba, dentro del mismo perfil, una hoja de ruta secuencial
para el laboratorio (M2: más entidades AC1015; M3: AC1018; M4: versiones
modernas AC1024+; M5: exportación), condicionada explícitamente a que cada
hito sólo avanzara DESPUÉS de que el anterior tuviera su propia evidencia
end-to-end en verde. Ésta es esa condición cumplida: V1 mergeó con su
spec de Node y su E2E de navegador pasando contra un DWG real
(PR #95), y el titular, en la misma sesión de trabajo, instruyó
explícitamente continuar con la siguiente fase en cascada, directamente
contra `main`, sin abrir rama ni detenerse a confirmar cada paso.

Esta sección no es una firma nueva sobre alcance nuevo: es el registro de
M2a, el primer paso de la hoja de ruta ya firmada en §6-bis, con la
decisión de ingeniería —qué dos tipos de entidad entran primero— dejada
por escrito porque §6-bis no los nombraba uno a uno.

1. **Amplía** el perfil de §6-bis de `AC1015_MODELSPACE_2D_V1` a
   `AC1015_MODELSPACE_2D_V2`: se suman ELLIPSE completa y SPLINE
   ESCENARIO 1 (nudos + puntos de control) NO RACIONAL. Se eligieron estas
   dos por ser las siguientes que el laboratorio ya decodifica con
   fidelidad exacta (§1.1) y para las que la primitiva canónica intermedia
   (`CadDxfPrimitive`, ya usada por el importador DXF) tiene campos que
   representan la forma sin pérdida geométrica.
2. **Deja fuera, explícitamente, del perfil V2** —y por tanto declaradas
   como diagnóstico "fuera de perfil", nunca como "no decodificado"—:
   SPLINE racional, SPLINE de escenario 2 (puntos de ajuste), MTEXT,
   DIMENSION, HATCH, y todo lo demás que §1.1 lista como decodificado por
   el laboratorio pero que la primitiva canónica actual no representa sin
   inventar semántica. Quedan para un M2b posterior, que necesita una ruta
   de mapeo "semántica" además de la de primitiva plana.
3. **No toca** ninguno de los límites de §6-bis.3: sigue AC1015 únicamente,
   sigue model space 2D, sigue sólo importación, sigue apagada en
   producción pública por defecto, sigue sin `legalReviewCleared`, sigue
   con el mismo mecanismo `DWG_BETA_AUTHORIZATION` — distinto de
   `DWG_PROMOTION_GATES` — y no mueve un bit la promoción general de §5.

Lo que esta ampliación NO autoriza: ningún hito posterior a M2a de la hoja
de ruta (M2b, M3, M4, M5) se da por autorizado por adelantado más allá de
lo que §6-bis ya autorizaba como secuencia condicionada — cada uno sigue
necesitando su propia evidencia end-to-end en verde antes de empezar el
siguiente.

## 6-quater. Ampliación de perfil — 2026-08-24 — `AC1015_MODELSPACE_2D_V3`

M2a (§6-ter) cerró con su propia evidencia en verde: `check:dwg` completo,
typecheck y lint del producto, y las specs de Node del adaptador y del
puente contra bytes reales más geometría hecha a mano. Ésa es la condición
que §6-bis exige para avanzar al siguiente paso de la hoja de ruta. Éste es
M2b, el paso que §1.1 ya señalaba como pendiente en §6-ter.2: MTEXT,
DIMENSION y HATCH necesitaban una ruta de mapeo "semántica" —un intermedio
distinto de `CadDxfPrimitive`— que no existía todavía.

1. **Amplía** el perfil de §6-ter de `AC1015_MODELSPACE_2D_V2` a
   `AC1015_MODELSPACE_2D_V3`: se suman MTEXT completo, DIMENSION salvo la
   variante angular DE DOS LÍNEAS, y HATCH de contorno poligonal. El mapeo
   reutiliza los mismos consumidores probados que ya usa el importador DXF
   (`cadDxfMTextsToNativeEntities`, `cadDxfSemanticDimensionsToNativeEntities`,
   `cadDxfHatchesToNativeEntities`) — ningún segundo camino hacia el
   documento canónico. DIMENSION entra DESLIGADA de su geometría (mide sus
   propios puntos, no se entera si mueves el muro), exactamente con el mismo
   criterio y las mismas variantes que ya acepta una cota DXF que llega sin
   la XDATA propia del producto (`dxf-read-foreign-dimensions.ts`) — DWG no
   tiene XDATA en absoluto, así que ninguna cota DWG puede entrar de otra
   forma.
2. **Deja fuera, explícitamente, del perfil V3** —fuera de perfil, nunca "no
   decodificado"—: DIMENSION angular de dos líneas (intersecar dos rectas
   arrastra el mismo riesgo de vértice al infinito que ya declina la cota
   DXF ajena), los contornos curvos de un HATCH (línea/arco/arco
   elíptico/spline: ningún campo de la primitiva de destino los representa,
   el propio lector de HATCH de DXF ya los descarta con aviso), el estilo de
   texto de MTEXT y DIMENSION (son nombres resueltos por handle que el
   laboratorio no decodifica todavía) y todo lo que las cotas propias del
   producto normalmente traen por su XDATA registrada (precisión, unidades,
   prefijo/sufijo, colores, flecha…) — DWG no tiene ese canal y nunca lo
   tendrá para un archivo que no pasó por el exportador de este producto.
3. **No toca** ninguno de los límites de §6-bis.3 ni de §6-ter.3: sigue
   AC1015 únicamente, sigue model space 2D, sigue sólo importación, sigue
   apagada en producción pública por defecto, sigue sin
   `legalReviewCleared`, sigue con `DWG_BETA_AUTHORIZATION` y no mueve un
   bit la promoción general de §5. Además, MTEXT/DIMENSION/HATCH sólo se
   proyectan en MODEL SPACE: dentro de un bloque caen al mismo diagnóstico
   genérico que cualquier tipo sin representación ahí, porque
   `CadDxfSemanticBlock` tampoco los admite para DXF.

Lo que esta ampliación NO autoriza: como en §6-ter, ningún hito posterior de
la hoja de ruta (M3, M4, M5) se da por autorizado por adelantado — cada uno
sigue necesitando su propia evidencia end-to-end en verde antes de empezar
el siguiente.

## 7. M3 — AC1018 (AutoCAD 2004) — 2026-08-24

M2b (§6-quater) cerró con su propia evidencia end-to-end en verde. M3 es el
siguiente hito de la misma hoja de ruta de §6-bis, y es distinto en NATURALEZA
de M2a/M2b: no amplía qué ENTIDADES lee la beta dentro de AC1015, amplía qué
VERSIÓN de contenedor acepta. Por eso no es «§6-quinquies» sino una sección
propia: la hoja de ruta original ya lo nombraba como hito hermano de M2, no
hijo («M2=más entidades AC1015; M3=AC1018»).

**Lo que ya existía, verificado antes de tocar el producto.** El laboratorio
lee AC1018 desde antes de esta sesión (§1.2), y `readDwg` (el punto de
entrada real del códec, `packages/dwg-codec/src/api/read.ts`) ya despachaba
AC1018 al lector R2004 devolviendo el MISMO tipo `DwgDatabase` que AC1015 —
confirmado leyendo el archivo, no supuesto. Eso significa que el perfil de
entidades de §6-quater (qué se proyecta al documento canónico) no necesita
ningún cambio para AC1018: `toBetaProfileGeometry` y el puente
(`dwg-document-bridge.ts`) no miran de qué versión vino la entidad, sólo su
forma, y la forma es la misma. M3 es, en el producto, casi enteramente un
cambio de GATE: qué firma se acepta antes de decodificar.

1. **Autoriza** que `readDwgNeutralDatabase` (`dwg-native-reader.ts`) acepte
   TAMBIÉN la firma AC1018, exclusivamente cuando quien llama pasa
   `allowAc1018: true` — nunca por defecto, nunca como ampliación silenciosa
   del gate de §6-quater. La autorización vive en un mecanismo DISTINTO,
   `DWG_AC1018_BETA_AUTHORIZATION` (`dwg-interop-flag.ts`), con su propia
   variable de build (`NEXT_PUBLIC_DWG_AC1018_IMPORT_BETA`) y su propia
   función de conjunción (`dwgAc1018BetaImportIsEnabled`), que exige la beta
   base encendida Y esta variable encendida Y la firma del titular — tres
   condiciones, no una ampliación de las dos que ya tenía §6-bis.
2. **Deja fuera, explícitamente**: AC1021 (2007, contenedor Reed-Solomon
   distinto, ya rechazado con su propio mensaje) y la familia 1024/1027/1032
   (2010/2013/2018): el contenedor de esos abre, pero sus cuerpos de objeto
   no decodifican todavía (§1.2) — `readDwg` ya falla tipado para ellos, y
   `readDwgNeutralDatabase` no cambia eso. Sólo AC1015 y AC1018 pasan el gate
   de esta beta.
3. **Nota de cautela que consta por escrito**: la vía R2004/AC1018 del
   laboratorio es la parte MÁS NUEVA de todo lo que esta beta expone —
   aterrizó el mismo día que esta ampliación, por un frente de trabajo
   paralelo, no por la sesión que construyó y firmó §6-bis/ter/quater. Su
   evidencia (§1.2, corpus de 8 AC1018 reales) es la misma que documenta
   ADR-0009 desde antes; lo que es nuevo es la integración al producto,
   exactamente como lo fue AC1015 en su momento. Se acepta como el mismo
   tipo de riesgo que ya aceptó §6-bis para AC1015: código propio,
   corpus propio, sin dependencia externa, cero razón para tratarlo distinto
   una vez que su propio flag está apagado por defecto.
4. **No toca** ninguno de los límites de §6-bis.3/§6-ter.3/§6-quater.3: sigue
   sólo importación, sigue model space 2D, sigue apagada en producción
   pública por defecto (las DOS variables, base y AC1018, nacen `false`),
   sigue sin `legalReviewCleared`, y no mueve un bit la promoción general de
   §5. El perfil de ENTIDADES sigue siendo exactamente V3 — AC1018 amplía la
   lista de firmas que llegan a ese perfil, no el perfil mismo.

Lo que esta ampliación NO autoriza: M4 (versiones modernas 2010+, que
necesitaría primero que el laboratorio decodifique sus cuerpos de objeto,
hoy bloqueado) y M5 (exportación) siguen sin autorizar por adelantado —
cada uno, otra vez, con su propia evidencia end-to-end en verde primero.

## 8. M5 — Exportación DWG — 2026-08-25

El titular, en conversación directa registrada en la sesión de trabajo de
esa fecha, respondió a un análisis honesto del estado de DWG (a petición
suya: "analiza qué más le falta al DWG, no quiero laboratorios quiero algo
real") escogiendo explícitamente autorizar M5 sobre las otras dos opciones
presentadas (encargar la revisión jurídica externa de §5, o no tocar DWG y
seguir con otra iniciativa), con el alcance descrito así en el momento de
la firma: el writer ya existe y está verificado por ODA File Converter
(oráculo externo real, no el propio código); se cablea un "Exportar como
DWG" al producto, detrás de su propio flag apagado por defecto, con el
mismo patrón cuidadoso que el import — evidencia primero, flag después,
nunca "DWG propio" sin calificar.

**Lo que ya existe, verificado antes de tocar el producto.** El laboratorio
escribe AC1015 con LINE/POINT/CIRCLE/ARC/LWPOLYLINE/TEXT/INSERT
(`ac1015-entity-writer.ts`, confirmado leyendo el archivo) — el mismo
subconjunto que autorizó §6-bis para lectura V1, no el perfil V3 completo
que lee hoy la beta. `canonicalDocumentToDwgEntities` y
`writeAc1015MinimalFile` (`packages/dwg-codec/src/api/canonical.ts`,
`writer/ac1015-minimal-file-writer.ts`) ya arman un archivo real a partir
de un documento canónico DEL LABORATORIO — no hay hoy una función pública
`writeDwg` equivalente a `readDwg`, ni un adaptador del lado del producto
que traduzca `CadDocument` a ese canónico (el equivalente inverso de
`dwg-document-bridge.ts`): ambos son trabajo de esta autorización, no algo
que ya existiera sin decirlo.

1. **Autoriza** diseñar y construir la integración de exportación DWG en el
   producto, acotada al mismo subconjunto de entidades que el writer ya
   escribe (LINE/POINT/CIRCLE/ARC/LWPOLYLINE/TEXT/INSERT) y a AC1015
   únicamente — igual que M1 lo hizo para lectura, la escritura empieza por
   el subconjunto más angosto con evidencia real, no por el perfil V3
   completo. Cualquier entidad del documento fuera de ese subconjunto se
   declara en un manifiesto de pérdidas al exportar, con el mismo mecanismo
   ya usado en la exportación DXF — nunca se omite en silencio.
2. **Exige, antes de cablear nada al producto**, que exista una función
   pública de escritura en el laboratorio (equivalente a `readDwg` en
   `api/read.ts`) y que su salida se verifique contra el mismo oráculo
   externo (ODA File Converter) sobre el corpus admitido, con la misma
   disciplina de `check:dwg` que ya rige la lectura — la evidencia previa de
   §1.3 cubre el contenedor y el round-trip de la librería de prueba, no
   nombra un contrato de API público, así que ese contrato es parte de este
   hito, no algo que se dé por hecho.
3. **Feature flag propio, apagado por defecto**, distinto de
   `DWG_BETA_AUTHORIZATION` y de `DWG_AC1018_BETA_AUTHORIZATION` — exportar
   y leer son capacidades distintas con superficies de riesgo distintas
   (leer un archivo hostil arriesga el parser; escribir arriesga entregarle
   al cliente un archivo que dice ser DWG y no lo es del todo). Nunca se
   activa por defecto en producción pública, igual que las dos de lectura.
4. **No autoriza** ninguna afirmación de "exportación DWG" sin calificar el
   subconjunto de entidades y la versión exacta, ni tratar esto como
   equivalente a que el import complete su perfil V3 en escritura, ni mueve
   un bit la promoción general de §5 (`legalReviewCleared` sigue en
   `false`, sin fecha). El archivo original que un usuario importó sigue
   preservándose intacto como corresponde; exportar es una capacidad nueva,
   no un reemplazo de esa garantía.
5. **Acepta los mismos límites de §6-bis.3** que ya rigen la lectura:
   interoperable con ODA, no verificado contra AutoCAD real; un solo
   oráculo externo; la advertencia de representatividad de
   `CORPUS_POLICY.md` se traslada íntegra a cualquier texto de producto que
   describa esta capacidad.

Lo que esta autorización NO hace: no declara M5 cumplido — sólo abre la
puerta a construirlo con su propia evidencia end-to-end en verde, exacto
al mismo criterio que exigieron M2a/M2b/M3. Tampoco toca M4 (2010+), que
sigue bloqueado en el laboratorio, ni GA/disponibilidad general de nada.
