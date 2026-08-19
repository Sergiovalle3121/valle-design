/**
 * Lo que el VISOR necesita saber del SCU: la vista en planta y el icono.
 *
 * ## Por qué la planta es aritmética y no una cámara
 *
 * `PLAN` no mueve una cámara: DECIDE hacia dónde hay que mirar. Quién sostiene
 * la cámara —el controlador de vista, con sus dos proyecciones y su THREE— es
 * otro problema y pertenece a otra sesión en esta ola. Separarlos permite
 * probar `PLAN` en Node sobre números y deja el enganche con el visor en una
 * sola función.
 *
 * ## El límite que hay que decir en voz alta
 *
 * El visor 2D mira SIEMPRE a lo largo de la Z del mundo. Con un SCU de planta
 * —el edificio girado 23,5°— basta con girar la vista, y eso el visor 2D lo
 * sabe hacer: `CadView.twistDeg` existe desde el primer día y reservado
 * literalmente «para UCS». Con un SCU INCLINADO no basta: hay que llevar la
 * cámara fuera del eje Z, y eso es la cámara 3D.
 *
 * Por eso `twistDeg` es `number | null` y no un número con un cero cómodo. Un
 * cero diría «no hace falta girar» cuando lo que pasa es «esta vista no puede
 * enseñar ese plano», y el usuario vería su faldón inclinado dibujado como si
 * fuera una planta. Se falla cerrado: el visor 2D dice que no puede, y la
 * geometría de la planta —que sí está calculada aquí, entera— queda disponible
 * para quien tenga cámara con la que enseñarla.
 */
import type { CadPoint2, CadPoint3 } from "./cad-document";
import type { CadVariableAccess } from "./system-variables";
import { cadUcsRotationDeg, worldToUcs, type CadNamedUcs } from "./ucs";

export interface CadUcsPlanView {
  ucs: CadNamedUcs;
  /** Punto del mundo al que se mira: el origen del SCU. */
  target: CadPoint3;
  /** Dirección en la que mira el observador: la Z del SCU, hacia el papel. */
  forward: CadPoint3;
  /** Vertical de la pantalla: la Y del SCU. */
  up: CadPoint3;
  /**
   * Giro que hay que dar a la vista 2D para que el eje X del SCU salga hacia la
   * derecha, en grados. `null` cuando el plano del SCU no es el plano del
   * mundo: entonces esta vista no se puede componer girando, hace falta mover
   * la cámara.
   */
  twistDeg: number | null;
}

/** La vista en planta del SCU: hacia dónde mirar y cuánto girar. */
export function cadUcsPlanView(ucs: CadNamedUcs): CadUcsPlanView {
  return {
    ucs,
    target: ucs.origin,
    forward: { x: -ucs.zAxis.x, y: -ucs.zAxis.y, z: -ucs.zAxis.z },
    up: ucs.yAxis,
    twistDeg: cadUcsRotationDeg(ucs),
  };
}

/**
 * Dónde cae un punto del mundo DENTRO de la planta: sus coordenadas sobre el
 * papel que la planta representa.
 *
 * Es la comprobación que convierte a `PLAN` en algo medible: si se dibujó en el
 * SCU tecleando `100,50`, la planta tiene que enseñar ese punto en `(100, 50)`,
 * esté el plano donde esté. La cota que se descarta al proyectar es la
 * distancia del punto al plano, y quien necesite saberla la pide aparte.
 */
export function cadUcsPlanPoint(point: CadPoint2 | CadPoint3, plan: CadUcsPlanView): CadPoint2 {
  const local = worldToUcs(point, plan.ucs);
  return { x: local.x, y: local.y };
}

/**
 * Estado del icono del SCU.
 *
 * ## Dónde vive, y por qué ahí
 *
 * En las VARIABLES DE SISTEMA de la sesión, junto al resto del estado del SCU,
 * y no en el documento ni en un módulo aparte. La razón está escrita en la
 * cabecera de `system-variables.ts` y no ha cambiado: con dos sitios donde
 * guardar lo mismo, un `.scr` que fija `UCSICON` y un comando que lo fija por
 * su cuenta acaban discrepando. Además no es un dato del dibujo —dos personas
 * con el mismo plano abierto pueden tener el icono en sitios distintos—, así
 * que meterlo en `CadDocument` lo haría viajar por la red y aparecer en el
 * diff de un plano que no ha cambiado.
 *
 * Los bits son los de AutoCAD, para que un `.scr` traído de fuera signifique lo
 * mismo aquí: 1 visible, 2 en el origen.
 */
export interface CadUcsIconState {
  visible: boolean;
  /** `true` lo planta en el origen del SCU; `false`, en la esquina del lienzo. */
  atOrigin: boolean;
  /** Lado del icono en píxeles. Es la única propiedad que el usuario ajusta. */
  sizePx: number;
}

export const CAD_UCSICON_VISIBLE_BIT = 1;
export const CAD_UCSICON_ORIGIN_BIT = 2;

export function cadUcsIconState(variables: CadVariableAccess): CadUcsIconState {
  const bits = Number(variables.get("UCSICON") ?? 0);
  return {
    visible: (bits & CAD_UCSICON_VISIBLE_BIT) !== 0,
    atOrigin: (bits & CAD_UCSICON_ORIGIN_BIT) !== 0,
    sizePx: Number(variables.get("UCSICONSIZE") ?? 12),
  };
}

export function cadUcsIconBits(state: Pick<CadUcsIconState, "visible" | "atOrigin">): number {
  return (
    (state.visible ? CAD_UCSICON_VISIBLE_BIT : 0) | (state.atOrigin ? CAD_UCSICON_ORIGIN_BIT : 0)
  );
}

export function describeCadUcsIcon(state: CadUcsIconState): string {
  if (!state.visible) return "El icono del SCU está desactivado.";
  return (
    `El icono del SCU está activado, ${state.atOrigin ? "en el origen del SCU" : "en la esquina del lienzo"}` +
    `, ${state.sizePx} px.`
  );
}
