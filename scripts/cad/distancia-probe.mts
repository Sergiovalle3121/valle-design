/**
 * LA SONDA DE LA DISTANCIA — el instrumento del informe contra AutoCAD completo.
 *
 * ## Por qué existe
 *
 * `docs/competitive/distancia-autocad-completo-20260901.md` publicó nueve
 * porcentajes por área y los justificó a mano, leyendo el código y ejecutando
 * comandos en una consola. Ese método es correcto —mide lo que FALTA, no lo
 * que hay— y tiene un defecto que se paga en la ola siguiente: no se puede
 * repetir. Un mes después nadie sabe si el 55 % del dibujo 2D bajó porque el
 * producto mejoró o porque quien lo midió esta vez fue más generoso.
 *
 * Esta sonda fija la parte MECÁNICA de esa medición: qué comandos existen de
 * verdad en el registro, qué opciones ofrece de verdad el primer prompt de los
 * que el informe citó, cuántos patrones de sombreado producen trazados
 * distintos, cuántas ranuras admite un tipo de línea, y los cuatro reflejos de
 * navegador que el informe dejó abiertos. El JUICIO —el porcentaje— sigue
 * siendo humano y sigue yendo con su justificación escrita; lo que deja de ser
 * humano es el inventario sobre el que se juzga.
 *
 * No concede nada: imprime hechos. Un comando que no está en el registro sale
 * en `ausentes` aunque exista un botón que se le parezca, y un prompt que no
 * ofrece opciones sale con `opciones: []` aunque el código tenga la rama.
 *
 * ## Procedencia de la lista de referencia
 *
 * `REFERENCIA` son NOMBRES de orden del manual público de AutoCAD, usados aquí
 * como vocabulario de comparación —igual que `alias-table.ts` usa los alias de
 * `acad.pgp`—. No se copia ni una descripción, ni un icono, ni una línea de
 * implementación de Autodesk. La lista dice qué se compara; lo que se compara
 * es el registro de este repositorio.
 *
 * ## Uso
 *
 *   node --import tsx scripts/cad/distancia-probe.mts            # JSON a stdout
 *   node --import tsx scripts/cad/distancia-probe.mts --resumen  # tabla legible
 */
import { CAD_COMMAND_REGISTRY_V2 } from "../../apps/web/src/lib/cad/engine/index";
import { CAD_COMMAND_ALIASES } from "../../apps/web/src/lib/cad/engine/alias-table";
import { CAD_HATCH_PATTERNS } from "../../apps/web/src/lib/cad/hatch-pattern-table";
import { CAD_BUILTIN_LINETYPES } from "../../apps/web/src/lib/cad/linetype-lin";
import { CAD_COMPLEX_LINETYPES } from "../../apps/web/src/lib/cad/linetype-complex";
import type { CadCommandContext } from "../../apps/web/src/lib/cad/engine/command-types";
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "../..");

/**
 * Las nueve áreas del informe, con el vocabulario de AutoCAD que cada una usa.
 * El área es la unidad en la que el informe puntúa, así que la sonda cuenta en
 * la misma unidad o los números no se pueden comparar entre olas.
 */
const REFERENCIA: ReadonlyArray<{ area: string; comandos: readonly string[] }> = [
  {
    area: "Dibujo y modificación 2D",
    comandos: [
      "LINE", "PLINE", "CIRCLE", "ARC", "RECTANG", "POLYGON", "ELLIPSE", "SPLINE",
      "XLINE", "RAY", "POINT", "DIVIDE", "MEASURE", "DONUT", "SOLID", "MLINE", "SKETCH",
      "REVCLOUD", "WIPEOUT", "BOUNDARY", "REGION",
      "ERASE", "COPY", "MIRROR", "OFFSET", "ARRAY", "MOVE", "ROTATE", "SCALE",
      "STRETCH", "TRIM", "EXTEND", "BREAK", "JOIN", "CHAMFER", "FILLET", "BLEND",
      "EXPLODE", "ALIGN", "LENGTHEN", "PEDIT", "SPLINEDIT", "GROUP", "OVERKILL",
      // Los reflejos de la línea de comandos. El informe del 1 de septiembre
      // los midió aparte y los puntuó dentro de esta área: son el gesto que
      // más veces se hace en un día y el que peor se perdona si falta.
      "U", "UNDO", "REDO", "OOPS", "REGEN", "REDRAW",
    ],
  },
  {
    area: "Anotación",
    comandos: [
      "TEXT", "MTEXT", "DDEDIT", "SPELL", "STYLE", "SCALETEXT", "JUSTIFYTEXT",
      "DIMLINEAR", "DIMALIGNED", "DIMANGULAR", "DIMRADIUS", "DIMDIAMETER",
      "DIMARC", "DIMORDINATE", "DIMBASELINE", "DIMCONTINUE", "DIMJOGGED",
      "QDIM", "DIMSPACE", "DIMBREAK", "DIMEDIT", "DIMTEDIT", "DIMSTYLE",
      "MLEADER", "MLEADERSTYLE", "QLEADER", "LEADER", "TOLERANCE",
      "TABLE", "TABLESTYLE", "TABLEDIT", "DATAEXTRACTION", "FIELD",
      "HATCH", "HATCHEDIT", "GRADIENT", "AREA", "ANNOTATIVE",
    ],
  },
  {
    area: "Capas, estilos y estándares",
    comandos: [
      "LAYER", "-LAYER", "LAYERSTATE", "LAYISO", "LAYUNISO", "LAYFRZ", "LAYTHW",
      "LAYON", "LAYOFF", "LAYLCK", "LAYULK", "LAYMCH", "LAYWALK", "LAYMRG",
      "LAYDEL", "LAYCUR", "LAYTRANS", "STANDARDS", "CHECKSTANDARDS",
      "LINETYPE", "LWEIGHT", "COLOR", "MATCHPROP", "PURGE", "RENAME", "UNITS",
      "SETBYLAYER", "CHPROP", "PROPERTIES", "QSELECT", "FILTER",
    ],
  },
  {
    area: "Bloques, atributos y referencias",
    comandos: [
      "BLOCK", "-BLOCK", "WBLOCK", "INSERT", "-INSERT", "MINSERT", "BEDIT", "BSAVE",
      "BCLOSE", "REFEDIT", "BURST", "XPLODE", "ATTDEF", "ATTEDIT", "-ATTEDIT",
      "ATTDISP", "BATTMAN", "ATTSYNC", "ATTEXT", "EATTEDIT",
      "XREF", "XATTACH", "XBIND", "XCLIP", "REFCLOSE", "ADCENTER", "DESIGNCENTER",
      "NCOPY", "SELECTSIMILAR", "ADDSELECTED", "IMAGEATTACH", "PDFATTACH",
    ],
  },
  {
    area: "Publicación",
    comandos: [
      "LAYOUT", "LAYOUTWIZARD", "PAGESETUP", "MVIEW", "MSPACE", "PSPACE",
      "VPORTS", "VPCLIP", "VPLAYER", "PLOT", "PREVIEW", "PLOTSTYLE",
      "PUBLISH", "SHEETSET", "ETRANSMIT", "EXPORTPDF", "DWGPROPS",
      "DXFOUT", "DXFIN", "SAVEAS", "EXPORT", "IMPORT",
    ],
  },
  {
    area: "Modelado 3D",
    comandos: [
      "BOX", "CYLINDER", "CONE", "SPHERE", "WEDGE", "TORUS", "PYRAMID", "POLYSOLID",
      "EXTRUDE", "REVOLVE", "SWEEP", "LOFT", "PRESSPULL",
      "UNION", "SUBTRACT", "INTERSECT", "SOLIDEDIT", "FILLETEDGE", "CHAMFEREDGE",
      "SLICE", "SECTION", "SECTIONPLANE", "3DMOVE", "3DROTATE", "3DALIGN",
      "MASSPROP", "INTERFERE", "THICKEN", "CONVTOSOLID", "CONVTOSURFACE",
      "UCS", "PLAN", "VSCURRENT", "3DORBIT", "SHADEMODE",
    ],
  },
  {
    area: "De 3D a documentación",
    comandos: [
      "SOLVIEW", "SOLDRAW", "SOLPROF", "FLATSHOT", "VIEWBASE", "VIEWPROJ",
      "VIEWSECTION", "VIEWDETAIL", "VIEWEDIT", "VIEWUPDATE", "SECTIONPLANETOBLOCK",
    ],
  },
  {
    area: "Toolsets",
    comandos: [
      // Architecture
      "WALL", "DOOR", "WINDOW", "STAIR", "ROOF", "SLAB", "SPACE", "AECDIMENSION",
      // Mechanical
      "STDPART", "STEELSHAPE", "BALLOON", "BOM", "WELDSYMBOL", "SURFACESYMBOL",
      "AMPOWERDIM", "HOLECHART",
      // Electrical
      "WIRE", "WIRENUMBER", "SCHEMATIC", "PANELSCHEDULE", "ONELINE", "CIRCUITBUILDER",
      // MEP
      "PIPE", "DUCT", "CABLETRAY", "MEPSYMBOL", "MEPROUTE",
      // Map 3D
      "GEOGRAPHICLOCATION", "MAPIMPORT", "MAPEXPORT", "MAPCLEAN",
      // Plant 3D
      "PNIDSYMBOL", "LINENUMBER", "EQUIPMENT", "PIPESPEC", "ISOGEN",
      // Raster
      "IMAGEATTACH", "IMAGECLIP", "IMAGEADJUST", "IMAGEFRAME", "TRANSPARENCY",
      "VECTORIZE",
    ],
  },
  {
    area: "Automatización y personalización",
    comandos: [
      "APPLOAD", "SCRIPT", "VLIDE", "CUI", "MENU", "TOOLPALETTES", "MACRO",
      "SETVAR", "DIESEL", "ACTRECORD", "ACTSTOP", "ACTUSERINPUT",
    ],
  },
];

/**
 * Los prompts que el informe del 1 de septiembre citó por su contenido. Se
 * ejecuta `begin()` de verdad: un comando cuyo prompt cambie sin que nadie
 * actualice el informe se ve aquí en la ola siguiente.
 */
const PROMPTS_CITADOS = [
  "CIRCLE", "ARC", "OFFSET", "DIVIDE", "MEASURE", "EXPLODE", "HATCH", "PEDIT",
  "ARRAY", "TRIM", "SOLIDEDIT", "EXTRUDE", "PLOT", "PUBLISH", "BEDIT", "XATTACH",
] as const;

/**
 * Los que el registro estático NO tiene y el producto SÍ ofrece.
 *
 * `cadLispFixedCommands(runtime)` fabrica sus descriptores con el runtime LISP
 * dentro (`components/cad/lisp/lisp-commands.ts`), así que sólo existen cuando
 * el estudio está montado — y el golden 47 los teclea de verdad. Contarlos como
 * «ausentes» sería un falso negativo: se declaran aquí, con su archivo, para
 * que la lista de ausentes de la sonda siga siendo la lista de lo que HAY QUE
 * HACER y no la de lo que esta sonda no sabe mirar.
 */
const DINAMICOS: Readonly<Record<string, string>> = {
  APPLOAD: "components/cad/lisp/lisp-commands.ts (registrado con el runtime)",
  LISPCON: "components/cad/lisp/lisp-commands.ts (registrado con el runtime)",
  VLIDE: "components/cad/lisp/lisp-commands.ts (alias de LISPCON)",
};

const existe = (nombre: string) =>
  CAD_COMMAND_REGISTRY_V2.get(nombre) !== undefined || nombre in DINAMICOS;

/** Contexto mínimo: un documento vacío. Lo que interesa es el PRIMER prompt. */
function contextoVacio(): CadCommandContext {
  return {
    entityIds: [],
    selection: [],
    activeLayer: "0",
  } as unknown as CadCommandContext;
}

function promptDe(nombre: string) {
  const descriptor = CAD_COMMAND_REGISTRY_V2.get(nombre);
  if (!descriptor) return { comando: nombre, existe: false as const };
  try {
    const paso = descriptor.begin(contextoVacio()) as {
      prompt?: { message: string; options?: readonly { keyword: string }[] };
    };
    return {
      comando: descriptor.name,
      existe: true as const,
      mensaje: paso.prompt?.message ?? null,
      opciones: (paso.prompt?.options ?? []).map((option) => option.keyword),
    };
  } catch (error) {
    return { comando: descriptor.name, existe: true as const, error: String(error) };
  }
}

/** Un hecho de código fuente: lo que hay o no hay escrito, con su archivo. */
function hechoDeFuente(relativo: string, patron: RegExp): { archivo: string; coincidencias: number } {
  const absoluto = path.join(RAIZ, relativo);
  if (!fs.existsSync(absoluto)) return { archivo: relativo, coincidencias: -1 };
  const fuente = fs.readFileSync(absoluto, "utf8");
  return { archivo: relativo, coincidencias: (fuente.match(patron) ?? []).length };
}

/** Cuenta coincidencias bajo un directorio, sin `node_modules` ni specs. */
function hechoDeArbol(relativo: string, patron: RegExp): number {
  const raiz = path.join(RAIZ, relativo);
  let total = 0;
  const visitar = (directorio: string) => {
    for (const entrada of fs.readdirSync(directorio, { withFileTypes: true })) {
      const completo = path.join(directorio, entrada.name);
      if (entrada.isDirectory()) {
        if (entrada.name === "node_modules" || entrada.name === ".next") continue;
        visitar(completo);
      } else if (/\.(ts|tsx)$/.test(entrada.name) && !/\.spec\.tsx?$/.test(entrada.name)) {
        total += (fs.readFileSync(completo, "utf8").match(patron) ?? []).length;
      }
    }
  };
  if (fs.existsSync(raiz)) visitar(raiz);
  return total;
}

const registro = CAD_COMMAND_REGISTRY_V2.names();
const areas = REFERENCIA.map(({ area, comandos }) => {
  const presentes = comandos.filter(existe);
  const ausentes = comandos.filter((nombre) => !existe(nombre));
  return {
    area,
    referencia: comandos.length,
    presentes: presentes.length,
    cobertura: Number(((presentes.length / comandos.length) * 100).toFixed(1)),
    ausentes,
  };
});

/**
 * Dos patrones de sombreado son DISTINTOS si su lista de familias lo es. Es la
 * pregunta exacta que el informe del 1 de septiembre respondió con «todos
 * producen el mismo trazado»: no cuántos nombres hay, cuántos trazados.
 */
const firmasDeSombreado = new Set(
  CAD_HATCH_PATTERNS.map((patron) => JSON.stringify(patron.families)),
);

const salida = {
  medido: new Date().toISOString().slice(0, 10),
  registro: {
    comandos: registro.size,
    alias: Object.keys(CAD_COMMAND_ALIASES).length,
    aliasSinResolver: CAD_COMMAND_REGISTRY_V2.unresolvedAliases(),
    dinamicos: DINAMICOS,
  },
  areas,
  prompts: PROMPTS_CITADOS.map(promptDe),
  sombreado: {
    patrones: CAD_HATCH_PATTERNS.length,
    trazadosDistintos: firmasDeSombreado.size,
  },
  tiposDeLinea: {
    definiciones: CAD_BUILTIN_LINETYPES.length,
    ranurasMaximas: Math.max(...CAD_BUILTIN_LINETYPES.map((tipo) => tipo.pattern.length)),
    conTexto: CAD_COMPLEX_LINETYPES.length,
  },
  reflejos: {
    zoomAlCursor: hechoDeArbol("apps/web/src/components/cad", /zoomToCursor/g),
    inerciaDeCamara: hechoDeFuente(
      "apps/web/src/components/cad/editor/Layout3DEditor.tsx",
      /enableDamping\s*=\s*true/g,
    ),
    dobleClic: hechoDeArbol("apps/web/src/components/cad", /dblclick|onDoubleClick|detail === 2/g),
    escalaDeAnotacionEnBarraDeEstado: hechoDeArbol(
      "apps/web/src/components/cad",
      /cad-status-annotation-scale/g,
    ),
    iconosPorComando: hechoDeArbol(
      "apps/web/src/components/cad/ribbon",
      /CAD_COMMAND_ICONS/g,
    ),
  },
};

if (process.argv.includes("--resumen")) {
  process.stdout.write(`Sonda de la distancia · ${salida.medido}\n\n`);
  process.stdout.write(
    `Registro: ${salida.registro.comandos} comandos, ${salida.registro.alias} alias, ` +
      `${salida.registro.aliasSinResolver.length} alias sin resolver\n\n`,
  );
  for (const area of salida.areas)
    process.stdout.write(
      `${String(area.cobertura).padStart(5)} %  ${area.area} — ${area.presentes}/${area.referencia}` +
        (area.ausentes.length ? `\n         faltan: ${area.ausentes.join(", ")}` : "") +
        "\n",
    );
  process.stdout.write(
    `\nSombreado: ${salida.sombreado.patrones} patrones, ` +
      `${salida.sombreado.trazadosDistintos} trazados distintos\n`,
  );
  process.stdout.write(
    `Tipos de línea: ${salida.tiposDeLinea.definiciones} definiciones, ` +
      `${salida.tiposDeLinea.ranurasMaximas} ranuras como máximo, ` +
      `${salida.tiposDeLinea.conTexto} con texto\n\n`,
  );
  for (const prompt of salida.prompts)
    process.stdout.write(
      `  ${prompt.comando.padEnd(12)} ${
        prompt.existe ? `[${(prompt as { opciones?: string[] }).opciones?.join("/") ?? ""}]` : "— no existe"
      }\n`,
    );
  process.stdout.write(`\nReflejos: ${JSON.stringify(salida.reflejos, null, 2)}\n`);
} else {
  process.stdout.write(JSON.stringify(salida, null, 2));
}
