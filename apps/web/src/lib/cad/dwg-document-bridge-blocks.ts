import type { CadBlockDefinition, CadEntity, CadLossManifestEntry } from "./cad-document";

type Insert = Extract<CadEntity, { type: "insert" }>;
type BlockParts = { blocks: CadBlockDefinition[]; inserts: Insert[] };

/**
 * Un INSERT sólo es contenido útil si alcanza geometría representable.
 * Tras filtrar el perfil, una definición puede quedar vacía: conservar sus
 * instancias produciría un éxito invisible. Propagación inversa O(bloques +
 * referencias), sin recursión: también termina frente a ciclos hostiles.
 */
export function retainDrawableDwgBlocks(parts: BlockParts): BlockParts & { losses: CadLossManifestEntry[] } {
  const productive = new Set<string>();
  const parents = new Map<string, Set<string>>();
  const pending: string[] = [];
  for (const block of parts.blocks) {
    if (block.entities.some((entity) => entity.type !== "insert")) {
      productive.add(block.id);
      pending.push(block.id);
    }
    for (const entity of block.entities) {
      if (entity.type !== "insert") continue;
      const references = parents.get(entity.block) ?? new Set<string>();
      references.add(block.id);
      parents.set(entity.block, references);
    }
  }
  for (let index = 0; index < pending.length; index += 1) {
    for (const parent of parents.get(pending[index]) ?? []) {
      if (productive.has(parent)) continue;
      productive.add(parent);
      pending.push(parent);
    }
  }

  const losses: CadLossManifestEntry[] = [];
  const keepInsert = (insert: Insert): boolean => {
    if (productive.has(insert.block)) return true;
    losses.push({
      code: "dwg_unrenderable_insert_excluded",
      sourceType: "insert",
      detail: `La inserción ${insert.id} no se importó: su bloque no resuelve a geometría representable en el perfil 2D.`,
      severity: "warning",
    });
    return false;
  };
  const blocks: CadBlockDefinition[] = [];
  for (const block of parts.blocks) {
    if (!productive.has(block.id)) {
      losses.push({
        code: "dwg_empty_block_excluded",
        sourceType: "block",
        detail: `El bloque "${block.name}" no se importó: después de aplicar el perfil 2D no contiene geometría representable.`,
        severity: "warning",
      });
      continue;
    }
    blocks.push({
      ...block,
      entities: block.entities.filter((entity) => entity.type !== "insert" || keepInsert(entity)),
    });
  }
  return { blocks, inserts: parts.inserts.filter(keepInsert), losses };
}
