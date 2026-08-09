"use client";

/**
 * Gestores de estilos: texto, cota, directriz, tabla y ploteo.
 *
 * Uno solo con cinco pestañas, y no cinco cuadros, porque las cinco familias
 * hacen lo mismo sobre la misma sección del documento y quien define un estilo
 * de cota suele definir a continuación el de texto que esa cota usa.
 *
 * Presentacional puro y memoizado: recibe filas ya calculadas y descriptores de
 * campo, y se pinta sola. Añadir un campo a una familia es una línea en
 * `style-manager-model.ts`, no una fila de JSX aquí.
 */
import React from "react";
import {
  CAD_STYLE_FAMILIES,
  type CadStyleFamily,
  type CadStyleFieldDescriptor,
  type CadStyleRow,
  type CadStyleValue,
} from "./style-manager-model";

export interface CadStyleManagerPaletteProps {
  family: CadStyleFamily;
  rows: readonly CadStyleRow[];
  fields: readonly CadStyleFieldDescriptor[];
  /** Entidades que usan cada estilo. Sin referencias no aparece el bloqueo. */
  usage: Readonly<Record<string, number>>;
  usedBy: string;
  draftName: string;
  readOnly: boolean;
  onFamily: (family: CadStyleFamily) => void;
  onDraftName: (name: string) => void;
  onCreate: () => void;
  onEdit: (name: string, key: string, value: CadStyleValue) => void;
  onDelete: (name: string) => void;
  onClose: () => void;
}

function Field({
  row,
  field,
  readOnly,
  onEdit,
}: {
  row: CadStyleRow;
  field: CadStyleFieldDescriptor;
  readOnly: boolean;
  onEdit: CadStyleManagerPaletteProps["onEdit"];
}) {
  const testId = `cad-style-field-${row.name}-${field.key}`;
  const inherited = !row.explicit.includes(field.key);
  const label = (
    <span className="text-[10px] text-gray-500">
      {field.label}
      {inherited && (
        <span
          className="ml-1 text-[9px] text-gray-600"
          title="Valor de fábrica"
        >
          (por defecto)
        </span>
      )}
    </span>
  );

  if (field.kind === "boolean")
    return (
      <label className="flex items-center justify-between gap-2 rounded-md border border-white/10 bg-gray-950/60 px-2 py-1.5">
        {label}
        <input
          type="checkbox"
          data-testid={testId}
          checked={row.values[field.key] === true}
          disabled={readOnly}
          onChange={(event) =>
            onEdit(row.name, field.key, event.target.checked)
          }
          className="accent-cyan-500"
        />
      </label>
    );

  if (field.kind === "enum")
    return (
      <label className="block">
        {label}
        <select
          data-testid={testId}
          value={String(row.values[field.key])}
          disabled={readOnly}
          onChange={(event) => onEdit(row.name, field.key, event.target.value)}
          className="mt-0.5 w-full rounded-md border border-white/10 bg-gray-950/70 px-1.5 py-1 text-[11px] text-gray-100 outline-none disabled:opacity-50"
        >
          {(field.options ?? []).map((option) => (
            <option key={option} value={option} className="text-gray-900">
              {option}
            </option>
          ))}
        </select>
      </label>
    );

  return (
    <label className="block">
      {label}
      <input
        key={`${row.name}-${field.key}-${String(row.values[field.key])}`}
        data-testid={testId}
        type={field.kind === "number" ? "number" : "text"}
        step={field.kind === "number" ? "any" : undefined}
        defaultValue={String(row.values[field.key])}
        disabled={readOnly}
        onBlur={(event) => {
          const raw = event.target.value;
          if (raw === String(row.values[field.key])) return;
          if (field.kind === "number") {
            const next = Number(raw);
            if (!Number.isFinite(next)) return;
            onEdit(row.name, field.key, next);
            return;
          }
          onEdit(row.name, field.key, raw);
        }}
        className="mt-0.5 w-full rounded-md border border-white/10 bg-gray-950/70 px-1.5 py-1 text-[11px] text-white outline-none focus:ring-1 focus:ring-cyan-500/40 disabled:opacity-50"
      />
    </label>
  );
}

export const CadStyleManagerPalette = React.memo(
  function CadStyleManagerPalette(props: CadStyleManagerPaletteProps) {
    const { family, rows, fields, usage, usedBy, readOnly } = props;

    return (
      <div
        data-testid="cad-style-manager"
        data-family={family}
        className="max-h-[80vh] w-[min(560px,92vw)] overflow-y-auto rounded-2xl border border-white/10 bg-gray-900 p-4 text-white shadow-2xl"
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-[13px] font-semibold">Gestor de estilos</div>
            <div className="text-[10.5px] text-gray-500">
              Un estilo sin campos fijados hereda los de fábrica; sólo lo que
              cambies viaja al documento.
            </div>
          </div>
          <button
            type="button"
            data-testid="cad-style-close"
            aria-label="Cerrar gestor de estilos"
            onClick={props.onClose}
            className="rounded-lg px-2 py-1 text-[11px] text-gray-400 hover:bg-white/10 hover:text-white"
          >
            Cerrar
          </button>
        </div>

        <div className="mb-3 flex flex-wrap gap-1.5">
          {CAD_STYLE_FAMILIES.map((entry) => (
            <button
              key={entry.family}
              type="button"
              data-testid={`cad-style-family-${entry.family}`}
              data-active={entry.family === family ? "true" : "false"}
              onClick={() => props.onFamily(entry.family)}
              className={`rounded-full border px-2.5 py-0.5 text-[10.5px] ${
                entry.family === family
                  ? "border-cyan-300/50 bg-cyan-400/15 text-cyan-100"
                  : "border-white/10 text-gray-400 hover:text-white"
              }`}
            >
              {entry.label}
            </button>
          ))}
        </div>

        <div className="mb-3 grid grid-cols-[1fr_auto] gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] p-1.5">
          <input
            data-testid="cad-style-new-name"
            value={props.draftName}
            onChange={(event) => props.onDraftName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                props.onCreate();
              }
            }}
            disabled={readOnly}
            placeholder="Nuevo estilo"
            className="min-w-0 rounded-md border border-white/10 bg-gray-950/70 px-2 py-1 text-[11px] text-gray-200 outline-none focus:ring-1 focus:ring-cyan-500/40 disabled:opacity-50"
          />
          <button
            data-testid="cad-style-create"
            onClick={props.onCreate}
            disabled={readOnly || !props.draftName.trim()}
            className="rounded-md bg-cyan-500/15 px-2.5 text-[10.5px] font-semibold text-cyan-200 hover:bg-cyan-500/25 disabled:opacity-40"
          >
            Crear
          </button>
        </div>

        <div className="space-y-2">
          {rows.map((row) => {
            const references = usage[row.name] ?? 0;
            return (
              <section
                key={row.name}
                data-testid={`cad-style-row-${row.name}`}
                className="rounded-xl border border-white/10 bg-white/[0.04] p-2.5"
              >
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-[11.5px] font-semibold text-gray-100">
                    {row.name}
                  </span>
                  <span className="inline-flex items-center gap-2 text-[10px]">
                    <span
                      data-testid={`cad-style-usage-${row.name}`}
                      className={references ? "text-cyan-200" : "text-gray-500"}
                    >
                      {references} uso(s)
                    </span>
                    <button
                      data-testid={`cad-style-delete-${row.name}`}
                      onClick={() => props.onDelete(row.name)}
                      disabled={readOnly || references > 0}
                      title={
                        references > 0
                          ? `Lo usan ${references} entidades de ${usedBy}; reasígnalas antes de borrarlo.`
                          : "Borrar estilo"
                      }
                      className="text-rose-300/80 hover:text-rose-200 disabled:opacity-40"
                    >
                      Borrar
                    </button>
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {fields.map((field) => (
                    <Field
                      key={field.key}
                      row={row}
                      field={field}
                      readOnly={readOnly}
                      onEdit={props.onEdit}
                    />
                  ))}
                </div>
              </section>
            );
          })}
          {rows.length === 0 && (
            <div className="rounded-xl border border-dashed border-white/10 px-2 py-4 text-center text-[11px] text-gray-500">
              Esta familia no tiene estilos todavía. Crea uno y las entidades de{" "}
              {usedBy} podrán apuntarlo por su nombre.
            </div>
          )}
        </div>

        <p className="mt-3 text-[9.5px] text-gray-500">
          Renombrar no se ofrece: las entidades referencian su estilo POR
          NOMBRE, y cambiarlo sin reasignarlas las dejaría huérfanas. Crea el
          nuevo, mueve las entidades desde la paleta de propiedades y borra el
          viejo.
        </p>
      </div>
    );
  },
);
