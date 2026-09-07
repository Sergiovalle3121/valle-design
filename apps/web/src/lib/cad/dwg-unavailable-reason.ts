/**
 * LA RAZÓN por la que un `.dwg` no entra cuando ninguna puerta está abierta.
 *
 * Vive en un módulo de una sola constante, sin dependencias, porque la leen
 * DOS módulos que no pueden verse entre sí: `interop-provider.ts` (el
 * proveedor DWG sin licencia, que arrastra el importador DXF entero) y
 * `document-import-validation.ts` (la puerta ligera del tablero, que existe
 * precisamente para no descargar ese importador antes de que haga falta).
 * Importar la razón desde el proveedor habría metido 539 KB de fuente en el
 * tablero para poder decir una frase.
 *
 * Es la misma frase de siempre — la de `interop-provider.ts` desde D5 —, que
 * ahora se dice IGUAL en la puerta del tablero y en la del estudio (T-16).
 */
import { PRODUCT_LABEL } from "@/config/brand";

export const DWG_UNAVAILABLE_REASON =
  "DWG requiere un proveedor con licencia (ODA Drawings SDK / Autodesk RealDWG). " +
  `${PRODUCT_LABEL.design} no hace ingeniería inversa del formato: conecta un proveedor ` +
  "licenciado que implemente CadInteroperabilityProvider o convierte el archivo " +
  "a DXF para importarlo hoy.";
