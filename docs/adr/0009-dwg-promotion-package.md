# ADR-0009: Paquete de promoción del códec DWG propio

- Estado: ACEPTADA — firmada por el dueño 2026-08-24 para el alcance
  acotado de §6-bis (beta de importación `AC1015_MODELSPACE_2D_V1`); no es
  la promoción general de §5, que sigue con gates pendientes
- Fecha: 2026-08-21 (paquete); firma real 2026-08-24 (§6-bis)
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
   Ver `docs/adr/0013-dwg-via-propia-unica.md` para el retiro simultáneo de
   la vía de proveedor licenciado que ADR-0012 dejaba abierta.
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
