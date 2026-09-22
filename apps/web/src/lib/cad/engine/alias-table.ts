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
 *
 * ## ESTA TABLA ES LA ÚNICA QUE CONSULTA EL TECLADO
 *
 * Un alias declarado en el `aliases: […]` de su descriptor NO basta para poder
 * teclearlo. Hay dos caminos y sólo uno mira el descriptor:
 *
 * ```text
 *   registry.get("SET")        → descriptor.aliases    → SETVAR ✅
 *   teclear «SET» en la línea  → CAD_COMMAND_ALIASES   → null   ❌
 * ```
 *
 * `input-pipeline.ts` —el teclado de verdad— resuelve con
 * `resolveCadCommandAlias`, que no conoce el registro. Así que un alias que sólo
 * vive en su descriptor sale en la paleta, pasa las specs de su familia, y al
 * teclearlo el usuario lee «Comando desconocido». Se pagó con `DX` en la Ola E,
 * con `IM` en la H y con la topografía en la I; la auditoría completa destapó
 * 233 más, empezando por `SET`→SETVAR.
 *
 * Desde entonces lo guarda `alias-table.spec.ts`, que teclea CADA alias
 * declarado por el motor entero y exige que haga lo mismo que invocar el
 * comando por su nombre largo. Un alias nuevo sin su entrada aquí falla ahí.
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
  ROTURA: "BREAKLINE",
  DIV: "DIVIDE",
  ME: "MEASURE",
  // BIM. `WA` es el alias histórico de WALLADD en AutoCAD Architecture, y
  // `MURO` la memoria muscular de quien viene del producto en español.
  WA: "WALL",
  MURO: "WALL",
  // `DOORADD` y `WINDOWADD` son los nombres con los que AutoCAD Architecture
  // coloca huecos; `PUERTA` y `VENTANA`, la memoria muscular en español.
  // `STAIRADD` coloca escaleras en AutoCAD Architecture; `ESCALERA`, en español.
  STAIRADD: "STAIR",
  ESCALERA: "STAIR",
  // `DX` es el alias de acad.pgp de DATAEXTRACTION. El descriptor ya lo
  // declaraba y el registro lo resolvía, pero el PIPELINE de entrada consulta
  // ESTA tabla: tecleado, «DX» no llegaba a ninguna parte (medido en el
  // golden 77: la «P» siguiente arrancaba PAN).
  DX: "DATAEXTRACTION",
  ROOFADD: "ROOF",
  CUBIERTA: "ROOF",
  SLABADD: "SLAB",
  LOSA: "SLAB",
  // MEP (Ola F): los nombres de AutoCAD MEP y la memoria muscular en español.
  PIPEADD: "PIPE",
  TUBERIA: "PIPE",
  DUCTADD: "DUCT",
  DUCTO: "DUCT",
  CABLETRAYADD: "CABLETRAY",
  CHAROLA: "CABLETRAY",
  DEVICEADD: "MEPSYMBOL",
  SIMBOLOMEP: "MEPSYMBOL",
  // Map 3D (Ola G): `GEO` es el alias de acad.pgp de GEOGRAPHICLOCATION;
  // `MAPCSASSIGN` asigna el sistema en AutoCAD Map; `GEORREFERENCIAR` e
  // `IMPORTARGIS`, la memoria muscular en español.
  GEO: "GEOGRAPHICLOCATION",
  GEOLOCATION: "GEOGRAPHICLOCATION",
  MAPCSASSIGN: "GEOGRAPHICLOCATION",
  GEORREFERENCIAR: "GEOGRAPHICLOCATION",
  IMPORTARGIS: "MAPIMPORT",
  // Map 3D (Ola I): la topografía. `CUADRO` es como se pide la lámina en un
  // despacho mexicano, y `RUMBOS` es la memoria muscular de quien teclea la
  // libreta de campo. Los descriptores ya declaran casi todos, pero el
  // pipeline de entrada resuelve por ESTA tabla (medido en la Ola E con DX).
  POLIGONAL: "COGO",
  RUMBOS: "COGO",
  MAPCOGO: "COGO",
  CUADRO: "CUADROCONSTRUCCION",
  CUADRODECONSTRUCCION: "CUADROCONSTRUCCION",
  COGOTABLE: "CUADROCONSTRUCCION",
  MAPCOGOTABLE: "CUADROCONSTRUCCION",
  // Raster (Ola H): los alias de acad.pgp y la memoria muscular en español.
  // `IM` estaba sólo en el descriptor de IMAGE y el pipeline consulta ESTA
  // tabla (medido en la Ola E con DX): tecleado no llegaba.
  IM: "IMAGE",
  IAT: "IMAGEATTACH",
  ICL: "IMAGECLIP",
  IAD: "IMAGEADJUST",
  ADJUNTARIMAGEN: "IMAGEATTACH",
  RECORTARIMAGEN: "IMAGECLIP",
  AJUSTARIMAGEN: "IMAGEADJUST",
  // Raster (Ola I): la vectorización del escaneo. `VEC` es la abreviatura y
  // `VECTORIZAR` la memoria muscular en español.
  VEC: "VECTORIZE",
  VECTORIZAR: "VECTORIZE",
  // PDF: el sustrato que se calca y la importación de vectores. Mismos alias
  // en español que ya declaran los descriptores; el pipeline de entrada
  // resuelve por ESTA tabla, no por el descriptor.
  ADJUNTARPDF: "PDFATTACH",
  IMPORTARPDF: "PDFIMPORT",
  RECORTARPDF: "PDFCLIP",
  AJUSTARPDF: "PDFADJUST",
  PAGINAPDF: "PDFPAGE",
  ESCALARPDF: "PDFSCALE",
  DESADJUNTARPDF: "PDFDETACH",
  DESCARGARPDF: "PDFUNLOAD",
  RECARGARPDF: "PDFRELOAD",
  LISTARPDF: "PDFLIST",
  // Mechanical (Ola I): los nombres AM* de AutoCAD Mechanical y la memoria
  // muscular en español.
  AMCONTENTLIB: "STDPART",
  NORMALIZADO: "STDPART",
  TORNILLO: "STDPART",
  AMSTLSHAP2D: "STEELSHAPE",
  PERFIL: "STEELSHAPE",
  PERFILACERO: "STEELSHAPE",
  AMBALLOON: "BALLOON",
  GLOBO: "BALLOON",
  AMBOM: "BOM",
  LISTAMATERIALES: "BOM",
  AMWELDSYM: "WELDSYMBOL",
  SOLDADURA: "WELDSYMBOL",
  AMSURFSYM: "SURFACESYMBOL",
  ACABADO: "SURFACESYMBOL",
  TOLERANCIA: "DIMTOLERANCE",
  DTOL: "DIMTOLERANCE",
  DOORADD: "DOOR",
  PUERTA: "DOOR",
  WINDOWADD: "WINDOW",
  VENTANA: "WINDOW",

  // `SO` es el alias de acad.pgp de SOLID, la cara rellena heredada. Lo
  // declaraba el descriptor y tecleado no llegaba: el pipeline lee ESTA tabla.
  SO: "SOLID",

  // --- modificación ---------------------------------------------------------
  E: "ERASE",
  BORRAR: "ERASE",
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
  APLASTAR: "FLATTEN",

  // `XP` es el alias de acad.pgp de XPLODE, el descomponer que deja elegir capa
  // y color de lo descompuesto. Sólo vivía en el descriptor.
  XP: "XPLODE",

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
  NUMTEXTO: "TCOUNT",
  TEXTOAMTEXTO: "TXT2MTXT",

  // Los alias de acad.pgp que faltaban y los nombres heredados: `DTEXT` y
  // `DDIM` son como se llamaban TEXT y DIMSTYLE antes de 2000, y se siguen
  // tecleando. `EJE` y `MARCACENTRO` son la memoria muscular en español.
  QD: "QDIM",
  TA: "TEXTALIGN",
  QL: "QLEADER",
  DST: "DIMSTYLE",
  DDIM: "DIMSTYLE",
  DTEXT: "TEXT",
  TEXTEDIT: "DDEDIT",
  CM: "CENTERMARK",
  MARCACENTRO: "CENTERMARK",
  CL: "CENTERLINE",
  EJE: "CENTERLINE",
  CAMPO: "FIELD",
  ACTUALIZARCAMPO: "UPDATEFIELD",
  BUSCAR: "FIND",
  HALLAR: "FIND",
  ESCANOTA: "ANNOSCALE",
  ESCALAOBJETO: "OBJECTSCALE",
  REINICIOANOTA: "ANNORESET",
  DIMDISASOC: "DIMDISASSOCIATE",
  DIMREASOC: "DIMREASSOCIATE",
  ORIGENSOMBREADO: "HATCHORIGIN",

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

  // `BMAKE` y `DDINSERT` son los nombres heredados de BLOCK e INSERT; `ADC` y
  // `DC`, los dos alias con los que acad.pgp abre DesignCenter. El bloque
  // dinámico y la edición de referencias se teclean en español en un despacho
  // mexicano, que es como los declara su descriptor.
  BMAKE: "BLOCK",
  DDINSERT: "INSERT",
  EATTEDIT: "ATTEDIT",
  ADC: "ADCENTER",
  DC: "ADCENTER",
  BLOQUEDINAMICO: "BLOQUEDIN",
  DYNBLOCK: "BLOQUEDIN",
  PARAMETROBLOQUE: "BLOQUEDINSET",
  DYNSET: "BLOQUEDINSET",
  LISTABLOQUESDIN: "BLOQUEDINLIST",
  PARAMETRODEF: "BLOQUEDINDEF",
  DYNPARAM: "BLOQUEDINDEF",
  EDITARREF: "REFEDIT",
  CONJUNTOREF: "REFSET",
  CERRARREF: "REFCLOSE",
  EXTERNALREFERENCES: "XREF",
  CLIP: "XCLIP",

  // --- capas y propiedades --------------------------------------------------
  LA: "LAYER",
  CAPABORRAR: "LAYDEL",
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

  // Los `DD*` son los nombres de los cuadros de diálogo de AutoCAD R12 y siguen
  // siendo memoria muscular de treinta años. `COLOUR` es la grafía británica
  // que acad.pgp acepta, y `SET` la abreviatura de SETVAR con la que se
  // consulta una variable sin escribir el nombre entero.
  //
  // Las variantes con guion necesitan entrada PROPIA: sin `-LA`, lo tecleado
  // cae al alias `LA` y abre el gestor de capas, que es justo el cuadro que el
  // guion existe para evitar, y un `.scr` se queda esperando un clic.
  DDLMODES: "LAYER",
  DDMODIFY: "PROPERTIES",
  RM: "DSETTINGS",
  DDRMODES: "DSETTINGS",
  DDOSNAP: "OSNAP",
  PREFERENCES: "OPTIONS",
  "PR-OPTIONS": "OPTIONS",
  DDUCS: "UCSMAN",
  DDLTYPE: "LINETYPE",
  DDUNITS: "UNITS",
  DDRENAME: "RENAME",
  REN: "RENAME",
  LAS: "LAYERSTATE",
  LMAN: "LAYERSTATE",
  LC: "LAYCUR",
  CAPASMX: "NORMAMX",
  COLOUR: "COLOR",
  DDCOLOR: "COLOR",
  SET: "SETVAR",
  RELLENO: "FILL",
  "-LA": "-LAYER",
  "-LT": "-LINETYPE",
  "-DS": "-DSETTINGS",
  "-SE": "-DSETTINGS",
  "-RM": "-DSETTINGS",
  "-OS": "-OSNAP",
  "-UC": "-UCSMAN",
  UCSNAMED: "-UCSMAN",
  "-TP": "-TOOLPALETTES",

  // --- consulta -------------------------------------------------------------
  DI: "DIST",
  AA: "AREA",
  LI: "LIST",
  LS: "LIST",
  MASS: "MASSPROP",

  // `INF` es el alias de acad.pgp de INTERFERE y `FI` el de FILTER.
  INF: "INTERFERE",
  FI: "FILTER",
  ESTADO: "STATUS",
  TIEMPO: "TIME",

  // --- vista ----------------------------------------------------------------
  Z: "ZOOM",
  P: "PAN",
  V: "VIEW",
  UC: "UCSMAN",
  VS: "VSCURRENT",
  // El nombre legado: en AutoCAD moderno SHADEMODE delega en VSCURRENT.
  SHADEMODE: "VSCURRENT",

  // `SCU` es como se teclea UCS en el AutoCAD en español —el sistema de
  // coordenadas es de lo poco que allí sí cambia de nombre— y `REGEN3D` el
  // nombre heredado de REGEN. La navegación 3D del final de la tabla ya cubre
  // `3DO` y `3DZ`; esto cubre el resto de la misma familia.
  SCU: "UCS",
  VRES: "VIEWRES",
  REGEN3D: "REGEN",
  RD: "REDRAW",
  REDIBUJAR: "REDRAW",
  PERS: "PERSPECTIVE",
  VST: "VISUALSTYLES",
  ESTILOVISUAL: "VISUALSTYLES",
  CAMARA: "CAMERA",
  VISTADIN: "DVIEW",
  CUBONAV: "NAVVCUBE",
  BARRANAV: "NAVBAR",
  "3W": "3DWALK",
  CAMINAR3D: "3DWALK",
  "3F": "3DFLY",
  VOLAR3D: "3DFLY",
  "3SW": "3DSWIVEL",
  GIRAR3D: "3DSWIVEL",
  SPLANE: "SECTIONPLANE",
  PLANOCORTE: "SECTIONPLANE",

  // --- layouts y ploteo -----------------------------------------------------
  LO: "LAYOUT",
  MV: "MVIEW",
  MS: "MSPACE",
  PS: "PSPACE",
  PU: "PURGE",
  PRINT: "PLOT",
  PLO: "PLOT",
  PSET: "PAGESETUP",
  VPORT: "VPORTS",

  // Las vistas de documentación: `VBASE` y compañía son los alias de acad.pgp
  // de la familia VIEWBASE, y `SOLV`/`SOLD` los de las vistas de sólido de toda
  // la vida. En español se teclean como los declara su descriptor.
  PUBLICAR: "PUBLISH",
  SSM: "SHEETSET",
  VBASE: "VIEWBASE",
  VISTABASE: "VIEWBASE",
  VPRJ: "VIEWPROJ",
  VISTAPROY: "VIEWPROJ",
  VSECCION: "VIEWSECTION",
  VISTACORTE: "VIEWSECTION",
  VD: "VIEWDETAIL",
  VISTADETALLE: "VIEWDETAIL",
  VE: "VIEWEDIT",
  VISTAEDIT: "VIEWEDIT",
  VU: "VIEWUPDATE",
  VISTAATUALIZA: "VIEWUPDATE",
  SOLV: "SOLVIEW",
  VISTASOL: "SOLVIEW",
  SOLD: "SOLDRAW",
  DIBUJOSOL: "SOLDRAW",
  APLANAR: "FLATSHOT",
  PERFILSOL: "SOLPROF",

  // --- gestión --------------------------------------------------------------
  // `DWGCOMPARE` es el nombre con el que AutoCAD 2019+ compara dos dibujos;
  // `COMPARAR`, la memoria muscular en español.
  COMPARAR: "COMPARE",
  DWGCOMPARE: "COMPARE",

  // `CHK` es el alias de acad.pgp de CHECKSTANDARDS; `ENTREGA` y `PREFLIGHT`,
  // los dos nombres con los que se pide la revisión previa a entregar.
  STANDARDS: "CHECKSTANDARDS",
  CHK: "CHECKSTANDARDS",
  ENTREGA: "REVISA",
  PREFLIGHT: "REVISA",
  ACERCADE: "ABOUT",

  // --- interoperabilidad ----------------------------------------------------
  EXP: "EXPORT",
  IMP: "IMPORT",
  DXFIN: "DXFIN",
  DXFOUT: "DXFOUT",

  ETRANS: "ETRANSMIT",

  // --- paramétricas ---------------------------------------------------------
  GCON: "GEOMCONSTRAINT",
  DCON: "DIMCONSTRAINT",
  PARAM: "PARAMETERS",

  // --- navegación 3D --------------------------------------------------------
  //
  // Donde se descubrió, tecleando `3DZ`, que un alias del descriptor no basta
  // para poder teclearlo. La regla y lo que costó están en la cabecera.
  "3DO": "3DORBIT",
  ORBIT: "3DORBIT",
  "3DF": "3DFORBIT",
  FORBIT: "3DFORBIT",
  "3DP": "3DPAN",
  "3DZ": "3DZOOM",
  VP: "VPOINT",

  // --- ayudas al dibujo (T-Ola3, F1) -----------------------------------------
  // `SN` es el alias de acad.pgp de SNAP. El descriptor ya lo declaraba —igual
  // que `3DZ` o `DX` antes— y el pipeline de entrada resuelve por ESTA tabla:
  // sin la entrada de aquí, tecleado no llegaba a ninguna parte.
  SN: "SNAP",

  // --- automatización -------------------------------------------------------
  // `SCR` y `RS` son los alias de acad.pgp de SCRIPT y RSCRIPT. Un `.scr` que
  // se llama a sí mismo con `RS` es el bucle de proceso por lotes de AutoCAD:
  // si el alias no resuelve, el lote se para en seco a la primera vuelta.
  SCR: "SCRIPT",
  RS: "RSCRIPT",
  GRABARACCION: "ACTRECORD",
  PARARACCION: "ACTSTOP",
  GESTORACCIONES: "ACTMANAGER",

  // --- sólidos 3D -----------------------------------------------------------
  // Los alias de acad.pgp del modelado de sólidos y de las transformaciones 3D.
  EXT: "EXTRUDE",
  REV: "REVOLVE",
  UNI: "UNION",
  SU: "SUBTRACT",
  IN: "INTERSECT",
  SL: "SLICE",
  SEC: "SECTION",
  WE: "WEDGE",
  CYL: "CYLINDER",
  TOR: "TORUS",
  PYR: "PYRAMID",
  PSOLID: "POLYSOLID",
  "3M": "3DMOVE",
  "3R": "3DROTATE",
  ROTATE3D: "3DROTATE",
  "3S": "3DSCALE",
  "3A": "3DARRAY",
  "3AL": "3DALIGN",
  MIRROR3: "MIRROR3D",
  SIMETRIA3D: "MIRROR3D",

  // --- superficies y mallas -------------------------------------------------
  // Las superficies regladas heredadas (`RSURF`, `TSURF`) y la familia SURF*
  // moderna, con la memoria muscular en español que declara cada descriptor.
  PLSURF: "PLANESURF",
  SUPERFICIEPLANA: "PLANESURF",
  CVTSURF: "CONVTOSURFACE",
  CONVERTIRASUPERFICIE: "CONVTOSURFACE",
  SFOFFSET: "SURFOFFSET",
  DESFSUPERF: "SURFOFFSET",
  STRIM: "SURFTRIM",
  RECORTARSUPERF: "SURFTRIM",
  SUNTRIM: "SURFUNTRIM",
  DESRECORTARSUPERF: "SURFUNTRIM",
  SSCULPT: "SURFSCULPT",
  ESCULPIRSUPERF: "SURFSCULPT",
  SPATCH: "SURFPATCH",
  PARCHE: "SURFPATCH",
  SNETWORK: "SURFNETWORK",
  RED: "SURFNETWORK",
  SBLEND: "SURFBLEND",
  MEZCLARSUPERF: "SURFBLEND",
  SEXTEND: "SURFEXTEND",
  EXTENDERSUPERF: "SURFEXTEND",
  SFILLET: "SURFFILLET",
  FILETESUPERF: "SURFFILLET",
  RSURF: "RULESURF",
  SUPERFICIEREGLADA: "RULESURF",
  TSURF: "TABSURF",
  SUPERFICIETABULADA: "TABSURF",
  RSURFACE: "REVSURF",
  SUPERFICIEREVOLUCION: "REVSURF",
  ESURF: "EDGESURF",
  SUPERFICIEBORDE: "EDGESURF",
  MALLA: "MESH",
  CARA3D: "3DFACE",
  CVTMESH: "CONVTOMESH",
  CONVERTIRAMALLA: "CONVTOMESH",
  CVTSOLID: "CONVTOSOLID",
  CONVERTIRASOLIDO: "CONVTOSOLID",
  SUAVIZARMALLA: "MESHSMOOTH",
  SUAVIZARMALLAMAS: "MESHSMOOTHMORE",
  SUAVIZARMALLAMENOS: "MESHSMOOTHLESS",
  REFINARMALLA: "MESHREFINE",
  COLAPSARMALLA: "MESHCOLLAPSE",
  TAPARMALLA: "MESHCAP",
  UNIRMALLA: "MESHMERGE",
  DIVIDIRMALLA: "MESHSPLIT",
  CRESTAMALLA: "MESHCREASE",
  QUITARCRESTA: "MESHUNCREASE",
  EXTRUIRMALLA: "MESHEXTRUDE",

  // --- render y materiales --------------------------------------------------
  // `RR` es el alias de acad.pgp de RENDER y `MAT` el de MATERIALS; el resto
  // son las abreviaturas de la ficha Render y su lectura en español.
  RR: "RENDER",
  RENDERIZAR: "RENDER",
  RPRES: "RENDERPRESETS",
  AJUSTESRENDER: "RENDERPRESETS",
  REXPOSURE: "RENDEREXPOSURE",
  EXPOSICIONRENDER: "RENDEREXPOSURE",
  RENV: "RENDERENVIRONMENT",
  ENTORNERENDER: "RENDERENVIRONMENT",
  RCROP: "RENDERCROP",
  RECORTARRENDER: "RENDERCROP",
  RWIN: "RENDERWIN",
  VENTANARENDER: "RENDERWIN",
  MAT: "MATERIALS",
  MATERIALES: "MATERIALS",
  MATBROWSER: "MATERIALS",
  MATTACH: "MATERIALATTACH",
  ADJUNTARMATERIAL: "MATERIALATTACH",
  MMAP: "MATERIALMAP",
  MAPEARMATERIAL: "MATERIALMAP",
  PLIGHT: "POINTLIGHT",
  LUZPUNTUAL: "POINTLIGHT",
  SLIGHT: "SPOTLIGHT",
  LUZFOCO: "SPOTLIGHT",
  DLIGHT: "DISTANTLIGHT",
  LUZDIRECCIONAL: "DISTANTLIGHT",
  SUNPROP: "SUNPROPERTIES",
  PROPIEDADESSOL: "SUNPROPERTIES",

  // --- eléctrico esquemático ------------------------------------------------
  // Los nombres de AutoCAD Electrical (`WIRENUMBER`, `AECOMPONENT`) y la
  // memoria muscular en español de quien dibuja diagramas unifilares.
  CIRCUITO: "AECIRCUIT",
  CONDUCTOR: "AEWIRE",
  WIRENUMBER: "AEWIRE",
  LISTACONDUCTORES: "AEWIRELIST",
  ETIQUETA: "AETAG",
  AECOMPONENT: "AETAG",
  LISTAETIQUETAS: "AETAGLIST",
  SIMBOLOESQUEMA: "AESYMBOL",
  REVISARNOM: "AECHECK",
  NOMCHECK: "AECHECK",

  // --- tubería de planta ----------------------------------------------------
  // Los nombres de AutoCAD Plant 3D (`ROUTEPIPE`, `ISOGEN`, `PIPEBOM`) y la
  // memoria muscular en español de quien dibuja un P&ID.
  EQUIPO: "PIDEQUIP",
  EQUIPMENT: "PIDEQUIP",
  LISTAEQUIPOS: "PIDEQUIPLIST",
  LINEAPROCESO: "PIDLINE",
  LINENUMBER: "PIDLINE",
  LISTALINEAS: "PIDLIST",
  PLANTDATAMANAGER: "PIDLIST",
  RUTATUBERIA: "PIDROUTE",
  ROUTEPIPE: "PIDROUTE",
  LISTAMATERIAL: "PIDMTO",
  PIPEBOM: "PIDMTO",
  ISOMETRICO: "PIDISO",
  ISOGEN: "PIDISO",
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
