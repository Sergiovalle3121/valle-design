/**
 * Donde `PLAN` deja de ser una petición y mueve la vista de verdad.
 *
 * ## Por qué un anfitrión propio de tres funciones
 *
 * `PLAN` necesita del visor lo mínimo imaginable: leer la vista actual y
 * devolverla con otro centro y otro giro. Meter eso en `view-navigation.ts`
 * habría obligado a añadir una clase de `CadViewRequest` —y con ella la noción
 * de ORIENTACIÓN— dentro del módulo de navegación, que en esta ola pertenece a
 * otra sesión. Este archivo es la interfaz más estrecha que hace el trabajo:
 * depende del TIPO `CadView` y de nada más, exactamente igual que
 * `dxf-host.ts` depende del tipo de la petición y no del motor.
 *
 * ## Lo que se niega, y por qué negarlo es lo correcto
 *
 * El visor 2D mira siempre a lo largo de la Z del mundo. La planta de un SCU de
 * planta —el edificio girado— se compone girando la vista, y eso sí sabe
 * hacerlo. La planta de un SCU apoyado en una cara inclinada exige sacar la
 * cámara del eje Z, y eso es la cámara 3D. Cuando `twistDeg` viene nulo se dice
 * en voz alta en vez de girar «lo que se pueda»: una planta a medias enseñaría
 * el faldón deformado y sin avisar, y el usuario acotaría sobre ella.
 */
import type { CadHostRequest } from "@/lib/cad/engine/host-requests";
import type { CadViewControllerLike } from "./navigation-host";

export interface CadUcsPlanHostBridge {
  /** Controlador vivo, o `null` mientras no hay escena. */
  controller(): CadViewControllerLike | null;
}

/**
 * Atiende la petición de `PLAN`. Devuelve el renglón que hay que enseñar, o
 * `null` si la petición no es suya —así se encadena con los demás anfitriones
 * sin que ninguno tenga que conocer a los otros.
 */
export function handleCadUcsPlanRequest(
  request: CadHostRequest,
  bridge: CadUcsPlanHostBridge,
): string | null {
  if (request.kind !== "ucs-plan") return null;
  const controller = bridge.controller();
  if (!controller)
    return "Todavía no hay ninguna vista activa: abre un dibujo antes de pedir su planta.";

  const { plan } = request;
  if (plan.twistDeg === null)
    return (
      `El SCU "${plan.ucs.name}" se apoya en un plano inclinado y esta ventana mira siempre a lo largo ` +
      "de la Z del mundo: su planta necesita mover la cámara, no girar la vista. Lo que sí vale ya es " +
      "dibujar en él: las coordenadas que teclee se miden sobre ese plano."
    );

  controller.setView({
    ...controller.view,
    centerX: plan.target.x,
    centerY: plan.target.y,
    twistDeg: plan.twistDeg,
  });
  return `Vista en planta del SCU "${plan.ucs.name}": giro ${plan.twistDeg.toFixed(2)}°.`;
}
