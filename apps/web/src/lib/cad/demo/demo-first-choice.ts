import { DEMO_STORAGE_KEY } from "./demo-constants";

/** Preferencia nueva; nunca cambia ni borra la clave histórica del dibujo. */
export const DEMO_FIRST_CHOICE_STORAGE_KEY = "valle:cad:demo-first-choice:v1";

export const DEMO_STARTING_CHOICES = [
  { id: "casa-habitacion", label: "Casa habitación", description: "Explora una planta de casa que ya puedes editar." },
  { id: "departamento", label: "Departamento", description: "Empieza con una planta de departamento editable." },
  { id: "local-comercial", label: "Local comercial", description: "Prueba una planta para un local y sus espacios." },
  { id: "en-blanco", label: "En blanco", description: "Dibuja desde cero en un plano vacío." },
] as const;

export type DemoStartingChoice = (typeof DEMO_STARTING_CHOICES)[number]["id"];

function isDemoStartingChoice(value: string | null): value is DemoStartingChoice {
  return DEMO_STARTING_CHOICES.some(({ id }) => id === value);
}

/** null = primera visita. Un autosave anterior identifica a una visita heredada. */
export function readDemoFirstChoice(storage: Pick<Storage, "getItem"> | null): DemoStartingChoice | null {
  try {
    const preferred = storage?.getItem(DEMO_FIRST_CHOICE_STORAGE_KEY) ?? null;
    if (isDemoStartingChoice(preferred)) return preferred;
    return storage?.getItem(DEMO_STORAGE_KEY) ? "casa-habitacion" : null;
  } catch {
    return null;
  }
}

/** Una elección o el vencimiento de cinco segundos basta; el dibujo vive en otra clave. */
export function rememberDemoFirstChoice(
  storage: Pick<Storage, "setItem"> | null,
  choice: DemoStartingChoice,
): void {
  try {
    storage?.setItem(DEMO_FIRST_CHOICE_STORAGE_KEY, choice);
  } catch {
    // El modo privado sin almacenamiento aún permite dibujar en memoria.
  }
}
