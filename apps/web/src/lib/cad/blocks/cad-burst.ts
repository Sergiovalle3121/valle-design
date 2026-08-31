/**
 * BURST: explotar un bloque SIN perder sus atributos.
 *
 * ## El defecto concreto que esto corrige
 *
 * `EXPLODE` (en `engine/commands/modify-join.ts`, vía `resolveCadInsert`)
 * resuelve un INSERT a la geometría de su definición, y ahí dentro un
 * atributo es un ATTDEF: la geometría del RÓTULO —tag, valor por defecto—,
 * no el VALOR que esta inserción concreta escribió. Un bloque «TÍTULO» con
 * el atributo `NOMBRE=Cocina` se explota y dice `NOMBRE`, no `Cocina`. Ésa es
 * la pérdida que EXPLODE tiene y BURST no: los ATTDEF resueltos se descartan
 * aquí y se sustituyen por TEXT con el valor real de la inserción.
 *
 * ## De dónde sale la posición del atributo, y qué se degrada
 *
 * La fuente buena es `insert.positionedAttributes`: geometría YA resuelta
 * para esta inserción exacta (posición, altura, rotación, estilo — ver
 * `CadPositionedAttribute` en `cad-entities-v4.ts`). Cuando el documento no
 * la trae —sólo `insert.attributes`, el mapa tag→valor sin geometría—, BURST
 * no INVENTA una posición transformando el ATTDEF de la definición: eso
 * exigiría reproducir la matriz de resolución completa de
 * `professional-blocks.ts` (rotación + escala no uniforme + reflexión) para
 * un caso que ya está marcado como degradado. Se apila cada atributo bajo el
 * punto de inserción, EN ORDEN, y se declara la degradación en el resultado
 * — nunca en silencio.
 */
import type { CadBlockDefinition, CadEntity } from "../cad-document";
import type { CadEntityCommand } from "../entity-commands";
import type { CadNativeEntity } from "../entity-runtime";
import { resolveCadInsert } from "../professional-blocks";

type CadInsertEntity = Extract<CadEntity, { type: "insert" }>;

export interface CadBurstOutcome {
  commands: readonly CadEntityCommand[];
  geometryPieces: number;
  attributeTexts: number;
  /** `true` cuando los atributos se apilaron por falta de geometría posicionada. */
  degradedAttributePlacement: boolean;
}

const STACK_LINE_HEIGHT = 2.5;

function attributeStackPosition(insert: CadInsertEntity, index: number): { x: number; y: number } {
  return { x: insert.insertion.x, y: insert.insertion.y - index * STACK_LINE_HEIGHT };
}

export function cadBurstCommands(
  insert: CadInsertEntity,
  context: {
    blocks: () => readonly CadBlockDefinition[];
    newEntityId: () => string;
  },
): CadBurstOutcome | string {
  const blocks = context.blocks();
  const block = blocks.find((candidate) => candidate.id === insert.block || candidate.name === insert.block);
  if (!block) return `BURST: el bloque «${insert.block}» no existe; no se hizo nada.`;

  const resolved = resolveCadInsert({ blocks: [...blocks], entities: [insert] }, insert);
  if (resolved.diagnostics.some((diagnostic) => diagnostic.severity === "error"))
    return `BURST: ${resolved.diagnostics.map((diagnostic) => diagnostic.detail).join(" ")}`;

  const geometryPieces: CadNativeEntity[] = resolved.entities
    .filter((entity) => entity.type !== "attdef")
    .map((entity) => ({ ...structuredClone(entity), id: context.newEntityId() }) as CadNativeEntity);

  const attributeTexts: CadNativeEntity[] = [];
  let degradedAttributePlacement = false;

  if (insert.positionedAttributes?.length) {
    for (const attribute of insert.positionedAttributes) {
      attributeTexts.push({
        id: context.newEntityId(),
        type: "text",
        x: attribute.insertion.x,
        y: attribute.insertion.y,
        text: attribute.value,
        layer: insert.layer,
        ...(attribute.height !== undefined ? { height: attribute.height } : {}),
        ...(attribute.rotation !== undefined ? { rotation: attribute.rotation } : {}),
        ...(attribute.style ? { style: attribute.style } : {}),
      } as CadNativeEntity);
    }
  } else if (insert.attributes && Object.keys(insert.attributes).length > 0) {
    degradedAttributePlacement = true;
    Object.entries(insert.attributes).forEach(([tag, value], index) => {
      const definition = block.attributes?.[tag];
      const position = attributeStackPosition(insert, index);
      attributeTexts.push({
        id: context.newEntityId(),
        type: "text",
        x: position.x,
        y: position.y,
        text: value,
        layer: insert.layer,
        ...(definition?.height !== undefined ? { height: definition.height } : {}),
        ...(definition?.style ? { style: definition.style } : {}),
      } as CadNativeEntity);
    });
  }

  if (geometryPieces.length === 0 && attributeTexts.length === 0)
    return `BURST: el bloque «${insert.block}» no aportó ninguna pieza; no se hizo nada.`;

  const commands: CadEntityCommand[] = [
    ...geometryPieces.map((entity): CadEntityCommand => ({ type: "insert", entity })),
    ...attributeTexts.map((entity): CadEntityCommand => ({ type: "insert", entity })),
    { type: "delete", entityId: insert.id },
  ];

  return { commands, geometryPieces: geometryPieces.length, attributeTexts: attributeTexts.length, degradedAttributePlacement };
}
