/**
 * LA PUERTA DEL ESTUDIO ES LA MISMA QUE LA DEL TABLERO (T-16).
 *
 * El producto tenía dos puertas de importación que contestaban distinto al
 * mismo archivo. La del tablero («Importar como documento») pasa por
 * `validateImportFile`: conoce las betas DWG firmadas y el tope de bytes de
 * cada formato, y decide ANTES de leer nada. La del estudio —el input del
 * plano DXF de fondo, con `accept=".dxf,.dwg"`— no llamaba a nadie: leía el
 * archivo entero como texto, medía 12 000 000 unidades UTF-16 escritas a mano
 * (no bytes) y contestaba SIEMPRE que el editor no lee DWG, aunque el
 * despliegue tuviera la beta encendida y el tablero lo admitiera. La
 * superficie más visible del producto mentía sobre una capacidad que el
 * producto ya tenía.
 *
 * Aquí el estudio pregunta lo mismo que el tablero, con la misma función, y
 * añade lo único que es suyo: el plano de FONDO sólo sabe dibujar DXF de
 * texto. Un formato que el tablero admite pero el fondo no puede pintar (un
 * `.dwg` con la beta encendida, un `.shp`, un modelo 3D) no se rechaza con una
 * mentira: se dice por dónde entra.
 */
import { isDwgNativeImportBetaEnabled } from "./document-import-client";
import { importFileExtension, validateImportFile } from "./document-import-validation";

export type StudioBackdropAdmission =
  | { ok: true }
  | {
      ok: false;
      /**
       * `rechazado`: la misma frase que diría el tablero (es la suya).
       * `entra-como-documento`: el tablero lo admite; el fondo del estudio no
       * lo pinta, y el mensaje dice por dónde entra.
       */
      reason: "rechazado" | "entra-como-documento";
      message: string;
    };

export function backdropDocumentOnlyMessage(fileName: string): string {
  // `importFileExtension` devuelve el nombre entero cuando no hay punto; un
  // nombre sin extensión no es un formato.
  const formato = fileName.includes(".") ? importFileExtension(fileName).toUpperCase() : "archivo";
  return (
    `Este ${formato} entra como documento, no como plano de fondo: en el tablero, ` +
    "«Importar como documento». El plano de fondo del estudio sólo lee DXF de texto."
  );
}

/**
 * Decide por NOMBRE y BYTES, sin leer el archivo: es la condición para que el
 * veredicto sea el mismo que el del tablero, que tampoco lo ha leído todavía.
 * `dwgBetaEnabled` sale de la misma variable de build que usa el tablero.
 */
export function admitStudioBackdropFile(
  file: { name: string; size: number },
  dwgBetaEnabled: boolean = isDwgNativeImportBetaEnabled(),
): StudioBackdropAdmission {
  try {
    validateImportFile(file.name, file.size, dwgBetaEnabled);
  } catch (error) {
    return {
      ok: false,
      reason: "rechazado",
      message: error instanceof Error ? error.message : String(error),
    };
  }
  if (importFileExtension(file.name) === "dxf") return { ok: true };
  return {
    ok: false,
    reason: "entra-como-documento",
    message: backdropDocumentOnlyMessage(file.name),
  };
}
