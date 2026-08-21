/**
 * La sección TABLES de un DXF: tipos de línea, capas, estilos de texto y de
 * acotación, y los identificadores de aplicación de la XDATA.
 *
 * Sale de `dxf-export.ts` por la razón de siempre —ese archivo está en su
 * asignación exacta del trinquete— y por una que pesa más: las tablas son lo
 * que declara CÓMO se dibuja el fichero, y hasta esta ola no declaraban nada.
 * Toda capa salía con `6 CONTINUOUS` fijo y sin grosor, así que un plano con
 * ejes a trazos y muros de 0,50 mm se devolvía al remitente completamente
 * continuo y todo del mismo grosor, sin un solo aviso. Juntarlas aquí deja ese
 * criterio en un sitio y no repartido por el escritor.
 *
 * Módulo puro: escribe renglones en el array que se le pasa.
 */
import {
  DXF_XDATA_APP_BLOCK,
  DXF_XDATA_APP_DIMENSION,
  DXF_XDATA_APP_MLEADER,
} from "@valle-design/contracts";
import type {
  CadDxfExportLayer,
  CadDxfExportLinetype,
  CadDxfExportModel,
} from "./dxf-export";
import type { CadDxfPrimitive } from "./dxf-import";
import {
  cadDimensionStyleStandardPairs,
  cadDimensionStyleToEntries,
} from "./dimension-style";
import { fmt, pushPair, safeLayerName, safeStyleName, safeText } from "./dxf-write-core";

function layerColor(model: CadDxfExportModel, name: string): number {
  const found = (model.layers ?? []).find(
    (layer) => safeLayerName(layer.name) === name,
  );
  return found?.color ?? 7;
}
function layerDefinition(
  model: CadDxfExportModel,
  name: string,
): CadDxfExportLayer | undefined {
  return (model.layers ?? []).find((layer) => safeLayerName(layer.name) === name);
}

/**
 * Tabla LTYPE.
 *
 * Se escribe SIEMPRE la continua, y detrás los tipos que el modelo declare más
 * los que alguna capa o entidad NOMBRE aunque nadie los definiese. Ese segundo
 * grupo sale con patrón vacío —continuo— y no es un capricho: un fichero que
 * referencia por nombre un LTYPE ausente de la tabla es un fichero inválido, y
 * varios visores lo rechazan entero en vez de degradar esa capa. Vale más un
 * plano que abre con una capa continua que un plano que no abre.
 */
function pushLinetypeTable(lines: string[], model: CadDxfExportModel, layers: string[]) {
  const defined = new Map<string, CadDxfExportLinetype>();
  defined.set("CONTINUOUS", { name: "CONTINUOUS", description: "Solid line", pattern: [] });
  for (const entry of model.linetypes ?? []) {
    // `safeText` y no `safeLayerName`: éste último sustituye el vacío por la
    // capa "0", y una tabla con un LTYPE llamado "0" es un fichero al que
    // ningún visor sabe qué contestar. Un nombre vacío no entra en la tabla.
    const name = safeText(entry.name).toUpperCase();
    if (name) defined.set(name, { ...entry, name });
  }
  const referenced = new Set<string>();
  for (const layer of layers) {
    const name = layerDefinition(model, layer)?.linetype;
    if (name) referenced.add(safeText(name).toUpperCase());
  }
  const collect = (primitives?: CadDxfPrimitive[]) => {
    for (const primitive of primitives ?? []) {
      const value = primitive.presentation?.linetype;
      if (value?.source === "explicit" && value.value)
        referenced.add(safeText(value.value).toUpperCase());
    }
  };
  collect(model.primitives);
  for (const block of model.blocks ?? []) collect(block.primitives);
  for (const name of referenced)
    if (name && !defined.has(name)) defined.set(name, { name, pattern: [] });

  pushPair(lines, 0, "TABLE");
  pushPair(lines, 2, "LTYPE");
  pushPair(lines, 70, defined.size);
  for (const entry of defined.values()) {
    pushPair(lines, 0, "LTYPE");
    pushPair(lines, 2, entry.name);
    pushPair(lines, 70, 0);
    pushPair(lines, 3, safeText(entry.description ?? entry.name));
    // 72 = 65 ("A"): alineación. Es el único valor que emite AutoCAD.
    pushPair(lines, 72, 65);
    pushPair(lines, 73, entry.pattern.length);
    pushPair(lines, 40, fmt(entry.pattern.reduce((total, value) => total + Math.abs(value), 0)));
    for (const value of entry.pattern) pushPair(lines, 49, fmt(value));
  }
  pushPair(lines, 0, "ENDTAB");
}

export function pushLayerTable(
  lines: string[],
  model: CadDxfExportModel,
  layers: string[],
) {
  pushPair(lines, 0, "SECTION");
  pushPair(lines, 2, "TABLES");
  pushLinetypeTable(lines, model, layers);
  pushPair(lines, 0, "TABLE");
  pushPair(lines, 2, "LAYER");
  pushPair(lines, 70, layers.length);
  for (const layer of layers) {
    const definition = layerDefinition(model, layer);
    pushPair(lines, 0, "LAYER");
    pushPair(lines, 2, layer);
    // Bit 1 del código 70: capa congelada. Antes se escribía 0 fijo, así que
    // el fichero devuelto descongelaba lo que el documento decía congelado.
    pushPair(lines, 70, definition?.frozen ? 1 : 0);
    pushPair(lines, 62, layerColor(model, layer));
    // El tipo de línea de la capa es donde un despacho guarda su convención:
    // fijarlo a CONTINUOUS convertía en continuo el plano entero al devolverlo.
    pushPair(lines, 6, safeText(definition?.linetype ?? "") || "CONTINUOUS");
    if (typeof definition?.lineweight === "number")
      pushPair(lines, 370, Math.round(definition.lineweight));
  }
  pushPair(lines, 0, "ENDTAB");
  const textStyles = new Map<string, string>([["Standard", "arial.ttf"]]);
  for (const mtext of model.mtexts ?? []) {
    const name = safeStyleName(mtext.style);
    const family = safeText(mtext.fontFamily ?? "Arial").replace(/[^\w.-]+/g, "").toLowerCase() || "arial";
    textStyles.set(name, family.endsWith(".ttf") || family.endsWith(".shx") ? family : `${family}.ttf`);
  }
  pushPair(lines, 0, "TABLE");
  pushPair(lines, 2, "STYLE");
  pushPair(lines, 70, textStyles.size);
  for (const [name, font] of textStyles) {
    pushPair(lines, 0, "STYLE");
    pushPair(lines, 2, name);
    pushPair(lines, 70, 0);
    pushPair(lines, 40, 0);
    pushPair(lines, 41, 1);
    pushPair(lines, 50, 0);
    pushPair(lines, 71, 0);
    pushPair(lines, 42, 2.5);
    pushPair(lines, 3, font);
    pushPair(lines, 4, "");
  }
  pushPair(lines, 0, "ENDTAB");
  // Tabla DIMSTYLE: la norma de acotación del documento. Cada entrada lleva
  // los DIMVARs con código estándar (la cara para AutoCAD y visores) y la
  // XDATA VALLE_DIM clave=valor (la fidelidad exacta del round-trip propio —
  // colores CSS y campos sin código estándar viajan sólo ahí).
  const dimensionStyles = Object.entries(model.dimensionStyles ?? {});
  if (dimensionStyles.length > 0) {
    pushPair(lines, 0, "TABLE");
    pushPair(lines, 2, "DIMSTYLE");
    pushPair(lines, 70, dimensionStyles.length);
    for (const [name, definition] of dimensionStyles) {
      pushPair(lines, 0, "DIMSTYLE");
      pushPair(lines, 2, safeStyleName(name));
      pushPair(lines, 70, 0);
      for (const [code, value] of cadDimensionStyleStandardPairs(definition))
        pushPair(lines, code, typeof value === "number" ? fmt(value) : safeText(value));
      const entries = cadDimensionStyleToEntries(definition);
      if (entries.length > 0) {
        pushPair(lines, 1001, DXF_XDATA_APP_DIMENSION);
        for (const [key, value] of entries)
          pushPair(lines, 1000, `${key}=${safeText(value)}`);
      }
    }
    pushPair(lines, 0, "ENDTAB");
  }
  pushPair(lines, 0, "TABLE");
  pushPair(lines, 2, "APPID");
  pushPair(lines, 70, 3);
  pushPair(lines, 0, "APPID");
  pushPair(lines, 2, DXF_XDATA_APP_DIMENSION);
  pushPair(lines, 70, 0);
  pushPair(lines, 0, "APPID");
  pushPair(lines, 2, DXF_XDATA_APP_MLEADER);
  pushPair(lines, 70, 0);
  pushPair(lines, 0, "APPID");
  pushPair(lines, 2, DXF_XDATA_APP_BLOCK);
  pushPair(lines, 70, 0);
  pushPair(lines, 0, "ENDTAB");
  pushPair(lines, 0, "ENDSEC");
}
