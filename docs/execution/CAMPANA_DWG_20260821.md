# Campaña autónoma DWG propio — 2026-08-21

Misión: convertir el laboratorio DWG en un códec serio — lectura completa
AC1015, contenedor familia 2004 (AC1018/24/27/32), escritura validada por
oráculo externo, mapeo al documento canónico y paquete de promoción
(ADR-0009) listo para la firma del dueño.

Territorio: `packages/dwg-codec/`, `scripts/dwg/`,
`docs/cad/evidence/dwg-*.json`, `docs/adr/` (solo ADRs nuevos de DWG),
este archivo, y todo `valle-design-dwg-conformance`.
Prohibido: apps/api, apps/web, packages/contracts, packages/design-sdk,
crates/, ci.yml, release.yml, migraciones, rubric.json,
monolith-budget.json, package.json de la raíz. Frontera ADR-0007 vigente:
nada de DWG en UI/API/providers.

Otra sesión trabaja en paralelo sobre apps/api, apps/web y ci.yml en ESTE
mismo working tree. Antes de cada push: `git pull --rebase --autostash
origin main`; conflictos fuera de mi territorio → versión de origin.

## Cola

### OLA 0 — Estado y API pública (~30 min)
- [x] 0.1 Suites del paquete + harness de corpus + check-corpus del repo conformance; lo rojo primero (todo verde de entrada)
- [x] 0.2 Leer CAPABILITIES, DWG0_WORKLOG, ADR-0004/0007/0008, estado real de src/
- [x] 0.3 API pública honesta: exports estables (readDwg/writeDwg/probeDwg), variante de ÉXITO en probeDwg, DWG_VERSION_REGISTRY con AC1015 experimental-lab, README al día

### OLA 1 — Lectura AC1015 completa (~2.5 h)
- [x] 1.0 Corpus rico generado y admitido: bundle entity-wave-2-ac1015 (dibujos 16–25, commit a60ebe2 del repo hermano). Gradient hatch documentado imposible en AC1015. IMAGE/WIPEOUT no entraron (sin archivo de imagen); quedan en PENDIENTES
- [x] 1.1 Anotación: MTEXT, TEXT completo, las 7 DIMENSION, LEADER, TOLERANCE, HATCH entero, ATTRIB/ATTDEF+SEQEND atados a su INSERT. MLEADER no existe en AC1015 (clase R2007+); documentado
- [x] 1.2 Geometría: SPLINE (2 escenarios), ELLIPSE, POLYLINE 2D/3D/MESH/PFACE+VERTEX+SEQEND, 3DFACE, SOLID, TRACE, RAY, XLINE, MLINE. IMAGE/WIPEOUT pendientes de corpus con imagen
- [~] 1.3 Tablas/objetos: EN CURSO (agente lote E): STYLE, LTYPE, DIMSTYLE, VPORT, APPID, UCS, VIEW, DICTIONARY+XRECORD, GROUP, LAYOUT+PLOTSETTINGS, MLINESTYLE, clases
- [x] 1.4 Variables de cabecera: decodificación COMPLETA (secuencia íntegra del cap. 9 de la ODS) + emisor espejo con round-trip exacto y defaults medidos del corpus
- [x] 1.5 Meta SUPERADA: matriz diferencial esperado==correcto en TODAS las filas (25/25 abren, 0 discrepancias); evidencia regenerada

### OLA 2 — Contenedor familia 2004 (~2 h)
- [ ] 2.1 Descompresión R2004 (LZ77 de la spec) con presupuesto + specs contra páginas reales
- [ ] 2.2 Page map / section map, cabecera cifrada trivial, checksums, localización de AcDb:Header/Classes/Handles/AcDbObjects
- [ ] 2.3 Reutilizar decodificadores OLA 1; documentar deltas de versión
- [ ] 2.4 Meta: 24 archivos ac1018/24/27/32 ABREN con matriz diferencial; AC1021 detectado y rechazado con mensaje claro, documentado como límite

### OLA 3 — Escritura AC1015 validada por oráculo (~1.5 h)
- [ ] 3.1 Writer AC1015 completo: header vars reales, clases, object map, second header, CRCs, SummaryInfo/Preview mínimos, semillas de handle
- [ ] 3.2 ODA File Converter instalado + harness: nuestro DWG → Converter → DXF (exit 0) → comparación campo a campo vs canónico
- [ ] 3.3 docs/cad/evidence/dwg-roundtrip.json con lectoresExternosAutorizados ≥ 1
- [ ] 3.4 Reserva declarada: writer contenedor 2004-familia (no de esta ola)

### OLA 4 — Mapeo canónico + paquete de promoción (~1 h)
- [ ] 4.1 base-neutral ↔ CadDocument JSON puras en dwg-codec (leer apps/web/src/lib/cad SIN tocarlo); manifiesto de pérdidas; specs DWG→canónico→DWG
- [ ] 4.2 docs/adr/0009-dwg-promotion-package.md

### OLA 5 — Blindaje (~1 h)
- [ ] 5.1 Fuzzing estructural sobre DWG reales mutados; 0 panics, casos → fixtures de regresión
- [ ] 5.2 Propiedades encode(decode(x))==x para todos los bitcodes
- [ ] 5.3 Benchmark MB/s y entidades/s versionado (report-only)

### OLA FINAL — Cierre y verdad (~30 min, OBLIGATORIA)
- [ ] F.1 Suites completas ambos repos + evidencia regenerada + push ambos
- [ ] F.2 CAPABILITIES/README/DWG0_WORKLOG al día; SOURCE_REGISTER completo
- [ ] F.3 node scripts/cad/rubric.mjs --history (sin tocar pesos)
- [ ] F.4 docs/execution/INFORME_CAMPANA_DWG_20260821.md

### Cola de reserva
- [ ] R.1 Writer contenedor 2004-familia
- [ ] R.2 DXF binario
- [ ] R.3 Detección estructural AC1021 + informe
- [ ] R.4 Segundo oráculo (dwg2dxf binario)
- [ ] R.5 Corpus adversarial mundo real + preservación de opacos

## Bitácora

- 2026-08-21 00:00 — Arranque. Ambos repos presentes. valle-design: 5 commits
  locales sin push (de la otra sesión) + working tree con cambios sin commitear
  de apps/api (CFDI, territorio ajeno) — no se tocan; se usará
  `--autostash` al sincronizar. conformance: rebase limpio a `ca1072c`.
  origin/main no trae nada nuevo para main local.
- `npm run check:dwg` verde de entrada; `npm run check` del repo conformance
  verde (6 bundles).
- OLA 0 cerrada: pin del corpus movido a `ca1072c` (admite
  foundational-entities-ac1015, 7 DWG nuevos). Línea base diferencial: 15/15
  AC1015 abren; faltan mtext 3, dimension 3, hatch 2, attdef 2, attrib 4,
  ellipse 2, spline 1 y 3 lwpolyline (POLYLINE 2D/3D clásicas). API pública:
  probeDwg con variante ok, readDwg/writeDwg exportados, registro AC1015
  experimental-lab; fixtures sintéticos y fuzz/benchmark adaptados; README al
  día. `npm run check` del paquete y `check:dwg`+`check:dwg-evidence` verdes
  (evidencia regenerada con el mirror configurado).
- Agente de corpus (repo hermano) TERMINÓ: bundle `entity-wave-2-ac1015`
  admitido, 10 dibujos 16–25 (LEADER, TOLERANCE, RAY/XLINE, SOLID/TRACE/
  3DFACE, dims radial/diametral/ordinate/angular3pt, HATCH islas, bloques
  anidados con ATTRIB/ATTDEF/SEQEND, VIEWPORT papel, MLINE+MLINESTYLE, malla
  y polyface). Commit `a60ebe2` sin push. Gradient hatch documentado como
  imposible en AC1015 (llegó con AC1018). Pin pendiente de mover a `a60ebe2`
  en la OLA 1.

## PENDIENTES

- IMAGE+IMAGEDEF y WIPEOUT: exigen un corpus con archivo de imagen real;
  no entraron en la ola de dibujos 16–25. Cola de reserva.
- MLEADER: no existe como tipo fijo en AC1015 (objeto de clase R2007+);
  se documenta como límite de versión, no como hueco.
- La descarga local del texto de la ODS vive en D:\dev\.cache\ods-spec-*.txt
  (consulta permitida, fuera de los repos; JAMÁS commitearlo).

## Suposiciones

- La otra sesión comparte este working tree; sus cambios sin commitear se
  preservan con autostash y jamás se incluyen en mis commits (git add por
  ruta explícita, nunca `git add -A`).
