/**
 * Corpus sintético del probe de carga: documentos canónicos VÁLIDOS.
 *
 * POR QUÉ NO SE MIDE CON UN DOCUMENTO DE JUGUETE. El coste de guardar no está
 * en el framing HTTP, está en validar el documento entidad por entidad, en
 * decidir si cabe inline o se va a un blob content-addressed y en el CAS. Un
 * `{}` mediría el framing y publicaría cifras que se caen el día que el
 * integrador manda una planta de verdad.
 *
 * POR QUÉ MUROS Y NO RUIDO. Las entidades se generan como una retícula de
 * muros con sus cotas y textos —lo que hay en una planta arquitectónica— para
 * que el validador recorra las mismas ramas que recorrerá en producción. Un
 * documento de mil entidades idénticas comprimiría de forma irreal en la
 * respuesta gzip y falsearía los bytes medidos.
 */

const LAYERS = ['A-MURO', 'A-PUERTA', 'A-COTA', 'TEXTO'] as const;

/**
 * Documento canónico con `entityCount` entidades.
 *
 * Se mezclan líneas, cajas y textos en proporción estable para que dos
 * tamaños del escalón sean comparables entre sí: si la mezcla cambiara con el
 * tamaño, la diferencia de tiempo mediría la mezcla y no la escala.
 */
export function buildLoadDocument(
  entityCount: number,
): Record<string, unknown> {
  const entities: Record<string, unknown>[] = [];
  for (let index = 0; index < entityCount; index += 1) {
    const column = index % 40;
    const row = Math.floor(index / 40);
    const x = column * 1_500;
    const y = row * 1_200;
    const layer = LAYERS[index % LAYERS.length];
    if (index % 5 === 4) {
      entities.push({
        id: `texto-${index}`,
        type: 'text',
        position: { x: x + 120, y: y + 120 },
        text: `EJE ${column + 1}-${row + 1}`,
        layer: 'TEXTO',
      });
    } else if (index % 5 === 3) {
      entities.push({
        id: `zona-${index}`,
        type: 'box',
        x,
        y,
        w: 1_200,
        h: 900,
        kind: 'zone',
        label: `Recámara ${row + 1}.${column + 1}`,
        layer,
      });
    } else {
      entities.push({
        id: `muro-${index}`,
        type: 'line',
        start: { x, y, z: 0 },
        end: { x: x + 1_400, y, z: 0 },
        layer,
      });
    }
  }
  return {
    meta: { schema: 3, version: 1, unit: 'mm' },
    entities,
    blocks: [],
    constraints: [],
    modelSpace: { entityIds: entities.map((entity) => String(entity.id)) },
  };
}
