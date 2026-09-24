import type { CadPaperSpace } from "./cad-document";
import type { CadEntityCommand } from "./entity-commands";

/** Keeps presentation tabs ordered after upsert, delete or reorder commands. */
export function applyPaperSpaceCommand(
  spaces: readonly CadPaperSpace[],
  command: Extract<CadEntityCommand, { type: "paper-space" }>,
): CadPaperSpace[] {
  const renumber = (list: readonly CadPaperSpace[]): CadPaperSpace[] =>
    [...list]
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id))
      .map((space, order) => (space.order === order ? space : { ...space, order }));

  if (command.op === "delete")
    return renumber(spaces.filter((space) => space.id !== command.spaceId));

  if (command.op === "reorder") {
    const position = new Map(command.spaceIds.map((id, index) => [id, index]));
    // Las pestañas no nombradas conservan su orden relativo detrás de las nombradas.
    return renumber(
      spaces.map((space) => ({
        ...space,
        order: position.get(space.id) ?? command.spaceIds.length + (space.order ?? 0),
      })),
    );
  }

  const exists = spaces.some((space) => space.id === command.space.id);
  return renumber(
    exists
      ? spaces.map((space) => (space.id === command.space.id ? command.space : space))
      : [...spaces, command.space],
  );
}
