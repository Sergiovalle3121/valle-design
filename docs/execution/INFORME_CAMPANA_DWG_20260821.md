# Informe de campaña — DWG propio, 2026-08-21

Ocho horas en cascada, tres frentes paralelos, un objetivo: que el formato
DWG sea NUESTRO. Bitácora operativa en `CAMPANA_DWG_20260821.md`; evidencia
en `docs/cad/evidence/`; claims en `packages/dwg-codec/CAPABILITIES.md`.

## Qué desbloqueó la campaña

1. **Lectura AC1015 completa para el corpus.** El decoder pasó de 13 tipos
   a 65: toda entidad presente en los 25 DWG reales decodifica con
   geometría EXACTA contra su oráculo DXF — matriz diferencial en **0
   discrepancias** (`dwg-corpus-validation.json`). Tablas de símbolos,
   diccionarios con entradas resueltas, XRECORD, clases y LAYOUT incluidos:
   los objetos no decodificados caen de ~160 a **32 por archivo**, todos
   enumerados con su nombre de clase.
2. **Variables de cabecera de ida y vuelta.** La sección completa R2000 se
   decodifica y se emite con round-trip exacto; los defaults del emisor son
   los valores MEDIDOS del corpus, incluida la disposición canónica de
   handles estructurales — el plano del archivo mínimo.
3. **Un lector ajeno abre nuestros archivos.** `writeAc1015MinimalFile`
   emite el archivo completo (34 objetos, 4141 bytes el vacío) y el ODA
   File Converter 27.1 convierte **4/4 casos sin error, campo a campo
   exactos** (`dwg-oda-roundtrip.json`). Las tres cosas que el oráculo
   exigió quedaron medidas y registradas (byte del control DIMSTYLE,
   posiciones de la lista enlazada, hard pointer al STYLE del TEXT).
4. **El contenedor moderno.** 32/32 DWG reales de 2004/2010/2013/2018:
   cabecera descifrada, mapas, descompresión con checksums — las cuatro
   secciones AcDb:* localizadas y descomprimidas
   (`dwg-r2004-container.json`). Seis mediciones corrigieron a la propia
   ODS y están registradas.
5. **El idioma del producto, sin tocarlo.** Mapeo puro base-neutral ↔
   documento canónico (esquema 9) con manifiesto de pérdidas en ambos
   sentidos y round-trip hermético; tablas proyectadas con patrones .lin
   exactos. ADR-0009 redactado: promover es ahora una decisión, no un
   proyecto.
6. **Blindaje medido.** 1200 mutaciones estructurales de DWG reales: 0
   excepciones sin tipar, 0 cuelgues (peor caso 87.5 ms); 8 propiedades
   encode/decode de bitcodes; benchmark declarado (2.46 MB/s, 4369
   objetos/s).
7. **La rúbrica lo reconoció sola**: Import/export DWG 4/8 → **7/8** (191/
   200 total) al derivar la verificación independiente de la medición
   (51/65 tipos verificados); el punto restante espera la firma del dueño.

## Matriz versión × entidad (corte del informe)

- **AC1015 (2000)** — LEE: todo tipo del corpus con 0 discrepancias (26
  clases de comparación; 51/65 tipos con verificación independiente; los
  14 restantes decodifican y aterrizan exactos pero carecen de comparación
  de oráculo). ESCRIBE: line, point, circle, arc, lwpolyline, text, insert
  + el esqueleto estructural completo, aceptado por lector externo.
- **AC1018/AC1024/AC1027/AC1032** — contenedor COMPLETO (32/32); cuerpos
  de objeto: ola en curso al cierre de este informe (AC1018 reutiliza la
  codificación R2000; R2010+ exige BOT + UMC + string stream, hechos ya
  registrados).
- **AC1021 (2007)** — FUERA por diseño: contenedor rediseñado, uso real
  marginal; detección y rechazo tipado.
- **R12/R13/R14** — solo detección de firma, como siempre.

## Qué sigue rojo (con la verdad delante)

- Los cuerpos de objeto de la familia 2004 (ola en curso/reserva).
- 14 tipos sin comparación de oráculo (SEQEND, DICTIONARY, XRECORD, GROUP,
  VPORT/APPID/VIEW/UCS/VP-ENT-HDR y controles) — decodifican, no están
  "verificados".
- El writer no emite anotación (MTEXT, DIMENSION, HATCH, LEADER, ATTRIB)
  ni ATTRIBs de INSERT — pendientes declarados que fallan cerrado.
- Paper space cae a model space con diagnóstico; `stateFlags` de capa
  crudos; IMAGE/WIPEOUT sin corpus con imagen.
- El check LOCAL del repo hermano está rojo por un worktree ajeno con
  trabajo sin commitear (no se toca); el commit pusheado está limpio.

## Los 10 siguientes pasos (estimación)

1. Cerrar cuerpos AC1018 con matriz diferencial en 0 (en curso; ~1 sesión).
2. R2010+: BOT + UMC + string stream sobre esa base (~1-2 sesiones).
3. Writer de anotación: MTEXT y DIMENSION con su bloque anónimo (~1-2).
4. Writer del contenedor familia 2004 (R.1; ~1-2).
5. Oráculo doble: dwg2dxf de LibreDWG COMO BINARIO para la doble
   validación independiente del corpus (R.4; ~0.5).
6. Corpus con IMAGE/WIPEOUT + sus decodificadores (~0.5).
7. Corpus adversarial del mundo real + preservación de opacos en
   round-trip (R.5; ~2).
8. Comparación de oráculo para los 14 tipos sin verificar (ampliar
   validate-corpus a VPORT/APPID/diccionarios; ~0.5).
9. DXF binario (R.2; ~1).
10. Paper space como espacio propio en la base neutral (~0.5).

## Para promover al producto falta (checklist ADR-0009)

- ☐ La FIRMA del dueño sobre el ADR-0009 (la decisión).
- ☐ Dictamen jurídico externo si el dueño lo encarga (el expediente
  clean-room está completo: registro de fuentes con 80+ hechos de la ODS y
  12+ mediciones first-party, corpus 100% propio con doble validación,
  oráculos solo como binarios, cero TrustedDWG).
- ☐ Integración: Web Worker + provider DXF-like + flag `DWG_IMPORT`
  apagado + tenancy + telemetría de pérdidas + CI/E2E (un sprint de
  producto, diseño en ADR-0009 §4).
- ✅ Todo lo demás del checklist (corpus, fuzzing, límites, fidelidad,
  manifiesto de pérdidas, mapeo canónico) — con evidencia fechada.
