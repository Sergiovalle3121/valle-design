/**
 * Tabla de alias de comandos, compatible con `acad.pgp`.
 *
 * Un dibujante veterano no teclea `RECTANGLE`: teclea `REC`. Esa memoria
 * muscular tiene décadas y es intransferible — si `TR` no recorta, el producto
 * se siente ajeno por muy completo que esté. Por eso los alias son parte del
 * contrato, no una comodidad.
 *
 * Los nombres canónicos y sus alias son **invariantes entre idiomas**, igual
 * que en AutoCAD: lo que se traduce es el prompt, nunca el nombre. Sin esa
 * separación, activar el español rompería toda macro y todo script escrito en
 * inglés, y viceversa.
 *
 * Las variantes con guion (`-LAYER`, `-INSERT`, `-PLOT`) resuelven al mismo
 * comando pero pidiendo sus opciones por la línea en vez de abrir un cuadro de
 * diálogo. Es lo que hace posible ejecutar un `.scr` sin interfaz.
 */

/** Alias → nombre canónico. */
export const CAD_COMMAND_ALIASES: Readonly<Record<string, string>> = {
  // --- dibujo ---------------------------------------------------------------
  L: "LINE",
  XL: "XLINE",
  PL: "PLINE",
  POL: "POLYGON",
  REC: "RECTANG",
  RECTANGLE: "RECTANG",
  A: "ARC",
  C: "CIRCLE",
  REVC: "REVCLOUD",
  SPL: "SPLINE",
  EL: "ELLIPSE",
  PO: "POINT",
  DO: "DONUT",
  DONUTS: "DONUT",
  H: "HATCH",
  BH: "HATCH",
  GD: "GRADIENT",
  BO: "BOUNDARY",
  REG: "REGION",
  WIPE: "WIPEOUT",
  DIV: "DIVIDE",
  ME: "MEASURE",
  // BIM. `WA` es el alias histórico de WALLADD en AutoCAD Architecture, y
  // `MURO` la memoria muscular de quien viene del producto en español.
  WA: "WALL",
  MURO: "WALL",
  // `DOORADD` y `WINDOWADD` son los nombres con los que AutoCAD Architecture
  // coloca huecos; `PUERTA` y `VENTANA`, la memoria muscular en español.
  DOORADD: "DOOR",
  PUERTA: "DOOR",
  WINDOWADD: "WINDOW",
  VENTANA: "WINDOW",

  // --- modificación ---------------------------------------------------------
  E: "ERASE",
  M: "MOVE",
  CO: "COPY",
  CP: "COPY",
  RO: "ROTATE",
  SC: "SCALE",
  MI: "MIRROR",
  O: "OFFSET",
  AR: "ARRAY",
  ARR: "ARRAY",
  TR: "TRIM",
  EX: "EXTEND",
  F: "FILLET",
  CHA: "CHAMFER",
  BLE: "BLEND",
  S: "STRETCH",
  LEN: "LENGTHEN",
  BR: "BREAK",
  J: "JOIN",
  X: "EXPLODE",
  AL: "ALIGN",
  PE: "PEDIT",
  SPE: "SPLINEDIT",
  ED: "DDEDIT",
  MA: "MATCHPROP",
  OV: "OVERKILL",
  G: "GROUP",
  UNG: "UNGROUP",
  DR: "DRAWORDER",

  // --- anotación ------------------------------------------------------------
  T: "MTEXT",
  MT: "MTEXT",
  DT: "TEXT",
  ST: "STYLE",
  D: "DIMSTYLE",
  DIM: "DIM",
  DLI: "DIMLINEAR",
  DAL: "DIMALIGNED",
  DAN: "DIMANGULAR",
  DRA: "DIMRADIUS",
  DDI: "DIMDIAMETER",
  DOR: "DIMORDINATE",
  DAR: "DIMARC",
  DCO: "DIMCONTINUE",
  DBA: "DIMBASELINE",
  DED: "DIMEDIT",
  MLD: "MLEADER",
  MLS: "MLEADERSTYLE",
  TB: "TABLE",
  TS: "TABLESTYLE",
  LE: "LEADER",
  TOL: "TOLERANCE",

  // --- bloques y referencias ------------------------------------------------
  B: "BLOCK",
  BE: "BEDIT",
  I: "INSERT",
  W: "WBLOCK",
  ATT: "ATTDEF",
  ATE: "ATTEDIT",
  ATTE: "ATTEDIT",
  XR: "XREF",
  XA: "XATTACH",
  XB: "XBIND",
  XC: "XCLIP",
  AC: "ADCENTER",
  TP: "TOOLPALETTES",

  // --- capas y propiedades --------------------------------------------------
  LA: "LAYER",
  LT: "LINETYPE",
  LTS: "LTSCALE",
  LW: "LWEIGHT",
  CH: "PROPERTIES",
  MO: "PROPERTIES",
  PR: "PROPERTIES",
  COL: "COLOR",
  UN: "UNITS",
  OP: "OPTIONS",
  OS: "OSNAP",
  DS: "DSETTINGS",
  SE: "DSETTINGS",
  RE: "REGEN",
  REA: "REGENALL",

  // --- consulta -------------------------------------------------------------
  DI: "DIST",
  AA: "AREA",
  LI: "LIST",
  LS: "LIST",
  MASS: "MASSPROP",

  // --- vista ----------------------------------------------------------------
  Z: "ZOOM",
  P: "PAN",
  V: "VIEW",
  UC: "UCSMAN",
  VS: "VSCURRENT",
  // El nombre legado: en AutoCAD moderno SHADEMODE delega en VSCURRENT.
  SHADEMODE: "VSCURRENT",

  // --- layouts y ploteo -----------------------------------------------------
  LO: "LAYOUT",
  MV: "MVIEW",
  MS: "MSPACE",
  PS: "PSPACE",
  PU: "PURGE",
  PRINT: "PLOT",
  PLO: "PLOT",
  PSET: "PAGESETUP",

  // --- interoperabilidad ----------------------------------------------------
  EXP: "EXPORT",
  IMP: "IMPORT",
  DXFIN: "DXFIN",
  DXFOUT: "DXFOUT",

  // --- paramétricas ---------------------------------------------------------
  GCON: "GEOMCONSTRAINT",
  DCON: "DIMCONSTRAINT",
  PARAM: "PARAMETERS",

  // --- navegación 3D --------------------------------------------------------
  //
  // Un alias declarado en el descriptor NO basta para poder teclearlo: la línea
  // de comandos resuelve por esta tabla, así que un comando cuyos alias sólo
  // viven en su descriptor se puede invocar por su nombre largo y por nada más.
  // Se descubrió aquí, tecleando `3DZ`.
  "3DO": "3DORBIT",
  ORBIT: "3DORBIT",
  "3DF": "3DFORBIT",
  FORBIT: "3DFORBIT",
  "3DP": "3DPAN",
  "3DZ": "3DZOOM",
  VP: "VPOINT",
};

/**
 * Resuelve lo tecleado a un nombre canónico.
 *
 * Acepta el nombre completo, un alias, y el prefijo `-` de las variantes sin
 * cuadro de diálogo. Devuelve `null` cuando no reconoce nada — quien llama
 * decide el mensaje, porque el motor no fabrica texto de interfaz.
 */
export function resolveCadCommandAlias(
  token: string,
  known?: ReadonlySet<string>,
): string | null {
  const trimmed = token.trim();
  if (!trimmed) return null;
  // Las variantes con guion son comandos DISTINTOS cuando existen: `-LAYER`
  // pide sus opciones por la línea y `LAYER` abre el gestor. Se busca primero
  // el nombre tal cual —con su guion— y sólo si nadie lo reclama se cae al
  // comportamiento histórico de tratar el prefijo como decorativo. Sin esta
  // consulta previa, teclear `-LAYER` abriría el cuadro y un `.scr` se
  // quedaría esperando un clic, que es justo lo que el guion evita.
  const literal = trimmed.replace(/^_+/, "").toUpperCase();
  if (known?.has(literal)) return literal;
  const literalAlias = CAD_COMMAND_ALIASES[literal];
  if (literalAlias && (!known || known.has(literalAlias))) return literalAlias;
  // `_` es el prefijo internacional de AutoCAD y `-` el de "sin diálogo";
  // ninguno cambia a qué comando se refiere quien escribe.
  const normalized = trimmed.replace(/^[-_]+/, "").toUpperCase();
  if (!normalized) return null;
  if (known?.has(normalized)) return normalized;
  const alias = CAD_COMMAND_ALIASES[normalized];
  if (alias) return alias;
  // Sin registro que consultar, un nombre no aliaseado se acepta tal cual: el
  // registro es quien sabe si existe.
  return known ? null : normalized;
}

/** `true` si lo tecleado pedía la variante de línea de comandos (`-LAYER`). */
export function isCadCommandLineVariant(token: string): boolean {
  return token.trim().startsWith("-");
}
