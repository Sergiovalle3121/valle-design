/**
 * Las CAPAS de un DWG traducidas al documento del producto.
 *
 * Vive aparte de `dwg-document-bridge.ts` desde el 2026-09-01, cuando el
 * intake del tipo de línea por capa empujó aquel archivo por encima del
 * presupuesto de monolito. La costura tiene sentido propio: aquí está todo lo
 * que decide qué SABE el producto de una capa —su color, su estado, su tipo
 * de línea— y, sobre todo, qué DECLARA cuando no lo sabe; allá queda la
 * traducción de entidades y bloques, que es otro trabajo.
 *
 * La regla que gobierna este archivo entero: lo que no se midió no se
 * rellena. Ni un color plausible, ni un estado por defecto, ni un
 * `CONTINUOUS` que el archivo no dice. Cada ausencia sale en el manifiesto de
 * pérdidas, que es donde el usuario la lee.
 */
import type { CadLayerDef, CadLossManifestEntry } from "./cad-document";
import { aciToHex } from "./plot/aci-palette";
import { decodeCodePageBytes } from "./dwg-document-bridge-primitives";
import type { DwgNeutralLayer } from "./dwg-neutral-model";
import { DWG_BRIDGE_LOSS_CODES } from "./dwg-document-bridge";

/**
 * Gris neutro DELIBERADAMENTE distinto de cualquier ACI básico: sin color
 * decodificado hay que pintar ALGO —el lienzo no puede no dibujar— y lo que
 * se pinta tiene que verse que no es el color del archivo.
 */
const LAYER_COLOR_NOT_DECODED = "#8a8f98";

export function mapLayers(layers: readonly DwgNeutralLayer[]): {
  names: Map<number, string>;
  definitions: CadLayerDef[];
  losses: CadLossManifestEntry[];
} {
  const names = new Map<number, string>();
  const losses: CadLossManifestEntry[] = [];
  const seen = new Set<string>();
  const definitions: CadLayerDef[] = [
    // RESPALDO, NO GANADOR (2026-09-01). ACI 7 es el color por defecto
    // tradicional de la capa "0" (blanco/negro según fondo) — no es un dato
    // del archivo. Sirve para que la capa "0" exista aunque la base neutral no
    // traiga ninguna capa, porque toda entidad cuya capa no resuelve cae aquí.
    // Hasta este corte, además, GANABA: `seen` venía sembrado con "0", así que
    // la capa "0" REAL del archivo entraba en el bucle y se descartaba entera
    // —color, estado y tipo de línea— sin declarar ni una pérdida. Medido: los
    // 57 fixtures del corpus traen capa "0" con tipo de línea resuelto
    // (CONTINUOUS ×27, Continuous ×30) y los 57 lo perdían en silencio.
    { id: "0", name: "0", color: aciToHex(7), visible: true, locked: false },
  ];

  for (const layer of layers) {
    const name = decodeCodePageBytes(layer.name);
    names.set(layer.handle, name);
    if (layer.name.some((byte) => byte > 0x7f)) {
      losses.push({
        code: DWG_BRIDGE_LOSS_CODES.codePage,
        sourceType: "layer",
        detail: `El nombre de la capa ${layer.handle} lleva bytes fuera de ASCII y la página de códigos del dibujo no se decodifica: se leyó como Latin-1.`,
        severity: "warning",
      });
    }
    // ESTADO DE LA CAPA — MEDIDO, NO ADIVINADO (2026-09-01). Hasta este corte
    // aquí se declaraba una pérdida y toda capa entraba visible y desbloqueada:
    // una capa CONGELADA se dibujaba igual que las demás. La sonda
    // `probe-layer-state-flags.mjs` midió los dos bits contra el oráculo DXF
    // del mismo dibujo —98 capas, 57 fixtures, las cinco versiones— y el
    // adaptador autorizado los entrega ya resueltos. Este puente NO reinterpreta
    // el `BS`: un segundo criterio de «qué bit es congelada» es justo lo que
    // ninguna prueba vería divergir.
    if (layer.frozen === undefined || layer.locked === undefined) {
      losses.push({
        code: DWG_BRIDGE_LOSS_CODES.layerStateFlags,
        sourceType: "layer",
        detail: `La capa "${name}" (handle ${layer.handle}) viene sin banderas de estado decodificadas: no se afirma que esté visible ni descongelada, y se importa visible y desbloqueada.`,
        severity: "warning",
      });
    } else if (layer.unmeasuredStateBits) {
      losses.push({
        code: DWG_BRIDGE_LOSS_CODES.layerStateFlags,
        sourceType: "layer",
        detail: `La capa "${name}" (handle ${layer.handle}) trae banderas de estado ${layer.stateFlags}, cuyos bits 0x${layer.unmeasuredStateBits.toString(16)} se apartan del patrón constante del corpus medido: se aplican congelada y bloqueada, y el resto del estado no se interpreta.`,
        severity: "info",
      });
    }
    // EL TIPO DE LÍNEA DE LA CAPA. Hasta el 2026-09-01 se perdía entero: el
    // laboratorio leía la tabla LTYPE y las capas, pero no QUIÉN USA CUÁL, así
    // que una capa de ejes con TRAZOS salía del import sin tipo de línea y una
    // reexportación a DXF ya no lo llevaba. Se declara cuando falta.
    if (!layer.linetypeName) {
      losses.push({
        code: DWG_BRIDGE_LOSS_CODES.layerLinetype,
        sourceType: "layer",
        detail: `La capa "${name}" (handle ${layer.handle}) no trae un tipo de línea resoluble: se importa sin declararlo, en vez de suponer CONTINUOUS.`,
        severity: "warning",
      });
    }
    // EL COLOR QUE NO SE DECODIFICÓ. Se pinta un gris neutro porque el lienzo
    // no puede no dibujar, y se DICE: hasta el 2026-09-01 el comentario de
    // abajo afirmaba que esta pérdida constaba en el manifiesto y no constaba
    // en ninguna parte. El corpus admitido no ejerce este camino —131 capas,
    // las 131 con color— así que esto cierra un camino alcanzable, no medido.
    if (layer.colorIndex === undefined) {
      losses.push({
        code: DWG_BRIDGE_LOSS_CODES.layerColor,
        sourceType: "layer",
        detail: `La capa "${name}" (handle ${layer.handle}) viene sin color decodificado: se dibuja en un gris neutro que NO es el color del archivo, en vez de suponer uno plausible.`,
        severity: "warning",
      });
    }
    // LA CAPA APAGADA NO SE MIDE Y NO SE AFIRMA. El DXF la codifica con color
    // NEGATIVO y el corpus admitido no trae ni una sola capa apagada, así que
    // el estado apagado/encendido no es falsable con esta evidencia: `visible`
    // se queda en `true` siempre y una capa apagada de un dibujo real entraría
    // encendida. La CONGELACIÓN sí se midió, y el producto ya la modela como
    // un estado propio —ni se dibuja, ni se regenera, ni entra en selección—,
    // así que viaja en `frozen` y no plegada en `visible`.
    if (seen.has(name)) continue;
    seen.add(name);
    const definition: CadLayerDef = {
      id: name,
      name,
      // ACI real del archivo (índices 1–9/250–255 exactos, 10–249 por rampa
      // reproducible) en vez de una paleta rotatoria inventada por posición.
      // Sin color decodificado hay que pintar ALGO —el lienzo no puede no
      // dibujar—, así que se usa un gris neutro DELIBERADAMENTE distinto de
      // cualquier ACI básico: que se vea que no es el color del archivo. La
      // pérdida `dwg_layer_color_not_decoded` de arriba lo declara en el
      // manifiesto, que es donde el usuario lo lee y no un toast que se va.
      color:
        layer.colorIndex === undefined
          ? LAYER_COLOR_NOT_DECODED
          : aciToHex(layer.colorIndex),
      // Sin estado decodificado se importa visible y desbloqueada, que es lo
      // único que se puede hacer sin inventar — y la pérdida de arriba lo
      // declara. Con estado, se respeta el archivo.
      visible: true,
      locked: layer.locked ?? false,
      ...(layer.frozen === undefined ? {} : { frozen: layer.frozen }),
      // Mismo modismo que el import DXF, que ya rellenaba este campo: se pone
      // sólo cuando se sabe. Sin tipo de línea el campo queda AUSENTE, y el
      // resto del producto ya trata la ausencia como «continua» donde le hace
      // falta — que es distinto de que el archivo dijera CONTINUOUS.
      ...(layer.linetypeName ? { linetype: layer.linetypeName } : {}),
    };
    // La capa "0" del ARCHIVO manda sobre el respaldo sintético y ocupa su
    // sitio: sigue siendo la primera —hay código que cuenta con que exista— y
    // ahora lleva lo que el archivo dice, no lo que se supuso antes de leerlo.
    // Se sustituye en vez de añadirse: dos capas "0" en el documento serían un
    // dato inventado, y la de más abajo tampoco la vería nadie.
    if (name === "0") definitions[0] = definition;
    else definitions.push(definition);
  }
  return { names, definitions, losses };
}
