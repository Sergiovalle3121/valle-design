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
    "Grupos", "Utilidades", "Portapapeles", "Sombreado", "Arquitectura", "Instalaciones", "Sólidos",
  ],
  insertar: ["Referencias", "Importar y extraer", "Ubicación", "Paletas"],
  anotar: ["Texto y tablas", "Cotas", "Directrices", "Tolerancias", "Estilos"],
  parametrico: ["Geométricas", "Dimensionales", "Gestionar"],
  vista: ["Encuadre y zoom", "Vistas 3D", "Estilos visuales", "SCU", "Ventanas", "Paletas", "Vistas"],
  salida: ["Trazar y publicar", "Exportar", "Ventanas"],
  administrar: ["Normas y reparación", "Variables", "AutoLISP y scripts"],
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
    "XLINE", "RAY", "POINT", "DIVIDE", "MEASURE", "DONUT", "REGION", "SOLID",
  ],
  Modificar: [
    "MOVE", "COPY", "ROTATE", "SCALE", "MIRROR", "OFFSET", "TRIM", "EXTEND",
    "FILLET", "CHAMFER", "ARRAY", "STRETCH", "ERASE", "EXPLODE", "BREAK", "JOIN",
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

/** Orden declarado primero; lo que no está en la lista va detrás, alfabético es-MX. */
export function compareDeclared(order: readonly string[] | undefined, a: string, b: string): number {
  const ia = order ? order.indexOf(a) : -1;
  const ib = order ? order.indexOf(b) : -1;
  const ra = ia === -1 ? Number.MAX_SAFE_INTEGER : ia;
  const rb = ib === -1 ? Number.MAX_SAFE_INTEGER : ib;
  if (ra !== rb) return ra - rb;
  return a.localeCompare(b, "es-MX");
}
