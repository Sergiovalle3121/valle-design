/**
 * Registro del viewport VIVO del estudio.
 *
 * ## Por qué existe un registro y no una prop
 *
 * La capa de colaboración necesita UNA cosa del editor: la cámara. Sin ella no
 * hay comentario anclado que valga —un comentario que no se mueve con el zoom
 * es una nota de post-it, no una anotación sobre el plano—. Pero el editor es
 * `Layout3DEditor.tsx`, 22.777 líneas bajo un trinquete que sólo permite que
 * ENCOJA (`scripts/cad/check-monolith-budget.mjs`): pasar la cámara por props
 * hasta el consumidor cuesta decenas de líneas de tubería dentro del monolito,
 * que es exactamente lo que ese gate existe para impedir.
 *
 * Así que el monolito publica su controlador en cuanto lo crea y lo retira en
 * su limpieza. Son DOS asignaciones que ya existían
 * (`viewControllerRef.current = …`) envueltas en esta función, más un import:
 * una línea neta. Todo lo demás —proyección, anclas, cursores, sondeo— vive
 * fuera, en módulos con spec propio.
 *
 * ## Por qué es un módulo global y por qué eso NO es una fuga
 *
 * El estudio monta UN editor por pestaña: `CadStudioHost` renderiza un
 * `Layout3DEditor` y la página de documento renderiza un `CadStudioHost`. No
 * hay un segundo viewport con el que confundirse.
 *
 * Lo que sí podría pasar —y sería un fallo silencioso de los que este
 * repositorio no admite— es que la capa de colaboración siguiera pintando
 * chinchetas contra una cámara MUERTA tras desmontar el editor: las
 * coordenadas seguirían proyectando, los números seguirían siendo finitos y el
 * plano de debajo ya no estaría. Por eso `publishCadViewport(null)` no es
 * opcional ni cortés: es la señal de que ya no hay dónde anclar nada, y los
 * suscriptores la reciben para APAGARSE, no para congelar el último dibujo.
 */
import type { CadPoint2 } from "../cad-document";

/**
 * Lo único que la colaboración le pide a la cámara.
 *
 * Deliberadamente NO es `CadViewController`: así el modelo y el overlay se
 * prueban en Node con un doble de tres métodos, sin THREE ni WebGL, que es
 * como se prueba todo lo demás del viewport en este repositorio.
 * `CadViewController` la satisface estructuralmente.
 */
export interface CadCollabViewport {
  /** Punto de DIBUJO → píxel del lienzo. */
  worldToScreen(point: CadPoint2): CadPoint2;
  /** Píxel del lienzo → punto de DIBUJO (null si el rayo no toca el plano). */
  screenToWorld(offsetX: number, offsetY: number): CadPoint2 | null;
  /** Tamaño del lienzo en píxeles CSS. */
  readonly view: { readonly widthPx: number; readonly heightPx: number };
  /** Se dispara en cada paneo, zoom, giro o cambio de tamaño. */
  onChange(listener: () => void): () => void;
}

/**
 * La cámara Y el elemento sobre el que se superpone. Van juntos porque son
 * inseparables: proyectar a píxeles sin saber sobre qué lienzo se pintan esos
 * píxeles no sirve de nada, y buscar el lienzo con un `querySelector` ataría
 * la colaboración a una clase de Tailwind del monolito.
 */
export interface CadCollabSurface {
  viewport: CadCollabViewport;
  /** El mismo elemento que hospeda el cursor vivo y el menú de grips. */
  container: HTMLElement;
}

export type CadViewportSubscriber = (surface: CadCollabSurface | null) => void;

let active: CadCollabSurface | null = null;
const subscribers = new Set<CadViewportSubscriber>();

/**
 * Publica (o retira, con `null`) el viewport activo y lo DEVUELVE.
 *
 * Devuelve su argumento para poder envolver una asignación que ya existe sin
 * añadir una sentencia al monolito:
 *
 * ```ts
 * viewControllerRef.current = publishCadViewport(viewController, mount); // montaje
 * viewControllerRef.current = publishCadViewport(null);                  // limpieza
 * ```
 *
 * Publicar un viewport SIN contenedor lo retira: una cámara sin lienzo no es
 * una superficie de colaboración a medias, es ninguna.
 */
export function publishCadViewport<T extends CadCollabViewport | null>(
  viewport: T,
  container?: HTMLElement | null,
): T {
  const next: CadCollabSurface | null =
    viewport && container ? { viewport, container } : null;
  if (active?.viewport === next?.viewport && active?.container === next?.container)
    return viewport;
  active = next;
  // Copia de la lista: un suscriptor puede darse de baja al recibir `null`
  // (es justo lo que hace la capa de colaboración al apagarse), y mutar el Set
  // mientras se recorre se salta al siguiente sin avisar.
  for (const subscriber of [...subscribers]) subscriber(active);
  return viewport;
}

/** La superficie de ahora mismo, o null si no hay editor montado. */
export function activeCadCollabSurface(): CadCollabSurface | null {
  return active;
}

/**
 * Suscripción a la superficie activa. Llama al suscriptor INMEDIATAMENTE con
 * el estado actual: quien se suscribe después del montaje del editor tiene que
 * enterarse igual, y hacerlo aquí evita que cada consumidor repita el mismo
 * `if (activeCadCollabSurface())` con su propia condición de carrera.
 */
export function onCadViewportPublished(
  subscriber: CadViewportSubscriber,
): () => void {
  subscribers.add(subscriber);
  subscriber(active);
  return () => {
    subscribers.delete(subscriber);
  };
}

/** Sólo para specs: deja el registro como recién cargado. */
export function resetCadViewportRegistryForTests(): void {
  active = null;
  subscribers.clear();
}
