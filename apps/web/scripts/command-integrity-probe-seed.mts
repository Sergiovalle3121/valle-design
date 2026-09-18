/**
 * El DOCUMENTO BASE de la sonda de integridad de comandos.
 *
 * Vive aparte de `command-integrity-probe.mts` por una razón concreta: la sonda
 * EJECUTA los 294 comandos en cuanto se importa, así que el spec de las reglas
 * —que comprueba los invariantes de la probeta— no puede importarla para
 * conseguir la semilla. Y duplicar las siete entidades en el spec sería peor:
 * la pasada base tiene que ser el documento de siempre BIT A BIT, y dos copias
 * de un fixture divergen el día que alguien toca una.
 *
 * Estas siete entidades son intocables. La pasada `plano2d` de la sonda las usa
 * exactamente como estaban antes de que existiera la probeta de sólidos y
 * lámina, para que ningún comando ya medido pueda perder su veredicto por el
 * cambio de fixture.
 */
import { migrateCadDocument, type CadDocument } from "../src/lib/cad/cad-document";

/**
 * Documento de prueba: geometría variada y capas.
 *
 * Se reconstruye ENTERO en cada llamada —la sonda lo pide una vez por comando y
 * por pasada— para que nada se arrastre de un comando al siguiente.
 *
 * El `meta` entra en el esquema 4 a propósito: `migrateCadDocument` lo sube al
 * actual y rellena los defectos, que es el mismo camino por el que entra un
 * dibujo guardado hace meses.
 */
export function probeDocumentSeed(): CadDocument {
  return migrateCadDocument({
    meta: { version: 1, schema: 4, unit: "mm" },
    layers: [
      { id: "0", name: "0", color: "#ffffff", visible: true, locked: false },
      { id: "muro", name: "MURO", color: "#ff0000", visible: true, locked: false },
      { id: "cotas", name: "COTAS", color: "#00ff00", visible: true, locked: false },
    ],
    entities: [
      { id: "l1", type: "line", layer: "0", start: { x: 0, y: 0 }, end: { x: 100, y: 0 } },
      { id: "l2", type: "line", layer: "0", start: { x: 50, y: -20 }, end: { x: 50, y: 60 } },
      { id: "l3", type: "line", layer: "MURO", start: { x: 0, y: 30 }, end: { x: 100, y: 30 } },
      { id: "c1", type: "circle", layer: "0", center: { x: 150, y: 20 }, radius: 15 },
      {
        id: "p1",
        type: "polyline",
        layer: "0",
        closed: true,
        vertices: [
          { x: 200, y: 0 },
          { x: 260, y: 0 },
          { x: 260, y: 40 },
          { x: 200, y: 40 },
        ],
      },
      // `x`/`y`, no `position`: la unión `CadEntity` define el texto nativo con
      // x/y (cad-document.ts) y ningún migrador convierte `position`. Con
      // `position`, t1 entraba en el documento SIN coordenadas, TEXTALIGN leía
      // entity.x/entity.y → undefined, proyectaba {NaN, NaN} y lo escribía tal
      // cual: el texto no se movía y el gate lo contaba como «muta». El mismo
      // NaN se propagaba por ALIGN, MOVE, ROTATE, COPY, MIRROR, ARRAY, TCOUNT,
      // LAYMCH y GROUP. Estaba así en main, heredado bit a bit; arreglarlo
      // cambia la pasada plano2d, y por eso se vuelve a medir.
      { id: "t1", type: "text", layer: "COTAS", x: 10, y: 80, text: "PRUEBA", height: 5 },
      { id: "a1", type: "arc", layer: "0", center: { x: 320, y: 20 }, radius: 20, startAngle: 0, endAngle: 180 },
    ],
  } as never);
}
