/**
 * Fuentes de un MTEXT: qué pide el dibujo y con qué se dibuja de verdad.
 *
 * ## El problema, dicho sin rodeos
 *
 * Un `.dxf` de un despacho mexicano llega con `\fISOCPEUR|b0|i0|c0|p34;` en
 * mitad de un rótulo, y con `txt.shx` como fuente de casi todas las cotas.
 * Ninguna de las dos existe en un navegador. Lo que hace todo visor que no lo
 * declara es dibujar OTRA fuente y callarse: las anchuras cambian, el rótulo
 * que cabía en la casilla del cajetín deja de caber, y nadie se entera hasta
 * que el plano está impreso.
 *
 * Este módulo hace lo mismo que `plot/plot-fonts.ts` hace para el PDF, pero
 * para la pantalla y para el `\f` del propio texto: convierte «qué familia pide
 * este tramo» en «qué va a pasar con ella», con nombre y apellidos.
 *
 * ## Las tres cosas que le pueden pasar a una familia, y ninguna más
 *
 * - **`resolved`** — la familia se dibuja tal cual. Es el caso de las que todo
 *   sistema tiene (Arial, Times New Roman, Courier New…) y de las que el
 *   producto declare disponibles.
 * - **`substituted`** — se dibuja con otra. Las ANCHURAS no son las mismas y
 *   por eso se dice; no es un fallo, es una decisión que tiene que quedar
 *   escrita.
 * - **`symbols-lost`** — la familia no dibuja letras: dibuja SÍMBOLOS. `gdt.shx`
 *   son los símbolos de tolerancia geométrica; `ltypeshp.shx`, las formas de los
 *   tipos de línea. Sustituirla por una fuente de texto pinta letras donde el
 *   dibujo tenía símbolos, que es peor que dejar un hueco porque parece
 *   contenido. Se marca aparte para que quien lo reciba lo trate como pérdida y
 *   no como cambio de estilo.
 *
 * ## SHX y TTF: qué se resuelve y qué se sustituye, aquí, sin adornos
 *
 * **Ninguna `.shx` se INTERPRETA.** Una SHX no es una fuente de contornos: es
 * un programa de trazos compilado, con su propio formato binario, y dibujarla
 * exige un intérprete de formas que este producto NO tiene. Todas las `.shx`
 * salen `substituted` —o `symbols-lost` si son de símbolos— y la sustitución
 * se declara. Lo que SÍ cambia desde `fonts/hershey-fonts.ts`: cuando el
 * anfitrión declara disponibles las familias Hershey (dominio público, del
 * mismo linaje de trazo único que las SHX de texto), las cinco `.shx` más
 * comunes —txt, simplex, romans, isocp, monotxt— se sustituyen por SU familia
 * Hershey y se dibujan con métrica de trazos (`strokeFamily`), no con una sans
 * de contornos. Sigue siendo una sustitución y sigue diciéndose: la métrica es
 * la de Hershey, no la del binario `.shx` original. Decir que se «soporta SHX»
 * porque se dibuja algo parecido sería exactamente el tipo de afirmación que
 * este repositorio no admite.
 *
 * **De las TTF se resuelven las que están.** Las nueve familias que cualquier
 * sistema operativo trae, más las que el anfitrión declare disponibles. El
 * resto —`ISOCPEUR`, `RomanS`, `City Blueprint`, las de estudio— se sustituyen
 * por la más cercana de las tres estándar y se dice por cuál.
 */
import {
  CAD_HERSHEY_FAMILIES,
  cadHersheyFamilyByName,
  cadHersheyFamilyForShx,
  type CadHersheyFamily,
} from "./fonts/hershey-fonts";
import { parseCadMText } from "./mtext-codes";

export type CadMTextFontKind = "shx" | "ttf" | "unnamed";

/**
 * El código `\f` desmontado: `\fArial|b1|i0|c0|p34;`.
 *
 * Los cinco campos existen en el formato y aquí se leen los cinco, pero sólo
 * dos llegan al dibujo. Se devuelven todos igualmente para que quien exporte
 * pueda escribirlos de vuelta sin perderlos y para que esta diferencia se pueda
 * AFIRMAR en una spec en vez de quedar como sobreentendido.
 */
export interface CadMTextFontCode {
  /** Familia. Es lo único que decide con qué se dibuja. */
  family: string;
  /** `b1` — negrita. La entidad ya tiene campo propio; aquí sólo se lee. */
  bold: boolean;
  /** `i1` — cursiva. Igual que la negrita. */
  italic: boolean;
  /**
   * `c<n>` — página de códigos. NO se usa: el texto ya viaja en Unicode dentro
   * del documento canónico, así que reinterpretarlo por página de códigos sólo
   * podría estropear los acentos que ya están bien.
   */
  codePage: number | null;
  /** `p<n>` — paso y familia de la fuente. No se usa: manda `family`. */
  pitchAndFamily: number | null;
}

/** Desmonta el cuerpo de un `\f`, sin la barra ni el `;`. */
export function parseCadMTextFontCode(payload: string): CadMTextFontCode {
  const parts = payload.split("|");
  const flag = (letter: string): string | undefined =>
    parts
      .slice(1)
      .find((part) => part.trim().toLowerCase().startsWith(letter))
      ?.trim()
      .slice(1);
  const number = (letter: string): number | null => {
    const raw = flag(letter);
    if (raw === undefined) return null;
    const value = Number.parseInt(raw, 10);
    return Number.isFinite(value) ? value : null;
  };
  return {
    family: (parts[0] ?? "").trim(),
    bold: flag("b") === "1",
    italic: flag("i") === "1",
    codePage: number("c"),
    pitchAndFamily: number("p"),
  };
}

export type CadMTextFontDisposition = "resolved" | "substituted" | "symbols-lost";

/** Familia que se usa cuando ni el tramo ni la entidad dicen nada. */
export const CAD_MTEXT_DEFAULT_FAMILY = "Arial";

/**
 * Familias TTF que se dan por presentes sin declarar nada.
 *
 * `Arial` está aquí y NO está en la lista equivalente de `plot-fonts.ts`, y la
 * diferencia es deliberada: en pantalla Arial la tiene el sistema y se dibuja
 * Arial; dentro de un PDF, «Arial» no es una de las catorce estándar y el visor
 * la cambia por Helvetica. Son dos preguntas distintas sobre dos medios
 * distintos, y unificarlas mentiría en uno de los dos.
 */
const RESOLVED_TTF = new Set([
  "arial",
  "helvetica",
  "times",
  "times new roman",
  "courier",
  "courier new",
  "verdana",
  "georgia",
  "tahoma",
]);

/** Con qué se dibuja cada `.shx` conocida, y por qué esa y no otra. */
interface ShxSubstitution {
  by: string;
  reason: string;
  symbols?: true;
}

const SHX_SUBSTITUTIONS: Readonly<Record<string, ShxSubstitution>> = {
  // Las de trazo simple sin serifas: la fuente por defecto de medio mundo.
  txt: { by: "Arial", reason: "trazo simple sin serifas" },
  simplex: { by: "Arial", reason: "trazo simple sin serifas" },
  romans: { by: "Arial", reason: "trazo simple sin serifas" },
  // `isocp` e `iso` son SHX. `ISOCPEUR`, que se le parece y se cita a su lado,
  // NO lo es: es una TrueType, y meterla aquí la clasificaría mal aunque
  // acabase sustituida por la misma familia. El resultado coincidiría y el
  // motivo no, que es como se cuelan los errores que nadie encuentra.
  isocp: { by: "Arial", reason: "trazo ISO, sin serifas" },
  iso: { by: "Arial", reason: "trazo ISO, sin serifas" },
  // Las de doble y triple trazo, con serifas: piden una romana.
  romand: { by: "Times New Roman", reason: "romana con serifas" },
  romanc: { by: "Times New Roman", reason: "romana con serifas" },
  romant: { by: "Times New Roman", reason: "romana con serifas" },
  italic: { by: "Times New Roman", reason: "romana inclinada" },
  italicc: { by: "Times New Roman", reason: "romana inclinada" },
  italict: { by: "Times New Roman", reason: "romana inclinada" },
  // La única de paso fijo.
  monotxt: { by: "Courier New", reason: "paso fijo" },
  // Y las que no son letras.
  gdt: { by: "Arial", reason: "símbolos de tolerancia geométrica", symbols: true },
  ltypeshp: { by: "Arial", reason: "formas de los tipos de línea", symbols: true },
  symath: { by: "Arial", reason: "símbolos matemáticos", symbols: true },
  symap: { by: "Arial", reason: "símbolos cartográficos", symbols: true },
  symeteo: { by: "Arial", reason: "símbolos meteorológicos", symbols: true },
  symusic: { by: "Arial", reason: "símbolos musicales", symbols: true },
  gbcbig: { by: "Arial", reason: "bigfont asiática", symbols: true },
  bigfont: { by: "Arial", reason: "bigfont asiática", symbols: true },
};

/** Familia del dibujo → estándar más parecida, cuando no está en la tabla. */
function nearestStandard(family: string): string {
  const key = family.trim().toLowerCase();
  if (/mono|courier|consol|typewriter/.test(key)) return "Courier New";
  if (/roman|times|serif|garamond|book|georgia|century/.test(key)) return "Times New Roman";
  return "Arial";
}

export interface CadMTextFontResolution {
  /** La familia tal y como la nombra el dibujo, extensión incluida. */
  requested: string;
  kind: CadMTextFontKind;
  disposition: CadMTextFontDisposition;
  /** La familia con la que se dibuja de verdad. */
  family: string;
  /** Pila CSS lista para el lienzo, con sus respaldos. */
  fontStack: string;
  /** Quién la reemplaza. `null` cuando no hay sustitución. */
  substitutedBy: string | null;
  /** Por qué, en una frase. `null` cuando no hay nada que explicar. */
  reason: string | null;
  /**
   * `true` cuando las ANCHURAS no son las del original. Es el dato que decide
   * si un rótulo que cabía va a seguir cabiendo, y por eso viaja aparte de la
   * disposición: una sustitución sin cambio de métrica no rompe una casilla.
   */
  metricsDiffer: boolean;
  /**
   * Familia de trazos Hershey con la que se dibuja DE VERDAD, cuando el texto
   * no va con una fuente del sistema sino con polilíneas
   * (`fonts/hershey-fonts.ts`). `null` en todo lo demás. Quien pinta el rótulo
   * decide con este campo: con él, traza; sin él, `fontStack` al lienzo.
   */
  strokeFamily: CadHersheyFamily | null;
}

export interface CadMTextFontOptions {
  /**
   * Familias que el anfitrión declara disponibles además de las de siempre.
   *
   * Se PASAN, igual que en `plot-fonts.ts`: quien sabe qué fuentes hay cargadas
   * es el anfitrión, y este módulo tiene que poder decir la verdad sin depender
   * de que alguien se acuerde de actualizar una lista escrita a mano aquí.
   */
  available?: readonly string[];
}

/**
 * Lo que el anfitrión de PANTALLA declara disponible: las familias Hershey.
 *
 * No es una lista escrita de memoria — esas familias van COMPILADAS en la
 * aplicación (`fonts/hershey-simplex-data.ts`), así que declararlas siempre es
 * decir la verdad. La maqueta de pantalla (`mtext-layout.ts`) resuelve con
 * esto; quien resuelva para OTRO medio (el PDF, por ejemplo) debe declarar lo
 * suyo, que es exactamente la razón de que el enchufe sea un parámetro.
 */
export const CAD_MTEXT_SCREEN_FONT_OPTIONS: CadMTextFontOptions = {
  available: CAD_HERSHEY_FAMILIES,
};

/** Nombre sin extensión ni ruta: `C:\\fuentes\\ISOCP.shx` → `isocp`. */
function bareName(family: string): string {
  const last = family.trim().split(/[\\/]/).pop() ?? "";
  return last.replace(/\.(shx|ttf|otf|ttc)$/i, "").trim().toLowerCase();
}

function kindOf(family: string): CadMTextFontKind {
  const trimmed = family.trim();
  if (!trimmed) return "unnamed";
  if (/\.shx$/i.test(trimmed)) return "shx";
  if (/\.(ttf|otf|ttc)$/i.test(trimmed)) return "ttf";
  // Sin extensión hay que decidir por el nombre. Las SHX de AutoCAD se citan a
  // menudo sin ella —`txt`, `romans`— y tratarlas como TTF las daría por
  // resueltas, que es justo la mentira que este módulo existe para evitar.
  return bareName(trimmed) in SHX_SUBSTITUTIONS ? "shx" : "ttf";
}

function stackFor(family: string): string {
  return [family, "Arial", "Helvetica", "sans-serif"]
    .filter((entry, index, all) => entry && all.indexOf(entry) === index)
    .join(", ");
}

/**
 * Qué le pasa a la familia que pide un tramo.
 *
 * Nunca falla ni devuelve `null`: siempre hay algo con lo que dibujar, y lo que
 * cambia es lo que se DECLARA. Un resolutor que se niega dejaría el rótulo sin
 * pintar, y un plano con un hueco es peor que un plano con una nota.
 */
export function resolveCadMTextFont(
  requested: string | undefined,
  options: CadMTextFontOptions = {},
): CadMTextFontResolution {
  const name = (requested ?? "").trim();
  const extra = new Set((options.available ?? []).map((entry) => bareName(entry)));

  if (!name)
    return {
      requested: "",
      kind: "unnamed",
      disposition: "resolved",
      family: CAD_MTEXT_DEFAULT_FAMILY,
      fontStack: stackFor(CAD_MTEXT_DEFAULT_FAMILY),
      substitutedBy: null,
      reason: null,
      metricsDiffer: false,
      strokeFamily: null,
    };

  const kind = kindOf(name);
  const bare = bareName(name);

  if (kind === "shx") {
    // Las cinco SHX con familia Hershey van con trazos cuando el anfitrión
    // declara esas familias disponibles. Es el mismo enchufe `available` que
    // usan las TTF del anfitrión: quien sabe qué hay cargado lo dice, y este
    // módulo no da por presente nada que no le hayan declarado.
    const hershey = cadHersheyFamilyForShx(bare);
    if (hershey && extra.has(bareName(hershey)))
      return {
        requested: name,
        kind,
        disposition: "substituted",
        family: hershey,
        // Pila de respaldo para quien ignore `strokeFamily`: una sans normal.
        // «Hershey Simplex» no es una fuente CSS y pedírsela al lienzo sería
        // pedir nada.
        fontStack: stackFor(CAD_MTEXT_DEFAULT_FAMILY),
        substitutedBy: hershey,
        reason:
          `se dibuja con los trazos ${hershey} (fuentes Hershey, dominio público del ` +
          `gobierno de EE.UU.): trazo único como la .shx original, pero las anchuras ` +
          `son las de Hershey, no las del binario que el dibujo nombraba.`,
        metricsDiffer: true,
        strokeFamily: hershey,
      };
    const known = SHX_SUBSTITUTIONS[bare];
    const by = known?.by ?? nearestStandard(bare);
    const why = known?.reason ?? "no hay tabla para esta .shx";
    return {
      requested: name,
      kind,
      disposition: known?.symbols ? "symbols-lost" : "substituted",
      family: by,
      fontStack: stackFor(by),
      substitutedBy: by,
      reason: known?.symbols
        ? `${name} dibuja ${why}, no letras: sustituirla por ${by} pinta texto donde el dibujo ` +
          "tenía símbolos."
        : `una .shx es un programa de trazos y este producto no lo interpreta; se dibuja con ${by} ` +
          `(${why}) y las anchuras no son las del original.`,
      metricsDiffer: true,
      strokeFamily: null,
    };
  }

  if (RESOLVED_TTF.has(bare) || extra.has(bare)) {
    // Pedir «Hershey Simplex» por su nombre también existe: son las familias
    // propias del producto y se dibujan con sus trazos, no con una TTF.
    const hershey = cadHersheyFamilyByName(bare);
    return {
      requested: name,
      kind,
      disposition: "resolved",
      family: hershey ?? name.replace(/\.(ttf|otf|ttc)$/i, ""),
      fontStack: hershey
        ? stackFor(CAD_MTEXT_DEFAULT_FAMILY)
        : stackFor(name.replace(/\.(ttf|otf|ttc)$/i, "")),
      substitutedBy: null,
      reason: null,
      metricsDiffer: false,
      strokeFamily: hershey,
    };
  }

  const by = nearestStandard(bare);
  return {
    requested: name,
    kind,
    disposition: "substituted",
    family: by,
    // La pedida va DELANTE en la pila: si el equipo de quien mira la tiene
    // instalada, se dibuja la de verdad. La sustitución es lo que pasa cuando
    // no la tiene, y por eso se declara aunque a veces no llegue a ocurrir.
    fontStack: stackFor(name.replace(/\.(ttf|otf|ttc)$/i, "")),
    substitutedBy: by,
    reason: `"${name}" no es una de las familias que todo sistema tiene; donde no esté instalada ` +
      `se dibuja con ${by} y las anchuras cambian.`,
    metricsDiffer: true,
    strokeFamily: null,
  };
}

/** Renglón para quien mira el dibujo. Una línea por familia. */
export function describeCadMTextFont(font: CadMTextFontResolution): string {
  if (font.disposition === "resolved")
    return `${font.requested || "(sin nombrar)"}: se dibuja tal cual.`;
  if (font.disposition === "symbols-lost")
    return `${font.requested}: SÍMBOLOS PERDIDOS — ${font.reason}`;
  return `${font.requested}: SUSTITUIDA por ${font.substitutedBy} — ${font.reason}`;
}

/**
 * Familias que NOMBRA un MTEXT, en orden de aparición y sin repetir.
 *
 * Se lee de los tramos ya analizados y no con una expresión regular sobre la
 * cadena: un `\f` dentro de un apilado o escapado con `\\` no nombra ninguna
 * fuente, y una expresión regular no sabe distinguirlo.
 */
export function cadMTextFontsUsed(source: string): string[] {
  const families: string[] = [];
  for (const paragraph of parseCadMText(source))
    for (const run of paragraph) {
      const family = run.fontFamily?.trim();
      if (family && !families.includes(family)) families.push(family);
    }
  return families;
}

/**
 * Lo que le pasa a CADA familia que nombra un MTEXT, con la de la entidad
 * incluida. Es el informe que se le enseña a quien va a entregar el plano.
 */
export function resolveCadMTextFonts(
  source: string,
  entityFamily?: string,
  options: CadMTextFontOptions = {},
): CadMTextFontResolution[] {
  const names = cadMTextFontsUsed(source);
  const base = (entityFamily ?? "").trim();
  if (base && !names.includes(base)) names.unshift(base);
  if (names.length === 0) names.push(CAD_MTEXT_DEFAULT_FAMILY);
  return names.map((name) => resolveCadMTextFont(name, options));
}
