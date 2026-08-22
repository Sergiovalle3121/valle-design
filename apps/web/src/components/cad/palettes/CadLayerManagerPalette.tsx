"use client";

/**
 * Gestor de propiedades de capa (LAYER).
 *
 * Componente PRESENTACIONAL puro y memoizado: recibe filas ya calculadas y
 * emite callbacks. No importa nada de `lib/cad`.
 *
 * Los identificadores de prueba `cad-layer-row-*`, `cad-layer-visible-*`,
 * `cad-layer-lock-*`, `cad-layer-name-*`, `cad-layer-color-*`,
 * `cad-layer-active-*`, `cad-layer-delete-*`, `cad-layer-new-name`,
 * `cad-layer-new-color` y `cad-layer-create` son CONTRATO: los usa el golden
 * 24. Lo que crece es lo que hay alrededor —tipo de línea, grosor, plot,
 * congelación por viewport, filtros y estados—, no la forma de leerlos.
 */
import React from "react";
import {
  CAD_LAYER_FILTER_LABELS,
  CAD_LINETYPE_NAMES,
  CAD_LINEWEIGHTS,
  describeCadLineweight,
  type CadLayerFilter,
  type CadLayerFilterProperty,
  type CadLayerManagerRow,
  type CadLayerStateListing,
} from "./layer-manager-model";

export interface CadLayerManagerPaletteProps {
  /** Filas ya filtradas, listas para pintar. */
  rows: readonly CadLayerManagerRow[];
  /** Total sin filtrar, para poder decir «12 de 80». */
  totalRows: number;
  filter: CadLayerFilter;
  draftName: string;
  draftColor: string;
  draftStateName: string;
  /** Estados de capa del DOCUMENTO (esquema 9); la paleta enseña su nombre. */
  states: readonly CadLayerStateListing[];
  readOnly: boolean;
  /** Nombre del viewport activo, o `null` en espacio modelo. */
  activeViewportName: string | null;

  onFilterText: (text: string) => void;
  onFilterProperty: (property: CadLayerFilterProperty) => void;
  onClearFilter: () => void;
  onDraftName: (name: string) => void;
  onDraftColor: (color: string) => void;
  onCreate: () => void;
  onRename: (id: string, name: string) => void;
  onColor: (id: string, color: string) => void;
  onLinetype: (id: string, linetype: string) => void;
  onLineweight: (id: string, lineweight: number) => void;
  onPlot: (id: string, plot: boolean) => void;
  onToggleVisible: (id: string) => void;
  onToggleLock: (id: string) => void;
  onToggleFrozen: (id: string, frozen: boolean) => void;
  onToggleViewportFreeze: (id: string, frozen: boolean) => void;
  onActivate: (id: string) => void;
  onSelectObjects: (id: string) => void;
  onIsolate: (id: string) => void;
  onAssignSelection: (id: string) => void;
  onDelete: (id: string) => void;
  onDraftStateName: (name: string) => void;
  onSaveState: () => void;
  onRestoreState: (name: string) => void;
  onDeleteState: (name: string) => void;

  /** Contadores del pie: objetos asignados, ocultos y bloqueados por capa. */
  summary: { assigned: number; hiddenObjects: number; lockedObjects: number };
  onShowAll: () => void;
  onHideEmpty: () => void;
  onUnlockAll: () => void;
  onResetPresentation: () => void;
}

const FILTER_ORDER: CadLayerFilterProperty[] = [
  "all",
  "visible",
  "hidden",
  "locked",
  "unlocked",
  "plot",
  "noplot",
  "used",
  "empty",
  "frozen",
  "viewport-frozen",
];

const LayerRow = React.memo(function LayerRow({
  row,
  readOnly,
  onRename,
  onColor,
  onLinetype,
  onLineweight,
  onPlot,
  onToggleVisible,
  onToggleLock,
  onToggleFrozen,
  onToggleViewportFreeze,
  onActivate,
  onSelectObjects,
  onIsolate,
  onAssignSelection,
  onDelete,
  deletable,
}: Pick<
  CadLayerManagerPaletteProps,
  | "readOnly"
  | "onRename"
  | "onColor"
  | "onLinetype"
  | "onLineweight"
  | "onPlot"
  | "onToggleVisible"
  | "onToggleLock"
  | "onToggleFrozen"
  | "onToggleViewportFreeze"
  | "onActivate"
  | "onSelectObjects"
  | "onIsolate"
  | "onAssignSelection"
  | "onDelete"
> & { row: CadLayerManagerRow; deletable: boolean }) {
  return (
    <div
      data-testid={`cad-layer-row-${row.id}`}
      className={`rounded-lg px-2 py-1 ${
        row.active
          ? "bg-indigo-400/[0.10] ring-1 ring-indigo-400/20"
          : "bg-white/[0.04]"
      }`}
    >
      <div className="flex items-center gap-1.5">
        <button
          data-testid={`cad-layer-visible-${row.id}`}
          onClick={() => onToggleVisible(row.id)}
          disabled={readOnly}
          className={`h-2.5 w-2.5 rounded-full ${row.visible ? "" : "opacity-30"} disabled:cursor-not-allowed`}
          style={{ background: row.color }}
          title={row.visible ? "Ocultar capa" : "Mostrar capa"}
        />
        <button
          data-testid={`cad-layer-active-${row.id}`}
          onClick={() => onActivate(row.id)}
          className={`min-w-0 flex-1 truncate text-left ${row.visible ? "text-gray-200" : "text-gray-500"}`}
          title="Definir como capa activa"
        >
          {row.name}
        </button>
        <span className="rounded bg-white/[0.06] px-1.5 py-0.5 type-micro text-gray-500 dark:text-gray-400">
          {row.objectCount}
        </span>
        <button
          data-testid={`cad-layer-frozen-${row.id}`}
          data-state={row.frozen ? "frozen" : "thawed"}
          onClick={() => onToggleFrozen(row.id, !row.frozen)}
          disabled={readOnly}
          className={`type-micro ${row.frozen ? "text-indigo-300" : "text-gray-600 opacity-60"} hover:opacity-100 disabled:opacity-40`}
          title={
            row.frozen
              ? "Descongelar capa"
              : "Congelar capa: ni se dibuja, ni se regenera, ni cuenta para extensión o selección"
          }
        >
          ❄
        </button>
        <button
          data-testid={`cad-layer-lock-${row.id}`}
          onClick={() => onToggleLock(row.id)}
          disabled={readOnly}
          className={`type-micro ${row.locked ? "text-amber-300" : "text-gray-500"} disabled:opacity-40`}
        >
          {row.locked ? "Lock" : "Open"}
        </button>
      </div>

      <div className="mt-1 grid grid-cols-[1fr_auto] gap-1.5">
        <input
          key={`${row.id}:${row.name}`}
          data-testid={`cad-layer-name-${row.id}`}
          defaultValue={row.name}
          onBlur={(event) => onRename(row.id, event.target.value)}
          disabled={readOnly}
          className="min-w-0 rounded-md border border-white/10 bg-gray-950/70 px-1.5 py-0.5 type-micro text-gray-200 outline-none focus:ring-1 focus:ring-indigo-500/40 disabled:opacity-50"
          title="Renombrar capa del documento"
        />
        <input
          data-testid={`cad-layer-color-${row.id}`}
          type="color"
          value={row.color}
          onChange={(event) => onColor(row.id, event.target.value)}
          disabled={readOnly}
          className="h-6 w-7 rounded border border-white/10 bg-transparent p-0 disabled:opacity-50"
          title="Color de capa"
        />
      </div>

      <div className="mt-1 grid grid-cols-[1fr_1fr_auto] items-center gap-1.5">
        <select
          data-testid={`cad-layer-linetype-${row.id}`}
          value={
            CAD_LINETYPE_NAMES.includes(row.linetype as never)
              ? row.linetype
              : "CONTINUOUS"
          }
          onChange={(event) => onLinetype(row.id, event.target.value)}
          disabled={readOnly}
          className="min-w-0 rounded-md border border-white/10 bg-gray-950/70 px-1 py-0.5 type-micro text-gray-200 outline-none disabled:opacity-50"
          title="Tipo de línea"
        >
          {CAD_LINETYPE_NAMES.map((name) => (
            <option key={name} value={name} className="text-gray-900">
              {name}
            </option>
          ))}
        </select>
        <select
          data-testid={`cad-layer-lineweight-${row.id}`}
          value={row.lineweight}
          onChange={(event) => onLineweight(row.id, Number(event.target.value))}
          disabled={readOnly}
          className="min-w-0 rounded-md border border-white/10 bg-gray-950/70 px-1 py-0.5 type-micro text-gray-200 outline-none disabled:opacity-50"
          title="Grosor de línea"
        >
          {CAD_LINEWEIGHTS.map((value) => (
            <option key={value} value={value} className="text-gray-900">
              {describeCadLineweight(value)}
            </option>
          ))}
        </select>
        <button
          data-testid={`cad-layer-plot-${row.id}`}
          data-active={row.plot ? "true" : "false"}
          onClick={() => onPlot(row.id, !row.plot)}
          disabled={readOnly}
          className={`type-micro ${row.plot ? "text-emerald-300" : "text-gray-500 line-through"} disabled:opacity-40`}
          title={row.plot ? "Se imprime" : "No se imprime"}
        >
          Plot
        </button>
      </div>

      <div className="mt-1 flex items-center justify-between gap-2 type-micro">
        {row.frozenInViewport === null ? (
          <span
            data-testid={`cad-layer-vpfreeze-${row.id}`}
            data-state="unavailable"
            className="text-gray-600"
            title="Sólo en una presentación con viewport activo"
          >
            VP freeze —
          </span>
        ) : (
          <button
            data-testid={`cad-layer-vpfreeze-${row.id}`}
            data-state={row.frozenInViewport ? "frozen" : "thawed"}
            onClick={() =>
              onToggleViewportFreeze(row.id, !row.frozenInViewport)
            }
            disabled={readOnly}
            className={
              row.frozenInViewport
                ? "text-indigo-300 hover:text-indigo-100 disabled:opacity-40"
                : "text-gray-500 hover:text-white disabled:opacity-40"
            }
            title="Congelar sólo en el viewport activo"
          >
            VP freeze {row.frozenInViewport ? "on" : "off"}
          </button>
        )}
        <div className="inline-flex items-center gap-2">
          <button
            onClick={() => onSelectObjects(row.id)}
            className="text-gray-500 hover:text-white dark:text-gray-400"
          >
            Sel
          </button>
          <button
            onClick={() => onIsolate(row.id)}
            disabled={readOnly}
            className="text-gray-500 hover:text-white disabled:opacity-40 dark:text-gray-400"
          >
            Solo
          </button>
          <button
            onClick={() => onAssignSelection(row.id)}
            disabled={readOnly}
            className="text-indigo-300 hover:text-indigo-100 disabled:opacity-40"
          >
            Asignar
          </button>
          {row.id !== "0" && (
            <button
              data-testid={`cad-layer-delete-${row.id}`}
              onClick={() => onDelete(row.id)}
              disabled={readOnly || !deletable}
              className="text-rose-300/80 hover:text-rose-200 disabled:opacity-40"
            >
              Borrar
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

export const CadLayerManagerPalette = React.memo(
  function CadLayerManagerPalette(props: CadLayerManagerPaletteProps) {
    const { rows, totalRows, filter, states, readOnly, activeViewportName } =
      props;
    const filtering = filter.text.trim() !== "" || filter.property !== "all";

    return (
      <div data-testid="cad-layer-properties">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <div className="type-micro uppercase tracking-wide text-gray-500">
            Capas CAD
          </div>
          <div
            data-testid="cad-layer-visible-count"
            className="type-micro text-gray-500"
          >
            {rows.length}/{totalRows} listadas
          </div>
        </div>

        <div className="mb-2 grid grid-cols-[1fr_auto_auto] gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] p-1.5">
          <input
            data-testid="cad-layer-new-name"
            value={props.draftName}
            onChange={(event) => props.onDraftName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                props.onCreate();
              }
            }}
            disabled={readOnly}
            placeholder="Nueva capa"
            className="min-w-0 rounded-md border border-white/10 bg-gray-950/70 px-2 py-1 type-micro text-gray-200 outline-none focus:ring-1 focus:ring-indigo-500/40 disabled:opacity-50"
          />
          <input
            data-testid="cad-layer-new-color"
            type="color"
            value={props.draftColor}
            onChange={(event) => props.onDraftColor(event.target.value)}
            disabled={readOnly}
            className="h-7 w-8 rounded border border-white/10 bg-transparent p-0 disabled:opacity-50"
            title="Color de la nueva capa"
          />
          <button
            data-testid="cad-layer-create"
            onClick={props.onCreate}
            disabled={readOnly || !props.draftName.trim()}
            className="rounded-md bg-indigo-500/15 px-2 type-micro font-semibold text-indigo-200 hover:bg-indigo-500/25 disabled:opacity-40"
          >
            Crear
          </button>
        </div>

        <div className="mb-2 grid grid-cols-[1fr_auto] gap-1.5">
          <input
            data-testid="cad-layer-filter-name"
            value={filter.text}
            onChange={(event) => props.onFilterText(event.target.value)}
            placeholder="Filtrar por nombre"
            className="min-w-0 rounded-md border border-white/10 bg-gray-950/70 px-2 py-1 type-micro text-gray-200 outline-none focus:ring-1 focus:ring-indigo-500/40"
          />
          <select
            data-testid="cad-layer-filter-property"
            value={filter.property}
            onChange={(event) =>
              props.onFilterProperty(
                event.target.value as CadLayerFilterProperty,
              )
            }
            className="rounded-md border border-white/10 bg-gray-950/70 px-1 py-1 type-micro text-gray-200 outline-none"
          >
            {FILTER_ORDER.map((property) => (
              <option key={property} value={property} className="text-gray-900">
                {CAD_LAYER_FILTER_LABELS[property]}
              </option>
            ))}
          </select>
        </div>

        {filtering && (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-md bg-amber-400/[0.07] px-2 py-1 type-micro text-amber-200">
            <span>El filtro oculta {totalRows - rows.length} capa(s).</span>
            <button
              data-testid="cad-layer-filter-clear"
              onClick={props.onClearFilter}
              className="hover:text-white"
            >
              Quitar filtro
            </button>
          </div>
        )}

        <div
          className="mb-2 px-0.5 type-micro text-gray-500"
          data-testid="cad-layer-viewport-scope"
        >
          {activeViewportName
            ? `VP freeze afecta al viewport «${activeViewportName}».`
            : "VP freeze necesita una presentación con viewport activo."}
        </div>

        <div className="space-y-1">
          {rows.map((row) => (
            <LayerRow
              key={row.id}
              row={row}
              deletable={totalRows > 1}
              readOnly={readOnly}
              onRename={props.onRename}
              onColor={props.onColor}
              onLinetype={props.onLinetype}
              onLineweight={props.onLineweight}
              onPlot={props.onPlot}
              onToggleVisible={props.onToggleVisible}
              onToggleLock={props.onToggleLock}
              onToggleFrozen={props.onToggleFrozen}
              onToggleViewportFreeze={props.onToggleViewportFreeze}
              onActivate={props.onActivate}
              onSelectObjects={props.onSelectObjects}
              onIsolate={props.onIsolate}
              onAssignSelection={props.onAssignSelection}
              onDelete={props.onDelete}
            />
          ))}
          {rows.length === 0 && (
            <div className="rounded-lg border border-dashed border-white/10 px-2 py-3 text-center type-micro text-gray-500">
              Ninguna capa coincide con el filtro.
            </div>
          )}
        </div>

        <div className="mt-1 flex items-center justify-between gap-2 type-micro text-gray-500">
          <span>
            {props.summary.assigned} asignados · {props.summary.hiddenObjects}{" "}
            ocultos · {props.summary.lockedObjects} bloqueados
          </span>
          <div className="inline-flex items-center gap-2">
            <button
              data-testid="cad-layer-show-all"
              onClick={props.onShowAll}
              className="text-gray-500 hover:text-white dark:text-gray-400"
            >
              All
            </button>
            <button
              data-testid="cad-layer-hide-empty"
              onClick={props.onHideEmpty}
              disabled={readOnly}
              className="text-gray-500 hover:text-white disabled:opacity-40 dark:text-gray-400"
              title="Ocultar capas sin objetos"
            >
              Ocultar 0
            </button>
            <button
              data-testid="cad-layer-unlock-all"
              onClick={props.onUnlockAll}
              className="text-gray-500 hover:text-white dark:text-gray-400"
              title="Desbloquear todas las capas"
            >
              Unlock
            </button>
            <button
              data-testid="cad-layer-reset"
              onClick={props.onResetPresentation}
              className="text-gray-500 hover:text-white dark:text-gray-400"
            >
              Reset
            </button>
          </div>
        </div>
        {props.summary.hiddenObjects > 0 && (
          <div className="mt-1 rounded-lg border border-amber-400/15 bg-amber-400/[0.06] px-2 py-1 type-micro text-amber-100">
            {props.summary.hiddenObjects} objeto(s) ocultos por capas CAD. Usa
            All para recuperar la vista completa.
          </div>
        )}

        <section className="mt-2 rounded-lg border border-white/10 bg-white/[0.03] p-1.5">
          <div className="mb-1 type-micro uppercase tracking-wide text-gray-500">
            Estados de capa
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-1.5">
            <input
              data-testid="cad-layer-state-name"
              value={props.draftStateName}
              onChange={(event) => props.onDraftStateName(event.target.value)}
              placeholder="Nombre del estado"
              className="min-w-0 rounded-md border border-white/10 bg-gray-950/70 px-2 py-1 type-micro text-gray-200 outline-none focus:ring-1 focus:ring-indigo-500/40"
            />
            <button
              data-testid="cad-layer-state-save"
              onClick={props.onSaveState}
              disabled={!props.draftStateName.trim()}
              className="rounded-md bg-white/[0.06] px-2 type-micro text-gray-200 hover:bg-white/[0.12] disabled:opacity-40"
            >
              Guardar
            </button>
          </div>
          <div className="mt-1 space-y-1">
            {states.map((state) => (
              <div
                key={state.name}
                data-testid={`cad-layer-state-${state.name}`}
                className="flex items-center justify-between gap-2 rounded bg-white/[0.04] px-2 py-1 type-micro text-gray-300"
              >
                <span className="min-w-0 truncate">{state.name}</span>
                <span className="inline-flex items-center gap-2">
                  <button
                    data-testid={`cad-layer-state-restore-${state.name}`}
                    onClick={() => props.onRestoreState(state.name)}
                    disabled={readOnly}
                    className="text-indigo-300 hover:text-indigo-100 disabled:opacity-40"
                  >
                    Restaurar
                  </button>
                  <button
                    data-testid={`cad-layer-state-delete-${state.name}`}
                    onClick={() => props.onDeleteState(state.name)}
                    className="text-rose-300/80 hover:text-rose-200"
                  >
                    Borrar
                  </button>
                </span>
              </div>
            ))}
            {states.length === 0 && (
              <div className="px-1 type-micro text-gray-500">
                Sin estados guardados. Viven en el documento: sobreviven a la
                recarga y viajan con el plano.
              </div>
            )}
          </div>
        </section>
      </div>
    );
  },
);
