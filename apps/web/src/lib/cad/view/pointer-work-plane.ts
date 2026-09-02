/**
 * El punto de dibujo bajo el puntero, resuelto contra el PLANO DE TRABAJO.
 *
 * ## El defecto que este módulo cierra
 *
 * Hasta ahora el rayo del cursor se cruzaba siempre contra el plano del SUELO,
 * escrito a fuego dentro del editor. Con un SCU apoyado en una fachada eso
 * significaba que un arquitecto dibujaba una línea con dos clics **sobre la
 * fachada** y el trazo aparecía en el suelo, sin aviso. Medido en el navegador,
 * con el SCU en `(6000, 7500, 1500)` y eje Z `(0,1,0)`, la línea guardada salía
 * `{start:{x:6000,y:5000,z:0}, end:{x:5613.69,y:7500,z:0}}`: el primer punto es
 * el centro de la huella en el suelo, ni siquiera está sobre el sólido, y los
 * dos tienen cota cero.
 *
 * Y era peor de lo que parece. El motor FALLA EN CERRADO ante un SCU inclinado
 * para todo comando que no se declare `spatial`, así que a 112 de 113 les habría
 * dicho que no. Pero `LINE` sí se declara espacial —conserva la cota del punto
 * que recibe—, de modo que aceptaba de buena fe un punto que venía del suelo.
 * **El único comando que sabía dibujar fuera del plano era el único capaz de
 * producir geometría equivocada en silencio.**
 *
 * ## Por qué vive aquí y no en el editor
 *
 * Porque en el editor sólo se podría probar montando un lienzo, una cámara y un
 * `pointermove`. Aquí es aritmética: entra un rayo de escena, el marco de la
 * huella y el plano de trabajo, y sale un punto de dibujo. Es el mismo argumento
 * que da `pick3d/scene-ray.ts` de sí mismo, y el mismo reparto: el editor pasa
 * lo que ya tiene.
 *
 * ## El camino del suelo no cambia ni un bit
 *
 * Cuando no hay plano de trabajo se conserva la intersección de THREE tal cual,
 * con su plano y su vector reutilizados. No es prudencia difusa: `intersectPlane`
 * y `cadRayPlanePoint` resuelven la misma intersección con aritmética distinta, y
 * una diferencia en el último bit movería el punto imantado en los goldens, que
 * corren en 3D. El 99 % del trabajo es el SCU universal y ese camino queda
 * intacto por construcción.
 */
import * as THREE from "three";
import type { CadNamedUcs } from "../ucs";
import { cadRayPlanePoint } from "../infer/inference-engine";
import { cadSceneRayToDrawing } from "../pick3d/scene-ray";

/** Escala y huella del dibujo: lo que el editor llama `ctx`. */
export interface CadPointerFrame {
  /** Unidades de escena por unidad de dibujo. */
  s: number;
  /** Ancho de la huella, en unidades de dibujo. */
  W: number;
  /** Alto de la huella, en unidades de dibujo. */
  H: number;
}

/**
 * Punto de dibujo bajo el puntero.
 *
 * `wz` viene SÓLO cuando hay plano de trabajo inclinado. Bajo el SCU universal
 * se omite, y es deliberado: los comandos espaciales pasan el punto tal cual a
 * la entidad que escriben, así que una cota de más cambiaría los bytes de todo
 * documento dibujado a mano.
 */
export interface CadPointerWorld {
  wx: number;
  wy: number;
  wz?: number;
}

/**
 * Punto de dibujo con su cota, o SIN la propiedad cuando no la hay.
 *
 * Existe para que la omisión sea una decisión escrita en un sitio y no un `if`
 * repetido por el editor. Un `z: undefined` presente no es lo mismo que un `z`
 * ausente: los comandos espaciales pasan el objeto TAL CUAL a la entidad que
 * escriben, así que la propiedad llegaría al documento.
 */
export function cadDrawingPoint(
  x: number,
  y: number,
  z?: number,
): { x: number; y: number; z?: number } {
  return z === undefined ? { x, y } : { x, y, z };
}

/**
 * Lo que devuelve el puntero del editor, ya en la forma que espera el motor.
 *
 * El editor habla `{wx, wy, wz}` —lo lleva haciendo desde antes de que existiera
 * el motor de comandos— y el motor habla `{x, y, z}`. La traducción es de una
 * línea, pero repetirla en cada callback es cómo se cuela un `wz` olvidado; y
 * viviendo aquí, además, sale del monolito, que sólo puede encoger.
 */
export function cadDrawingPointOrNull(
  world: { wx: number; wy: number; wz?: number } | null,
): { x: number; y: number; z?: number } | null {
  return world ? cadDrawingPoint(world.wx, world.wy, world.wz) : null;
}

/**
 * Reutilizados entre llamadas: esto corre en CADA `pointermove`, y asignar un
 * plano y un vector por evento es basura que el recolector acaba pagando en
 * mitad de un arrastre. Compartirlos a nivel de módulo es seguro porque la
 * función los escribe y los lee dentro del MISMO turno síncrono: en JavaScript
 * no hay dos llamadas solapadas que puedan pisarse.
 */
const SUELO = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const IMPACTO = new THREE.Vector3();

/**
 * Rayo de la escena → punto de dibujo, sobre el plano que toque.
 *
 * `plane` a `null` significa el plano del suelo, que es el caso normal.
 *
 * Devuelve `null` cuando no hay punto que dar: el rayo es paralelo al plano, o
 * el plano queda a la espalda de la cámara. Decirlo es mejor que inventar un
 * punto, que caería a kilómetros de donde el usuario está mirando.
 */
export function cadPointerWorldFromRay(
  ray: THREE.Ray,
  frame: CadPointerFrame,
  plane: CadNamedUcs | null,
): CadPointerWorld | null {
  if (plane) {
    const punto = cadRayPlanePoint(
      cadSceneRayToDrawing(
        { origin: ray.origin, direction: ray.direction },
        frame,
      ),
      plane,
    );
    return punto ? { wx: punto.x, wy: punto.y, wz: punto.z } : null;
  }
  if (!ray.intersectPlane(SUELO, IMPACTO)) return null;
  return {
    wx: IMPACTO.x / frame.s + frame.W / 2,
    wy: IMPACTO.z / frame.s + frame.H / 2,
  };
}
