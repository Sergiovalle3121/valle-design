"use client";

import { Copy, Group, HelpCircle, Trash2 } from "lucide-react";
import { CadDialogShell } from "./CadDialogShell";

/**
 * TRES CUADROS DEL ESTUDIO, FUERA DEL MONOLITO.
 *
 * `Layout3DEditor.tsx` terminaba con ocho cuadros modales escritos en línea,
 * 1 779 líneas de JSX detrás del render del editor. Aquí salen los tres menos
 * acoplados —ayuda, clonar desde plantilla y celdas— como paso siguiente del
 * mismo método que ya sacó las paletas, el visor y el ciclo de vida del
 * documento a `components/cad/`.
 *
 * ## El criterio de la costura
 *
 * No «lo que cabe», sino **lo que se puede describir con un contrato explícito**.
 * Estos tres reciben datos y devoluciones de llamada, y nada más: ninguno lee
 * un `ref` del editor por su cuenta, ninguno decide cuándo se abre. El resto de
 * los cuadros (informe, exportación DXF, juego de láminas, cuantificación)
 * tocan diez o veinte variables del cierre del monolito y salen con su propio
 * contrato en su turno; el mapa está en `DEUDA-MONOLITO.md`.
 *
 * ## Lo que NO cambia
 *
 * Ningún `data-testid` se mueve, ningún texto cambia y la estructura visible es
 * la misma. Lo único que cambia para el usuario es a favor: los tres ganan
 * `role="dialog"`, título anunciado y cierre con Escape, que antes no tenían.
 */

/** Una celda tal como la pinta el cuadro. Coincide con `Cell` del editor. */
export interface CadCellView {
  id: string;
  name: string;
  color: string;
  stationIds: string[];
}

/** Una sección de la chuleta de atajos. Coincide con `HELP_SECTIONS`. */
export interface CadHelpSection {
  title: string;
  rows: readonly (readonly [string, string])[];
}

export function CadHelpOverlay({
  onClose,
  secciones,
}: {
  onClose: () => void;
  secciones: readonly CadHelpSection[];
}) {
  return (
    <CadDialogShell
      id="cad-ayuda"
      onClose={onClose}
      icon={<HelpCircle className="w-4 h-4" />}
      titulo="Atajos y herramientas · CAD 3D"
      ancho="w-[640px]"
      alto="max-h-[82vh] overflow-y-auto"
    >
      <div className="p-4 grid grid-cols-2 gap-x-6 gap-y-4 type-caption">
        {secciones.map((sec) => (
          <div key={sec.title}>
            <div className="type-micro uppercase tracking-wide text-muted-foreground mb-1.5">
              {sec.title}
            </div>
            <div className="space-y-1">
              {sec.rows.map(([k, d]) => (
                <div key={d} className="flex items-baseline justify-between gap-3">
                  <span className="text-foreground">{d}</span>
                  <kbd className="shrink-0 px-1.5 py-0.5 rounded-md bg-muted/60 border border-border type-micro text-foreground font-mono">
                    {k}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="px-4 pb-4 type-micro text-muted-foreground">
        Abre esta ayuda con{" "}
        <kbd className="px-1 py-0.5 rounded bg-muted/60 border border-border font-mono">
          ?
        </kbd>{" "}
        en cualquier momento.
      </div>
    </CadDialogShell>
  );
}

export function CadCloneFromTemplateDialog({
  onClose,
  model,
  revision,
  models,
  origen,
  onOrigenChange,
  onClonar,
  ocupado,
}: {
  onClose: () => void;
  model: string;
  revision: string;
  models: readonly { model: string; revision: string }[];
  origen: string;
  onOrigenChange: (valor: string) => void;
  onClonar: () => void;
  ocupado: boolean;
}) {
  return (
    <CadDialogShell
      id="cad-clonar"
      onClose={onClose}
      icon={<Copy className="w-4 h-4" />}
      titulo="Clonar desde plantilla"
      ancho="w-[420px]"
    >
      <div className="p-4">
        <p className="type-caption text-muted-foreground dark:text-muted-foreground mb-3">
          Copia el dibujo (puntos, objetos, conexiones, celdas y plano) de otro
          modelo a{" "}
          <b className="text-foreground">
            {model} · {revision}
          </b>
          . Reemplaza el actual.
        </p>
        <select
          aria-label="Modelo origen"
          value={origen}
          onChange={(e) => onOrigenChange(e.target.value)}
          className="w-full bg-muted/60 rounded-lg px-2.5 py-2 type-small outline-none mb-3 focus:ring-1 ring-indigo-500/40"
        >
          <option value="" className="text-foreground">
            Elige un modelo origen…
          </option>
          {models
            .filter((m) => !(m.model === model && m.revision === revision))
            .map((m) => (
              <option
                key={`${m.model}|${m.revision}`}
                value={`${m.model}|${m.revision}`}
                className="text-foreground"
              >
                {m.model} · {m.revision}
              </option>
            ))}
        </select>
        <button
          type="button"
          onClick={onClonar}
          disabled={!origen || ocupado}
          className="w-full px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-brand-strong text-primary-foreground type-caption font-medium disabled:opacity-50"
        >
          {ocupado ? "Clonando…" : "Clonar layout"}
        </button>
      </div>
    </CadDialogShell>
  );
}

export function CadCellsDialog({
  onClose,
  model,
  revision,
  celdas,
  onCrearDesdeSeleccion,
  onRenombrar,
  onBorrar,
}: {
  onClose: () => void;
  model: string;
  revision: string;
  celdas: readonly CadCellView[];
  onCrearDesdeSeleccion: () => void;
  onRenombrar: (id: string, nombre: string) => void;
  onBorrar: (id: string) => void;
}) {
  return (
    <CadDialogShell
      id="cad-celdas"
      onClose={onClose}
      icon={<Group className="w-4 h-4" />}
      titulo={`Celdas / zonas · ${model} · ${revision}`}
      ancho="w-[440px]"
      alto="max-h-[80vh] overflow-y-auto"
      cerrarTestId="cad-cells-close"
    >
      <div className="p-4">
        <button
          type="button"
          data-testid="cad-cells-create"
          onClick={onCrearDesdeSeleccion}
          className="w-full mb-3 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-brand-strong text-primary-foreground type-caption font-medium"
        >
          Crear celda con la selección
        </button>
        {celdas.length === 0 ? (
          <p className="type-caption text-muted-foreground text-center py-3">
            Selecciona puntos (Shift+clic) y crea una celda para agruparlas.
          </p>
        ) : (
          <div className="space-y-1.5">
            {celdas.map((c) => (
              <div
                key={c.id}
                data-testid="cad-cell-row"
                className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2"
              >
                <span
                  className="inline-block w-3 h-3 rounded-sm shrink-0"
                  style={{ background: c.color }}
                />
                <div className="min-w-0 flex-1">
                  <input
                    aria-label={`Nombre de la celda ${c.name}`}
                    data-testid="cad-cell-name"
                    defaultValue={c.name}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      // Crear y borrar ya pasaban por `commitCells`; renombrar
                      // escribía `cellsRef` a mano y sólo marcaba dirty, así que
                      // el nombre nuevo no entraba en el documento canónico y se
                      // perdía en el guardado — con el autosave respondiendo 200.
                      if (v && v !== c.name) onRenombrar(c.id, v);
                    }}
                    className="w-full bg-transparent type-small font-medium outline-none focus:bg-muted/60 rounded px-1"
                  />
                  <div className="type-micro text-muted-foreground dark:text-muted-foreground px-1">
                    {c.stationIds.length} puntos
                  </div>
                </div>
                <button
                  type="button"
                  aria-label={`Borrar la celda ${c.name}`}
                  onClick={() => onBorrar(c.id)}
                  className="p-1 rounded-md text-danger-ink hover:bg-rose-500/20"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        <p className="type-micro text-muted-foreground mt-3">
          Las celdas tiñen el piso bajo sus objetos agrupados.
        </p>
      </div>
    </CadDialogShell>
  );
}
