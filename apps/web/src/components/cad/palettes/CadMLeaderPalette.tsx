"use client";

import { useState } from "react";

export interface CadMLeaderDraft {
  text: string;
  contentType: "text" | "mtext";
  style: string;
  landing: boolean;
  doglegLength: number;
  arrowhead: "closed-filled" | "open" | "architectural-tick" | "dot" | "none";
  arrowSize: number;
  textWidth: number;
  textHeight: number;
  textAlignment: "left" | "center" | "right" | "justify";
  backgroundMask: boolean;
}

interface CadMLeaderPaletteProps {
  docked?: boolean;
  selectedCount: number;
  defaultSize: number;
  styles: string[];
  onCreate(draft: CadMLeaderDraft): void;
}

export function CadMLeaderPalette({
  selectedCount,
  defaultSize,
  styles,
  onCreate,
  docked,
}: CadMLeaderPaletteProps) {
  const [draft, setDraft] = useState<CadMLeaderDraft>({
    text: "",
    contentType: "mtext",
    style: styles[0] ?? "Standard",
    landing: true,
    doglegLength: defaultSize * 4,
    arrowhead: "closed-filled",
    arrowSize: defaultSize,
    textWidth: defaultSize * 12,
    textHeight: defaultSize * 0.8,
    textAlignment: "left",
    backgroundMask: true,
  });
  return (
    <div
      data-testid="cad-mleader-palette"
      className={
        docked
          ? "w-full p-3 type-micro"
          : "absolute right-0 top-full z-50 mt-1.5 w-80 rounded-xl border border-indigo-400/20 bg-gray-950 p-3 type-micro shadow-2xl"
      }
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold text-indigo-100">MLEADER semántico</span>
        <span className="text-gray-500">{selectedCount} destino(s)</span>
      </div>
      <label className="text-gray-400">
        Contenido
        <textarea
          data-testid="cad-mleader-content"
          value={draft.text}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              text: event.target.value.slice(0, 16_384),
            }))
          }
          rows={4}
          placeholder="Nota técnica…"
          className="mt-1 w-full resize-y rounded border border-white/10 bg-black/30 px-2 py-1.5 text-white"
        />
      </label>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="text-gray-400">
          Tipo
          <select
            value={draft.contentType}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                contentType: event.target
                  .value as CadMLeaderDraft["contentType"],
              }))
            }
            className="mt-1 w-full rounded border border-white/10 bg-gray-900 px-2 py-1 text-white"
          >
            <option value="mtext">MTEXT</option>
            <option value="text">Text</option>
          </select>
        </label>
        <label className="text-gray-400">
          Estilo
          <input
            list="cad-mleader-styles"
            value={draft.style}
            onChange={(event) =>
              setDraft((current) => ({ ...current, style: event.target.value }))
            }
            className="mt-1 w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-white"
          />
          <datalist id="cad-mleader-styles">
            {styles.map((style) => (
              <option key={style} value={style} />
            ))}
          </datalist>
        </label>
        <label className="text-gray-400">
          Arrow
          <select
            data-testid="cad-mleader-arrow"
            value={draft.arrowhead}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                arrowhead: event.target.value as CadMLeaderDraft["arrowhead"],
              }))
            }
            className="mt-1 w-full rounded border border-white/10 bg-gray-900 px-2 py-1 text-white"
          >
            <option value="closed-filled">Closed filled</option>
            <option value="open">Open</option>
            <option value="architectural-tick">Architectural tick</option>
            <option value="dot">Dot</option>
            <option value="none">None</option>
          </select>
        </label>
        <label className="text-gray-400">
          Arrow size
          <input
            type="number"
            min="0.001"
            value={draft.arrowSize}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                arrowSize: Math.max(
                  0.001,
                  Number(event.target.value) || defaultSize,
                ),
              }))
            }
            className="mt-1 w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-white"
          />
        </label>
        <label className="text-gray-400">
          Dogleg
          <input
            data-testid="cad-mleader-dogleg"
            type="number"
            min="0.001"
            value={draft.doglegLength}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                doglegLength: Math.max(
                  0.001,
                  Number(event.target.value) || defaultSize * 4,
                ),
              }))
            }
            className="mt-1 w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-white"
          />
        </label>
        <label className="text-gray-400">
          Alineación
          <select
            value={draft.textAlignment}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                textAlignment: event.target
                  .value as CadMLeaderDraft["textAlignment"],
              }))
            }
            className="mt-1 w-full rounded border border-white/10 bg-gray-900 px-2 py-1 text-white"
          >
            {["left", "center", "right", "justify"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label className="text-gray-400">
          Text width
          <input
            type="number"
            min="0.001"
            value={draft.textWidth}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                textWidth: Math.max(
                  0.001,
                  Number(event.target.value) || defaultSize * 12,
                ),
              }))
            }
            className="mt-1 w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-white"
          />
        </label>
        <label className="text-gray-400">
          Text height
          <input
            type="number"
            min="0.001"
            value={draft.textHeight}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                textHeight: Math.max(
                  0.001,
                  Number(event.target.value) || defaultSize * 0.8,
                ),
              }))
            }
            className="mt-1 w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-white"
          />
        </label>
      </div>
      <div className="mt-2 flex gap-4">
        <label className="flex items-center gap-2 text-gray-300">
          <input
            type="checkbox"
            checked={draft.landing}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                landing: event.target.checked,
              }))
            }
            className="accent-indigo-500"
          />{" "}
          Landing
        </label>
        <label className="flex items-center gap-2 text-gray-300">
          <input
            type="checkbox"
            checked={draft.backgroundMask}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                backgroundMask: event.target.checked,
              }))
            }
            className="accent-indigo-500"
          />{" "}
          Mask
        </label>
      </div>
      <button
        data-testid="cad-mleader-create"
        disabled={selectedCount < 1 || !draft.text.trim()}
        onClick={() => onCreate(draft)}
        className="mt-3 w-full rounded-lg bg-indigo-500 px-3 py-1.5 font-semibold text-gray-950 disabled:opacity-40"
      >
        Crear MLEADER ({selectedCount} línea{selectedCount === 1 ? "" : "s"})
      </button>
      <div className="mt-2 type-micro leading-relaxed text-gray-500">
        Una entidad, selección unitaria y una línea asociativa por cada destino
        seleccionado.
      </div>
    </div>
  );
}
