/**
 * ÓRDENES QUE AÚN NO ESTÁN DISPONIBLES — y que lo dicen en vez de fingir.
 *
 * ## Qué pasaba (medido en la auditoría del 2026-09-19)
 *
 * - Los 13 comandos de render, luces y materiales emitían una petición al
 *   anfitrión (`render-capture`, `light-create`, `material-attach`…) que NADIE
 *   atendía: la cadena de anfitriones terminaba en `plot-host.ts`, que respondía
 *   «la atiende el anfitrión del motor», y el anfitrión del motor no la atendía.
 *   RENDER era además un botón GRANDE de Salida › Render.
 * - Los 8 de visualización (3DWALK, CAMERA, DVIEW…) terminaban en «requiere
 *   anfitrión con visor 3D»: el visor 3D existe y tampoco los atiende.
 * - SURFSCULPT y SURFUNTRIM BORRABAN el sólido designado y dejaban una placa de
 *   0,1 mm o 0,001 mm del rectángulo que lo envolvía, anunciando «Sólido
 *   esculpido» o «Superficie restaurada»; un cubo de 500 000 mm³ se quedaba en
 *   1 000. MESHCOLLAPSE ponía la caja envolvente encima de la malla (una
 *   pirámide de 333 333 mm³ ganaba una caja de 2 000 000).
 *
 * ## Qué hacen ahora
 *
 * Terminan en su PRIMER paso con un renglón que dice que aún no están
 * disponibles y por qué, sin pedir nada, sin petición a ningún anfitrión y sin
 * tocar el documento. Siguen en el registro —quien teclea RENDER porque viene
 * de AutoCAD recibe una respuesta honesta, no «Comando desconocido»— pero NO
 * tienen botón en la cinta (`ribbon.ts` los declara no-expuestos desde esta
 * tabla): un botón que no hace nada es peor que un botón que no está.
 *
 * El día que uno de verdad funcione se BORRA de aquí; la cinta lo vuelve a
 * montar sola y `command-availability.spec.ts` deja de exigirle la negativa.
 *
 * Este módulo no importa nada en ejecución: la cinta lo lee al abrir el
 * estudio y no debe arrastrar ninguna implementación de comandos.
 */
import type { CadCommandDescriptor, CadCommandKind, CadCommandStep } from "./command-types";

/** Por qué no está disponible, en una frase que termina sin punto. */
export const CAD_COMANDOS_AUN_NO_DISPONIBLES: Readonly<Record<string, string>> = {
  // Render, luces y materiales: no hay motor de render ni el documento guarda
  // luces o materiales. Estilos de la vista, con VSCURRENT.
  RENDER: "VALLECAD todavía no tiene motor de render; para ver el modelo sombreado use VSCURRENT",
  RENDERPRESETS: "no hay motor de render cuya calidad ajustar",
  RENDEREXPOSURE: "no hay motor de render cuya exposición ajustar",
  RENDERENVIRONMENT: "no hay motor de render cuyo fondo o iluminación cambiar",
  RENDERCROP: "no hay motor de render que produzca la imagen de una región",
  RENDERWIN: "no hay ventana de render que abrir",
  MATERIALS: "el dibujo todavía no guarda materiales y no hay biblioteca que explorar",
  MATERIALATTACH: "el dibujo todavía no guarda materiales por objeto",
  MATERIALMAP: "el dibujo todavía no guarda materiales ni su mapeado",
  POINTLIGHT: "el dibujo todavía no guarda luces y el visor 3D no las pinta",
  SPOTLIGHT: "el dibujo todavía no guarda luces y el visor 3D no las pinta",
  DISTANTLIGHT: "el dibujo todavía no guarda luces y el visor 3D no las pinta",
  SUNPROPERTIES: "el visor 3D todavía no simula el sol",
  // Visualización: el visor 3D no tiene estos modos. Lo que sí hay: 3DORBIT y
  // VPOINT para orientar la vista, VSCURRENT para el estilo visual.
  "3DWALK": "el visor 3D todavía no tiene modo de paseo; para girar la vista use 3DORBIT",
  "3DFLY": "el visor 3D todavía no tiene modo de vuelo; para girar la vista use 3DORBIT",
  "3DSWIVEL": "el visor 3D todavía no gira la cámara sobre sí misma; para girar la vista use 3DORBIT",
  VISUALSTYLES: "no hay administrador de estilos visuales; para cambiar el estilo de la vista use VSCURRENT",
  CAMERA: "el dibujo todavía no guarda cámaras; para orientar la vista use 3DORBIT o VPOINT",
  DVIEW: "la vista dinámica todavía no existe; para orientar la vista use 3DORBIT o VPOINT",
  NAVVCUBE: "el cubo de navegación todavía no se controla desde la línea de comandos",
  NAVBAR: "la barra de navegación todavía no existe en VALLECAD",
  // Los tres que DESTRUÍAN trabajo: ahora se niegan sin tocar nada.
  SURFSCULPT: "el núcleo todavía no convierte superficies en un sólido; su sólido no se toca",
  SURFUNTRIM: "el núcleo todavía no rehace los bordes de una superficie; su sólido no se toca",
  MESHCOLLAPSE: "el núcleo todavía no colapsa caras ni aristas de una malla; su malla no se toca",
};

/** ¿Este comando (canónico, cualquier caja) está declarado como aún no disponible? */
export function cadComandoAunNoDisponible(name: string): boolean {
  return Object.hasOwn(CAD_COMANDOS_AUN_NO_DISPONIBLES, name.toUpperCase());
}

/** El renglón con el que responde. Lanza si el comando no está en la tabla. */
export function cadMensajeAunNoDisponible(name: string): string {
  const canonical = name.toUpperCase();
  const motivo = CAD_COMANDOS_AUN_NO_DISPONIBLES[canonical];
  if (motivo === undefined)
    throw new Error(`${canonical} no está declarado como aún no disponible.`);
  return `${canonical} aún no está disponible: ${motivo}.`;
}

/**
 * El descriptor de una orden aún no disponible.
 *
 * Conserva lo que identifica a la orden —nombre, alias, `kind` y si es
 * transparente— y fija lo demás a lo que de verdad hace: no designa, no se
 * repite con Intro, no muta y no cambia el cursor. Termina en `begin`, así que
 * ni pide una designación que no va a usar ni deja una orden abierta.
 */
export function cadDescriptorAunNoDisponible(meta: {
  name: string;
  aliases: readonly string[];
  kind: CadCommandKind;
  transparent: boolean;
}): CadCommandDescriptor<null> {
  const text = cadMensajeAunNoDisponible(meta.name);
  const negativa: CadCommandStep<null> = {
    state: null,
    prompt: { message: text, options: [] },
    accepts: 0,
    result: { kind: "message", text },
  };
  return {
    name: meta.name,
    aliases: meta.aliases,
    kind: meta.kind,
    transparent: meta.transparent,
    selection: "none",
    repeatable: false,
    mutates: false,
    cursor: "none",
    begin: () => negativa,
    step: () => negativa,
  };
}
