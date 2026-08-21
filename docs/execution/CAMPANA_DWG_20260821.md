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
- [x] 2.1 Descompresión R2004 con presupuesto; el corpus corrigió la tabla de opcodes de la ODS (offsets −1, dos bytes tras el terminador) — 47/47 flujos exactos
- [x] 2.2 Cabecera cifrada (generador corregido: bits 16–23), CRC32, page map, section map (nombres de 64 bytes), checksums Fletcher en dos etapas medidos (66/66): las CUATRO secciones localizadas y descomprimidas en 32/32 archivos de AC1018/24/27/32 (dwg-r2004-container.json)
- [x] 2.3 AC1018 decodifica ENTERO reutilizando los decodificadores R2000 (adaptador de cuerpos medido + ensamblado compartido, cero gemelos); deltas R2010+ (BOT, UMC, string stream) registrados y declarados — fallo cerrado con motivo exacto
- [x] 2.4 Matriz diferencial por versión: AC1015 25/25 y AC1018 8/8 en 0 discrepancias; AC1024/27/32 con 8 no-abre tipados cada una; AC1021 detectado y rechazado con mensaje de límite

### OLA 3 — Escritura AC1015 validada por oráculo (~1.5 h)
- [ ] 3.1 Writer AC1015 completo: header vars reales, clases, object map, second header, CRCs, SummaryInfo/Preview mínimos, semillas de handle
- [ ] 3.2 ODA File Converter instalado + harness: nuestro DWG → Converter → DXF (exit 0) → comparación campo a campo vs canónico
- [ ] 3.3 docs/cad/evidence/dwg-roundtrip.json con lectoresExternosAutorizados ≥ 1
- [ ] 3.4 Reserva declarada: writer contenedor 2004-familia (no de esta ola)

### OLA 4 — Mapeo canónico + paquete de promoción (~1 h)
- [x] 4.1 dwgDatabaseToCanonicalDocument + canonicalDocumentToDwgEntities (tipos espejo del esquema 9, sin importar el producto); manifiesto de pérdidas en ambos sentidos; round-trip hermético verde. Ampliar con tablas cuando aterrice el lote E
- [x] 4.2 docs/adr/0009-dwg-promotion-package.md redactado (checklist de gates con estado; se afinan números al cierre)

### OLA 5 — Blindaje (~1 h)
- [x] 5.1 Fuzzing estructural: 1200 mutaciones sobre los 25 DWG reales — 0 sin tipar, 0 internal, 0 cuelgues, peor caso 87.5 ms (recetas por semilla en dwg-structural-fuzz.json); no hubo crashes que congelar
- [x] 5.2 8 propiedades encode(decode(x))==x sembradas (RC/RS/RL, BS/BL, BD/RD con −0.0, DD, BT/BE, H, TV, secuencias mixtas)
- [x] 5.3 Benchmark report-only: 2.46 MB/s, 4369 objetos/s, máquina declarada (dwg-read-benchmark.json)

### OLA FINAL — Cierre y verdad (~30 min, OBLIGATORIA)
- [x] F.1 check:dwg + check del paquete (366 unit + 349 adversarial + fuzz) + presupuesto de monolito verdes; evidencia regenerada entera; push de ambos repos (conformance a60ebe2; principal d95269c)
- [x] F.2 CAPABILITIES/README/DWG0_WORKLOG al día; SOURCE_REGISTER con 80 hechos de la ODS + 21 mediciones first-party en dos entradas de corpus
- [x] F.3 Rúbrica sin tocar pesos: Import/export DWG 4/8 → 7/8 (191/200) al corregir el generador de evidencia; el punto restante espera la firma del ADR-0009
- [x] F.4 INFORME_CAMPANA_DWG_20260821.md con matriz por versión, lo rojo, los 10 pasos y el checklist de promoción

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
- El `npm run check` LOCAL del repo conformance está rojo por un worktree
  AJENO con trabajo sin commitear (.claude/worktrees/hungry-williamson-*,
  rama claude/hungry-williamson-6fa0b4: package.json + corpus-tools). NO se
  toca — es de otra sesión. El commit pusheado a60ebe2 está limpio; el gate
  en CI no ve worktrees locales.

## Suposiciones

- La otra sesión comparte este working tree; sus cambios sin commitear se
  preservan con autostash y jamás se incluyen en mis commits (git add por
  ruta explícita, nunca `git add -A`).
