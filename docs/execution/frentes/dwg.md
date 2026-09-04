# F1 · DWG dentro del producto

> Frente de la campaña «Superar a AutoCAD completo» (2026-09-04).
> Coordinador: `docs/execution/CAMPANA_SUPERAR_20260904.md`.
> Mapa de brechas: `docs/competitive/distancia-autocad-completo-20260903.md`.

## Territorio exclusivo

- `packages/dwg-codec/**`
- `apps/web/src/lib/cad/dwg-*`
- `apps/web/src/lib/cad/interop*`
- `scripts/dwg/**`
- `docs/cad/evidence/dwg-*`
- `el repo valle-design-dwg-conformance completo`

## Cola

1. Writer público: de 9 clases a las de un plano de despacho — INSERT con ATTRIB, DIMENSION con su bloque anónimo, LEADER/MLEADER, HATCH de patrón (hoy sólo sólido), SPLINE, TABLE, VIEWPORT y espacio papel. Cada clase verificada por el oráculo externo antes de darla por buena.

2. Escritura de la familia moderna (AC1024/AC1027/AC1032): un cliente pedirá «guárdalo en 2018».

3. Preservación opaca en round-trip DENTRO del producto: proxies, objetos AEC y ACIS viajan intactos de entrada a salida, con su manifiesto de pérdida visible.

4. Segundo oráculo externo como binario (dwg2dxf de LibreDWG o equivalente) cableado al arnés, para que «doble validación» deje de ser una etiqueta. Si no se puede instalar en este entorno, se declara con el intento y el motivo.

5. Paquete de firma: ADR-0009 §encendido con matriz de soporte, límites, riesgos y checklist, listo para que el titular encienda DWG_IMPORT_FLAG y DWG_EXPORT_FLAG con un solo commit.

## Cierre

Corpus completo en cero discrepancias con las clases nuevas; `dwg-oda-roundtrip.json` con ≥20 casos sobre el writer público; documento de firma en `docs/adr/`.

## Lo que hay que tener presente

Las dos banderas NO se encienden en esta campaña. Clean-room: la ODS pública y el corpus propio son las únicas fuentes; los oráculos sólo como binarios; cada hecho nuevo al SOURCE_REGISTER ANTES de tocar código.

## Las reglas que no se negocian

- **R1 Territorio.** Sólo modificas los directorios de arriba. Si necesitas algo fuera,
  NO lo tocas: lo escribes en `docs/execution/frentes/dwg-peticiones.md` y el coordinador
  lo aplica en la ventana de integración.
- **R2 Archivos compartidos, sólo el coordinador.** `package.json`, `turbo.json`,
  `.github/workflows/*`, `docs/competitive/rubric.json`, `scripts/cad/monolith-budget.json`,
  `scripts/lint-budget.json`, `docs/governance/assisted-development-log.json`,
  `docs/execution/BACKLOG.md`, `docs/parity/ESCALERA.md`, `AGENTS.md`, `IDENTITY.md`,
  migraciones de la API y el esquema del documento canónico (`cad-document*.ts`,
  `cad-entities-v*.ts`). **Nunca edites la rúbrica.** Excepción única: el presupuesto del
  monolito se actualiza con `--update` si y sólo si BAJA.
- **R3 Tu árbol.** Trabajas en `/home/user/vd-dwg` sobre la rama `campana/superar/dwg`. Commits sí;
  **push a origin no** (el coordinador hace un push por ventana).
- **R6 Las reglas de la casa, intactas.** Prohibido relajar gates, umbrales, goldens o
  presupuestos. Prohibido tocar identificadores persistidos (IDENTITY.md, ADR-0010).
  Prohibido renombrar `data-testid`. Fix-or-hide: lo que no gana su evidencia no es visible.
  Ningún claim sin evidencia; lo parcial se declara «todavía no» en tu bitácora, con fecha.
  Las banderas `DWG_IMPORT_FLAG` y `DWG_EXPORT_FLAG` NO se encienden en esta campaña.
- **R7 Bitácora.** Este archivo es tu memoria. Si tu contexto se compacta, lo relees primero.
  Nunca se pregunta al titular: se decide, se anota y se sigue.

## Cómo se valida antes de dar algo por hecho

```
cd /home/user/vd-dwg
npx vitest run <ruta de tu spec>        # lo tuyo primero, rápido
npm run typecheck                       # el árbol entero compila
npm run check:command-integrity         # si tocaste comandos
npm run check:cad                       # antes de cerrar
```

## Bitácora

### 2026-09-04 · Entregable 1/5 — arnés de re-escritura del corpus

**Qué se construyó.** `scripts/dwg/corpus-rewrite.mjs` (+ `corpus-rewrite-compare.mjs`,
partido por el presupuesto de 800 líneas) y su spec. Por cada uno de los 57 fixtures
ADMITIDOS: decodificar → ofrecer cada entidad al writer → armar un archivo propio →
releerlo → cotejar CAMPO A CAMPO → anclar los valores contra el DXF del oráculo con los
helpers de `dxf-oracle.mjs` importados sin modificar. Evidencia en
`docs/cad/evidence/dwg-corpus-rewrite.json`, regenerable y determinista.

**La cifra de partida, tal como salió.** De **327 entidades ajenas el writer regraba 269
(82,3 %)** y rechaza 58. Las 269 vuelven **idénticas campo a campo** (cero diferencias) y
212 quedan ancladas al DXF del oráculo sin un solo valor distinto.

| Estado | Clases |
| --- | --- |
| `regrabada-integra` (8) | `arc`, `circle`, `ellipse`, `line`, `lwpolyline`, `mtext`, `point`, `text` |
| `regrabada-con-perdida-declarada` (2) | `hatch` (2 de 4: el patrón falla cerrado), `insert` (30 de 34: con ATTRIBs falla cerrado) |
| `no-escribible` (17) | `attdef`, `attrib`, `dimension`, `face3d`, `leader`, `mline`, `polyfaceMesh`, `polyline2d`, `polyline3d`, `polymesh`, `ray`, `solid`, `spline`, `tolerance`, `trace`, `viewport`, `xline` |

**Tres hechos que el arnés encontró y no se sabían con este detalle.**

1. La frontera del INSERT con atributos NO es «se escribe sin los ATTRIBs»: es un fallo
   CERRADO en `validateEntity` (`DWG_INPUT_INVALID: Writing insert attributes is not
   implemented by the phase-D4 laboratory`). Un INSERT con atributos hoy no se escribe en
   absoluto — 4 de 34 en el corpus. Lo mismo el HATCH de patrón: 2 de 4.
2. **62 de 74 capas cambian el nombre de su tipo de línea al re-escribirse**: el corpus
   ajeno lo deletrea `CONTINUOUS` y nuestro writer emite `Continuous`. No es pérdida de
   información (la capa sigue siendo continua) y no se ha tocado nada: queda REGISTRADO en
   `resumenDeObservacionesDeCapa`. Si un lector ajeno distingue mayúsculas ahí, esto sería
   un defecto real; que lo distinga o no NO está medido en este entorno.
3. Ninguna de las 269 entidades regrabadas movió un solo campo, y ninguna se apartó del
   DXF del oráculo. Color de capa, congelada/bloqueada y patrón de LTYPE propio también
   sobreviven exactos.

**El límite, escrito en el propio informe (`limiteDeclarado`).** El cotejo enfrenta
NUESTRO writer con NUESTRO lector: un error SIMÉTRICO seguiría oculto. El anclaje al DXF
del oráculo lo estrecha —esos valores los escribió otro— pero no lo cierra. Sólo un
conversor ajeno leyendo NUESTRO archivo lo cierra, y eso es `oda-roundtrip.mjs`, acción
del titular con su binario con licencia.

**Cómo se corre** (el prefijo de entorno tiene que estar EXPORTADO: `--check` sin corpus
falla cerrado a propósito, y no inventa una ruta por defecto — esa atadura a una máquina
es la que `oda-roundtrip.mjs` se quitó el 2026-09-02):

```
export VALLE_DWG_CORPUS_MIRROR=/home/user/valle-design-dwg-conformance
node scripts/dwg/corpus-rewrite.spec.mjs && node scripts/dwg/corpus-rewrite.mjs --check
```

**Esto es el patrón de medida de 2, 3 y 4.** Cada clase que el writer aprenda se ve como
una fila que cambia de estado en `matrizPorClase`, y el porcentaje del veredicto sube
solo. No hace falta un informe nuevo por clase.

## «Todavía no»

- **2026-09-04 · `npm run check:cad` ya estaba ROJO al cortar la rama, y no por este
  frente.** `check:dwg-evidence` compara `docs/cad/evidence/dwg-decoder-matrix.json` y
  `dwg-roundtrip.json` con lo que el árbol genera hoy, y esos dos artefactos guardan el
  campo `origen` con la RUTA LOCAL del espejo del corpus. Committeados sin espejo dicen
  `estado: "unavailable"`, `bundlesAdmitidos: 0` y la URL del repositorio; regenerados con
  espejo dicen `verified`, `7` y `/home/user/valle-design-dwg-conformance`. Ninguna de las
  dos formas pasa el gate en las dos máquinas: el artefacto es dependiente del entorno por
  construcción. Verificado con `git stash -u` que el rojo existe sin mis cambios
  (`typecheck` sigue verde). **Diseño del arreglo, para la tarea siguiente de este frente:**
  que `dwg-evidence.mjs` grabe el TIPO de transporte (`local-mirror` / `git-fetch`), como ya
  hace `corpus-rewrite.mjs`, y nunca la ruta; y que la comparación del spec ignore el bloque
  de corpus cuando no hay espejo, en vez de exigir el estado de cero. No se toca en este
  entregable para no mezclar dos cosas en un commit. **Trampa que costó un susto:**
  `dwg-evidence.mjs` NO respeta `--out` — correrlo para inspeccionar su salida REESCRIBE los
  dos artefactos committeados con la ruta de la máquina dentro. `corpus-rewrite.mjs` sí lo
  respeta, y el arreglo de arriba debería incluirlo.
- **2026-09-04 · El anclaje no cubre los bloques anónimos `*D`.** El DXF del oráculo es la
  fuente de autoría propia y no los tiene (los genera el conversor al producir el DWG), así
  que las 57 entidades escritas que viven dentro de ellos (4 `arc`, 21 `line`, 8 `mtext`,
  24 `point`) se re-escriben y se cotejan campo a campo,
  pero NO se anclan contra nadie. Por eso `ancladasAlOraculo` es menor que `escritas` en
  `line`, `point`, `mtext` y `arc`. Está declarado en el informe; cerrarlo exigiría un
  oráculo que describa el bloque anónimo, que hoy no existe.
