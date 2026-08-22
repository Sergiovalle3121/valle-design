"use client";

import { useMemo, useState } from "react";
import type { CadBlockDefinition } from "@/lib/cad/cad-document";
import {
  buildCadBlockThumbnail,
  searchCadBlocks,
} from "@/lib/cad/professional-blocks";

export interface CadBlockDefinitionDraft {
  name: string;
  description: string;
  keywords: string[];
  attributeTag?: string;
  attributeDefault?: string;
  tenantLibrary: boolean;
  businessEntityType?: string;
  businessEntityId?: string;
}

export interface CadBlockInsertDraft {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  attributes: Record<string, string>;
}

interface CadBlockPaletteProps {
  docked?: boolean;
  blocks: CadBlockDefinition[];
  selectedEntityCount: number;
  selectedInsert?: { id: string; block: string } | null;
  defaultPoint: { x: number; y: number };
  onDefine(draft: CadBlockDefinitionDraft): void;
  onInsert(blockId: string, draft: CadBlockInsertDraft): void;
  onRedefine(blockId: string): void;
  onReplace(sourceBlock: string, targetBlock: string): void;
  onExplode(insertId: string): void;
  onPurge(): void;
}

function parseAttributes(value: string): Record<string, string> {
  return Object.fromEntries(
    value
      .split(/\r?\n/)
      .map((line) => {
        const separator = line.indexOf("=");
        return separator > 0
          ? [line.slice(0, separator).trim(), line.slice(separator + 1).trim()]
          : null;
      })
      .filter((entry): entry is [string, string] => !!entry?.[0]),
  );
}

export function CadBlockPalette({
  blocks,
  selectedEntityCount,
  selectedInsert,
  defaultPoint,
  onDefine,
  onInsert,
  onRedefine,
  onReplace,
  onExplode,
  onPurge,
  docked,
}: CadBlockPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedBlock, setSelectedBlock] = useState(blocks[0]?.id ?? "");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [keywords, setKeywords] = useState("");
  const [attributeTag, setAttributeTag] = useState("");
  const [attributeDefault, setAttributeDefault] = useState("");
  const [tenantLibrary, setTenantLibrary] = useState(false);
  const [businessEntityType, setBusinessEntityType] = useState("");
  const [businessEntityId, setBusinessEntityId] = useState("");
  const [insert, setInsert] = useState({
    x: defaultPoint.x,
    y: defaultPoint.y,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    attributes: "",
  });
  const visibleBlocks = useMemo(
    () => searchCadBlocks(blocks, query),
    [blocks, query],
  );
  const selectedDefinition =
    blocks.find((block) => block.id === selectedBlock) ?? visibleBlocks[0];
  const input =
    "mt-1 w-full rounded border border-border bg-black/30 px-2 py-1 text-foreground outline-none focus:border-primary/30";
  return (
    <div
      data-testid="cad-block-palette"
      className={
        docked
          ? "grid w-full grid-cols-[minmax(150px,0.7fr)_minmax(220px,1.3fr)] overflow-hidden type-micro"
          : "absolute left-0 top-full z-50 mt-1.5 grid w-[620px] max-w-[92vw] grid-cols-[250px_1fr] overflow-hidden rounded-card border border-primary/30 bg-surface type-micro shadow-2xl"
      }
    >
      <section className="border-r border-border p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-semibold text-primary-ink">BLOCK / INSERT</span>
          <span className="text-muted-foreground">{blocks.length}</span>
        </div>
        <input
          aria-label="Buscar bloques"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar nombre, tag, negocio…"
          className={input}
        />
        <div className="mt-2 max-h-64 space-y-1 overflow-y-auto">
          {visibleBlocks.map((block) => {
            const thumbnail =
              block.thumbnail?.svg ?? buildCadBlockThumbnail(block, 96);
            return (
              <button
                key={block.id}
                data-testid={`cad-block-row-${block.name}`}
                onClick={() => setSelectedBlock(block.id)}
                className={`flex w-full items-center gap-2 rounded-control border p-1.5 text-left ${selectedDefinition?.id === block.id ? "border-primary/30 bg-primary/15" : "border-border bg-muted/40"}`}
              >
                <span
                  className="h-10 w-10 shrink-0 rounded bg-cover bg-center"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(thumbnail)}")`,
                  }}
                />
                <span className="min-w-0">
                  <strong className="block truncate text-foreground">
                    {block.name}
                  </strong>
                  <span className="block truncate type-micro text-muted-foreground">
                    v{block.version ?? 1} · {block.entities.length} entidad(es)
                    · {block.library?.scope ?? "document"}
                  </span>
                </span>
              </button>
            );
          })}
          {!visibleBlocks.length && (
            <p className="py-4 text-center text-muted-foreground">Sin coincidencias.</p>
          )}
        </div>
        <button
          data-testid="cad-block-purge"
          onClick={onPurge}
          className="mt-2 w-full rounded border border-warning/30 px-2 py-1 text-warning-ink"
        >
          Purge no usados
        </button>
      </section>
      <section className="max-h-[78vh] overflow-y-auto p-3">
        <div className="grid grid-cols-2 gap-2">
          <label className="text-muted-foreground">
            Nombre
            <input
              data-testid="cad-block-name"
              value={name}
              onChange={(event) => setName(event.target.value.slice(0, 80))}
              className={input}
            />
          </label>
          <label className="text-muted-foreground">
            Keywords
            <input
              value={keywords}
              onChange={(event) => setKeywords(event.target.value)}
              placeholder="puerta, seguridad"
              className={input}
            />
          </label>
          <label className="col-span-2 text-muted-foreground">
            Descripción
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className={input}
            />
          </label>
          <label className="text-muted-foreground">
            ATTDEF tag
            <input
              value={attributeTag}
              onChange={(event) =>
                setAttributeTag(
                  event.target.value
                    .replace(/[^A-Za-z0-9_.:-]/g, "")
                    .slice(0, 64),
                )
              }
              placeholder="MARK"
              className={input}
            />
          </label>
          <label className="text-muted-foreground">
            Default
            <input
              value={attributeDefault}
              onChange={(event) => setAttributeDefault(event.target.value)}
              placeholder="D-01"
              className={input}
            />
          </label>
          <label className="text-muted-foreground">
            Business type
            <input
              value={businessEntityType}
              onChange={(event) => setBusinessEntityType(event.target.value)}
              placeholder="assetType"
              className={input}
            />
          </label>
          <label className="text-muted-foreground">
            Business id
            <input
              value={businessEntityId}
              onChange={(event) => setBusinessEntityId(event.target.value)}
              placeholder="door-standard"
              className={input}
            />
          </label>
        </div>
        <label className="mt-2 flex items-center gap-2 text-foreground">
          <input
            type="checkbox"
            checked={tenantLibrary}
            onChange={(event) => setTenantLibrary(event.target.checked)}
            className="accent-indigo-500"
          />{" "}
          Publicar en biblioteca tenant
        </label>
        <button
          data-testid="cad-block-define"
          disabled={!name.trim() || selectedEntityCount < 1}
          onClick={() =>
            onDefine({
              name: name.trim(),
              description: description.trim(),
              keywords: keywords
                .split(",")
                .map((value) => value.trim())
                .filter(Boolean),
              attributeTag: attributeTag || undefined,
              attributeDefault: attributeDefault || undefined,
              tenantLibrary,
              businessEntityType: businessEntityType || undefined,
              businessEntityId: businessEntityId || undefined,
            })
          }
          className="mt-2 w-full rounded-control bg-indigo-500 px-3 py-1.5 font-semibold text-gray-950 disabled:opacity-40"
        >
          Crear BLOCK desde selección ({selectedEntityCount})
        </button>

        <div className="my-3 border-t border-border" />
        <div className="mb-2 font-semibold text-violet-100">
          INSERT {selectedDefinition?.name ?? "—"}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(["x", "y", "rotation", "scaleX", "scaleY"] as const).map((key) => (
            <label key={key} className="text-muted-foreground">
              {key}
              <input
                data-testid={`cad-block-insert-${key}`}
                type="number"
                value={insert[key]}
                onChange={(event) =>
                  setInsert((current) => ({
                    ...current,
                    [key]: Number(event.target.value) || 0,
                  }))
                }
                className={input}
              />
            </label>
          ))}
        </div>
        <label className="mt-2 block text-muted-foreground">
          Atributos por instancia (TAG=valor)
          <textarea
            data-testid="cad-block-attributes"
            rows={3}
            value={insert.attributes}
            onChange={(event) =>
              setInsert((current) => ({
                ...current,
                attributes: event.target.value,
              }))
            }
            className={input}
          />
        </label>
        <button
          data-testid="cad-block-insert"
          disabled={!selectedDefinition}
          onClick={() =>
            selectedDefinition &&
            onInsert(selectedDefinition.id, {
              ...insert,
              scaleX: insert.scaleX || 1,
              scaleY: insert.scaleY || 1,
              attributes: parseAttributes(insert.attributes),
            })
          }
          className="mt-2 w-full rounded-control bg-violet-500 px-3 py-1.5 font-semibold text-foreground disabled:opacity-40"
        >
          Insertar instancia viva
        </button>
        <div className="mt-2 grid grid-cols-3 gap-1">
          <button
            disabled={!selectedDefinition || selectedEntityCount < 1}
            onClick={() =>
              selectedDefinition && onRedefine(selectedDefinition.id)
            }
            className="rounded border border-border px-2 py-1 text-foreground disabled:opacity-30"
          >
            Redefinir
          </button>
          <button
            disabled={
              !selectedInsert ||
              !selectedDefinition ||
              selectedInsert.block === selectedDefinition.id
            }
            onClick={() =>
              selectedInsert &&
              selectedDefinition &&
              onReplace(selectedInsert.block, selectedDefinition.id)
            }
            className="rounded border border-border px-2 py-1 text-foreground disabled:opacity-30"
          >
            Replace todas
          </button>
          <button
            data-testid="cad-block-explode"
            disabled={!selectedInsert}
            onClick={() => selectedInsert && onExplode(selectedInsert.id)}
            className="rounded border border-danger/30 px-2 py-1 text-danger-ink disabled:opacity-30"
          >
            Explode
          </button>
        </div>
        <p className="mt-2 type-micro leading-relaxed text-muted-foreground">
          Las instancias conservan definición, anidación, transform, atributos y
          vínculos; redefinir actualiza todas sin aplanarlas.
        </p>
      </section>
    </div>
  );
}
