/**
 * EL ORDEN DE LA CINTA SE DECLARA; no lo decide un `sort` alfabético.
 *
 * Medido el 2026-09-01 (docs/competitive/distancia-autocad-completo-20260901.md
 * §cinta, y reproducido con `node --import tsx` antes de este módulo): con el
 * orden alfabético el primer panel de Inicio era «Capas y propiedades» (2
 * botones) y en «Dibujo» LINE ocupaba el puesto 15 de 31, detrás de ATTEDIT,
 * BURST, CHECKSTANDARDS o GETVAR, que ni siquiera dibujan. Quien viene de
 * AutoCAD busca Dibujo · Modificar · Anotación · Capas · Bloque · Propiedades,
 * en ese orden, y dentro de Dibujo la línea primero. Aquí están las tablas; la
 * cinta (`ribbon.ts`) sigue siendo una función total sobre el registro y sólo
 * consulta este orden al ordenar.
 *
 * Lo que no aparece en una tabla va detrás, en orden alfabético es-MX: un
 * comando nuevo sigue apareciendo sin que nadie edite este archivo.
 */
import type { CadRibbonTabId } from "./ribbon";

/** Paneles por pestaña, de izquierda a derecha, como en la cinta de AutoCAD. */
export const CAD_RIBBON_PANEL_ORDER: Readonly<Record<CadRibbonTabId, readonly string[]>> = {
  // Sólo paneles que EXISTEN hoy (ribbon.spec.ts lo exige en los dos
  // sentidos): «Portapapeles» volverá con COPYCLIP/PASTECLIP en la Ola D, y
  // los paneles de reposo no hace falta declararlos —lo no declarado va al
  // final—.
  inicio: [
    "Dibujo", "Modificar", "Anotación", "Capas", "Bloque", "Propiedades",
    "Grupos", "Utilidades", "Portapapeles",
  ],
  insertar: ["Referencias", "Importar y extraer", "Ubicación", "Normalizados", "Paletas"],
  anotar: ["Texto y tablas", "Cotas", "Directrices", "Tolerancias", "Mecánica", "Estilos"],
  parametrico: ["Geométricas", "Dimensionales", "Gestionar"],
  vista: ["Encuadre y zoom", "Vistas 3D", "Estilos visuales", "SCU", "Ventanas", "Paletas", "Vistas"],
  solidos3d: ["Primitivas", "Sólido", "Booleanas", "Edición de sólidos", "Consulta 3D"],
  salida: ["Trazar y publicar", "Exportar", "Ventanas"],
  administrar: ["Normas y reparación", "Variables", "AutoLISP y scripts", "Comparar", "Vistas"],
  superficies: ["Superficies", "Arquitectura", "Instalaciones"],
  mallas: ["Mallas"],
};

/**
 * Comandos por panel: los frecuentes primero (el reparto de los paneles Draw,
 * Modify, Annotation, Layers, Block y Properties de AutoCAD); el resto detrás,
 * alfabético. No hay telemetría en el producto —ni debe haberla—, así que la
 * frecuencia es la del oficio, no una medición nuestra.
 */
export const CAD_RIBBON_COMMAND_ORDER: Readonly<Record<string, readonly string[]>> = {
  Dibujo: [
    "LINE", "PLINE", "CIRCLE", "ARC", "RECTANG", "POLYGON", "ELLIPSE", "SPLINE",
    "HATCH", "XLINE", "RAY", "POINT", "DIVIDE", "MEASURE", "DONUT", "REGION", "SOLID",
    "GRADIENT", "BOUNDARY",
  ],
  // Tras los dos grandes (MOVE, COPY), la primera columna de pequeños es
  // Girar · Recortar · Borrar: es la que sobrevive a 1280 px (ribbon-layout)
  // y la que el golden 86 exige a la vista.
  Modificar: [
    "MOVE", "COPY", "ROTATE", "TRIM", "ERASE", "SCALE", "MIRROR", "OFFSET",
    "EXTEND", "FILLET", "CHAMFER", "ARRAY", "STRETCH", "EXPLODE", "BREAK", "JOIN",
    "LENGTHEN", "PEDIT", "ALIGN", "BLEND", "DRAWORDER",
  ],
  Anotación: ["TEXT", "MTEXT", "DIMLINEAR", "DIMALIGNED", "MLEADER", "TABLE"],
  Cotas: [
    "DIMLINEAR", "DIMALIGNED", "DIMANGULAR", "DIMRADIUS", "DIMDIAMETER", "DIMARC",
    "DIMORDINATE", "DIMCONTINUE", "DIMBASELINE", "QDIM", "DIM", "DIMEDIT",
  ],
  "Texto y tablas": ["TEXT", "MTEXT", "DDEDIT", "TEXTALIGN", "TABLE"],
  Capas: [
    "LAYER", "LAYISO", "LAYUNISO", "LAYOFF", "LAYON", "LAYFRZ", "LAYTHW", "LAYMCH",
    "LAYWALK", "LAYERSTATE", "LAYMRG", "VPLAYER", "-LAYER",
  ],
  Bloque: ["INSERT", "BLOCK", "BEDIT", "WBLOCK", "ATTDEF", "ATTEDIT", "BURST", "BASE"],
  Propiedades: ["PROPERTIES", "MATCHPROP", "COLOR", "LINETYPE", "LWEIGHT", "LTSCALE", "CELTSCALE", "-LINETYPE"],
  Utilidades: ["DIST", "AREA", "ID", "LIST", "QSELECT", "FILTER"],
  // El reparto del panel Clipboard de AutoCAD: pegar primero, que es lo que
  // se busca con el ratón; cortar y copiar tienen su tecla.
  Portapapeles: ["PASTECLIP", "CUTCLIP", "COPYCLIP", "COPYBASE", "PASTEORIG"],
  Geométricas: [
    "AUTOCONSTRAIN", "GCCOINCIDENT", "GCCOLLINEAR", "GCCONCENTRIC", "GCFIX", "GCPARALLEL",
    "GCPERPENDICULAR", "GCHORIZONTAL", "GCVERTICAL", "GCTANGENT", "GCSMOOTH", "GCSYMMETRIC",
    "GCEQUAL", "GEOMCONSTRAINT",
  ],
  Dimensionales: ["DCLINEAR", "DCANGULAR", "DCRADIUS", "DCDIAMETER", "DIMCONSTRAINT"],
  // Sólidos 3D, en el orden de la pestaña Solid de AutoCAD.
  Primitivas: ["BOX", "CYLINDER", "SPHERE", "CONE", "WEDGE", "TORUS", "PYRAMID", "POLYSOLID"],
  Sólido: ["EXTRUDE", "PRESSPULL", "REVOLVE", "SWEEP", "LOFT"],
  Booleanas: ["UNION", "SUBTRACT", "INTERSECT", "INTERFERE"],
  "Edición de sólidos": ["SLICE", "FILLETEDGE", "CHAMFEREDGE", "SOLIDEDIT", "SECTION"],
  // Fase 2: superficies.
  Superficies: [
    "PLANESURF", "CONVTOSURFACE", "SURFPATCH", "SURFNETWORK", "SURFBLEND", "SURFEXTEND", "SURFFILLET", "SURFOFFSET", "SURFTRIM", "SURFSCULPT", "SURFUNTRIM",
  ],
  Mallas: ["MESH"],
  Render: ["RENDER", "RENDERPRESETS", "RENDEREXPOSURE", "RENDERENVIRONMENT", "MATERIALS", "MATERIALATTACH", "POINTLIGHT", "SPOTLIGHT", "DISTANTLIGHT", "SUNPROPERTIES"],
};

/**
 * Comandos que ADEMÁS aparecen en Inicio, como el panel Annotation de la
 * pestaña Home de AutoCAD. Es un espejo: la pestaña Anotar los conserva. Un
 * nombre que no exista en el registro hace saltar `buildRibbonTabs` al cargar,
 * para que un cadáver no quede escondido en una tabla.
 */
export const CAD_RIBBON_INICIO_ESPEJOS: Readonly<Record<string, readonly string[]>> = {
  Anotación: ["TEXT", "MTEXT", "DIMLINEAR", "DIMALIGNED", "MLEADER", "TABLE"],
};

/**
 * LOS BOTONES GRANDES de cada panel: uno o dos por panel, como los botones
 * grandes de la cinta de AutoCAD (Línea y Polilínea en Dibujo; Desplazar y
 * Copiar en Modificar; Capa en Capas). Se declara POR PANEL y no como un
 * conjunto plano (así venía en a742a410: veinte nombres sueltos, cinco de
 * ellos en Dibujo y siete en Modificar, sin límite ni validación) para que
 * `ribbon.spec.ts` pueda exigir que todo panel montado tenga entre uno y dos,
 * que todo nombre exista en el registro y que ninguna clave nombre un panel
 * que ya no existe. La selección es por oficio, no por telemetría — el mismo
 * razonamiento que encabeza `CAD_RIBBON_COMMAND_ORDER`.
 *
 * Los demás comandos del panel se pintan como botones pequeños (icono +
 * rótulo, tres filas) y, si no caben, en el desplegable del panel: un
 * primario es «grande y siempre a la vista», no «el único con botón».
 *
 * Un panel con el mismo nombre en dos pestañas (Ventanas, Paletas) declara un
 * primario por cada una: en cada pestaña sólo se monta el que existe ahí.
 */
export const CAD_RIBBON_PRIMARY: Readonly<Record<string, readonly string[]>> = {
  // Inicio.
  Dibujo: ["LINE", "PLINE"],
  Modificar: ["MOVE", "COPY"],
  Anotación: ["MTEXT", "DIMLINEAR"],
  Capas: ["LAYER"],
  Bloque: ["INSERT"],
  Propiedades: ["PROPERTIES", "MATCHPROP"],
  Grupos: ["GROUP"],
  Utilidades: ["DIST"],
  Portapapeles: ["PASTECLIP"],

  // Insertar.
  Referencias: ["XATTACH"],
  "Importar y extraer": ["DXFIN"],
  Ubicación: ["GEOGRAPHICLOCATION"],
  Normalizados: ["STDPART"],
  Paletas: ["ADCENTER", "TOOLPALETTES"],
  // Anotar.
  "Texto y tablas": ["MTEXT", "TABLE"],
  Cotas: ["DIMLINEAR"],
  Directrices: ["MLEADER"],
  Tolerancias: ["TOLERANCE"],
  Mecánica: ["BALLOON"],
  Estilos: ["STYLE", "DIMSTYLE"],
  // Paramétrico.
  Geométricas: ["AUTOCONSTRAIN"],
  Dimensionales: ["DCLINEAR"],
  Gestionar: ["PARAMETERS"],
  // Vista.
  "Encuadre y zoom": ["PAN", "ZOOM"],
  "Vistas 3D": ["3DORBIT"],
  "Estilos visuales": ["VSCURRENT"],
  SCU: ["UCS"],
  Ventanas: ["MSPACE", "MVIEW"],
  // Sólidos 3D.
  Primitivas: ["BOX"],
  Sólido: ["EXTRUDE"],
  Booleanas: ["UNION"],
  "Edición de sólidos": ["SLICE"],
  "Consulta 3D": ["MASSPROP"],
  // Salida.
  "Trazar y publicar": ["PLOT"],
  Exportar: ["DXFOUT"],
  // Administrar.
  "Normas y reparación": ["AUDIT"],
  Variables: ["UNITS"],
  "AutoLISP y scripts": ["SCRIPT"],
  Comparar: ["COMPARE"],
  // Superficies, Arquitectura e Instalaciones (pestaña propia).
  Arquitectura: ["WALL"],
  Instalaciones: ["PIPE"],
  Superficies: ["PLANESURF", "SURFPATCH"],
  Mallas: ["MESH"],
  Render: ["RENDER"],
  Vistas: ["VIEWBASE", "VIEWEDIT", "REGEN"],
};

/**
 * QUÉ PANEL SE PLIEGA PRIMERO cuando la pestaña no cabe en la ventana. Como
 * en AutoCAD, los paneles de la derecha se reducen antes que los de la
 * izquierda: primero pierden columnas de botones pequeños, luego se quedan
 * sólo con sus botones grandes y al final se pliegan a un único botón con
 * el icono del panel. Los paneles que NO aparecen aquí (Dibujo, Modificar y
 * Capas en Inicio; Cotas en Anotar) nunca se pliegan a un botón: son los
 * que el oficio busca primero, y los goldens 61 y 86 pulsan sus comandos por
 * `data-testid` sin abrir nada. Lo que no se declara va detrás, en el orden
 * inverso al de `CAD_RIBBON_PANEL_ORDER`.
 */
export const CAD_RIBBON_PANEL_COLLAPSE_ORDER: Readonly<Record<CadRibbonTabId, readonly string[]>> = {
  inicio: [
    "Portapapeles", "Grupos",
    "Utilidades", "Propiedades", "Bloque",
  ],
  insertar: ["Paletas", "Normalizados", "Ubicación", "Importar y extraer"],
  anotar: ["Mecánica", "Tolerancias", "Estilos", "Directrices", "Texto y tablas"],
  parametrico: ["Gestionar", "Dimensionales"],
  vista: ["Vistas", "Paletas", "Ventanas", "SCU", "Estilos visuales", "Vistas 3D"],
  solidos3d: ["Consulta 3D", "Edición de sólidos", "Booleanas", "Sólido"],
  salida: ["Ventanas", "Exportar"],
  administrar: ["Vistas", "Comparar", "AutoLISP y scripts", "Variables"],
  superficies: ["Instalaciones", "Arquitectura"],
  mallas: [],
};

/** Orden declarado primero; lo que no está en la lista va detrás, alfabético es-MX. */
export function compareDeclared(order: readonly string[] | undefined, a: string, b: string): number {
  const ia = order ? order.indexOf(a) : -1;
  const ib = order ? order.indexOf(b) : -1;
  const ra = ia === -1 ? Number.MAX_SAFE_INTEGER : ia;
  const rb = ib === -1 ? Number.MAX_SAFE_INTEGER : ib;
  if (ra !== rb) return ra - rb;
  return a.localeCompare(b, "es-MX");
}
