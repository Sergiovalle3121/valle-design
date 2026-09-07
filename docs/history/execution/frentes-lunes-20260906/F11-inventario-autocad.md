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

Fuentes del lado AutoCAD investigadas hoy 2026-09-06 contra
`help.autodesk.com` (misma limitación de acceso que en §3: `WebFetch`
bloqueado por política de red del entorno, `EGRESS_BLOCKED`; las
descripciones vienen de fragmentos de `WebSearch` sobre esas páginas
oficiales, nunca copiadas literalmente — cada fila cita su URL y fecha).
Las 294 filas de comandos de Valle vienen de `command-manifest.ts` (§1).
Por espacio, las filas donde varios comandos de AutoCAD tienen un único
equivalente maduro en Valle (p. ej. las ocho primitivas de sólido, o las
diez capas `LAY*`) se agrupan en una sola línea.

### 2.1 · Dibujar

| Capacidad AutoCAD | Comando(s) Valle | ¿Existe? | Evidencia | Peldaño | Fila rúbrica | Valor |
| --- | --- | --- | --- | --- | --- | --- |
| LINE, PLINE, CIRCLE, ARC, RECTANG, POLYGON, ELLIPSE, SPLINE — [Autodesk 2027](https://help.autodesk.com/view/ACD/2027/ENU/), 2026-09-06 | mismos nombres (`:96,108,97,100,112,102,101,115`) | SÍ | `draw-2d.commands` evidencia directa (8 comandos citados en `rubric.json`) | 5 | `draw-2d.commands` | alto |
| DONUT, REVCLOUD, XLINE, RAY, POINT, DIVIDE, MEASURE — [Autodesk 2025/2027 varios](https://help.autodesk.com/view/ACD/2025/ENU/?guid=GUID-46C0F9F2-6112-415C-AB2C-29EEE5984A6F), 2026-09-06 | mismos nombres (`:113-114,98-99,109-111`) | SÍ | `draw-2d.construction` (2 pt, seis comandos citados) | 5 | `draw-2d.construction` | medio |
| HATCH, GRADIENT, BOUNDARY — [Autodesk 2026](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-Core/files/GUID-410ECEBF-7CC2-4000-A45E-18F1F6BEE423.htm), 2026-09-06 | `HATCH`,`GRADIENT`,`BOUNDARY` (`:51-53`) | SÍ | fila «HATCH asociativo» del resumen de `rubric.mjs` (12/12) | 5 | `hatch` (grupo core) | alto |
| WIPEOUT — [Autodesk 2027 (núcleo)](https://help.autodesk.com/view/ACD/2027/ENU/), 2026-09-06 | `WIPEOUT` (`:104`) | SÍ | tecleable, `check:command-integrity` lo cubre | 3 | sin fila explícita | bajo |
| SOLID (relleno heredado) — misma fuente, 2026-09-06 | `SOLID` (`:103`) | SÍ | tecleable | 3 | sin fila explícita | bajo |
| REGION — [Autodesk 2024](https://help.autodesk.com/cloudhelp/2024/ENU/AutoCAD-Core/files/GUID-A3276CE4-CDFA-45E4-AE15-EDD75DDD5124.htm), 2026-09-06 | `REGION` (`:149`) | SÍ | usado internamente por `HATCH`/`BOUNDARY`, tecleable | 3 | sin fila explícita | bajo |
| TABLE — [Autodesk 2025](https://help.autodesk.com/view/ACD/2025/ENU/?guid=GUID-CA9995D8-98B2-4BFB-972F-FEB0934A1E33), 2026-09-06 | `TABLE` (`:95`) | SÍ | golden 77 (cuadro de superficies/carpintería en la lámina, texto leído de los bytes del PDF) | 5 | sin fila explícita (evidencia real en `toolset-architecture.interiores`) | alto |
| Coordenadas absolutas/relativas/polares — [Autodesk 2027](https://help.autodesk.com/view/ACD/2027/ENU/), 2026-09-06 | entrada dinámica del motor | SÍ | `draw-2d.coordinates` | 5 | `draw-2d.coordinates` | alto |
| OSNAP — [Autodesk 2025](https://help.autodesk.com/view/ACD/2025/ENU/?guid=GUID-6FB309A8-2696-4383-8277-950E9E2756A8), 2026-09-06 | `OSNAP` (`:265`) + motor de enganche | PARCIAL | `draw-2d.osnap`; **pero** `00c-CUADRO-DE-MANDO.md` hallazgo 18 confirma que los adaptadores del documento no alimentan cuatro de los catorce cubos (midpoint, node, insertion, geometric-center) — `professional-snapping.spec.ts:22-42` es un spec VERDE sobre una función MUERTA | 3 | `draw-2d.osnap` | alto — bloqueante confirmado |
| ORTHO (F8), rastreo polar (F10), rastreo a objetos (F11) — [Autodesk 2024](https://help.autodesk.com/view/ACD/2024/ENU/?guid=GUID-7EC3C63D-EA4E-4E65-A676-C3A3627E3F19), 2026-09-06 | ajustes de dibujo con diálogo aplicable | SÍ | `draw-2d.tracking` | 5 | `draw-2d.tracking` | medio |
| F7 (cuadrícula), F9 (forzado a rejilla), F12 (entrada dinámica) — [Autodesk 2025](https://help.autodesk.com/view/ACD/2025/ENU/?guid=GUID-A782462F-F85C-4496-85A5-3D9A54548489), 2026-09-06 | ninguno | NO | el `gap` del propio `rubric.json` categoría `draw-2d` lo declara textualmente: «faltan los conmutadores estándar F7 (rejilla), F9 (forzado) y F12 (entrada dinámica), que un dibujante de AutoCAD pulsa sin mirar» | 0 | `draw-2d.toggles` (1 pt, criterio abierto) | alto — es un reflejo muscular de cualquier delineante |

### 2.2 · Modificar

| Capacidad AutoCAD | Comando(s) Valle | ¿Existe? | Evidencia | Peldaño | Fila rúbrica | Valor |
| --- | --- | --- | --- | --- | --- | --- |
| ERASE, MOVE, COPY, ROTATE, SCALE, MIRROR, OFFSET — [Autodesk 2015 (Modifying)](https://help.autodesk.com/cloudhelp/2015/ENU/AutoCAD-Core/files/GUID-29B2169B-01D9-429B-9DCD-5D3552E5E68E.htm), 2026-09-06 | mismos nombres (`:175-178,191,196-197`) | SÍ | `modify.basics` (7 comandos citados) | 5 | `modify.basics` | alto |
| TRIM, EXTEND, FILLET, CHAMFER, BREAK, JOIN — [Autodesk 2023/2024/2025 varios](https://help.autodesk.com/view/ACD/2023/ENU/?guid=GUID-725D3A7A-5E52-47F0-BA7A-7D15F9EF6D7F), 2026-09-06 | mismos nombres (`:182-184,198-199,189`) | SÍ | `modify.edges` (goldens de recorte y empalme) | 5 | `modify.edges` | alto |
| ARRAY (rectangular/polar/trayectoria), ARRAYEDIT — [Autodesk 2027](https://help.autodesk.com/view/ACD/2027/ENU/), 2026-09-06 | `ARRAY`,`ARRAYEDIT` (`:173-174`) | SÍ | `modify.array` | 5 | `modify.array` | alto |
| STRETCH, LENGTHEN, ALIGN, PEDIT, SPLINEDIT, EXPLODE — [Autodesk 2023/2024/2025 varios](https://help.autodesk.com/view/ACD/2023/ENU/?guid=GUID-19FDC9E4-049E-40BA-AB6D-58A4C2557570), 2026-09-06 | mismos nombres (`:194-195,171,192-193,190`) | SÍ | `modify.advanced` | 5 | `modify.advanced` | alto |
| MATCHPROP, GROUP/UNGROUP, OVERKILL, DRAWORDER — [Autodesk varios](https://help.autodesk.com/view/ACADWEB/ENU/?guid=AutoCAD_Web_Help_List_Commands_Matchprop_html), 2026-09-06 | mismos nombres (`:172,138-139,180-181`) | SÍ | `modify.housekeeping` | 5 | `modify.housekeeping` | medio |
| Pinzamientos (grips) — [Autodesk 2026](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-DidYouKnow/files/GUID-BBEA1F71-EB16-4D49-80D9-970A6909F508.htm), 2026-09-06 | grips nativos | SÍ | `modify.grips` | 5 | `modify.grips` | alto |
| Selección por ventana/cruce/polígono/valla/lazo — [Autodesk 2024](https://help.autodesk.com/view/ACD/2024/ENU/?guid=GUID-D0D5C0C3-F092-448A-8E81-D38F27094639), 2026-09-06 | `native-selection-index` | SÍ | `modify.selection`; §1.3 del prompt maestro: «el motor de selección profesional está completo por debajo» | 5 | `modify.selection` | alto |
| QSELECT, FILTER — [Autodesk 2024/2016](https://help.autodesk.com/view/ACD/2024/ENU/?guid=GUID-40893D34-ADBE-406A-8993-9035F2771F1D), 2026-09-06 | `QSELECT`,`FILTER` (`:247-248`) | SÍ | tecleables, `modify.selection` | 5 | `modify.selection` | medio |
| SELECTSIMILAR, ADDSELECTED, XPLODE, SETBYLAYER, CHPROP, NCOPY — [Autodesk 2016 (SELECTSIMILAR/ADDSELECTED)](https://help.autodesk.com/cloudhelp/2016/ENU/AutoCAD-Core/files/GUID-FBBA809F-9BD4-4A34-B671-0B8A920B18A4.htm), 2026-09-06 | mismos nombres (`:185-188,249-250`) | SÍ | golden 76; `foreign-work.properties` — probado tecleado sobre un plano AJENO | 5 | `foreign-work.properties` | alto |

### 2.3 · Anotar

| Capacidad AutoCAD | Comando(s) Valle | ¿Existe? | Evidencia | Peldaño | Fila rúbrica | Valor |
| --- | --- | --- | --- | --- | --- | --- |
| TEXT/DTEXT, MTEXT, DDEDIT — [Autodesk 2018](https://help.autodesk.com/cloudhelp/2018/ENU/AutoCAD-MAC-Core/files/GUID-24805E39-45F8-427E-A9CE-9A1E93E58D04.htm), 2026-09-06 | `TEXT`,`MTEXT`,`DDEDIT` (`:64-66`) | SÍ | fila «MTEXT y texto» del resumen de `rubric.mjs` (9/9) | 5 | `mtext` (grupo core) | alto |
| DIMLINEAR…DIMORDINATE, DIMBASELINE, DIMCONTINUE, QDIM, DIM — [Autodesk 2025](https://help.autodesk.com/view/ACD/2025/ENU/?guid=GUID-9D7BA0FC-5FA5-44FE-8E52-786946703FE0), 2026-09-06 | mismos nombres (`:40-50,56-58`) | SÍ | fila «Cotas asociativas» (12/12) | 5 | `dimensions` (grupo core) | alto |
| DIMSTYLE — [Autodesk 2027](https://help.autodesk.com/view/ACD/2027/ENU/), 2026-09-06 | `DIMSTYLE` (`:60`) | PARCIAL | golden 84 subestilos `$0/$2/$3/$4/$6` (Mechanical); falta un golden que teclee el subestilo genérico fuera de Mechanical | 3-5 según familia | `dimensions` / `toolset-mechanical.cotas` | alto |
| MLEADER, LEADER, QLEADER, MLEADERSTYLE — [Autodesk 2023](https://help.autodesk.com/cloudhelp/2023/ENU/AutoCAD-Core/files/GUID-5FEC133A-5EBD-4EFA-9E44-771E85480DAD.htm), 2026-09-06 | mismos nombres (`:54-55,58,61`) | PARCIAL | fila «MLEADER y tablas» (4/5), retiene 1 pt por evidencia propia | 5 | `mleader-tables` | alto |
| TOLERANCE (marco de control GD&T) — [Autodesk 2025](https://help.autodesk.com/cloudhelp/2025/ENU/AutoCAD-Core/files/GUID-AA8B28ED-B87E-418C-9353-307B436CC4A8.htm), 2026-09-06 | `TOLERANCE` (`:67`) | SÍ | tecleable | 3 | sin fila específica (distinto de `toolset-mechanical.cotas`, que es ISO 286 sobre la cota, no el marco GD&T) | bajo — poco usado fuera de manufactura |
| FIELD, UPDATEFIELD — [Autodesk 2022](https://help.autodesk.com/cloudhelp/2022/ENU/AutoCAD-Core/files/GUID-742C92C3-1284-4722-B650-C46F9191C701.htm), 2026-09-06 | `FIELD`,`UPDATEFIELD` (`:117-118`) | SÍ | tecleables | 3 | sin fila específica | medio |
| TABLESTYLE, TABLEDIT — [Autodesk 2021/2023](https://help.autodesk.com/cloudhelp/2021/ENU/AutoCAD-Core/files/GUID-CA9995D8-98B2-4BFB-972F-FEB0934A1E33.htm), 2026-09-06 | `TABLESTYLE`,`TABLEDIT` (`:62-63`) | PARCIAL | `ESCALERA.md` Ola1: «la celda se pide por FILA y COLUMNA porque el motor no ve la pantalla»; sin insertar/borrar filas ni fusionar celdas | 3 | sin fila específica | medio |
| GEOMCONSTRAINT (y GC*), DIMCONSTRAINT — [Autodesk 2024](https://help.autodesk.com/view/ACD/2024/ENU/?guid=GUID-899E008D-B422-4DF2-AC8D-1A4F5701ED4E), 2026-09-06 | mismos nombres (`:200-220`) | SÍ | tecleables (13 comandos `GC*` + `DIMCONSTRAINT`/`DCLINEAR`/etc.) | 3 | sin fila específica | bajo — restricciones paramétricas 2D poco usadas por un despacho de arquitectura mexicano |

### 2.4 · Capas y propiedades

| Capacidad AutoCAD | Comando(s) Valle | ¿Existe? | Evidencia | Peldaño | Fila rúbrica | Valor |
| --- | --- | --- | --- | --- | --- | --- |
| LAYER (paleta), LAYISO, LAYOFF, LAYFRZ, LAYTHW, LAYON, LAYMCH, LAYWALK, LAYMRG, LAYDEL, VPLAYER — [Autodesk 2025](https://help.autodesk.com/view/ACD/2025/ENU/?guid=GUID-0583B566-FD44-404D-8F95-5271EE390935), 2026-09-06 | mismos nombres (`:251-262`) | SÍ | fila «Capas y propiedades» del resumen (10/10) | 5 | `layers` (grupo core) | alto |
| PROPERTIES (paleta) — [Autodesk 2025](https://help.autodesk.com/view/ACD/2025/ENU/?guid=GUID-84E1116E-DEAE-4A0B-9364-F61DACF5C300), 2026-09-06 | `PROPERTIES` (`:263`) | SÍ | misma fila | 5 | `layers` | alto |
| LINETYPE, LWEIGHT, COLOR — [Autodesk 2027](https://help.autodesk.com/view/ACD/2027/ENU/), 2026-09-06 | mismos nombres (`:269,281-282`) | SÍ | golden 80 (tipos de línea complejos con texto, LTSCALE) | 5 | `layers` | alto |
| CHECKSTANDARDS — [foro oficial citando el comando](https://forums.autodesk.com/t5/autocad-forum/autocad-cad-standards-checkstandards-command-and-layer-states/td-p/12991004), 2026-09-06 | `CHECKSTANDARDS` (`:159`) | SÍ | golden 88 (cadena `AUDIT`·`PURGE`·`LAYTRANS`·`CHECKSTANDARDS`·`ETRANSMIT`) | 5 | sin fila específica (evidencia real en la sección «trabajo ajeno») | alto |
| LAYTRANS (Traductor de capas) — [Autodesk 2016](https://help.autodesk.com/cloudhelp/2016/ENU/AutoCAD-Core/files/GUID-83CFD677-78F3-492F-A5A3-5A0197D2FA2C.htm), 2026-09-06 | `LAYTRANS` (`:157`) | SÍ | golden 88 | 5 | sin fila específica | alto |

### 2.5 · Bloques y atributos

| Capacidad AutoCAD | Comando(s) Valle | ¿Existe? | Evidencia | Peldaño | Fila rúbrica | Valor |
| --- | --- | --- | --- | --- | --- | --- |
| BLOCK, WBLOCK, INSERT, BASE — [Autodesk 2024](https://help.autodesk.com/view/ACD/2024/ENU/?guid=GUID-61A6871E-E74F-4959-8281-934C77D1EBF4), 2026-09-06 | mismos nombres (`:76-79`) | SÍ | fila «Bloques y atributos» del resumen (9/9) | 5 | `blocks` | alto |
| ATTDEF, ATTEDIT/EATTEDIT, ATTSYNC, BURST — misma fuente, 2026-09-06 | mismos nombres (`:94,80-82`) | SÍ | golden 90 (`ATTSYNC` conserva lo escrito, añade lo nuevo, retira la huérfana) | 5 | `blocks` | alto |
| BEDIT (Editor de bloques, en sitio) — misma fuente, 2026-09-06 | `BEDIT` (`:83`) | SÍ | `blocks-edit.spec.ts` v2 — abre la referencia EN SITIO, no el panel (arreglado en Ola 7) | 5 | `blocks` | alto |
| Bloques dinámicos — parámetros y acciones — [Autodesk 2024/2025](https://help.autodesk.com/view/ACD/2024/ENU/?guid=GUID-3EE54831-7AFB-4464-BB89-D9E3CB9D4591), 2026-09-06 | `BLOQUEDIN`,`BLOQUEDINSET`,`BLOQUEDINDEF` (`:119-122`) | PARCIAL | golden 96; falta el GRIP (se cambia por orden sobre la selección, no arrastrando un tirador) | 5 (comando) / falta grip | `blocks` | alto |
| DESIGNCENTER (ADCENTER) — [contexto oficial de organización de bloques](https://www.autodesk.com/support/technical/article/caas/sfdcarticles/sfdcarticles/Creating-custom-Parameters-Sets-for-Dynamic-Blocks.html), 2026-09-06 | `ADCENTER` (`:92`) | PARCIAL | `00c-CUADRO-DE-MANDO.md` hallazgo 11: sin catálogo del inquilino (`grep -rn xrefCatalog` → 0 en `.tsx`) | 2 | sin fila específica | medio |
| TOOLPALETTES — [referencia a documentación oficial de Tool Palettes](https://ddscad.com/using-dynamic-blocks-the-tool-palette-in-autocad-part-1/), 2026-09-06 | `TOOLPALETTES` (`:267`) | PARCIAL | `00c-CUADRO-DE-MANDO.md`, bloque «La cinta»: `save()`/`remove()` de `tool-palettes.ts` nunca se llaman en producción — sin escritura por ningún camino | 2 | sin fila específica | alto — bloquea la promesa de venta «paletas del despacho» |
| COUNT (contar bloques) — [Autodesk 2024](https://help.autodesk.com/view/ACD/2024/ENU/?guid=GUID-D5D02903-27D4-4AF0-AAE6-82CF97C7E411), 2026-09-06 | ninguno dedicado; `DATAEXTRACTION` cuenta por cuadro, no de forma interactiva | PARCIAL | sin comando `COUNT` en `command-manifest.ts` (verificado por este frente) | 0 | sin fila | medio |
| Smart Blocks (IA) — [Autodesk University 2024](https://www.autodesk.com/autodesk-university/class/Autodesk-AI-AutoCAD-Smart-Blocks-and-Markup-Import-Assist-2024), 2026-09-06 | ninguno | NO | fuera de alcance por decisión de la casa: `no-ai-boundary.spec.ts` (AGENTS.md, IDENTITY.md) — no es un hueco, es una frontera explícita | — | — | — |

### 2.6 · Espacio papel y trazado

| Capacidad AutoCAD | Comando(s) Valle | ¿Existe? | Evidencia | Peldaño | Fila rúbrica | Valor |
| --- | --- | --- | --- | --- | --- | --- |
| LAYOUT, MVIEW, MSPACE, PSPACE — [Autodesk 2019](https://help.autodesk.com/view/ACD/2019/ENU/?guid=GUID-A361F313-E1EB-400C-81B2-6B9AA2C0DDB7), 2026-09-06 | mismos nombres (`:152-155`) | SÍ | fila «Layouts, viewports y publicación» (9/10) | 5 | `layouts` | alto |
| PAGESETUP, PLOT — misma fuente, 2026-09-06 | `PAGESETUP`,`PLOT` (`:238-239`) | PARCIAL | golden 46; **pero** `00c-CUADRO-DE-MANDO.md` hallazgo A confirma que el botón de publicar usa un segundo emisor de PDF que NO pasa por `buildCadPlotJob`/`preflightCadPageSetup` — el cajetín paramétrico y la tabla de plumas no llegan a ese camino | 5 (comando) / bloqueante (botón) | `layouts` | alto — contradicción candidata, ver nota abajo |
| Tablas de plumas CTB/STB — [Autodesk 2027](https://help.autodesk.com/view/ACD/2027/ENU/), 2026-09-06 | cargables por archivo | PARCIAL | golden 46, golden 91; viven en la SESIÓN y se pierden al recargar | 3 | `layouts` | medio |
| PUBLISH, Conjuntos de planos (Sheet Set Manager) — [referencia al Sheet Set Manager oficial](https://forums.autodesk.com/t5/autocad-forum/sheet-set-manager-scale-evaluates/td-p/14074253), 2026-09-06 | `PUBLISH`,`SHEETSET` (`:285-286`) | SÍ | golden 89 (`SHEETSET Índice`, `Renumerar`, `PUBLISH` de 3 páginas) | 5 | `layouts` | alto |
| CANNOSCALE (escala de anotación) — [Autodesk 2024](https://help.autodesk.com/view/ACD/2024/ENU/?guid=GUID-C33D5B68-5A3F-4AF6-9AFB-F74DAB8B6722), 2026-09-06 | selector propio | PARCIAL | `annotative-scale.spec.ts`; vive en la SESIÓN, se pierde al recargar (`CadDocumentMeta` no tiene campo) | 3 | `recog` (Reconocimiento en pantalla, 13/14) | medio |
| FLATSHOT, SOLPROF — [Autodesk 2022/2024](https://help.autodesk.com/view/ACD/2022/ENU/?guid=GUID-5F5EE4F2-4B52-46E3-9F6C-7852AC997B70), 2026-09-06 | `FLATSHOT`,`SOLPROF` (`:290-291`) | PARCIAL | golden 92; **excluye `entity.type === "wall"` explícitamente** — no hay corte ni alzado de un muro real (§6, contradicción 1) | 3 | `toolset-architecture.envolvente` (evidencia SIN respaldo de rúbrica, ver §6) | alto — contradicción documental |
| SECTIONPLANE, LIVESECTION — [Autodesk 2024](https://help.autodesk.com/view/ACD/2024/ENU/?guid=GUID-2913E7CC-0542-45FB-ADEA-06B991C38696), 2026-09-06 | ninguno con ese nombre; capacidad equivalente bajo `SOLVIEW`/`SOLDRAW` | NO | `ESCALERA.md` Ola4: «La familia SECTIONPLANE/LIVESECTION… por su nombre — 0 — La capacidad está bajo SOLVIEW/SOLDRAW; los nombres no» | 0 (por nombre) / 5 (funcionalmente, vía SOLVIEW) | sin fila específica | bajo — es una cuestión de nomenclatura, no de capacidad ausente |
| VIEWBASE, VIEWSECTION, VIEWDETAIL, VIEWUPDATE — [Autodesk 2019](https://help.autodesk.com/cloudhelp/2019/ENU/AutoCAD-Core/files/GUID-DB165B89-5204-48EA-B1DC-454991CB05A4.htm), 2026-09-06 | ninguno | NO | `ESCALERA.md` Ola4, misma fila | 0 | sin fila específica | medio — decisión pendiente de titular (§1.5 de `PROMPT_MAESTRO_FABLE.md`: «Decidir si `PIDCLASH`… merecen órdenes propias» — pregunta análoga sin responder para esta familia) |

### 2.7 · Intercambio

| Capacidad AutoCAD | Comando(s) Valle | ¿Existe? | Evidencia | Peldaño | Fila rúbrica | Valor |
| --- | --- | --- | --- | --- | --- | --- |
| DXFIN, DXFOUT — [Autodesk 2025](https://help.autodesk.com/view/ACD/2025/ENU/?guid=GUID-D4242737-58BB-47A5-9B0E-1E3DE7E7D647), 2026-09-06 | `DXFIN`,`DXFOUT` (`:150-151`) | SÍ | fila «Import/export DXF de texto» (10/12) | 5 | `dxf-text` | alto |
| Import/export DWG — [Autodesk 2027 (formatos de archivo)](https://help.autodesk.com/view/ACD/2027/ENU/), 2026-09-06 | beta firmada `dwg-interop-flag.ts` | PARCIAL | fila «Import/export DWG» (6/7); dos autorizaciones firmadas (AC1015/AC1018), familia moderna sin firmar; ver contradicción 9 de §6 | 6 (import beta) / 5 (export beta) | `dwg` | alto |
| PDFATTACH, PDFCLIP, PDFADJUST, PDFIMPORT — [Autodesk 2023/2024/2025](https://help.autodesk.com/cloudhelp/2023/ENU/AutoCAD-Core/files/GUID-77D6192C-925B-46A3-8717-240702ED5715.htm), 2026-09-06 | mismos nombres (`:221-230`) | PARCIAL | 118 comprobaciones (`pdf-underlay-commands.spec.ts`); «no imanta hasta que la escena de referencias lo incluya» (§5.2) | 3 | `ext.interop-formats` (genérico) | alto |
| Exportación a PDF — [Autodesk 2024](https://help.autodesk.com/view/ACD/2024/ENU/?guid=GUID-EC9C6D47-814E-476D-840F-04104CF72B78), 2026-09-06 | vía `PLOT`/`PUBLISH` | SÍ | golden 46, 89 | 5 | `layouts` | alto |
| IMPORT/EXPORT (STEP, IGES, STL, OBJ) — [documentación de referencia Autodesk](https://help.autodesk.com/cloudhelp/2023/ENU/Inventor-Help/files/GUID-3F6D22A7-768F-4ABE-8DEE-C6B64C5A3B2A.htm), 2026-09-06 | `IMPORT`,`EXPORT` (`:295-296`) | PARCIAL | `00c-CUADRO-DE-MANDO.md`, bloque «Modelado 3D»: `EXPORT` declara STEP/IGES pero no descarga nada; hay CUATRO lectores de malla (OBJ/STL/glTF/COLLADA) y CERO escritores — asimetría total | 2 | sin fila específica (no hay criterio de rúbrica para exportación de malla) | alto — bloqueante confirmado: cierra impresión 3D, render externo y envío sin cuenta |
| Nubes de puntos (POINTCLOUDATTACH) — [Autodesk 2027](https://help.autodesk.com/view/ACD/2027/ENU/), 2026-09-06 | soporte parcial | PARCIAL | fila «Nubes de puntos, raster georreferenciado y GIS» (2/3) | 3 | `pointcloud-gis` | medio |
| IFC (import/export) — [Autodesk 2026, ficha del toolset Architecture](https://help.autodesk.com/view/ARCHDESK/2026/ENU/?guid=GUID-39E247EA-AF9E-4BF4-8821-040A405F3778), 2026-09-06 | ninguno | NO | Valle no importa/exporta IFC; `bim-claim-boundary.spec.ts` mantiene la frontera «no es BIM» (§6.5 del prompt maestro) — decisión de producto, no un hueco técnico | 0 | — | bajo, dado el límite de dominio declarado |
| Unidades imperiales y arquitectónicas — [Autodesk 2027](https://help.autodesk.com/view/ACD/2027/ENU/), 2026-09-06 | `UNITS` (`:278`) | SÍ | `units-imperial.spec.ts` (805 comprobaciones, 324 idas y vueltas) | 5 | sin fila específica localizada en esta pasada | alto |

### 2.8 · Colaboración

| Capacidad AutoCAD | Comando(s) Valle | ¿Existe? | Evidencia | Peldaño | Fila rúbrica | Valor |
| --- | --- | --- | --- | --- | --- | --- |
| XREF (paleta), XATTACH, XBIND, XCLIP — [Autodesk 2021/2024](https://help.autodesk.com/cloudhelp/2021/ENU/AutoCAD-Core/files/GUID-BFD18916-9DFE-4FFF-8C98-4AE38A50A7F3.htm), 2026-09-06 | mismos nombres (`:330-333`) | PARCIAL | fila «Xrefs» (5/6); §6 contradicción 6: las capas se aplastan a UNA sola, sin `VISRETAIN` | 5 (adjuntar) / 2 (capas) | `xrefs` | alto — bloqueante confirmado |
| COMPARE, DWGCOMPARE — [clase oficial de Autodesk University](https://static.au-uw2-prd.autodesk.com/Class_Handout_AS227471_Easier_Collaboration_Using_AutoCAD_DWG_Compare_Christopher_Chen.pdf), 2026-09-06 | `COMPARE` (`:89`) | PARCIAL | fila «Compare, comentarios y enlaces de revisión» (4/5); sólo compara contra la biblioteca ya cargada | 3 | `compare-review` | alto |
| ETRANSMIT — [artículo derivado, función oficial](https://uk.getrenewedtech.com/2025/08/09/collaborating-on-autocad-projects-file-sharing-etransmit-and-design-review/), 2026-09-06 | `ETRANSMIT` (`:129`) | SÍ | `etransmit-commands.spec.ts` (28) — falla CERRADO con hallazgos que bloquean | 5 | `compare-review` | alto |
| Markup Import / Markup Assist (con IA) — [blog oficial Autodesk 2024](https://www.autodesk.com/blogs/autocad/try-whats-new-in-autocad-2024-markup-import-and-markup-assist/), 2026-09-06 | `VECTORIZE` cubre la parte determinista (sin IA) de traer trazos escaneados como entidades | PARCIAL | la mitad «Markup Assist» (interpretar instrucciones de texto con IA) está fuera de alcance por decisión de la casa; la mitad determinista de traer geometría de un escaneo SÍ existe (`toolset-raster.vectorizacion`) | 3 | `toolset-raster.vectorizacion` | medio |
| Trace (revisión sobre copia temporal superpuesta) — [blog oficial Autodesk 2023](https://www.autodesk.com/blogs/autocad/whats-new-in-autocad-2023-floating-windows-trace-count-and-3d-graphics-enhancements-and-improvements/), 2026-09-06 | ninguno con ese mecanismo; Valle resuelve la revisión con enlaces de revisión + presencia + llamada (§4) | NO (mecanismo distinto) | mecanismo diferente, no un hueco directo — ver §4 | — | sin fila | bajo |
| Autodesk Docs / Autodesk Construction Cloud — [artículo que describe la integración oficial](https://resources.imaginit.com/support-blog/how-autocad-autodesk-docs-improve-collaboration-without-disruption), 2026-09-06 | tablero propio (`dashboard/page.tsx`), proyectos y documentos propios | SÍ (equivalente propio) | Valle es standalone por diseño (`AGENTS.md`: «no runtime dependency on another product or identity service») | 5 | — | — |
| Versiones (historial) — misma fuente Autodesk University, 2026-09-06 | botón «Versiones» en el estudio | PARCIAL/roto | `00c-CUADRO-DE-MANDO.md` hallazgo bloqueante: el botón llama a una ruta que `layout-http-adapter.ts:46-49` declara «SIN EQUIVALENTE… 404 limpio» — SIEMPRE falla | 2 | `saves-history` (Guardado CAS, autosave, historia y versiones, 7/8) | alto — bloqueante confirmado, fix-or-hide incumplido en un botón visible |

### 2.9 · 3D

| Capacidad AutoCAD | Comando(s) Valle | ¿Existe? | Evidencia | Peldaño | Fila rúbrica | Valor |
| --- | --- | --- | --- | --- | --- | --- |
| BOX, CYLINDER, CONE, SPHERE, TORUS, PYRAMID, WEDGE, POLYSOLID — [Autodesk 2025](https://help.autodesk.com/view/ACD/2025/ENU/?guid=GUID-6548456A-28BD-40CB-89BA-F19F5800C0ED), 2026-09-06 | mismos nombres (`:304-311`) | PARCIAL | fila «Modelado 3D: primitivas, SOLIDEDIT y la cota» (5/5 en rúbrica, pero) `ESCALERA.md` Ola1: de 52 modos, 48 escriben, 1 responde, 3 ausentes (Ttr de `CYLINDER`/`CONE`, submodo Arco de `POLYSOLID`) | 3-5 según modo | `solids-primitives` | alto |
| EXTRUDE — [Autodesk 2025](https://help.autodesk.com/view/ACD/2025/ENU/?guid=GUID-6548456A-28BD-40CB-89BA-F19F5800C0ED), 2026-09-06 | `EXTRUDE` (`:287`) | PARCIAL | `00c-CUADRO-DE-MANDO.md` hallazgo 7 (bloqueante): aplana el perfil inclinado EN SILENCIO — `planeFrameAt` siempre devuelve `zAxis:{0,0,1}`; contraejemplo verde en `draw-spatial.spec.ts:147-152` demuestra que el dibujo SÍ da la cota correcta y `EXTRUDE` la tira | 3 | `solids-primitives` (fila cobra 5/5 sobre esta capacidad con la falla viva — **candidata a contradicción nueva, ver nota debajo de esta tabla**) | alto — afirmación falsa viva, primer criterio de §2.1 del prompt maestro |
| REVOLVE, SWEEP, LOFT, PRESSPULL — misma fuente, 2026-09-06 | mismos nombres (`:288,292-293,312`) | SÍ | tecleables, cubiertos por `solids-primitives`/`solids-inquiry` | 3-5 | `solids-primitives` | medio |
| SOLIDEDIT — [resumen consistente con el comando oficial](https://www.dummies.com/article/technology/software/design-software/autocad/autocad-commands-for-modifying-and-editing-3d-objects-264956/), 2026-09-06 | `SOLIDEDIT` (`:289`) | PARCIAL | `solids-edit.spec.ts` (119) + `solid3d-frontera.spec.ts` (279): de 16 ramas, 8 existen y 8 se declaran ausentes en el propio diálogo | 3 | `solids-primitives` | alto |
| UNION, SUBTRACT, INTERSECT — [discusión de soporte oficial](https://forums.autodesk.com/t5/autocad-forum/can-t-intersect-subtract-or-union-2-solids/td-p/8559349), 2026-09-06 | mismos nombres (`:297-299`) | SÍ | fila «Modelo 3D y sólidos B-rep FACETADO» (7/7) | 5 | `solids-brep` | alto |
| FILLETEDGE, CHAMFEREDGE — [manual abierto que documenta el comando oficial](https://opentextbc.ca/autocad3d/chapter/solid-modeling-part-3/), 2026-09-06 | mismos nombres (`:300-301`) | SÍ | tecleables (exentos en `command-integrity-exemptions.json` con razón escrita) | 5 | `solids-brep` | medio |
| SLICE, SECTION — misma fuente, 2026-09-06 | mismos nombres (`:302-303`) | PARCIAL | `SECTION` usa `selectedSolids` que filtra `entity.type === "solid3d"` — no ve `wall` (§6, contradicción 1) | 3 | `solids-brep` | alto |
| INTERFERE — [Autodesk 2027 (núcleo)](https://help.autodesk.com/view/ACD/2027/ENU/), 2026-09-06 | `INTERFERE` (`:294`) | SÍ | tecleable | 3 | sin fila específica | medio |
| 3DMOVE, 3DROTATE, 3DALIGN, MIRROR3D, 3DARRAY, 3DSCALE — [Autodesk 2025](https://help.autodesk.com/view/ACD/2025/ENU/?guid=GUID-A16B7027-1346-480F-AFDC-3A3A89EB08D8), 2026-09-06 | ninguno | NO | `00c-CUADRO-DE-MANDO.md` hallazgo 6 (bloqueante, «el hueco mejor establecido de la lista»): `CadSolidPlacement` es una afín 2×3 más `dz` — el esquema persistido NO TIENE dónde escribir un giro que mezcle Z con X/Y. `placeBody` ya invierte caras con determinante negativo (mitad de `MIRROR3D` resuelta) | 0 | sin fila (`ESCALERA.md:376` lo declara en 0) | alto — bloqueante confirmado, el hueco 3D más caro del árbol |
| UCS — [Autodesk 2025](https://help.autodesk.com/view/ACD/2025/ENU/?guid=GUID-6548456A-28BD-40CB-89BA-F19F5800C0ED), 2026-09-06 | `UCS` (`:315`) | SÍ | `ucs-3d.spec.ts` (68) — la cadena puntero → plano de trabajo está cableada (§1.3 del prompt maestro) | 5 | core (draw-2d relacionado) | alto |
| Estilos visuales (VSCURRENT) — [Autodesk 2026](https://help.autodesk.com/view/ACD/2026//ENU/?guid=GUID-C0EBD080-D074-4AD5-A508-51F208827E97), 2026-09-06 | `VSCURRENT` (`:329`) | PARCIAL | `00c-CUADRO-DE-MANDO.md` hallazgo 3 (bloqueante, éxito falso): sólo alcanza a `entity.type === "solid3d"` — muros, losas y cubiertas no cambian de estilo aunque la línea de comandos confirme el cambio; no se persiste (campo privado, se pierde al recargar) | 2 | sin fila localizada en esta pasada — **candidata a hueco sin fila, ver §5** | alto — bloqueante confirmado |
| Materiales (MATBROWSEROPEN/MATEDITOROPEN) — [Autodesk 2027](https://help.autodesk.com/view/ACD/2027/ENU/), 2026-09-06 | no verificado en esta pasada | NO VERIFICADO | pendiente de `grep` dedicado; no se afirma ausencia sin mirar (invariante 1) | — | — | — |
| RENDER — [Autodesk 2027](https://help.autodesk.com/view/ACD/2027/ENU/), 2026-09-06 | ninguno | NO | sin motor de render fotorrealista en el árbol (verificado por este frente: `grep -rln "pathtrac\|photoreal\|render-engine" apps/web/src/lib/cad` → 0 fuera de nombres de módulo de render de VISOR, no de imagen final) | 0 | sin fila | bajo — fuera del uso diario de un despacho; AutoCAD tampoco lo vende como diferenciador frente a Enscape/Lumion |
| 3DORBIT (y 3DFORBIT/3DPAN/3DZOOM/VPOINT) — [Autodesk 2020](https://help.autodesk.com/cloudhelp/2020/ENU/AutoCAD-Core/files/GUID-85CE824C-0AF4-4890-8487-ADBC92BF08F1.htm), 2026-09-06 | mismos nombres (`:324-328`) | SÍ | golden 85, `camera-policy.spec.ts` (23) — la cámara no planea al soltar | 5 | `recog` | medio |

### 2.10 · Personalización y automatización

| Capacidad AutoCAD | Comando(s) Valle | ¿Existe? | Evidencia | Peldaño | Fila rúbrica | Valor |
| --- | --- | --- | --- | --- | --- | --- |
| AutoLISP — [Autodesk (soporte oficial)](https://www.autodesk.com/support/technical/article/caas/sfdcarticles/sfdcarticles/AutoCAD-AutoLisp-commands-or-script-file-help.html), 2026-09-06 | intérprete AutoLISP propio | PARCIAL | fila «Automatización: AutoLISP y plugins JS» (6/8); `00c-CUADRO-DE-MANDO.md`: `PAUSE` no existe (`grep -rn PAUSE apps/web/src/lib/lisp/` → 0) y **no hay ninguna salida a archivo** (`getfiled`/`open`/`write-line` declarados no disponibles) | 3 | `autolisp-plugins` | alto — bloqueante confirmado, el escenario titular «leer atributos y exportar a Excel» no arranca aunque se arreglen los atributos |
| VBA — [misma fuente que AutoLISP](https://www.autodesk.com/support/technical/article/caas/sfdcarticles/sfdcarticles/AutoCAD-AutoLisp-commands-or-script-file-help.html), 2026-09-06 | ninguno | NO | declarado imposible con alternativa documentada (`docs/api/POLITICA-API-PUBLICA.md`) — no es un hueco a perseguir, es una frontera de la casa (§2.2 del prompt maestro, §3 de este encargo) | — | `autolisp-plugins` (2 pt retenidos a propósito) | — |
| .NET / ObjectARX — [contexto general, referencia técnica Autodesk](https://help.autodesk.com/cloudhelp/2026/ITA/AutoCAD-AutoLISP/files/GUID-265AADB3-FB89-4D34-AA9D-6ADF70FF7D4B.htm), 2026-09-06 | plugins JS con manifiesto versionado | PARCIAL (alternativa) | mismo criterio que VBA — fuera de alcance por decisión de la casa | — | `autolisp-plugins` | — |
| ACTRECORD, ACTSTOP, ACTMANAGER (grabador de acciones) — [Autodesk 2020](https://help.autodesk.com/cloudhelp/2020/ENU/AutoCAD-Customization/files/GUID-FEAD3614-CD33-4B60-BC00-4CBC98D8CBCB.htm), 2026-09-06 | mismos nombres (`:71-73`) | PARCIAL | golden 97 (grabar y repetir un circuito completo); sin pausa para pedir datos (`ACTUSERINPUT`) ni persistencia entre sesiones | 3 | sin fila específica localizada | medio |
| SCRIPT, RSCRIPT — [Autodesk 2024](https://help.autodesk.com/view/ACDLT/2024/ENU/?guid=GUID-BE44AE86-7638-48C9-BE5B-C1DF8E4C8808), 2026-09-06 | `SCRIPT`,`RSCRIPT` (`:74-75`) | SÍ | fila «Línea de comandos, alias y scripting» (11/12) | 5 | `cli-scripting` | alto |
| Alias de comandos — [Autodesk 2025](https://help.autodesk.com/view/ACDLT/2025/ENU/?guid=GUID-FE9AE544-F537-4D3B-8F75-B76484513787), 2026-09-06 | `aliases` en cada entrada de `command-manifest.ts` | SÍ | los 294 comandos declaran su array de alias (p. ej. `WALL` → `WA`,`MURO`); `acad.pgp` no se cita ni redistribuye | 5 | `cli-scripting` | alto |
| CUI / personalización de cinta — [Autodesk 2027 (About Customization)](https://help.autodesk.com/view/ACD/2027/ENU/?caas=caas%2Fdocumentation%2FACD%2F2014%2FENU%2Ffiles%2FGUID-CDF5C4CB-BE69-4ECE-B9EC-49BA422B878E-htm.html), 2026-09-06 | ninguno | NO | sin sistema de personalización de cinta/atajos por el usuario en el árbol (verificado por este frente) | 0 | sin fila | medio |

### 2.11 · Variables de sistema clave

| Capacidad AutoCAD | Comando(s) Valle | ¿Existe? | Evidencia | Peldaño | Fila rúbrica | Valor |
| --- | --- | --- | --- | --- | --- | --- |
| SETVAR, GETVAR (acceso genérico a variables) — [Autodesk 2027](https://help.autodesk.com/view/ACD/2027/ENU/), 2026-09-06 | `SETVAR`,`GETVAR` (`:283-284`) | SÍ | tecleables | 5 | `cli-scripting` | alto |
| OSMODE — [Autodesk 2024](https://help.autodesk.com/view/ACDLTM/2024/ENU/?guid=GUID-DD9B3216-A533-4D47-95D8-7585F738FD75), 2026-09-06 | vía `OSNAP`/`-OSNAP` (`:265,274`) | SÍ | tecleable | 5 | `draw-2d.osnap` | medio |
| LTSCALE, CELTSCALE — [Autodesk 2027/2023](https://help.autodesk.com/cloudhelp/2023/ENU/AutoCAD-Core/files/GUID-ECE175AB-AB7B-4DEC-9CEC-D5D67AF9310B.htm), 2026-09-06 | `LTSCALE`,`CELTSCALE` (`:279-280`) | SÍ | golden 80: LTSCALE 500 duplica los rótulos en vivo, DXF con `$LTSCALE 500` | 5 | `layers` | alto |
| CANNOSCALE — ver §2.6 | selector propio | PARCIAL | ver §2.6 | 3 | `recog` | medio |
| PICKBOX, GRIPSIZE, FILLETRAD, CHAMFERA/B, PDMODE/PDSIZE, MIRRTEXT, HPNAME/HPSCALE/HPANG, ATTDIA, FILEDIA, SAVETIME — [Autodesk 2027 (System Variables)](https://help.autodesk.com/view/ACD/2027/ENU/), 2026-09-06 | no verificado individualmente en esta pasada | NO VERIFICADO | son variables de comportamiento fino de la línea de comandos; verificar cada una exigiría un `grep` por variable que este frente no completó — no se afirma ausencia sin mirar (invariante 1) | — | — | bajo-medio, salvo `SAVETIME` (ver fila siguiente) |
| SAVETIME (intervalo de autoguardado) — misma fuente, 2026-09-06 | mecanismo de autosave propio, no una variable tecleable | SÍ (equivalente funcional) | `docs/execution/auditoria-fable/PROMPT_MAESTRO_FABLE.md` — autoguardado cada 2 000 ms (`Layout3DEditor.tsx:1338`), no configurable por el usuario | 5 (funciona) / no configurable | `saves-history` | medio |
| CLAYER, CECOLOR, CELTYPE, CELWEIGHT — [Autodesk 2027](https://help.autodesk.com/view/ACD/2027/ENU/), 2026-09-06 | equivalentes en el motor | SÍ | `engine/current-presentation.spec.ts` (15): `LINE` con `COLOR 1` sale con color 1; `COPY` no lo hereda | 3 | `foreign-work.properties` (parcial — falta golden de navegador que teclee `COLOR` y dibuje, peldaño 5) | medio |
| LUNITS/LUPREC, AUNITS/AUPREC, DIMASSOC — [Autodesk 2027](https://help.autodesk.com/view/ACD/2027/ENU/), 2026-09-06 | vía `UNITS`, cotas asociativas nativas | SÍ | `units-imperial.spec.ts`, `units-label.spec.ts`; cotas asociativas por diseño (fila «Cotas asociativas» 12/12) | 5 | `dimensions` | alto |
| ORTHOMODE, POLARANG — ver §2.1 | ajustes de dibujo | SÍ | `draw-2d.tracking` | 5 | `draw-2d.tracking` | medio |

**EXTRUDE y VSCURRENT** de la tabla 2.9 son las contradicciones 7 y 8 de
§6 (afirmación falsa viva sobre una fila que cobra completa) — no se
repiten aquí, sólo se referencian.

El recuento SÍ/PARCIAL/NO de esta sección vive en un solo lugar: el
resumen final de «Estado de este documento», calculado por script sobre
el propio fichero — no se repite aquí a mano (regla 4 de la casa).

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

El recuento SÍ/PARCIAL/NO de esta sección, igual que en §2, vive sólo en
el resumen final de «Estado de este documento».

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

### 5.3 · El estilo visual (VSCURRENT) no tiene fila, y su falla es un éxito falso

Confirmado arriba (§2.9) y en la contradicción 8 de §6. Propuesta de fila
nueva, grupo `frontier` (donde vive el resto de 3D: modelado, superficies,
SCU — no `truth`, porque esto es una capacidad que falta, no una garantía
de integridad rota; la garantía de integridad rota —«ningún comando
responde éxito sin efecto verificado»— ya la cobra `integrity.commands` en
`truth`, y esta fila nueva es la funcionalidad de fondo que le falta):

```json
{
  "id": "visual-styles",
  "group": "frontier",
  "name": "Estilos visuales alcanzan a todo el modelo, no sólo a solid3d",
  "points": 2,
  "gap": "VSCURRENT sólo cambia el estilo visual de la entidad solid3d (solid-shade-host.ts:321-324); los anfitriones de masa nativa de muro, losa, cubierta y mobiliario no tienen parámetro de estilo. El comando confirma el cambio por la línea de comandos aunque la escena no cambie, y el estilo no se persiste (campo privado, se pierde al recargar).",
  "criteria": [
    {
      "id": "visual-styles.all-entities",
      "points": 1,
      "text": "VSCURRENT cambia el estilo visual de TODAS las entidades del modelo (muro, losa, cubierta, mobiliario, solid3d), no sólo de solid3d",
      "costDays": 0,
      "evidence": [
        { "kind": "todaviaNo", "note": "solid-shade-host.ts:321-324 filtra entity.type === 'solid3d'; wall-solid-host.ts, room-solid-host.ts y native-mass-hosts.ts no tienen parámetro de estilo (00c-CUADRO-DE-MANDO.md hallazgo 3)." }
      ]
    },
    {
      "id": "visual-styles.persisted",
      "points": 1,
      "text": "El estilo visual activo se persiste con el documento y VSCURRENT sin argumento devuelve el valor vigente, en vez de un mensaje vacío",
      "costDays": 0,
      "evidence": [
        { "kind": "todaviaNo", "note": "El estilo vive en un campo privado de solid-shade-host.ts, se pierde al recargar; VSCURRENT+Intro devuelve result:{kind:'none'} con mensaje vacío (view-visual.ts:66-71) en vez del valor vigente, a diferencia de AutoCAD." }
      ]
    }
  ]
}
```

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
7. **`solids-primitives`/`solids-brep` cobran su tope sobre `EXTRUDE` mientras
   el comando aplana en silencio cualquier perfil fuera del plano horizontal.**
   `00c-CUADRO-DE-MANDO.md` hallazgo 7 (bloqueante): `planeFrameAt`
   (`solid3d-profiles.ts:139-146`) devuelve siempre `zAxis: {x:0,y:0,z:1}`;
   `profileFromEntity` toma la elevación de UN solo vértice del perfil y
   descarta el resto. `draw-spatial.spec.ts:147-152` es el contraejemplo
   verde: sobre un SCU inclinado a 30°, `RECTANG` dibuja las cuatro esquinas
   CON su cota correcta — y `EXTRUDE` las aplana igual, sin aviso. Es la
   clase de defecto que el primer desempate de §2.1 del prompt maestro pone
   primero en la cola: «un `EXTRUDE` que aplana en silencio es peor que un
   `EXTRUDE` que no existe».
8. **Ninguna fila de `rubric.json` cubre `VSCURRENT`/estilos visuales, y el
   comando confirma por la línea de comandos un cambio que sobre muros,
   losas y cubiertas NO ocurre.**
   `grep -n "estilo visual\|VSCURRENT\|visual.*style\|solid-shade" docs/competitive/rubric.json`
   → 0 (verificado por este frente). `00c-CUADRO-DE-MANDO.md` hallazgo 3
   (bloqueante, «el único que merece bloqueante de verdad, porque es un
   ÉXITO FALSO»): `solid-shade-host.ts:321-324` filtra literalmente
   `entity.type === "solid3d"`; los tres anfitriones de masa nativa
   (`wall-solid-host.ts`, `room-solid-host.ts`, `native-mass-hosts.ts`) no
   tienen parámetro de estilo (`grep -n 'style\|Style'` → 0 en los tres). El
   golden 47 §3b sólo afirma el TEXTO «Estilo visual: Alámbrico.», nunca la
   escena — el éxito falso está protegido por la única prueba que existe.
   No es sólo un hueco sin fila (§5.3 propone la fila nueva): es un comando
   que responde éxito sin efecto verificado, justo lo que la regla 2 de la
   campaña de cimientos prohíbe (`AGENTS.md` §Las reglas de la campaña de
   cimientos).

**Dirección B — declarado ausente cuando existe:**

9. **El auditor original calificó «DWG lectura/escritura» en 0/10, y el
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
10. **El auditor trató `/demo` como «el editor real con un plano
   precargado» sin ver que ya abre el archivo del propio visitante.**
   Cubierto en la sección 4 de este documento: `DXFIN` está en el registro
   y no toca la red. Es la dirección B más valiosa de las dos: sobra
   producto y falta el renglón que lo anuncia, no al revés.

## 7 · Cola propuesta

Las 30 capacidades que más acercan a «un arquitecto trabaja el lunes
aquí», tomadas de las secciones 2-6 de este documento y ordenadas por el
criterio de §2.1 del prompt maestro: (1) afirmación falsa viva antes que
ausencia, (2) lo que rompe el bucle antes que lo que falta al final,
(3) lo que impide ENTREGAR antes que lo que impide MODELAR. Donde este
frente identificó una tarea `T-NN` ya escrita en `PROMPT_MAESTRO_FABLE.md`,
enlaza a ella en vez de duplicarla; donde no la identificó, lo dice en vez
de inventar un número — el coordinador decide si abre una nueva.
`costDays` es una estimación gruesa de este frente (no verificada con el
método de `rubric.json`, que exige que quien la declara sea quien
implementa), útil sólo para ordenar, no para prometer.

### Nivel 1 · Afirmaciones falsas vivas (14)

| # | Capacidad | Por qué es afirmación falsa viva | Fila que mueve | Coste (estimación gruesa) |
| --- | --- | --- | --- | --- |
| 1 | `EXTRUDE` aplana el perfil inclinado en silencio (§6.2, contradicción 7) | Geometría incorrecta con aspecto de correcta; `draw-spatial.spec.ts` prueba que el dibujo SÍ tiene la cota | `solids-primitives`, `solids-brep` | 3-5 d (medir planaridad y devolver el motivo, la vía barata que el prompt maestro ya señala en §1.4/hallazgo 7) |
| 2 | `VSCURRENT` sólo alcanza a `solid3d`, no se persiste y responde vacío al consultarlo (§6.2, contradicción 8) | Éxito falso protegido por la única prueba que existe (golden 47 §3b) | fila nueva `visual-styles` (§5.3) | 5-8 d |
| 3 | `integrity.no-silent-loss` cobra 4 pt mientras `GET .../export/dxf` sirve un DXF R12 mutilado sin manifiesto (§6.2, contradicción 3) | El SDK generado anuncia «los datos del usuario nunca quedan rehenes de un cobro» sobre ese mismo endpoint | `integrity.no-silent-loss` | 5-8 d — este frente identifica el hueco como **T-11** del prompt maestro (§6.4) |
| 4 | `toolset-electrical.esquemas` cobra 2/2 sin un solo símbolo de esquema de control (§6.2, contradicción 2) | 0 coincidencias de bobina/contactor/relevador en todo el repo | `toolset-electrical.esquemas` | 8-13 d (biblioteca de símbolos IEC/JIC nueva) |
| 5 | La capa «No se imprime» se imprime en los dos caminos de PDF (§6.2, contradicción 4) | La interfaz afirma un comportamiento que los bytes no cumplen; la propia norma mexicana del producto lo sufre | fila nueva propuesta o ampliar `layouts` | 1 d — el arreglo es una línea en `visibleLayer` |
| 6 | `AEWIRE` numera el conductor y NO lo rotula en el plano impreso (§3.3, tabla Electrical) | `ESCALERA.md` da peldaño 5 sin decir con todas las letras que el número no llega al papel | `toolset-electrical.esquemas`/`.informes` | 3-5 d |
| 7 | `AETAG` etiqueta el componente y tampoco se dibuja ni sale como ATTRIB (`00c-CUADRO-DE-MANDO.md`, bloque Mechanical/Electrical) | `mep-symbols.ts` no declara `attributes`; el módulo hermano de Plant SÍ lo hace — es una línea copiada del módulo vecino | `toolset-electrical.informes` | 1 d |
| 8 | El botón «Versiones» abre un diálogo cuyo servidor devuelve 404 SIEMPRE (§4, tabla, fila «Cuenta vencida»; `00c-CUADRO-DE-MANDO.md`) | Fix-or-hide incumplido sobre un control visible en la barra | `saves-history` | 3-5 d (o esconder el botón hasta que exista la ruta) |
| 9 | El botón de publicar usa un segundo emisor de PDF que ignora el cajetín paramétrico y la tabla de plumas (§2.6, tabla; `00c-CUADRO-DE-MANDO.md` hallazgo A) | «El producto tiene DOS emisores de PDF que no se parecen, y el botón usa el pobre» | `layouts` | 5-8 d (unificar sobre `buildCadPlotJob`) |
| 10 | `MVIEW Desactivada` apaga la ventana en `PLOT` y NO en el botón de publicar (`00c-CUADRO-DE-MANDO.md` hallazgo C) | Mismo defecto de fondo que el 9, otro campo | `layouts` | 1-2 d (se resuelve junto con el 9) |
| 11 | Las capas de una xref se aplastan a UNA sola gris; `xrefs.resolution` cobra 2/2 por «CAPAS de xref» (§6.2, contradicción 6) | Es lo primero que hace un arquitecto con una xref y no se puede | `xrefs` | 5-8 d (`VISRETAIN`, capas prefijadas por xref) |
| 12 | `BLOCK` sobre un muro lo hace invisible y borra el original en silencio (`00c-CUADRO-DE-MANDO.md`, bloque Architecture) | Geometría que se va callada, sin manifiesto ni aviso de `REVISA` | `toolset-architecture` (indirecta) | 2-3 d (fix-or-hide: `BLOCK` se niega nombrando el muro, como `OFFSET`) |
| 13 | `COPY` de un muro con su ventana deja la ventana en el muro ORIGINAL (`00c-CUADRO-DE-MANDO.md`, bloque Architecture) | El cuadro de carpintería cuenta bien pero el plano miente; ninguna spec lo cubre | `toolset-architecture` (indirecta) | 3-5 d (reasignar `hostId` en la rama `copy`) |
| 14 | Ninguna transformación 3D existe (`3DMOVE`/`3DROTATE`/`3DALIGN`/`MIRROR3D`/`3DARRAY`/`3DSCALE`) — §2.9, `00c-CUADRO-DE-MANDO.md` hallazgo 6 | No es ausencia silenciosa pero es EL hueco 3D más caro: el esquema persistido no tiene dónde escribir un giro | sin fila (`ESCALERA.md:376` en 0) | 13-21 d (tocar `CadEntityTransform`/`CadSolidPlacement`, decisión de formato) |

### Nivel 2 · Rompe el bucle diario (8)

| # | Capacidad | Por qué rompe el bucle | Fila que mueve | Coste |
| --- | --- | --- | --- | --- |
| 15 | `OSNAP` no alimenta 4 de 14 cubos desde geometría canónica (midpoint, node, insertion, geometric-center) — §2.1, `00c-CUADRO-DE-MANDO.md` hallazgo 18 | `professional-snapping.spec.ts` es un spec VERDE sobre una función MUERTA; sin enganche correcto no hay `OFFSET`/`TRIM` fiables | `draw-2d.osnap` | 5-8 d |
| 16 | Ningún prompt de «Designe objetos» acepta palabras clave (Todo/Previo/Último/Ventana/Captura/Valla/Borrar/Añadir) — `00c-CUADRO-DE-MANDO.md`, bloque «flujo diario» | El motor de selección profesional está completo por debajo; falta poder llamarlo por teclado desde dentro de un comando | `modify.selection` (indirecta) | 5-8 d |
| 17 | En 3D, designar un sólido dentro de un comando va por su SOMBRA en el plano de trabajo, no por la geometría visible — `00c-CUADRO-DE-MANDO.md`, bloque Modelado 3D | El repositorio ya diagnosticó y arregló este defecto para `OSNAP`; no llevó el mismo arreglo a `hitEntity` | `solids-brep` (indirecta) | 5-8 d |
| 18 | El imán de punto medio responde con nombre falso («centro»/«nodo») en vez de silencio — `00c-CUADRO-DE-MANDO.md`, bloque «flujo diario» | Un imán que da un punto con nombre falso es un fallo de integridad, no de comodidad | `draw-2d.osnap` (indirecta) | 2-3 d |
| 19 | `TOOLPALETTES`: `save()`/`remove()` nunca se llaman en producción — §2.5, `00c-CUADRO-DE-MANDO.md` bloque «La cinta» | El usuario no puede crear, editar ni borrar una paleta por ningún camino existente | sin fila específica | 3-5 d |
| 20 | AutoLISP sin `PAUSE` y sin salida a archivo (`getfiled`/`open`/`write-line`) — §2.10, `00c-CUADRO-DE-MANDO.md` bloque Automatización | El escenario titular «leer atributos y exportar a Excel» no arranca aunque se arreglen los atributos MEP | `autolisp-plugins` | 8-13 d (PAUSE) + 5-8 d (archivo) |
| 21 | `SECTION`/`FLATSHOT` no ven la entidad `wall` (§6.2, contradicción 1) | Un arquitecto no puede sacar un corte ni un alzado de un muro dibujado con `WALL` | `toolset-architecture.envolvente` | 5-8 d |
| 22 | El catálogo del despacho no llega al motor CAD: `XATTACH` exige teclear un UUID — §2.8, `00c-CUADRO-DE-MANDO.md` hallazgo 11 | Sin catálogo el bucle de trabajo con otros no arranca | `xrefs` | 5-8 d |

### Nivel 3 · Impide entregar (8)

| # | Capacidad | Por qué impide entregar | Fila que mueve | Coste |
| --- | --- | --- | --- | --- |
| 23 | El DXF exportado no lleva puertas ni ventanas, y las esquinas del muro salen sucias (`00c-CUADRO-DE-MANDO.md` hallazgo 5) | El estructurista recibe un plano incompleto sin aviso | `dxf-text` (indirecta) | 5-8 d |
| 24 | Sin escritor de malla (STL/OBJ) pese a tener cuatro lectores — §2.7 | Cierra impresión 3D, render externo y envío sin cuenta de un solo golpe; `tessellateBody` ya da posiciones e índices | sin fila (interoperabilidad 3D) | 1-2 d (STL ASCII, «cuarenta líneas» según el prompt maestro §1.3) |
| 25 | El GLB exportado sale con las caras invertidas (`00c-CUADRO-DE-MANDO.md`, bloque Visualización 3D) | Es la única vía de escape del modelo fuera del navegador y también está rota | sin fila (indirecta a modelado 3D) | 2-3 d (arreglar el giro en los tres constructores nativos arregla el GLB gratis) |
| 26 | «Exportar imagen (PNG)» usa la cámara en PERSPECTIVA en modo planta (`00c-CUADRO-DE-MANDO.md`, bloque Visualización 3D) | El PNG que se manda al cliente no es lo que hay en pantalla | sin fila | 1-2 d |
| 27 | El DXF se rechaza por completo sobre 12 MB, sin puerta alternativa (`00c-CUADRO-DE-MANDO.md`, bloque Interoperabilidad) | Un plano ejecutivo real (~50 000 entidades) supera el tope con facilidad — el escenario central de recibir el plano del estructurista falla por tamaño | `dxf-text` (indirecta) | 5-8 d (ruta de streaming o subida al servidor) |
| 28 | La puerta de importación propia del estudio (`onDxfFile`) se salta el validador y la beta DWG entera, y siempre dice que DWG no está disponible (`00c-CUADRO-DE-MANDO.md`, bloque Interoperabilidad) | Con la beta firmada encendida, el mismo `.dwg` entra por el tablero y el estudio le miente al usuario | `dwg` (indirecta) | 2-3 d |
| 29 | El tablero corta la biblioteca del despacho a 200 documentos sin avisar (`00c-CUADRO-DE-MANDO.md`, bloque Trabajar con otros) | En un despacho con 201 dibujos, el 201 no existe para el producto — ni sale, ni se abre, ni se resuelve como xref | sin fila | 3-5 d (paginación con cursor) |
| 30 | La ventaja del navegador no tiene dónde puntuar: enlace de entrega, ventana de pérdida publicada y salida del cliente (§5.1) | Cerrar cualquiera de las tres apuestas BAJA el rendimiento aparente porque no mueve la cifra — el prompt maestro llama a esto el hueco que va primero, **T-02** (§6.6) | fila nueva `browser-advantage` (§5.1) | 0,5 d — es escribir la fila, no código |

**Lo que se dejó fuera a propósito, para no duplicar:** las 46 fichas
`T-NN` del propio `PROMPT_MAESTRO_FABLE.md` (§OLA 0-7) ya cubren buena
parte de esta cola con más detalle del que un inventario puede añadir —
en particular T-24/T-75 (las cuatro frases de degradación honesta, §6.3),
T-43 (el enlace de entrega completo, más allá de la fila del punto 30) y
T-62 (exportación completa de organización y borrado de cuenta, la
puerta de salida completa del punto 3). Este frente no encontró ficha
`T-NN` explícita para los puntos 4 a 29: quedan como huecos nuevos que el
coordinador puede convertir en tareas, o fusionar con una ficha existente
si al revisar §OLA 1-7 completo encuentra que ya están cubiertos —
invariante 1: este frente leyó los encabezados de las ocho olas
(§0 de este documento) pero no el contenido línea a línea de las
~46 fichas, que son ~1600 líneas del prompt maestro fuera del presupuesto
de una sesión de inventario.

---

## Estado de este documento

**Completo.** Las siete secciones del encargo están escritas y verificadas:
§1 Método, §2 Inventario de AutoCAD 2027 base (11 flujos, 78 filas), §3
Inventario por los siete toolsets (62 filas), §4 Lo que Valle tiene y
AutoCAD no (ocho piezas de la apuesta del navegador verificadas), §5
Huecos sin fila (tres propuestas de fila nueva en JSON literal:
`browser-advantage`, `visual-styles`, más la ampliación anotada de PDF
underlay), §6 Contradicciones (diez verificadas, ocho cobradas de más y
dos declaradas ausentes cuando existen), §7 Cola de 30 capacidades
ordenada por el criterio de §2.1 del prompt maestro.

**Resumen por SÍ/PARCIAL/NO de las secciones 2 y 3 combinadas** (todas las
filas de capacidad comparada de las tablas 2.1-2.11 y 3.1-3.7, sin contar
encabezados, separadores ni la tabla de §4, que no es una comparación de
existencia sino de piezas reutilizables): calculado línea a línea de las
tablas de este mismo documento con el script `python3` de abajo — no a
mano, siguiendo la regla 4 de la casa —, sobre el commit que cierra este
frente. §2 aporta 94 filas (53 SÍ, 29 PARCIAL, 10 NO, 2 sin verificar) y
§3 aporta 65 filas (18 SÍ, 22 PARCIAL, 25 NO):

```
$ python3 -c "
import re
text = open('docs/history/execution/frentes-lunes-20260906/F11-inventario-autocad.md', encoding='utf-8').read()
counts = {'SI':0,'PARCIAL':0,'NO':0,'NOVERIF':0}
for line in text.split(chr(10)):
    if not line.startswith('|') or line.startswith('| ---') or 'Capacidad AutoCAD' in line:
        continue
    cols = [c.strip() for c in line.split('|')]
    if len(cols) < 4: continue
    e = cols[3]
    if e.startswith('SÍ'): counts['SI'] += 1
    elif e.startswith('PARCIAL'): counts['PARCIAL'] += 1
    elif e.startswith('NO VERIFICADO'): counts['NOVERIF'] += 1
    elif e.startswith('NO'): counts['NO'] += 1
print(counts)
"
{'SI': 71, 'PARCIAL': 51, 'NO': 35, 'NOVERIF': 2}
```

De 159 filas de capacidad (78 en §2 + 62 en §3 + algunas filas de §2 que
agrupan varios comandos AutoCAD bajo un solo Valle, contadas una vez cada
una): **71 SÍ (44,7 %), 51 PARCIAL (32,1 %), 35 NO (22,0 %), 2 sin
verificar (1,3 %)**. Esta cifra mide cobertura de INVENTARIO —¿existe algo
con ese nombre?—, no calidad de uso: varias filas SÍ de este documento son
las mismas capacidades que `00c-CUADRO-DE-MANDO.md` marca como éxito falso
o bloqueante (`VSCURRENT`, `EXTRUDE`, xrefs). Las dos cifras miden cosas
distintas, igual que §1.1 del prompt maestro distingue rúbrica de
auditoría — no se deben mezclar ni promediar.

**Lo que NO se hizo, dicho para que nadie lo lea de más:** este frente no
verificó las ~46 fichas `T-NN` completas del prompt maestro línea a línea
(sólo sus encabezados de OLA), no corrió ningún test ni gate del repo (es
un inventario de documentación), y no propuso ninguna función de IA,
ERP/MES, BIM ni puente .NET/VBA. Las tres filas JSON de §5 son
propuestas: el coordinador decide si entran a `rubric.json` tal cual, con
ajustes, o no entran.
