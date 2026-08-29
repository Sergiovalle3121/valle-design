"use client";

/**
 * Elegir plantilla, lámina y responsiva, en el mismo sitio donde se crea el
 * documento.
 *
 * ## Por qué está aquí y no en un asistente
 *
 * Porque son cuatro decisiones de un segundo que ahorran media hora de
 * configuración, y un asistente de tres pasos para tomarlas costaría más que el
 * tiempo que ahorra. Van debajo del nombre del documento, en la misma tarjeta.
 *
 * ## Por qué está fuera de `page.tsx`
 *
 * No es estética: `dashboard/page.tsx` está sujeto al presupuesto de 800 líneas
 * que `check-monolith-budget.mjs` aplica a todo archivo no presupuestado, y ya
 * lo rozaba. Aquí vive lo que sólo PINTA; en la página se queda lo que decide
 * —qué se crea y con qué permiso—.
 *
 * ## Por qué el papel se puede cambiar
 *
 * Porque «A1 siempre» es una mentira cómoda. Una casa de interés social entra
 * de sobra en A2 y el arquitecto no quiere pagar un plotter de un metro para
 * imprimirla; un conjunto grande no cabe en A1. Lo que sí es constante es que
 * los cinco tamaños son de la **serie A** —la que se usa en México— y no de la
 * serie ANSI con la que llegan las plantillas importadas.
 *
 * ## Por qué el D.R.O. está aquí y no sólo en el trazado
 *
 * Porque el hueco de la responsiva del Director Responsable de Obra tiene que
 * existir en la lámina desde que nace. Rellenarlo es opcional —y si nadie lo
 * rellena el cajetín lo dice, en vez de inventar un responsable— pero descubrir
 * al ir a ventanilla que las veinte láminas del juego no tienen dónde firmar es
 * rehacer el cajetín veinte veces.
 */
import { CAD_MEXICAN_PAPERS } from "@/lib/cad/standards/mexican-sheets";
import { CAD_STARTER_TEMPLATES } from "@/lib/cad/starter-templates";
import type { CadStarterChoice } from "./starter-choice";

// El tipo y el valor vacío viven en `starter-choice.ts`, sin dependencias, para
// que el tablero pueda usarlos como estado inicial sin descargar este catálogo.
// Se reexportan aquí para no romper ningún import existente.
export {
  type CadStarterChoice,
  EMPTY_CAD_STARTER_CHOICE,
} from "./starter-choice";

const FIELD = "mt-2 w-full rounded-xl border bg-transparent px-3 py-2 text-sm";

export function CadStarterTemplateFields({
  value,
  onChange,
  disabled,
}: {
  value: CadStarterChoice;
  onChange: (next: CadStarterChoice) => void;
  disabled?: boolean;
}) {
  const template = CAD_STARTER_TEMPLATES.find((item) => item.id === value.templateId);
  const patch = (part: Partial<CadStarterChoice>) => onChange({ ...value, ...part });

  return (
    <>
      <select
        aria-label="Plantilla de arranque"
        data-testid="starter-template"
        value={value.templateId}
        onChange={(event) => patch({ templateId: event.target.value })}
        disabled={disabled}
        className={FIELD}
      >
        <option value="">Sin plantilla (lienzo en blanco)</option>
        {CAD_STARTER_TEMPLATES.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label} — 1:{item.scale} en {item.paper}
          </option>
        ))}
      </select>
      {template ? (
        <>
          <p data-testid="starter-template-detail" className="mt-1 text-xs text-gray-500">
            {template.description}
          </p>
          <select
            aria-label="Tamaño de lámina"
            data-testid="starter-paper"
            value={value.paper}
            onChange={(event) => patch({ paper: event.target.value })}
            disabled={disabled}
            className={FIELD}
          >
            <option value="">Lámina de la plantilla ({template.paper})</option>
            {CAD_MEXICAN_PAPERS.map((paper) => (
              <option key={paper} value={paper}>
                {paper}
              </option>
            ))}
          </select>
          <input
            aria-label="Ubicación de la obra"
            data-testid="starter-location"
            value={value.location}
            onChange={(event) => patch({ location: event.target.value })}
            disabled={disabled}
            className={FIELD}
            placeholder="Ubicación de la obra (calle, colonia, alcaldía)"
          />
          <input
            aria-label="Director Responsable de Obra"
            data-testid="starter-dro"
            value={value.dro}
            onChange={(event) => patch({ dro: event.target.value })}
            disabled={disabled}
            className={FIELD}
            placeholder="Director Responsable de Obra (opcional)"
          />
        </>
      ) : null}
    </>
  );
}
