/**
 * ALIAS LEGADOS DEL CAD STUDIO UNIVERSAL — identificadores PERSISTIDOS.
 *
 * Estos dos literales identifican, en la base de datos, los documentos que el
 * estudio "universal" guarda cuando no hay un modelo/revisión de ingeniería
 * detrás (hoy `cad_documents.model` / `.revision`; antes
 * `sf_line_layouts.model`). Son VALORES OPACOS: se leen y escriben tal cual.
 *
 * NO son nombres de código. Cambiar su valor no es un renombre: es una
 * migración de datos. Ver `README.md` de esta carpeta.
 */

/** Modelo centinela del CAD Studio universal. Valor persistido: NO renombrar. */
export const LEGACY_CAD_STUDIO_MODEL = "AXOS-CAD-STUDIO" as const;

/** Revisión centinela del CAD Studio universal. Valor persistido: NO renombrar. */
export const LEGACY_CAD_STUDIO_REVISION = "UNIVERSAL" as const;

/** Par (modelo, revisión) con el que se abre el estudio universal. */
export const LEGACY_CAD_STUDIO_SENTINEL = {
  model: LEGACY_CAD_STUDIO_MODEL,
  revision: LEGACY_CAD_STUDIO_REVISION,
} as const;
