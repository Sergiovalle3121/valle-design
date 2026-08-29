/**
 * La ELECCIÓN de plantilla de arranque, separada del formulario que la pinta.
 *
 * `starter-template-fields.tsx` importa `CAD_STARTER_TEMPLATES`, y ese catálogo
 * arrastra 1 036 KB de fuente: plantillas, capas normalizadas, cajetín, papeles
 * mexicanos, operaciones de layout. El tablero necesita el TIPO y el valor
 * vacío desde el primer render —son el estado inicial de `useState`— pero el
 * formulario sólo aparece cuando el usuario abre «documento nuevo».
 *
 * Con las dos cosas en el mismo fichero, listar documentos descargaba el
 * catálogo entero de plantillas. Aquí viven las dos declaraciones que sí hacen
 * falta desde el principio, y no dependen de nada.
 */
export interface CadStarterChoice {
  /** Vacío = lienzo en blanco, que sigue siendo una opción legítima. */
  templateId: string;
  /** Vacío = el papel que trae la plantilla. */
  paper: string;
  location: string;
  dro: string;
}

export const EMPTY_CAD_STARTER_CHOICE: CadStarterChoice = {
  templateId: "",
  paper: "",
  location: "",
  dro: "",
};
