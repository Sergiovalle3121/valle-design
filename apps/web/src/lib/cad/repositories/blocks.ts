import type { CadBlockCreate, CadBlockUpdate } from "@valle/design-sdk";
import { designClient } from "./client";
export const blocksRepository = {
  list: designClient.blocks.list,
  get: (blockId: string) => designClient.blocks.get(blockId),
  create: (input: CadBlockCreate) => designClient.blocks.create(input),
  update: (blockId: string, patch: CadBlockUpdate) =>
    designClient.blocks.update(blockId, patch),
  remove: (blockId: string) => designClient.blocks.remove(blockId),
};
