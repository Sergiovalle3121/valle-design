/**
 * ADCENTER: traerse definiciones de OTROS dibujos.
 *
 * ## Es un LECTOR
 *
 * DesignCenter no edita el dibujo de origen: sólo COPIA definiciones al actual
 * —bloques, capas y estilos—. Aquí eso es literal: todas las funciones de este
 * módulo son puras y las órdenes que emiten sólo escriben en el documento
 * anfitrión.
 *
 * ## De dónde salen los «otros dibujos», hoy
 *
 * De las referencias externas YA ADJUNTADAS. Cuando se adjunta un xref, su
 * contenido se proyecta en la tabla de bloques del anfitrión con el prefijo
 * `xref:<id>:` — es decir, las definiciones del otro dibujo ya están AQUÍ, sólo
 * que marcadas como pertenecientes a la referencia. ADCENTER las ofrece como
 * origen y las copia como bloques LOCALES, que es exactamente lo que hace
 * DesignCenter cuando arrastras un bloque de un plano a otro.
 *
 * Eso hace que ADCENTER funcione entero sin I/O. Navegar por la biblioteca
 * completa del inquilino —dibujos que todavía no están adjuntados— exige traer
 * su contenido, y eso lo aportará el anfitrión por `context.xrefCatalog`
 * cuando el panel exista; queda anotado en el PR.
 *
 * ## Los nombres se DESAMBIGUAN, no se pisan
 *
 * Copiar un bloque llamado `PUERTA` a un dibujo que ya tiene un `PUERTA`
 * distinto no puede sobrescribir el del anfitrión: cambiaría en silencio todas
 * sus inserciones. Se copia como `PUERTA(2)` y se dice.
 */
import type { CadDocument } from "../cad-document";
import type { CadEntityCommand } from "../entity-commands";

type CadDesignCenterDocument = Pick<
  CadDocument,
  "blocks" | "layers" | "externalReferences"
>;

export interface CadDesignCenterSource {
  id: string;
  name: string;
  /** De dónde sale: hoy siempre una referencia externa adjuntada. */
  kind: "xref";
  blockCount: number;
  layerCount: number;
  layoutCount: number;
}

export interface CadDesignCenterItem {
  kind: "block" | "layer";
  /** Identificador dentro del origen. */
  id: string;
  /** Nombre que ve el usuario, ya sin el prefijo de la referencia. */
  name: string;
  detail: string;
}

const fold = (value: string) => value.trim().toLocaleLowerCase();

/** `PLANTA|PUERTA` → `PUERTA`. El prefijo es del proyector, no del dibujante. */
const localName = (name: string) => name.replace(/^[^|]*\|/, "");

const projectionPrefix = (xrefId: string) => `xref:${xrefId.trim().replace(/[^a-z0-9_.:-]+/gi, "-").slice(0, 96) || "xref"}:`;

export function cadDesignCenterSources(document: CadDesignCenterDocument): CadDesignCenterSource[] {
  return document.externalReferences
    .map((reference) => {
      const prefix = projectionPrefix(reference.id);
      const blocks = document.blocks.filter(
        (block) => block.id.startsWith(prefix) && block.id !== `${prefix}root`,
      );
      const layers = document.layers.filter((layer) => layer.id === `${prefix}layer`);
      return {
        id: reference.id,
        name: reference.name,
        kind: "xref" as const,
        blockCount: blocks.length,
        layerCount: layers.length,
        // Las láminas del dibujo referenciado no se proyectan: un xref aporta
        // su espacio de MODELO. Se declara 0 en vez de omitir el campo, para
        // que la interfaz no insinúe que hay algo que traer.
        layoutCount: 0,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function cadDesignCenterInventory(
  document: CadDesignCenterDocument,
  sourceKey: string,
): CadDesignCenterItem[] {
  const reference =
    document.externalReferences.find((candidate) => candidate.id === sourceKey) ??
    document.externalReferences.find((candidate) => fold(candidate.name) === fold(sourceKey));
  if (!reference) throw new Error(`No hay ningún origen llamado ${sourceKey}.`);
  const prefix = projectionPrefix(reference.id);
  const items: CadDesignCenterItem[] = document.blocks
    .filter((block) => block.id.startsWith(prefix) && block.id !== `${prefix}root`)
    .map((block) => ({
      kind: "block" as const,
      id: block.id,
      name: localName(block.name),
      detail: `${block.entities.length} objetos`,
    }));
  for (const layer of document.layers.filter((candidate) => candidate.id === `${prefix}layer`))
    items.push({ kind: "layer", id: layer.id, name: layer.name, detail: "capa de la referencia" });
  return items.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
}

/** Nombre libre en el anfitrión: `PUERTA`, `PUERTA(2)`, `PUERTA(3)`… */
function freeName(taken: ReadonlySet<string>, wanted: string): string {
  if (!taken.has(fold(wanted))) return wanted;
  for (let index = 2; index < 1_000; index += 1) {
    const candidate = `${wanted}(${index})`;
    if (!taken.has(fold(candidate))) return candidate;
  }
  throw new Error(`No hay ningún nombre libre para ${wanted}.`);
}

export interface CadDesignCenterCopy {
  commands: CadEntityCommand[];
  /** Qué se copió y con qué nombre acabó. La interfaz lo enseña. */
  copied: Array<{ from: string; to: string; renamed: boolean }>;
}

/**
 * Copia definiciones del origen al anfitrión.
 *
 * Los bloques se copian con ID NUEVO y sin el marcaje de la referencia: dejar
 * el `xref:` en el id haría que desligar la referencia se llevase por delante
 * la copia, que es justo lo contrario de lo que se pidió al copiarla.
 */
export function cadDesignCenterCopyCommands(
  document: CadDesignCenterDocument,
  sourceKey: string,
  names: readonly string[],
): CadDesignCenterCopy {
  const inventory = cadDesignCenterInventory(document, sourceKey);
  const wanted =
    names.length === 1 && names[0] === "*"
      ? inventory
      : names.map((name) => {
          const item = inventory.find((candidate) => fold(candidate.name) === fold(name));
          if (!item) throw new Error(`El origen no tiene ningún elemento llamado ${name}.`);
          return item;
        });
  if (wanted.length === 0) throw new Error("El origen no tiene nada que copiar.");

  const takenBlockNames = new Set(document.blocks.map((block) => fold(block.name)));
  const takenBlockIds = new Set(document.blocks.map((block) => block.id));
  const takenLayerNames = new Set(document.layers.map((layer) => fold(layer.name)));
  const commands: CadEntityCommand[] = [];
  const copied: CadDesignCenterCopy["copied"] = [];
  const mapping = new Map<string, { id: string; name: string }>();
  const order: string[] = [];
  // La geometría proyectada vive en la capa BLOQUEADA de la referencia. Copiarla
  // tal cual ataría la copia a esa capa: desligar el xref se encontraría la capa
  // ocupada por algo que ya no le pertenece, y no podría retirarla. Se reapunta
  // a la copia de la capa si también se pidió, y si no, a la `0`.
  const layerMapping = new Map<string, string>();

  for (const item of wanted) {
    if (item.kind === "layer") {
      const layer = document.layers.find((candidate) => candidate.id === item.id)!;
      const name = freeName(takenLayerNames, localName(layer.name));
      takenLayerNames.add(fold(name));
      const id = freeName(new Set([...document.layers.map((candidate) => fold(candidate.id))]), name);
      commands.push({
        type: "layer",
        op: "upsert",
        // La capa se copia DESBLOQUEADA: la del xref está bloqueada porque su
        // contenido no es editable, y la copia sí lo es.
        layer: { ...layer, id, name, locked: false },
      });
      layerMapping.set(layer.id, id);
      copied.push({ from: layer.name, to: name, renamed: name !== localName(layer.name) });
      continue;
    }
    plan(document, item.id, { takenBlockNames, takenBlockIds, mapping, order });
  }

  // Los bloques se emiten de CONTENIDO a CONTENEDOR: la tabla rechaza una
  // definición que inserta un bloque que todavía no existe… y aunque no lo
  // hiciera, dejar el INSERT apuntando al bloque del xref haría que desligar la
  // referencia se llevase por delante la copia.
  const xrefLayers = new Set(
    document.layers.filter((layer) => layer.id.startsWith("xref:")).map((layer) => layer.id),
  );
  const targetLayer = (layer: string) => layerMapping.get(layer) ?? (xrefLayers.has(layer) ? "0" : layer);
  for (const sourceId of order) {
    const block = document.blocks.find((candidate) => candidate.id === sourceId)!;
    const target = mapping.get(sourceId)!;
    commands.push({
      type: "block",
      op: "define",
      definition: {
        ...structuredClone(block),
        id: target.id,
        name: target.name,
        entities: block.entities.map((entity, index) => {
          const clone = {
            ...structuredClone(entity),
            id: `${target.id}:entity:${index}`,
            layer: targetLayer(entity.layer),
          };
          return clone.type === "insert"
            ? { ...clone, block: mapping.get(clone.block)?.id ?? clone.block }
            : clone;
        }),
        library: { scope: "document" },
        version: 1,
      },
    });
    if (wanted.some((item) => item.id === sourceId))
      copied.push({
        from: localName(block.name),
        to: target.name,
        renamed: target.name !== localName(block.name),
      });
  }
  return { commands, copied };
}

interface CopyPlan {
  takenBlockNames: Set<string>;
  takenBlockIds: Set<string>;
  mapping: Map<string, { id: string; name: string }>;
  /** Ids de origen en orden de emisión: contenido antes que contenedor. */
  order: string[];
}

/**
 * Reserva nombre e id para un bloque y, ANTES, para todo lo que contiene.
 *
 * Copiar un bloque que inserta otro sin traerse el segundo deja una definición
 * rota en cuanto se desliga la referencia de la que salió. Se copia el árbol
 * entero, y los INSERT se reapuntan a las copias.
 */
function plan(document: CadDesignCenterDocument, sourceId: string, state: CopyPlan): void {
  if (state.mapping.has(sourceId)) return;
  const block = document.blocks.find((candidate) => candidate.id === sourceId);
  if (!block) return;
  // Se marca ANTES de bajar para que un ciclo —que la tabla no debería
  // permitir, pero que un documento importado sí puede traer— no cuelgue esto.
  const name = freeName(state.takenBlockNames, localName(block.name));
  state.takenBlockNames.add(fold(name));
  const id = freeName(
    new Set([...state.takenBlockIds].map(fold)),
    `block:${fold(name).replace(/[^a-z0-9]+/g, "-") || "bloque"}`,
  );
  state.takenBlockIds.add(id);
  state.mapping.set(sourceId, { id, name });
  for (const child of block.entities)
    if (child.type === "insert") plan(document, child.block, state);
  state.order.push(sourceId);
}
