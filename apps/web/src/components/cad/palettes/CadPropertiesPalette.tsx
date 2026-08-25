"use client";

/**
 * Paleta de PROPIEDADES (Ctrl+1).
 *
 * Componente PRESENTACIONAL puro: recibe el modelo ya calculado y emite una
 * llamada por edición. No importa nada de `lib/cad` —ni el registro, ni el
 * documento, ni la escena—, así que se puede montar en un test sin backend y
 * no puede participar en un ciclo de importación con `entity-runtime`.
 *
 * Va memoizado con `React.memo`. No es adorno: la paleta cuelga de un
 * componente que renderiza en cada movimiento del ratón sobre el lienzo, y
 * hasta ahora ninguna de las doce paletas lo estaba.
 *
 * ## Los identificadores de prueba son contrato
 *
 * `cad-native-property-<clave>` y `cad-native-property-text` los usan once
 * goldens. Esta paleta sustituye a la rejilla que vivía dentro del monolito y
 * los conserva EXACTOS, con el mismo `defaultValue` + `onBlur`: lo que cambia
 * es que ahora hay categorías, `*VARIES*` y N objetos, no la forma de leer un
 * campo.
 */
import React from "react";
import {
  CAD_PROPERTY_VARIES,
  cadPropertyFieldValue,
  type CadPropertyModel,
  type CadPropertyRow,
  type CadPropertyValue,
} from "./property-model";

export interface CadPropertiesPaletteProps {
  model: CadPropertyModel;
  /**
   * Revisión del documento. Entra en la `key` de cada campo para que un cambio
   * externo —deshacer, un comando tecleado, la respuesta de la red— vuelva a
   * montar el input y su `defaultValue` diga la verdad.
   */
  revision: number;
  readOnly?: boolean;
  /** Resumen del objeto único designado; ausente en designación múltiple. */
  summary?: {
    id: string;
    layer: string;
    bounds: string;
    gripCount: number;
    gripLabels: string[];
  };
  /** Aplica un valor a TODOS los objetos de la fila, en un solo lote. */
  onEdit: (row: CadPropertyRow, value: CadPropertyValue) => void;
}

function fieldClass(varies: boolean): string {
  return `mt-1 w-full rounded-control border bg-surface/80 px-2 py-1.5 type-caption text-foreground outline-none focus:ring-1 focus:ring-indigo-500/40 ${
    varies
      ? "border-warning/30 placeholder:text-warning-ink/70"
      : "border-border"
  }`;
}

const PropertyField = React.memo(function PropertyField({
  row,
  revision,
  readOnly,
  onEdit,
}: {
  row: CadPropertyRow;
  revision: number;
  readOnly: boolean;
  onEdit: CadPropertiesPaletteProps["onEdit"];
}) {
  const testId = `cad-native-property-${row.key}`;
  // La `key` incluye la revisión y el valor: un `defaultValue` sólo se lee al
  // montar, así que sin esto el campo seguiría enseñando el valor anterior.
  const fieldKey = `${row.key}-${revision}-${row.varies ? "varies" : String(row.value)}`;
  /**
   * Los campos de ESCRITURA (texto, número, multilínea) no se remontan: un
   * autosave que aterrizaba mientras se tecleaba remontaba el input por la
   * `key` y se comía el valor a medio escribir — el blur veía «sin cambios» y
   * la edición no se emitía nunca (así caía el radio del golden 22). El valor
   * se sincroniza por efecto, y NUNCA sobre un campo con el foco: lo que el
   * usuario está escribiendo manda sobre cualquier estado que llegue de fuera.
   */
  const writableRef = React.useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const fieldValue = cadPropertyFieldValue(row);
  React.useEffect(() => {
    const node = writableRef.current;
    if (!node) return;
    if (typeof document !== "undefined" && document.activeElement === node) return;
    if (node.value !== fieldValue) node.value = fieldValue;
  }, [fieldValue, revision]);

  // Lo derivado se pinta en un `input` de sólo lectura y no en un `div`: el
  // valor sigue siendo legible con `toHaveValue`, que es como lo leen los
  // goldens de cota (`measurement`), y a la vez deja de aceptar escritura que
  // el adaptador iba a ignorar.
  if (row.kind === "readonly")
    return (
      <label className="type-micro text-muted-foreground dark:text-muted-foreground">
        {row.key}
        <input
          data-testid={testId}
          data-varies={row.varies ? "true" : undefined}
          readOnly
          tabIndex={-1}
          value={row.varies ? CAD_PROPERTY_VARIES : String(row.value)}
          className="mt-1 w-full rounded-control border border-border bg-muted/40 px-2 py-1.5 type-caption text-muted-foreground outline-none"
        />
      </label>
    );

  if (row.kind === "boolean")
    return (
      <label
        key={fieldKey}
        className="flex items-center justify-between gap-2 rounded-control border border-border bg-surface/80 px-2 py-1.5 type-micro text-muted-foreground"
      >
        {row.key}
        {row.varies && (
          <span className="type-micro text-warning-ink">
            {CAD_PROPERTY_VARIES}
          </span>
        )}
        <input
          type="checkbox"
          data-testid={testId}
          data-varies={row.varies ? "true" : undefined}
          // Con valores mezclados la casilla arranca apagada: el primer clic la
          // enciende y unifica, que es lo que AutoCAD hace y lo único que no
          // depende de en qué orden se designaron los objetos.
          checked={row.varies ? false : row.value === true}
          disabled={readOnly}
          onChange={(event) => onEdit(row, event.target.checked)}
          className="accent-indigo-500 disabled:opacity-40"
        />
      </label>
    );

  if (row.kind === "select")
    return (
      <label
        key={fieldKey}
        className="type-micro text-muted-foreground dark:text-muted-foreground"
      >
        {row.key}
        <select
          data-testid={testId}
          data-varies={row.varies ? "true" : undefined}
          // Sin valor propio para "mixto": un desplegable no admite un valor
          // seleccionado que no sea una de sus opciones, así que *VARIES* es
          // una opción MÁS, deshabilitada, que sólo se pinta mientras nadie
          // eligió — elegir cualquier opción real (incluida "Genérico") la
          // reemplaza y aplica a los objetos designados, igual que un texto
          // que se teclea encima del marcador.
          value={
            row.varies
              ? CAD_PROPERTY_VARIES
              : String(row.value ?? "")
          }
          disabled={readOnly}
          onChange={(event) => {
            if (event.target.value === CAD_PROPERTY_VARIES) return;
            onEdit(row, event.target.value);
          }}
          className={fieldClass(row.varies)}
        >
          {row.varies && (
            <option value={CAD_PROPERTY_VARIES} disabled hidden>
              {CAD_PROPERTY_VARIES}
            </option>
          )}
          {row.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );

  if (row.kind === "multiline")
    return (
      <label
        key={row.key}
        className="col-span-2 type-micro text-muted-foreground dark:text-muted-foreground"
      >
        {row.key}
        <textarea
          ref={(node) => {
            writableRef.current = node;
          }}
          data-testid={testId}
          data-varies={row.varies ? "true" : undefined}
          defaultValue={cadPropertyFieldValue(row)}
          placeholder={row.varies ? CAD_PROPERTY_VARIES : undefined}
          rows={4}
          disabled={readOnly}
          onBlur={(event) => {
            if (event.target.value === cadPropertyFieldValue(row)) return;
            onEdit(row, event.target.value);
          }}
          className={`${fieldClass(row.varies)} resize-y disabled:opacity-50`}
        />
      </label>
    );

  return (
    <label
      key={row.key}
      className="type-micro text-muted-foreground dark:text-muted-foreground"
    >
      {row.key}
      <input
        ref={(node) => {
          writableRef.current = node;
        }}
        data-testid={testId}
        data-varies={row.varies ? "true" : undefined}
        type={row.kind === "number" ? "number" : "text"}
        step={row.kind === "number" ? "any" : undefined}
        defaultValue={cadPropertyFieldValue(row)}
        placeholder={row.varies ? CAD_PROPERTY_VARIES : undefined}
        disabled={readOnly}
        onBlur={(event) => {
          const raw = event.target.value;
          if (raw === cadPropertyFieldValue(row)) return;
          if (row.kind === "number") {
            const next = Number(raw);
            if (!Number.isFinite(next)) return;
            onEdit(row, next);
            return;
          }
          onEdit(row, raw);
        }}
        className={fieldClass(row.varies)}
      />
    </label>
  );
});

export const CadPropertiesPalette = React.memo(function CadPropertiesPalette({
  model,
  revision,
  readOnly = false,
  summary,
  onEdit,
}: CadPropertiesPaletteProps) {
  if (model.count === 0)
    return (
      <div
        data-testid="cad-properties-palette"
        className="rounded-card border border-border bg-muted/40 p-2.5 type-micro text-muted-foreground"
      >
        Designa objetos para editar sus propiedades.
      </div>
    );

  return (
    <div data-testid="cad-properties-palette" data-count={model.count}>
      <div className="mb-3 grid grid-cols-2 gap-2 rounded-card border border-primary/30 bg-primary/15 p-2.5">
        {summary ? (
          <>
            <ReadOnlyCell label="ID" value={summary.id} />
            <ReadOnlyCell label="Capa" value={summary.layer} />
            <ReadOnlyCell label="Bounds" value={summary.bounds} />
            <ReadOnlyCell label="Grips" value={`${summary.gripCount}`} />
          </>
        ) : (
          <>
            <ReadOnlyCell label="Objetos" value={`${model.count}`} />
            <ReadOnlyCell label="Tipos" value={model.types.join(", ")} />
            <div
              className="col-span-2 type-micro text-muted-foreground"
              data-testid="cad-properties-multi-hint"
            >
              Se editan las propiedades COMUNES. Un valor que difiere se marca{" "}
              {CAD_PROPERTY_VARIES} y al escribirlo se aplica a los{" "}
              {model.count} objetos en un solo paso de deshacer.
            </div>
          </>
        )}
      </div>

      {model.groups.map((group) => (
        <section key={group.category} className="mb-3">
          <div
            data-testid={`cad-properties-group-${group.category}`}
            className="mb-1.5 type-micro uppercase tracking-wide text-primary-ink"
          >
            {group.category}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {group.rows.map((row) => (
              <PropertyField
                key={row.key}
                row={row}
                revision={revision}
                readOnly={readOnly}
                onEdit={onEdit}
              />
            ))}
          </div>
        </section>
      ))}

      {summary && summary.gripLabels.length > 0 && (
        <div className="mb-3 rounded-card border border-border bg-muted/40 p-2.5">
          <div className="mb-2 type-micro uppercase tracking-wide text-primary-ink">
            Grips disponibles
          </div>
          <div className="flex flex-wrap gap-1">
            {summary.gripLabels.slice(0, 12).map((label, index) => (
              <span
                key={`${label}-${index}`}
                className="rounded-full bg-muted/60 px-2 py-0.5 type-micro text-foreground"
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

function ReadOnlyCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="mb-0.5 block type-micro uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="w-full rounded-control border border-border bg-muted/40 px-2 py-1 type-small text-muted-foreground dark:text-muted-foreground">
        {value}
      </div>
    </div>
  );
}
