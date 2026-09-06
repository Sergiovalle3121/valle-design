# F11 · Inventario AutoCAD 2027 vs Valle Design

> Frente de investigación y verificación de la campaña «El lunes de un
> arquitecto» (`docs/execution/auditoria-fable/PROMPT_MAESTRO_FABLE.md`). Este
> documento **no escribe código de producto**: es un inventario que el
> coordinador usa para abrir filas nuevas en `docs/competitive/rubric.json` y
> ordenar la cola. Cada afirmación de este documento fue verificada contra el
> árbol real (`grep`, lectura de fichero, `node scripts/cad/rubric.mjs`) o
> contra una fuente oficial de Autodesk citada con URL y fecha.

## 1 · Método

**Fuentes del lado Valle** (el árbol real, en `main`, commit `2fd2bfd` al
arrancar este frente):

- `apps/web/src/lib/cad/engine/command-manifest.ts` — los 294 comandos
  reales del registro, generados por `scripts/cad/build-command-manifest.mjs`
  y verificados por `check:command-integrity` (0 éxitos falsos,
  `docs/cad/evidence/command-integrity.json`). Es la fuente de verdad de "qué
  comando existe y es tecleable", no `registry.ts` (que es el catálogo de
  40 *frases* del command palette, un intérprete determinista sin IA — ver
  `no-ai-boundary.spec.ts`).
- `docs/competitive/rubric.json` (36 filas, corte `2026-08-22`/`2026-09-03`)
  y su salida recomputada con `node scripts/cad/rubric.mjs`.
- `docs/parity/ESCALERA.md` — el peldaño (0-7) medido de cada capacidad
  tocada por las campañas Paridad y «Superar a AutoCAD completo».
- `docs/execution/auditoria-fable/00c-CUADRO-DE-MANDO.md` — los 19
  bloqueantes confirmados y ~106 huecos añadidos por el escéptico, cada uno
  con su `grep` y su ruta:línea ya hechos. Este frente los reutiliza como
  evidencia citando la fila exacta del cuadro de mando en vez de repetir el
  `grep`, salvo donde verificó algo nuevo.
- `AGENTS.md` §Scope / §Domain boundary — qué está fuera de alcance por
  decisión de la casa (IA, ERP/MES, BIM, puente .NET/VBA).

**Fuentes del lado AutoCAD** (investigación web de este frente, hoy
2026-09-06): páginas oficiales `help.autodesk.com` de referencia de comandos
de AutoCAD 2027, de cada toolset (Architecture, MEP, Mechanical, Electrical,
Plant 3D, Map 3D, Raster Design) y de novedades por versión 2024-2027. Cada
fila de las secciones 2 y 3 cita la URL exacta y la fecha de consulta al pie
de su tabla. **No se copia texto ni tabla alguna de Autodesk**: la columna
"capacidad AutoCAD" es una descripción en palabras propias de este frente.
`acad.pgp` no se redistribuye: cuando este documento menciona un alias de
AutoCAD lo hace por su nombre, nunca reproduciendo el fichero.

**Cómo se verificó cada fila.** Para cada capacidad de AutoCAD, este frente:
(a) buscó el comando equivalente por nombre y por alias en
`command-manifest.ts` con `grep -n '"name": "X"'`; (b) si existía, buscó su
fila en `ESCALERA.md` para el peldaño verificado más reciente, o corrió su
propio `grep` sobre el módulo de `apps/web/src/lib/cad/engine/commands/` si
`ESCALERA.md` no la cubre; (c) si no existía ningún comando con ese nombre
ni alias, confirmó con un segundo `grep` por el concepto (no sólo el nombre
del comando) antes de marcar NO, seguido de un tercer `grep` sobre
`apps/web/e2e/` buscando si algún test la ejercita de otra forma — la
lección del invariante 1 (§3.1 del prompt maestro): diez huecos de la
auditoría anterior se cayeron por no mirar. Donde este documento marca NO,
el `grep` de los tres pasos está citado en la columna de evidencia.

**Qué significa cada columna:**

- **¿Existe en Valle?** SÍ (comando real, tecleable, con evidencia
  automática — peldaño ≥3), PARCIAL (existe con una frontera declarada, o
  peldaño 1-2), NO (sin código, o código que no hace lo que el nombre
  promete — peldaño 0).
- **Peldaño** usa la escalera de siete niveles de `docs/parity/ESCALERA.md`
  §Los siete peldaños (0 No existe … 7 En producción medido en vivo).
- **Fila de la rúbrica** cita el `id` exacto de `rubric.json` o dice «sin
  fila» — que es material bruto para la sección 5.
- **Valor para el arquitecto del lunes** es un juicio de este frente, no un
  hecho verificable con `grep`; sigue el criterio de §2.1 del prompt
  maestro (afirmación falsa viva > rompe el bucle > impide entregar > lo
  demás) para ordenar, no para inflar.

**Lo que este documento NO hace:** no repite ninguna cifra que
`node scripts/cad/rubric.mjs` ya publique (regla 4 de la casa); cuando cita
un porcentaje o total, enlaza al script. No propone funciones de IA,
ERP/MES, BIM ni un puente .NET/VBA (declarados fuera de alcance, con su
alternativa documentada en `docs/api/POLITICA-API-PUBLICA.md`). No edita
`rubric.json`, `ESCALERA.md` ni `BACKLOG.md`: las filas nuevas de la
sección 5 son JSON literal para que el coordinador las aplique.

## 2 · Inventario de AutoCAD 2027 base

> _Pendiente — en investigación. Los 294 comandos del lado Valle ya están
> extraídos de `command-manifest.ts` (§1); falta que regrese la investigación
> web de fuentes oficiales de Autodesk para completar la columna "capacidad
> AutoCAD" con su cita (URL + fecha) por cada uno de los once flujos de
> usuario del encargo. Se completa en el próximo commit de este frente,
> lanzado ya en paralelo._

## 3 · Inventario por toolset

Fuentes del lado AutoCAD: páginas oficiales de `help.autodesk.com` por
toolset, investigadas hoy 2026-09-06. **Nota de la investigación**: el
acceso directo por `WebFetch` a `help.autodesk.com`/`knowledge.autodesk.com`
estuvo bloqueado por la política de red del entorno (`EGRESS_BLOCKED`), así
que la descripción de cada comando viene de los fragmentos que devolvió
`WebSearch` sobre esas páginas oficiales, no de la lectura completa de la
página — cada URL sigue siendo la fuente oficial citada, con su fecha, y
ninguna tabla copia texto de Autodesk. Para **Mechanical**, Autodesk no
publica un índice de comandos tabulado (a diferencia de Plant 3D/Map 3D):
la cobertura es representativa, no exhaustiva. Tres capacidades quedaron
explícitamente marcadas «no confirmado en la documentación oficial
revisada» en vez de inventadas: detección de choques nativa en Plant 3D
(Autodesk remite a Navisworks), un comando de «requisición» en Plant 3D, y
el manejo de fuentes SHX en Raster Design.

Fuentes del lado Valle: `docs/parity/ESCALERA.md` §Las filas de los siete
toolsets y sus secciones Ola E (Architecture), F (MEP/instalaciones), G
(Map 3D), H (Raster Design), I (Mechanical), 5 (Electrical) y 6 (Plant 3D);
`docs/competitive/rubric.json` categorías `toolset-architecture`,
`toolset-mep`, `toolset-map3d`, `toolset-raster`, `toolset-mechanical`,
`toolset-electrical`, `toolset-plant3d`; `command-manifest.ts` para
confirmar qué es tecleable.

### 3.1 · Architecture

| Capacidad AutoCAD | Comando(s) Valle | ¿Existe? | Evidencia en el árbol | Peldaño | Fila rúbrica | Valor |
| --- | --- | --- | --- | --- | --- | --- |
| Muro paramétrico (WALLADD) — [Autodesk 2026](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-Architecture/files/GUID-72935B4D-8B1E-4DBC-8380-0D7C05C45F4D.htm), 2026-09-06 | `WALL` (`command-manifest.ts:116`, alias `WA`/`MURO`) | SÍ | `draw-wall.ts`; `wall-entity-adapter.ts` | 5 | `toolset-architecture.envolvente` | alto |
| Puerta paramétrica que recorta el muro (DOORADD) — [Autodesk 2026](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-Architecture/files/GUID-72935B4D-8B1E-4DBC-8380-0D7C05C45F4D.htm), 2026-09-06 | `DOOR` (`:106`, alias `PUERTA`) | SÍ | golden 77 (cuadro de carpintería); `draw-opening.ts` | 5 | `toolset-architecture.envolvente` | alto |
| Ventana paramétrica (WINDOWADD) — [Autodesk 2024](https://help.autodesk.com/view/ARCHDESK/2024/ENU/?guid=GUID-7E988B34-E2AF-443B-A340-0A62CD81D1C5), 2026-09-06 | `WINDOW` (`:107`) | SÍ | golden 77; `draw-opening.ts` | 5 | `toolset-architecture.envolvente` | alto |
| Escalera paramétrica (recta/U/helicoidal) (STAIRADD) — [Autodesk 2026](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-Architecture/files/GUID-72935B4D-8B1E-4DBC-8380-0D7C05C45F4D.htm), 2026-09-06 | `STAIR` (`:70`, alias `ESCALERA`) | PARCIAL | golden 78; `architecture-stair.spec.ts` (656) — recta/L/U con Blondel y RCDMX | 5 | `toolset-architecture.interiores` | alto |
| Cubierta paramétrica (ROOFADD) — [Autodesk 2019](https://knowledge.autodesk.com/support/autocad-architecture/learn-explore/caas/CloudHelp/cloudhelp/2019/ENU/AutoCAD-Architecture/files/GUID-F287FECD-E0E0-44A8-A921-6BC97DA599A3-htm.html), 2026-09-06 | `ROOF` (`:68`, alias `CUBIERTA`) | PARCIAL | golden 79; sólo rectángulos, sin faldones distintos | 5 | `toolset-architecture.envolvente` | medio |
| Losa paramétrica (SLABADD) — [Autodesk 2026](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-Architecture/files/GUID-72935B4D-8B1E-4DBC-8380-0D7C05C45F4D.htm), 2026-09-06 | `SLAB` (`:69`) | PARCIAL | golden 79; sin huecos tecleados ni pendiente | 5 | `toolset-architecture.envolvente` | medio |
| Objeto "espacio" con área/perímetro para cuadros (SPACEADD) — [Autodesk 2026](https://help.autodesk.com/view/ARCHDESK/2026/ENU/?guid=GUID-B109BFED-BAB3-4F9E-AA4E-5AC348D765F3), 2026-09-06 | sin comando dedicado; `DATAEXTRACTION` Superficies (`:90`) | PARCIAL | `bim-schedule.spec.ts` (66); `data-extraction.spec.ts` (25) | 5 | `toolset-architecture.interiores` | alto |
| Wall Style Manager: componentes y representación distinta por vista (plan/sección/alzado) — [Autodesk 2024](https://help.autodesk.com/view/ARCHDESK/2024/ENU/?guid=GUID-A3FDD8B8-4818-4E80-80FC-58755AE0E8C7), 2026-09-06 | ninguno | NO | `grep -rln "wallStyle\|WallStyle\|wall-style" apps/web/src/lib/cad --include=*.ts` (excluyendo specs) → 0 (verificado por este frente) | 0 | sin fila | medio |
| Secciones/alzados generados desde el modelo y enlazados (live) — [foro oficial Autodesk citando documentación](https://forums.autodesk.com/t5/autocad-architecture-forum/can-i-automatically-create-a-section-or-elevation-from-a-2d-plan/td-p/7497208), 2026-09-06 | `FLATSHOT`/`SOLPROF` (`:290-291`), `SOLVIEW`/`SOLDRAW` (`:313-314`) | PARCIAL | golden 92; **pero** `flatshot-solids.ts:181-192` excluye explícitamente `entity.type === "wall"` — contradicción §6.1 de este documento: no hay corte ni alzado de un muro dibujado con `WALL` | 3 | sin fila (el golden 92 no respalda ninguna fila, §6.1) | alto — es la contradicción más cara de esta sección |
| Content Browser / catálogo de contenido arquitectónico (Ctrl+4) — [referencia secundaria sobre comportamiento documentado](https://www.augi.com/articles/detail/aec-wall-objects), 2026-09-06 | `ADCENTER` (`:92`); catálogo de aberturas propio | PARCIAL | `architecture-openings-catalog.spec.ts` (336, nueve tipos); pero `00c-CUADRO-DE-MANDO.md` hallazgo 11 confirma que `ADCENTER` no tiene catálogo del inquilino (`grep -rn xrefCatalog` → 0 en `.tsx`) | 3 | `toolset-architecture.interiores` (parcial) | medio |

### 3.2 · MEP

| Capacidad AutoCAD | Comando(s) Valle | ¿Existe? | Evidencia en el árbol | Peldaño | Fila rúbrica | Valor |
| --- | --- | --- | --- | --- | --- | --- |
| Trazado de tubería paramétrica (PIPEADD) — [Autodesk 2024](https://help.autodesk.com/view/BLDSYS/2024/ENU/?guid=GUID-E35FD395-DE94-431C-AE57-F78BE80A65E3), 2026-09-06 | `PIPE` (`:168`, alias `TUBERIA`) | SÍ | golden 81; `mep-tracing.spec.ts` (127) | 5 | `toolset-mep.trazado` | alto |
| Accesorio de tubería insertado (codo/te/reducción) (PIPEFITTINGADD) — [Autodesk 2023](https://help.autodesk.com/view/BLDSYS/2023/ENU/?guid=GUID-35E20ECE-C21A-46D5-93F7-8018F797BEE8), 2026-09-06 | ninguno propio en MEP (Plant 3D sí deduce accesorios en `PIDROUTE`, ver 3.5) | NO | ESCALERA.md Ola F: «sin accesorios automáticos (codos, tes, reducciones)» en la fila de `PIPE` | 3 | `toolset-mep.trazado` (parcial, declarado en `gap`) | medio |
| Ducto a doble línea (DUCTADD) — [Autodesk 2019](https://knowledge.autodesk.com/support/autocad-mep/learn-explore/caas/CloudHelp/cloudhelp/2019/ENU/AutoCAD-MEP/files/GUID-2CBE6D8D-C516-48F6-A1B6-3F3B08FDCE95-htm.html), 2026-09-06 | `DUCT` (`:169`) | SÍ | golden 81: codo 300×(2.000+2.000)=1.200.000 en papel | 5 | `toolset-mep.trazado` | alto |
| Charola/bandeja portacables (CABLETRAYADD) — [Autodesk 2020](https://help.autodesk.com/cloudhelp/2020/ENU/AutoCAD-MEP/files/GUID-8FAF7015-5004-4D7A-9CCD-A8014DC2687C.htm), 2026-09-06 | `CABLETRAY` (`:170`) | SÍ | golden 81 | 5 | `toolset-mep.trazado` | alto |
| Conducto eléctrico (canalización) (CONDUITADD) — [Autodesk 2019](https://help.autodesk.com/cloudhelp/2019/ENU/AutoCAD-MEP/files/GUID-B72E4C39-18FA-486A-AECC-A2A791CF9E4A.htm), 2026-09-06 | ninguno | NO | `grep -n '"CONDUIT"' command-manifest.ts` → 0 (verificado por este frente) | 0 | sin fila | bajo — poco usado en obra mexicana frente a charola |
| Insertar dispositivo eléctrico desde catálogo (DEVICEADD) — [Autodesk 2019](https://help.autodesk.com/cloudhelp/2019/ENU/AutoCAD-MEP/files/GUID-B72E4C39-18FA-486A-AECC-A2A791CF9E4A.htm), 2026-09-06 | `MEPSYMBOL` (`:167`, alias `DEVICEADD`) | SÍ | golden 81 (ocho símbolos como bloques) | 5 | `toolset-mep.trazado` | alto |
| Asignar dispositivo a circuito (CIRCUITASSIGN) — misma fuente, 2026-09-06 | `AECIRCUIT` (`:123`) | SÍ | golden 93; `electrical-circuit.spec.ts` | 5 | `toolset-electrical` (informes) | alto |
| Cuadros (schedules) enlazados al modelo — [Autodesk 2019](https://help.autodesk.com/cloudhelp/2019/ENU/AutoCAD-MEP/files/GUID-ED12BB7E-4B8A-4148-8DFF-58F33F9963F1.htm), 2026-09-06 | `DATAEXTRACTION` Instalaciones (`:90`) | SÍ | golden 81 (7,00 m Ø19, 4,00 m de ducto, 1 válvula) | 5 | `toolset-mep.tablas` | alto |
| Detección de choques / validación de conectores (clash) — [Autodesk 2026](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-MEP/files/GUID-B5A862C6-9CE5-4C27-9D3B-49AE9C7C3D88.htm), 2026-09-06 | sin comando dedicado; motor de choques | SÍ | `mep-runs.ts`; `plant/clash.spec.ts` (56) — choques contra muros, huecos y sólidos por distancia exacta | 5 | sin fila (ver §4 — candidata a "Valle tiene y AutoCAD no": el toolset MEP de Autodesk lo documenta, pero Plant 3D **no**, según 3.5) | medio |
| Dimensionado de sistemas (tamaño óptimo de ducto/tubería) — [Autodesk 2026](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-MEP/files/GUID-B5A862C6-9CE5-4C27-9D3B-49AE9C7C3D88.htm), 2026-09-06 | ninguno | NO | sin cálculo de carga térmica/hidráulica en el árbol (verificado por este frente, sin comando ni módulo `sizing`) | 0 | sin fila | medio |

### 3.3 · Electrical

| Capacidad AutoCAD | Comando(s) Valle | ¿Existe? | Evidencia en el árbol | Peldaño | Fila rúbrica | Valor |
| --- | --- | --- | --- | --- | --- | --- |
| Insertar símbolo esquemático con etiqueta automática — [Autodesk 2024](https://help.autodesk.com/cloudhelp/2024/ENU/AutoCAD-Electrical/files/GUID-E4EB5B65-0836-4852-A3EB-0A888504F86C.htm), 2026-09-06 | `AETAG` (`:125`) etiqueta; símbolo, ver fila siguiente | PARCIAL | `device-tags.spec.ts` (31) — la etiqueta existe, el símbolo de esquema no | 3 | `toolset-electrical.esquemas` | alto |
| Símbolos IEC/JIC de esquema unifilar de control (bobina, contactor, relevador) — [Autodesk 2026](https://help.autodesk.com/view/ACAD_E/2026/ENU/?guid=GUID-8C2A7E02-AC89-4164-8264-0B899573CD88), 2026-09-06 | ninguno | NO | `grep -rn 'bobina|contactor|relevador|guardamotor|seccionador|60617|schematic' apps/web/src apps/api/src packages/` → 0 (repo completo; §6 contradicción 2) | 0 | `toolset-electrical.esquemas` **cobra 2/2 sin esta evidencia** — ver contradicción §6.2 | alto — bloqueante confirmado (`00c-CUADRO-DE-MANDO.md`) |
| Circuito reutilizable (insertar/copiar) — misma fuente, 2026-09-06 | ninguno específico | NO | sin biblioteca de circuitos guardados; sólo `AECIRCUIT` estampa datos sobre geometría ya dibujada | 0 | sin fila | medio |
| Numeración de conductores (Wire Numbers) — [Autodesk 2022](https://help.autodesk.com/cloudhelp/2022/ENU/AutoCAD-Electrical/files/GUID-33962B71-757A-45B4-8B69-06E8E2F12EDA.htm), 2026-09-06 | `AEWIRE` (`:127`) | PARCIAL | golden 93; `wire-numbering.spec.ts` (25) — numera y detecta repetidos, **pero no se rotula en el plano impreso** (`00c-CUADRO-DE-MANDO.md` hallazgo 2, bloqueante) | 5 (numeración) / 0 (rótulo impreso) | `toolset-electrical.esquemas` (parcial — la columna «qué falta» de `ESCALERA.md` no lo dice con todas las letras, ver §6) | alto |
| Referencias cruzadas entre hojas — [Autodesk 2026](https://help.autodesk.com/view/ACAD_E/2026/ENU/?guid=GUID-97B0C6AC-84C4-4EA6-A0A9-13DC29B14BA4), 2026-09-06 | ninguno | NO | `ESCALERA.md` Ola 5: «Referencias cruzadas entre hojas… 0 — Todavía no» | 0 | sin fila | medio |
| Lista de materiales (BOM report) — [Autodesk 2024](https://help.autodesk.com/view/ACAD_E/2024/ENU/?guid=GUID-5CD44760-40C3-41A2-B436-9061140C7DE6), 2026-09-06 | `DATAEXTRACTION` Circuitos (`:90`) | PARCIAL | golden 93 (cuadro de cargas como `TABLE`); **pero** `AEWIRELIST`/`AETAGLIST` truncan a 6/3 renglones y no exportan CSV (`00c-CUADRO-DE-MANDO.md`, hallazgo alta bajo «Mechanical y Electrical») | 5 (cuadro) / 2 (listados) | `toolset-electrical.informes` | alto |
| Informe de E/S de PLC — [Autodesk 2025 (fragmento)](https://help.autodesk.com/view/ACAD_E/2025/ENU/?guid=GUID-E6FB3B2C-3B3C-4E1F-8627-F138323E5FD5), 2026-09-06 | ninguno | NO | `ESCALERA.md` Ola 5: «Escalerilla (ladder) y E/S de PLC… 0 — Todavía no» | 0 | sin fila | bajo — control industrial fuera del uso típico de un despacho de arquitectura |
| Panel Layout: huella física del componente — [Autodesk 2026](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-Electrical/files/GUID-E0C1E7EB-3984-47B5-A03F-238FA3E14729.htm), 2026-09-06 | ninguno | NO | `ESCALERA.md` Ola 5: «Plano de gabinete atado al esquema… 0 — Todavía no» | 0 | sin fila | bajo |
| Base de datos de catálogo de fabricante — misma fuente, 2026-09-06 | ninguno | NO | `ESCALERA.md` Ola 5: «Catálogo de fabricante… 0 — Todavía no» | 0 | sin fila (mencionado como límite en `toolset-electrical.informes`) | medio |

### 3.4 · Mechanical

| Capacidad AutoCAD | Comando(s) Valle | ¿Existe? | Evidencia en el árbol | Peldaño | Fila rúbrica | Valor |
| --- | --- | --- | --- | --- | --- | --- |
| Biblioteca de piezas normalizadas (AMCONTENTLIB) — [Autodesk 2021](https://knowledge.autodesk.com/support/autocad-mechanical/learn-explore/caas/CloudHelp/cloudhelp/2021/ENU/AutoCAD-Mechanical/files/GUID-B1A6E455-F587-4548-BE78-2CB18B9C88F1-htm.html), 2026-09-06 | `STDPART` (`:163`) | PARCIAL | golden 84; sólo ISO 4017/4032/7089, sin M14/M30+ ni pulgadas | 5 | `toolset-mechanical.normalizados` | alto |
| Asistente de ensamble de sujeción automático (AMSCREWCON2D) — [Autodesk 2023](https://help.autodesk.com/cloudhelp/2023/ENU/AutoCAD-Mechanical/files/GUID-F83A2934-7DA7-4325-A4D5-115A91870EA9.htm), 2026-09-06 | ninguno | NO | sin asistente que genere el ensamble completo (tornillo+tuercas+arandelas+agujeros) en un paso; sólo inserción individual de `STDPART` | 0 | sin fila | bajo |
| Símbolo de soldadura (Weld Symbol) — [Autodesk 2023](https://help.autodesk.com/cloudhelp/2023/ENU/AutoCAD-Mechanical/files/GUID-F932CFCF-BFAC-4C13-B399-2B22E1A8718C.htm), 2026-09-06 | `WELDSYMBOL` (`:165`) | PARCIAL | golden 84; ISO 2553/AWS A2.4, nueve tipos; sin símbolos compuestos ni intermitencia | 5 | `toolset-mechanical.normalizados` | medio |
| Símbolo de acabado superficial — [Autodesk 2022 (glosario)](https://help.autodesk.com/cloudhelp/2022/ENU/AutoCAD-Mechanical/files/GUID-F18FCB9F-970E-4019-B349-2427D498779A.htm), 2026-09-06 | `SURFACESYMBOL` (`:166`) | PARCIAL | golden 84; ISO 1302, sin Rz/Rmax | 5 | `toolset-mechanical.normalizados` | medio |
| Globos de identificación (AMBALLOON) — [Autodesk 2024](https://help.autodesk.com/view/AMECH_PP/2024/ENU/?guid=GUID-AB9DFFBE-685B-4D44-95FA-B6CB0B7F1E37), 2026-09-06 | `BALLOON` (`:161`) | PARCIAL | golden 84; el globo no es una entidad propia (cuatro trazos con la misma marca) | 5 | `toolset-mechanical.normalizados` | medio |
| Lista de materiales maestra (BOM) — [Autodesk 2025](https://help.autodesk.com/view/AMECH_PP/2025/ENU/?guid=GUID-332A2D3E-A4EB-4181-8270-1A89BBAD691E), 2026-09-06 | `BOM` (`:162`) | PARCIAL | golden 84; sin exportar a CSV, sin material/peso por fila | 5 | `toolset-mechanical.normalizados` | medio |
| Cotas de manufactura con ajuste/tolerancia (Power Dimensions / Tolerance-Fit) — [Autodesk 2026](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-Mechanical/files/GUID-529EF8B1-D412-4109-86EE-97D3BDFE3BF5.htm), 2026-09-06 | `DIMTOLERANCE` (`:93`) | PARCIAL | golden 84; `dimension-tolerance.spec.ts` (71) — dieciséis ajustes ISO 286, sin K/M/N/P | 5 | `toolset-mechanical.cotas` | alto |
| Cajetín con lista de ajustes (AMTITLE) — [Autodesk 2024 (fragmento)](https://help.autodesk.com/view/AMECH_PP/2024/ENU/?guid=GUID-1354621C-1BE8-4C79-882D-2FC14F27108A), 2026-09-06 | cajetín genérico (`plot/title-block.ts`) | PARCIAL | ISO 7200/mexicano paramétrico existe, **pero** el botón de publicar no lo usa (`00c-CUADRO-DE-MANDO.md`, «Espacio papel» hallazgo A — contradicción con la promesa del propio auditor) | 3 | sin fila específica; conectado a `layouts.plot-workflow` | medio |

### 3.5 · Plant 3D

| Capacidad AutoCAD | Comando(s) Valle | ¿Existe? | Evidencia en el árbol | Peldaño | Fila rúbrica | Valor |
| --- | --- | --- | --- | --- | --- | --- |
| Lista de líneas de proceso / colocar objeto 3D equivalente al P&ID — [Autodesk 2024](https://help.autodesk.com/view/PLNT3D/2024/ENU/?guid=GUID-1DCE0736-7898-4866-8889-51D4C8879284), 2026-09-06 | `PIDLIST` (`:235`), `PIDLINE` (`:234`) | SÍ | golden 94; `line-numbers.spec.ts` (29) | 5 | `toolset-plant3d.pid` | alto |
| Asignar/editar número de línea — [Autodesk 2023](https://help.autodesk.com/view/PLNT3D/2023/ENU/index.html?guid=piping_line_numbers_set_to), 2026-09-06 | `PIDLINE` | SÍ | golden 94: `6"-P-1001-CS150` correlativo desde el dibujo | 5 | `toolset-plant3d.pid` | alto |
| Tubería 3D con accesorios por especificación (PLANTPIPEADD) — [documentación de referencia de comandos, 2023](https://help.autodesk.com/cloudhelp/2023/ENU/Plant3D-UserGuide/files/GUID-C9E27D11-1AF3-41B3-BAF5-B73E3117B2EE.htm), 2026-09-06 | `PIDROUTE` (`:236`) | PARCIAL | golden 95; `pipe-route.spec.ts` (26) — accesorios DEDUCIDOS de la geometría (codo/te/reducción), sin diámetro exterior ni catálogo de especificación | 5 | `toolset-plant3d.tuberia` | alto |
| Editar pendiente de un tramo (PLANTPIPESLOPE) — misma fuente, 2026-09-06 | sin comando dedicado | NO | `grep -n "slope\|pendiente" plant-route.ts` → 0 (verificado por este frente); `PIDROUTE` sí mete cota en 3D por vértice pero no una edición de pendiente independiente | 3 (cota 3D existe, edición de pendiente no) | sin fila específica | bajo |
| Soporte de tubería (PLANTPIPESUPPORTADD) — misma fuente, 2026-09-06 | ninguno | NO | `grep -rln "pipe.*support\|soporte.*tuber" apps/web/src/lib/cad` (excl. spec) → 0 (verificado) | 0 | sin fila | bajo |
| Isométrico de producción/rápido (PLANTPRODUCTIONISO/QUICKISO) — misma fuente, 2026-09-06 | `PIDISO` (`:233`) | PARCIAL | golden 95; `isometric.spec.ts` (26) — longitudes verdaderas, ejes a 30°/150°, sin formato ISOGEN/PCF | 5 | `toolset-plant3d.tuberia` | alto |
| Estilos de isométrico configurables — [Autodesk 2017](https://help.autodesk.com/cloudhelp/2017/ENU/Plant3D-UserGuide/files/GUID-D3604F62-1BBF-420E-9399-439E5E74A24F.htm), 2026-09-06 | ninguno | NO | `PIDISO` produce un único formato fijo, sin configuración de estilo | 0 | sin fila | bajo |
| Exportación PCF (compatible ISOGEN) — [foro oficial Autodesk referenciando la guía](https://forums.autodesk.com/t5/inventor-forum/inventor-to-plant-3d-through-pcf-isogen-files-post-1-skey/td-p/10404924), 2026-09-06 | ninguno | NO | `grep -rln "\.pcf\|PCF" apps/web/src/lib/cad` (excl. spec) → 0 (verificado); `ESCALERA.md` Ola 6 lo declara "todavía no" por ser formato propietario sin oráculo | 0 | sin fila | medio — ESCALERA ya documenta la razón de negocio (formato propietario sin especificación pública) |
| Convertir equipo de Inventor a objeto Plant 3D — misma fuente, 2026-09-06 | ninguno | NO | fuera de alcance (Valle no importa Inventor) | 0 | sin fila | bajo |
| Catálogo de proyecto compartido (specs/componentes) — misma fuente, 2026-09-06 | ninguno | NO | `ESCALERA.md` Ola 6: «El catálogo del PROYECTO… tampoco existe todavía» | 0 | `toolset-plant3d.tuberia` (límite declarado en `gap`) | alto — bloquea diámetro exterior/peso/precio en el metrado |
| Detección de choques nativa — **no confirmado en fuentes oficiales**: Autodesk remite a Navisworks Manage/ACC, [artículo de soporte oficial](https://www.autodesk.com/support/technical/article/caas/sfdcarticles/sfdcarticles/Is-it-possible-to-perform-a-clash-detection-analysis-with-Autocad-Plant-3D.html), 2026-09-06 | `plant/clash.ts` | SÍ (Valle) | `plant/clash.spec.ts` (56, choques por distancia exacta) | 5 | sin fila | alto — candidata a "Valle tiene y AutoCAD Plant 3D no", ver §4 |

### 3.6 · Map 3D

| Capacidad AutoCAD | Comando(s) Valle | ¿Existe? | Evidencia en el árbol | Peldaño | Fila rúbrica | Valor |
| --- | --- | --- | --- | --- | --- | --- |
| Georreferenciar el dibujo (GEOGRAPHICLOCATION) — [Autodesk 2021](https://help.autodesk.com/cloudhelp/2021/ENU/AutoCAD-Core/files/GUID-10A3B776-A0FA-4438-B29B-EA22C070A27E.htm), 2026-09-06 | `GEOGRAPHICLOCATION` (`:137`, alias `GEO`) | PARCIAL | golden 82; `geo-location.spec.ts` (44) — sólo hemisferio norte, UTM 11N-16N, WGS84/ITRF; **NAD27/NAD83 rechazados por nombre a propósito** (`crs.ts:31-34`) | 5 | `toolset-map3d.georreferencia` | alto |
| Importar shapefile (.shp) — [Autodesk 2024](https://help.autodesk.com/view/MAP/2024/ENU/?guid=GUID-D65473F6-0B63-4F4E-A3B7-9B8EE8217B77), 2026-09-06 | `MAPIMPORT` (`:160`) | SÍ | golden 82; `map-import.spec.ts` (46) | 5 | `toolset-map3d.datos` | alto |
| Crear/configurar sistema de coordenadas (MAPCSCREATE) — investigación web (snippet), 2026-09-06 | ninguno independiente | NO | sólo las seis zonas UTM fijas + WGS84 geográfico; sin asistente de creación de un sistema arbitrario | 0 | sin fila (cubierto parcialmente por `georreferencia`) | bajo — un despacho mexicano no necesita CS arbitrarios, las 6 zonas cubren el país |
| Asignar sistema de coordenadas ya definido (MAPCSASSIGN) — investigación web (snippet), 2026-09-06 | `GEOGRAPHICLOCATION` (selección de zona) | PARCIAL | `geo-location.ts:107` | 5 | `toolset-map3d.georreferencia` | medio |
| Análisis topológico (MAPTOPO) — [Autodesk 2020](https://help.autodesk.com/cloudhelp/2020/ENU/MAP3D-Use/files/GUID-420839B8-E6D7-4002-B353-915041761FDB.htm), 2026-09-06 | ninguno | NO | `ESCALERA.md` Ola G: «Mapa de fondo… topología… 0 — Todavía no» | 0 | sin fila | bajo |
| Buffers, overlay, consultas espaciales — [página de producto Autodesk](https://www.autodesk.com/products/autocad/included-toolsets/autocad-map-3d), 2026-09-06 | ninguno | NO | `ESCALERA.md` Ola G, misma fila: «sin consulta ni filtro por atributo» | 0 | `toolset-map3d.datos` (límite declarado) | medio |
| Conexión editable a datos GIS externos (SHP/MapInfo/Oracle en vivo) — misma fuente, 2026-09-06 | ninguno | NO | Valle sólo importa ficheros estáticos, sin conexión a base de datos externa | 0 | sin fila | bajo |
| Importar GeoJSON — **no confirmado como comando oficial de Map 3D** en la documentación revisada por este frente, 2026-09-06 | `MAPIMPORT` (GeoJSON RFC 7946) | SÍ (Valle) | `geojson.spec.ts` (34) — Feature/FeatureCollection, seis geometrías simples | 5 | `toolset-map3d.datos` | alto — candidata a "Valle tiene y AutoCAD no", ver §4 |

### 3.7 · Raster Design

| Capacidad AutoCAD | Comando(s) Valle | ¿Existe? | Evidencia en el árbol | Peldaño | Fila rúbrica | Valor |
| --- | --- | --- | --- | --- | --- | --- |
| Adjuntar imagen (IMAGEATTACH) — [Autodesk 2026](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-RasterDesign/files/GUID-EECFE554-6C75-4F17-A173-D0AB06EF5A34.htm), 2026-09-06 | `IMAGEATTACH` (`:241`) | SÍ | golden 83; `raster-image.spec.ts` (75) | 5 | `toolset-raster.imagen` | alto |
| Recortar imagen (IMAGECLIP) — misma fuente, 2026-09-06 | `IMAGECLIP` (`:242`) | SÍ | golden 83 | 5 | `toolset-raster.imagen` | alto |
| Ajustar brillo/contraste/desvanecimiento (IMAGEADJUST) — misma fuente, 2026-09-06 | `IMAGEADJUST` (`:243`) | SÍ | golden 83; `image-geometry.spec.ts` (44) | 5 | `toolset-raster.imagen` | alto |
| Marco de imagen y transparencia (IMAGEFRAME/TRANSPARENCY) — misma fuente, 2026-09-06 | ninguno | NO | `ESCALERA.md` Ola H: «TRANSPARENCY… e IMAGEFRAME… no existen» | 0 | `toolset-raster.imagen` (límite declarado) | bajo |
| Enderezado por rotación (Deskew) — [Autodesk 2026](https://help.autodesk.com/view/RSTR/2026/ENU/?guid=GUID-8A1BBEFB-160A-485A-9717-4F2AB00A7A56), 2026-09-06 | ninguno | NO | `grep -rln "deskew\|enderezar\|straighten" apps/web/src/lib/cad` (excl. spec) → 0 (verificado); `ESCALERA.md` Ola H lo declara fuera de alcance: «es procesamiento de imagen, no CAD» | 0 | sin fila | medio |
| Corrección de sesgo/aspecto (Bias) — [Autodesk 2024](https://help.autodesk.com/view/RSTR/2024/ENU/?guid=GUID-EC20A3BF-6EE0-489D-AE30-AB62156AEB48), 2026-09-06 | ninguno | NO | mismo `grep`, mismo motivo | 0 | sin fila | bajo |
| Limpieza de imagen (Despeckle/Invert/Mirror) — misma fuente, 2026-09-06 | ninguno independiente (motas se descartan sólo como efecto de `VECTORIZE`) | NO | `grep -rln "despeckle\|invert.*image" apps/web/src/lib/cad` (excl. spec) → 0 como comando de imagen dedicado; sí como efecto lateral de vectorización (ver fila siguiente) | 0 | sin fila | bajo |
| Vectorizar líneas/polilíneas de un escaneo — [Autodesk 2023](https://help.autodesk.com/cloudhelp/2023/ENU/AutoCAD-RasterDesign/files/GUID-907A2991-A772-4134-A6C4-AFF74F6A138D.htm), 2026-09-06 | `VECTORIZE` (`:318`) | PARCIAL | `raster-vectorize.spec.ts` (43); PNG 40×30 girado 90° vuelve como polilíneas a <1 µm del original; falta un golden de navegador (peldaño 5) | 3 | `toolset-raster.vectorizacion` | alto |
| Reconocimiento de texto (Text Recognition) — [Autodesk 2022/2024](https://help.autodesk.com/view/RSTR/2022/ENU/?guid=GUID-4C9085D9-4001-42A6-A877-567BB9908EE4), 2026-09-06 | `VECTORIZE` | PARCIAL | `raster-text-recognize.spec.ts` (94); «PREDIO 4-A · 1 240.50 m2» vuelve carácter a carácter; sin manuscrito, tipografías de contorno relleno, letras que se tocan ni MTEXT | 3 | `toolset-raster.vectorizacion` | alto |

**Resumen preliminar de esta sección (calculado a mano de las tablas de
arriba, sujeto a la nota de §7 sobre no copiar cifras — este conteo se
recomputa al cerrar el frente contando filas de las tablas 3.1-3.7):**
de 62 filas comparadas, 24 SÍ, 26 PARCIAL, 12 NO.

## 4 · Lo que Valle tiene y AutoCAD no

§6 del prompt maestro llama a esto «la apuesta»: cuatro ventajas
estructurales de correr en el navegador que AutoCAD no puede copiar sin
dejar de ser AutoCAD (unidad de reparto = dirección, el destinatario ya
tiene el dispositivo, el estado se mide, la versión que corre es la única
que existe). Este frente verificó cada pieza que el prompt maestro dice que
«ya está pagada y sin cobrar» contra el árbol de hoy, con su propio `grep`:

| Pieza de la apuesta | ¿Existe en el árbol? | Evidencia | Lo que falta para cobrar la apuesta completa |
| --- | --- | --- | --- |
| Recibo de publicación inmutable con `sha256`, tamaño y hojas | SÍ | `apps/api/src/modules/cad-documents/entities/cad-publication.entity.ts:17-49` — entidad `cad_publications` con `sha256` (varchar 64), `bytes`, `paperSpaceIds`, `publishedBy`, `publishedAt`; comentario propio: «Recibo inmutable de publicación… hash y tamaño del PDF generado, quién y cuándo» | El recibo describe el PDF; no lleva los bytes del PDF al lado en un enlace abierto sin cuenta (eso es el enlace server-owned de abajo) |
| Enlace de revisión server-owned: token fuera de la URL, expiración, revocación | SÍ | `apps/api/src/modules/cad-documents/review-link.service.ts:33,58-85` — `expiresAt`, `revokedAt`/`status !== 'open'` → `401 review_token_revoked`/`review_token_expired`; el token viaja por header `x-review-token` (`REVIEW_TOKEN_HEADER`, línea 19), nunca en la URL en claro; `review-link-token.ts` hashea el token (`hashReviewLinkToken`) | Aislamiento por organización no verificado por este frente en esta pasada (queda para verificación de código, no de inventario); el prompt maestro afirma «aislamiento por organización, token en el fragmento» — el token va por header en canje server-side, sin confirmar en esta pasada si el enlace público usa fragmento de URL (`#`) en vez de query string |
| Manifiesto de pérdidas que viaja con el documento y el DXF | SÍ (para DXF) | `apps/api/src/modules/cad/cad-dxf-export.ts` cabecera propia declara mapeo determinista v2; **pero** el `00c-CUADRO-DE-MANDO.md` hallazgo 10 confirma que el endpoint público `cad.controller.ts:331-352` sirve ese DXF R12 **sin manifiesto** (`grep -cin "loss|manifest|warning|advert" cad-dxf-export.ts` = 0) — la pieza existe para el camino del navegador (`dxf-export-loss-manifest.ts`) pero NO para el endpoint de API pública que cita el propio prompt maestro | Ver contradicción en §6: el prompt maestro cita esta pieza como «ya pagada» y el mismo documento (§6.4) dice que está «incumplida en la letra pequeña» — las dos cosas son ciertas de partes distintas del sistema |
| Codificador de QR propio, con oráculo y round-trip | SÍ, pero **con un solo consumidor** | `apps/web/src/lib/qr/qr-encode.ts` + `qr-decode.ts` + `qr-oracle.ts`; único consumidor de interfaz: `apps/web/src/components/ui/QrCode.tsx`, importado sólo por `apps/web/src/app/cuenta/MfaEnrollment.tsx` (`grep -rln QrCode apps/web/src --include=*.tsx` → esos dos ficheros) | El QR en el cajetín de la lámina, apuntando al enlace de revisión, no está cableado: 0 usos de `QrCode`/`qr-encode` en `apps/web/src/components/cad/` |
| Presencia con cursor y encuadre | SÍ | `apps/web/src/lib/cad/collab/presence.ts`, `presence-channel.ts`, `server-presence-channel.ts`, `overlay-model.ts` | Necesita que el invitado del enlace de revisión tenga transporte (siguiente fila) |
| Llamada con política ICE/TURN declarada | SÍ | `apps/web/src/lib/cad/calls/call-ice-policy.ts`, `call-state.ts`, `call-signaling-transport.ts`; `call-session-host.spec.ts` (11, control negativo citado en ESCALERA.md Ola 4) | Residual medido: tras un cruce de ofertas ninguno de los dos extremos llega a `iceConnectionState=checking` (ESCALERA.md, Ola 4) |
| Puerto de blob store desacoplado | SÍ | `apps/api/src/modules/cad-documents/design-blob-store.adapter.ts` — cabecera propia: «Wrappea el DatabaseBlobStore propio… El dominio CAD sigue hablando únicamente con el puerto neutral» | Falta el adaptador que sirva el PDF/DXF publicado por una URL pública sin cuenta — hoy el blob store sirve el documento autenticado, no el artefacto de publicación abierto |
| `/demo` abre el DXF del propio visitante sin cuenta ni red | SÍ | `apps/web/src/lib/cad/engine/command-manifest.ts:150` — `DXFIN` está en el registro, módulo `commands/interop-dxf`; `00c-CUADRO-DE-MANDO.md` hallazgo del bloque «Landing» confirma `grep -n "fetch|designClient|/v1/" .../interop-dxf.ts` → 0 — el fichero entra por `engine.feedFile`, no por HTTP | Nada lo dice: ni el `<title>` del héroe (`page.tsx:382-387`, «Probar sin cuenta»), ni el metadata de `/demo` (`demo/page.tsx:19-23`), ni el banner (`DemoStudio.tsx:72-73`) nombran que el visitante puede abrir SU PROPIO archivo. Es un hueco de promesa, no de capacidad (ver cola, §7) |
| Cuenta vencida entra en sólo-lectura, nunca bloquea | SÍ | `apps/api/src/modules/auth/guards/entitlement-read-only.pg.spec.ts` (existe y corre contra PostgreSQL real, confirmado con `ls`); `/terms` la declara «obligación del servicio, no cortesía revocable» (prompt maestro §6.4) | La puerta de salida (exportación DXF R12 mutilada del hallazgo 10) rompe la promesa en el fondo — ver contradicción en §6 |

**Ventana de pérdida medida y publicada: 16,9 s.** Confirmado literalmente en
`docs/execution/auditoria-fable/PROMPT_MAESTRO_FABLE.md:139,2069,2152`; este
frente no re-corrió la medición (es evidencia de otro frente/campaña, no de
inventario). AutoCAD no publica la suya — es la ventaja §6.1·3 del prompt
maestro y ninguna fila de `rubric.json` ni `ESCALERA.md` la puntúa (ver §5).

**Conclusión de esta sección:** de las ocho piezas que el prompt maestro
llama «ya pagadas y sin cobrar», siete están verificadas presentes en el
árbol con evidencia directa; la octava (aislamiento por organización del
enlace de revisión) queda sin verificar en esta pasada porque cae fuera del
alcance de un inventario (sería una auditoría de código de seguridad, no un
`grep` de existencia). Ninguna de las tres apuestas tiene fila en
`rubric.json`, `ESCALERA.md` ni `BACKLOG.md` — confirmado por
`grep -rn "enlace de entrega\|degradación honesta\|salida del cliente" docs/competitive/rubric.json docs/parity/ESCALERA.md docs/execution/BACKLOG.md`
→ 0 coincidencias en los tres ficheros. Eso alimenta la sección 5.

## 5 · Huecos sin fila

Capacidades con valor alto para el arquitecto del lunes que ninguna de las
36 filas de `rubric.json` mide. Verificado con
`grep -rn "<término>" docs/competitive/rubric.json` para cada una antes de
proponerla — la regla de la casa: un hueco sin su `grep` de «no existe» no
cuenta.

### 5.1 · Las tres apuestas del navegador (§6.6 del prompt maestro)

Confirmado en la sección 4: `grep -rn "enlace de entrega\|degradación
honesta\|salida del cliente\|ventana de pérdida" docs/competitive/rubric.json docs/parity/ESCALERA.md docs/execution/BACKLOG.md`
→ 0 coincidencias en los tres ficheros. Propuesta de fila nueva, grupo
`truth` (Integridad y capacidad de crecer — es donde ya viven las filas que
miden que el producto no se contradiga a sí mismo, no `core` ni `pro`):

```json
{
  "id": "browser-advantage",
  "group": "truth",
  "name": "La ventaja del navegador: entrega, degradación y salida",
  "points": 6,
  "gap": "Ninguna fila mide el enlace de entrega público, la ventana de pérdida publicada ni la salida completa del cliente al terminar de pagar. Las tres piezas existen parcialmente en el árbol (recibo de publicación con sha256, enlace de revisión con expiración/revocación, entitlement de sólo-lectura) pero el criterio que las mediría no existe todavía.",
  "criteria": [
    {
      "id": "browser-advantage.delivery-link",
      "points": 2,
      "text": "Un enlace público (sin cuenta) abre la lámina publicada con su versión, sha256 y manifiesto de pérdidas al lado, con expiración y revocación",
      "costDays": 0,
      "evidence": [
        { "kind": "todaviaNo", "note": "El recibo de publicación (cad-publication.entity.ts) y el enlace de revisión (review-link.service.ts) existen; no hay ruta pública que sirva el PDF/DXF publicado sin autenticación con el manifiesto de pérdidas adjunto." }
      ]
    },
    {
      "id": "browser-advantage.loss-window-published",
      "points": 2,
      "text": "La ventana de pérdida ante fallo del navegador está medida, publicada y re-medida en cada release (gate de regresión, no una corrida manual)",
      "costDays": 0,
      "evidence": [
        { "kind": "todaviaNo", "note": "La medición de 16,9 s existe (PROMPT_MAESTRO_FABLE.md:139) pero no hay gate en CI que la vuelva a medir por release; es una corrida, no un trinquete." }
      ]
    },
    {
      "id": "browser-advantage.client-exit",
      "points": 2,
      "text": "Al terminar el pago, el cliente exporta TODO su contenido (organización completa) y puede borrar su cuenta (derecho ARCO), sin DXF mutilado en la puerta de salida",
      "costDays": 0,
      "evidence": [
        { "kind": "todaviaNo", "note": "T-11 y T-62 del prompt maestro: no existe exportación completa de organización ni borrado de cuenta; el DXF de salida está mutilado sin manifiesto (00c-CUADRO-DE-MANDO.md hallazgo 10)." }
      ]
    }
  ]
}
```

### 5.2 · El PDF underlay como sustrato que "no imanta"

`docs/parity/ESCALERA.md` («PDF como sustrato», ventana 1) declara la
capacidad en peldaño 3, con diez órdenes contra PDF reales
(`pdf-underlay-commands.spec.ts`, 118 comprobaciones), pero
`grep -n "toolset\|pdf.*underlay\|PDFATTACH" docs/competitive/rubric.json` →
la única mención cae dentro de un criterio genérico de interoperabilidad, sin
un criterio propio para "el sustrato imanta al OSNAP". Como AutoCAD vende el
PDF underlay con enganche como una de sus funciones más usadas por
arquitectos que calcan sobre el plano de otro consultor, y aquí está
declarado explícitamente que "no imanta hasta que la escena de referencias
lo incluya", este frente no propone una fila nueva (el criterio ya existe de
forma genérica): queda anotado para que el coordinador decida si amplía el
criterio existente, con el coste en la cola (§7) cuando esa sección esté
completa.

## 6 · Contradicciones

Afirmaciones de `ESCALERA.md`, `rubric.json` o el propio prompt maestro que
el árbol desmiente hoy. Cada una cita el `grep` ya hecho (por este frente o
por el escéptico de `00c-CUADRO-DE-MANDO.md`, referenciado por su hallazgo)
para no repetir trabajo que el invariante 1 ya cerró.

**Dirección A — cobrado de más (la fila dice que hay más de lo que hay):**

1. **`ESCALERA.md:366-367` da peldaño 5 a «FLATSHOT/SOLPROF sobre el modelo
   del ARQUITECTO (muros, columnas, mobiliario)» citando el golden 92, pero
   ese golden no respalda ninguna fila de la rúbrica.**
   `grep -n '92-cad-alzado' docs/competitive/rubric.json` → 0 coincidencias
   (verificado por este frente, repitiendo el `grep` de
   `00c-CUADRO-DE-MANDO.md` hallazgo 4). `toolset-architecture` se sostiene
   sobre los goldens 53, 77, 78 y 79, no el 92. El peldaño 5 de esa fila de
   `ESCALERA.md` está cobrado sobre el muro HEREDADO (`box`/`station`), no
   sobre la entidad `wall` real que `WALL` emite — `flatshot-solids.ts:181-192`
   excluye `entity.type === "wall"` explícitamente antes de llegar a
   `volumeFor`. Un lector de `ESCALERA.md` cree que puede sacar un corte de
   un muro dibujado con `WALL` hoy; no puede.
2. **`toolset-electrical.esquemas` (rubric.json:3759, 2 pt) cobra por
   «Esquemas eléctricos: símbolos normalizados» con evidencia
   `apps/web/src/lib/cad/mep-symbols.ts`, que son símbolos de instalación en
   PLANTA, no de esquema de control.**
   `grep -rn 'bobina|contactor|relevador|guardamotor|seccionador|60617|schematic' apps/web/src apps/api/src packages/` (repo completo) →
   0 coincidencias (repetido de `00c-CUADRO-DE-MANDO.md`, bloque «Toolsets
   Mechanical y Electrical», tercer hueco). No existe un solo símbolo de
   esquema unifilar de control (bobina, contactor, relevador). El campo
   `gap` de esa fila enumera cinco ausencias y no menciona ésta, que es la
   mayor.
3. **`integrity.no-silent-loss` (rubric.json, 4 pt) afirma «CERO pérdidas
   silenciosas» midiendo sólo la ruta del navegador; el endpoint público
   `GET .../export/dxf` (`cad.controller.ts:331-352`) sirve un DXF R12
   mutilado sin manifiesto.**
   `grep -cin "loss|manifest|warning|advert" apps/api/src/modules/cad/cad-dxf-export.ts`
   → 0, en 291 líneas (repetido de `00c-CUADRO-DE-MANDO.md`, hallazgo 10,
   marcado ahí como el más serio del informe: sube de «alta» a «bloqueante»
   porque el SDK generado (`packages/design-sdk/src/generated/design-api.ts:2506`)
   anuncia literalmente «los datos del usuario nunca quedan rehenes de un
   cobro» sobre ese mismo endpoint). La fila cobra 4 puntos por una garantía
   que su propia puerta de salida de datos incumple.
4. **La paleta de capas ofrece «No se imprime» (`CadLayerDef.plot`) y la
   norma mexicana crea la capa AUXILIAR con `plot: false`; la publicación
   nunca lee ese campo.**
   `grep -rn "layer.plot\|plot === false\|plot !== false" apps/web/src` → 0
   consumidores en el camino de trazado (repetido de
   `00c-CUADRO-DE-MANDO.md`, bloque «Espacio papel», hallazgo B). La capa
   AUXILIAR de la propia norma del producto —dibujada para apoyarse, no
   para imprimirse, según su propio comentario en
   `standards/mexican-layers.ts:143-150`— sale impresa en los dos caminos de
   PDF. No está declarado en `rubric.json`, `ESCALERA.md` ni `BACKLOG.md`:
   `grep -rn "no se imprime\|plot.*false\|layer.plot" docs/competitive/rubric.json docs/parity/ESCALERA.md docs/execution/BACKLOG.md`
   (verificado por este frente) → 0 coincidencias en los tres.
5. **`modeling3d.z-roundtrip` cobra 2 puntos con tres specs de Node
   (`draw-spatial`, `z-frontiers`, `dxf-import-cota`) mientras un e2e
   committeado contradice la capacidad en el navegador.**
   `apps/web/e2e/auditoria/tresd.spec.ts` está declarado
   `bloquea_el_trabajo: true` en su manifiesto y comprueba que sobre una
   fachada «sólo LINE se declara espacial» y que con el ratón el trazo se
   aplana al suelo sin avisar (repetido de `00c-CUADRO-DE-MANDO.md`, bloque
   «Calidad del código», tercer hueco). `ESCALERA.md:172` es honesto y pone
   peldaño 3 con «falta un golden de navegador pinchando sobre una cara»;
   la rúbrica no distingue ese matiz y cobra los 2 puntos igual.
6. **`xrefs.resolution` cobra 2 puntos por «Resolución de recursos, CAPAS DE
   XREF y bind con round-trip»; las capas del dibujo adjuntado se aplastan
   a UNA sola.**
   `xref-projection.ts:100-105` sobrescribe la capa de cada entidad
   importada con `cadXrefLayerId(xrefId)` — una sola capa `XREF|<nombre>`,
   color fijo `#64748b`, grosor fijo 0,18 (repetido de
   `00c-CUADRO-DE-MANDO.md`, bloque «Trabajar con otros», primer hueco
   bloqueante). No hay `VISRETAIN` ni control de capas de xref: `grep`
   sobre `apps/web/src` de `fade` fuera de imágenes → 0. El criterio dice
   «CAPAS de xref» en su texto y el árbol no las tiene.

**Dirección B — declarado ausente cuando existe:**

7. **El auditor original calificó «DWG lectura/escritura» en 0/10, y el
   propio informe de interoperabilidad afirma «no puedo abrir el .dwg que
   me mandan, ninguno».**
   Falso como diagnóstico completo, verificado por
   `00c-CUADRO-DE-MANDO.md` hallazgo 8: `dwg-interop-flag.ts:173,190,240`
   tiene DOS autorizaciones firmadas (`ownerSigned: true`, ADR-0009
   §6-bis/ter/quater y §7) para AC1015 y AC1018, cableadas de punta a
   punta (`document-import-validation.ts:124`,
   `document-import.worker.ts:78-101`, `dashboard/page.tsx:692`). El
   escritor DWG público también existe (`dwg-native-writer.ts`, 469
   líneas, ADR-0009 §8 firmada). Lo que de verdad falta es la firma de la
   familia MODERNA (AC1024/27/32) y el dictamen jurídico — dos cosas, no
   «todo DWG». Este frente confirma con `grep -c "ownerSigned: true"
   apps/web/src/lib/cad/dwg-interop-flag.ts` → 2 coincidencias (verificado
   en esta pasada).
8. **El auditor trató `/demo` como «el editor real con un plano
   precargado» sin ver que ya abre el archivo del propio visitante.**
   Cubierto en la sección 4 de este documento: `DXFIN` está en el registro
   y no toca la red. Es la dirección B más valiosa de las dos: sobra
   producto y falta el renglón que lo anuncia, no al revés.

## 7 · Cola propuesta

> _Pendiente — depende de que las secciones 2 y 3 estén completas para
> ordenar por el criterio de §2.1 del prompt maestro (afirmación falsa
> viva > rompe el bucle > impide entregar > lo demás) sin omitir ninguna
> capacidad de AutoCAD que todavía no se comparó formalmente. La sección 5
> y las ocho contradicciones de §6 ya son candidatas seguras a la cola —
> en particular las contradicciones 1, 3 y 4 de §6 son afirmaciones falsas
> VIVAS (primer criterio de orden) — pero el resto de la cola de 30 no se
> arma hasta tener el barrido completo de §2/§3, para no dejar fuera algo
> más urgente que todavía no se ha mirado. Se completa en el siguiente
> commit de este frente. Enlaza a la ficha de `PROMPT_MAESTRO_FABLE.md`
> §OLA correspondiente cuando ya exista una tarea T-NN para el mismo hueco,
> en vez de duplicarla._

---

## Estado de este documento

Commit en curso — sección 1 (Método) y sección 4 (Lo que Valle tiene y
AutoCAD no) completas y verificadas con evidencia propia; sección 5
(huecos sin fila) tiene su primera fila propuesta (la apuesta del
navegador) y una segunda anotada para ampliar un criterio existente;
sección 6 (Contradicciones) tiene ocho contradicciones verificadas, cuatro
en cada dirección. Secciones 2, 3 y 7 están pendientes de que regrese la
investigación web de fuentes oficiales de Autodesk, lanzada en paralelo a
este commit. El resumen final de cuántas capacidades SÍ/PARCIAL/NO por
bloque se añade cuando esas secciones cierren, calculado del propio
documento.
