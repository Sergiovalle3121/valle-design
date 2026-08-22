import { useMemo, useState } from "react";
import {
  resolveCadDynamicInput,
  type CadDynamicInputContext,
  type CadDynamicInputMode,
  type CadDynamicInputResult,
  type CadDynamicInputValues,
} from "@/lib/cad/dynamic-input";

interface CadDynamicInputProps {
  kind: "point" | "radius" | "offset";
  anchor: { x: number; y: number } | null;
  documentUnit: "mm" | "m";
  locale?: string;
  defaults?: CadDynamicInputContext["defaults"];
  onCommit: (result: Extract<CadDynamicInputResult, { ok: true }>) => void;
  onCancel: () => void;
}

type Field = keyof CadDynamicInputValues;

const fieldLabels: Record<Field, string> = {
  x: "X",
  y: "Y",
  distance: "Distancia",
  angle: "Ángulo",
  radius: "Radio",
  diameter: "Diámetro",
  offset: "Offset",
};

export function CadDynamicInput({
  kind,
  anchor,
  documentUnit,
  locale = "es-MX",
  defaults,
  onCommit,
  onCancel,
}: CadDynamicInputProps) {
  const [pointMode, setPointMode] = useState<CadDynamicInputMode>(
    anchor ? "relative" : "absolute",
  );
  const [radiusMode, setRadiusMode] = useState<CadDynamicInputMode>("radius");
  const [values, setValues] = useState<CadDynamicInputValues>({});
  const [locked, setLocked] = useState<Partial<Record<Field, boolean>>>({});
  const mode: CadDynamicInputMode =
    kind === "point" ? pointMode : kind === "radius" ? radiusMode : "offset";
  const fields: Field[] =
    mode === "absolute" || mode === "relative"
      ? ["x", "y"]
      : mode === "polar"
        ? ["distance", "angle"]
        : [mode];
  const context = useMemo<CadDynamicInputContext>(
    () => ({
      mode,
      anchor,
      documentUnit,
      locale,
      defaults,
    }),
    [anchor, defaults, documentUnit, locale, mode],
  );
  const result = resolveCadDynamicInput(values, context);
  const hasInput = fields.some((field) => values[field]?.trim());
  const inlineError = hasInput && !result.ok ? result.error : null;

  const toggleLock = (field: Field) => {
    setLocked((current) => {
      const next = !current[field];
      if (next && !values[field]?.trim() && defaults?.[field] != null)
        setValues((items) => ({ ...items, [field]: String(defaults[field]) }));
      return { ...current, [field]: next };
    });
  };

  return (
    <form
      data-testid="cad-dynamic-input"
      aria-label="Entrada dinámica CAD"
      onSubmit={(event) => {
        event.preventDefault();
        if (result.ok) onCommit(result);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        }
      }}
      className="flex max-w-[720px] flex-wrap items-center gap-1.5 rounded-xl border border-amber-300/30 bg-gray-900/95 px-2 py-1.5 shadow-2xl backdrop-blur"
    >
      <span className="px-1 type-micro font-semibold uppercase tracking-wide text-amber-200">
        DYN
      </span>
      {kind === "point" && (
        <div className="inline-flex rounded-md bg-white/[0.06] p-0.5">
          {(["absolute", "relative", "polar"] as const).map((item) => (
            <button
              key={item}
              type="button"
              disabled={item !== "absolute" && !anchor}
              onClick={() => setPointMode(item)}
              className={`rounded px-2 py-0.5 type-micro disabled:opacity-35 ${mode === item ? "bg-amber-300 text-gray-950" : "text-gray-300 hover:bg-white/10"}`}
            >
              {item === "absolute"
                ? "ABS"
                : item === "relative"
                  ? "REL"
                  : "POLAR"}
            </button>
          ))}
        </div>
      )}
      {kind === "radius" && (
        <div className="inline-flex rounded-md bg-white/[0.06] p-0.5">
          {(["radius", "diameter"] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setRadiusMode(item)}
              className={`rounded px-2 py-0.5 type-micro ${mode === item ? "bg-amber-300 text-gray-950" : "text-gray-300 hover:bg-white/10"}`}
            >
              {item === "radius" ? "R" : "Ø"}
            </button>
          ))}
        </div>
      )}
      {fields.map((field) => (
        <label
          key={field}
          className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-gray-950/80 px-1.5 py-0.5"
        >
          <span className="type-micro text-gray-500">{fieldLabels[field]}</span>
          <input
            data-testid={`cad-dynamic-field-${field}`}
            aria-label={fieldLabels[field]}
            value={values[field] ?? ""}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                [field]: event.target.value,
              }))
            }
            onKeyDown={(event) => {
              if (event.key !== "Tab") return;
              const index = fields.indexOf(field);
              const next = fields[index + (event.shiftKey ? -1 : 1)];
              if (!next) return;
              event.preventDefault();
              event.currentTarget.form
                ?.querySelector<HTMLInputElement>(
                  `[data-testid="cad-dynamic-field-${next}"]`,
                )
                ?.focus();
            }}
            placeholder={
              defaults?.[field] == null
                ? documentUnit
                : `≈${Number(defaults[field]).toFixed(field === "angle" ? 1 : 2)}`
            }
            inputMode="decimal"
            className="w-20 bg-transparent type-micro text-white outline-none placeholder:text-gray-600"
          />
          <button
            type="button"
            aria-label={`${locked[field] ? "Desbloquear" : "Bloquear"} ${fieldLabels[field]}`}
            aria-pressed={locked[field] === true}
            onClick={() => toggleLock(field)}
            className={
              locked[field]
                ? "text-amber-300"
                : "text-gray-600 hover:text-gray-300"
            }
          >
            {locked[field] ? "●" : "○"}
          </button>
        </label>
      ))}
      <span
        aria-live="polite"
        className={`max-w-40 truncate type-micro ${inlineError ? "text-rose-300" : "text-indigo-200"}`}
      >
        {inlineError ??
          (result.ok ? result.previewLabel : "Tab cambia de campo")}
      </span>
      <button
        type="submit"
        disabled={!result.ok}
        className="rounded-md bg-amber-300 px-2 py-1 type-micro font-semibold text-gray-950 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Aplicar
      </button>
    </form>
  );
}
