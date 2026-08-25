/**
 * `snapshotCadCamera`: la copia tiene que ser una copia de verdad.
 *
 * La cámara y el target de OrbitControls son objetos MUTABLES que Three.js
 * actualiza en su sitio en cada cuadro. Si `snapshotCadCamera`
 * devolviera una referencia al mismo objeto en vez de copiar `x/y/z`, la
 * "última cámara conocida" que este módulo existe para preservar se movería
 * sola en cuanto el usuario volviera a orbitar — exactamente el defecto que
 * un snapshot debe impedir.
 */
import { check, report } from "../../brep/spec-support";
import { snapshotCadCamera } from "./camera-continuity";

const position = { x: 12.5, y: 34, z: -7.25 };
const target = { x: 1, y: 2, z: 3 };
const snapshot = snapshotCadCamera(position, target);

check("posición copiada: x", snapshot.position.x === 12.5);
check("posición copiada: y", snapshot.position.y === 34);
check("posición copiada: z", snapshot.position.z === -7.25);
check("target copiado: x", snapshot.target.x === 1);
check("target copiado: y", snapshot.target.y === 2);
check("target copiado: z", snapshot.target.z === 3);

// Mutar los objetos de ENTRADA después de capturar no debe tocar el snapshot:
// es exactamente lo que Three.js hace en cada cuadro con `camera.position`.
position.x = 999;
target.z = -999;
check(
  "el snapshot no comparte referencia con la posición de entrada",
  snapshot.position.x === 12.5,
  `se esperaba 12.5 y quedó en ${snapshot.position.x} tras mutar la entrada`,
);
check(
  "el snapshot no comparte referencia con el target de entrada",
  snapshot.target.z === 3,
  `se esperaba 3 y quedó en ${snapshot.target.z} tras mutar la entrada`,
);

// Acepta cualquier cosa con forma {x,y,z} — un THREE.Vector3 real, no sólo un
// literal — porque así es como se llama desde Layout3DEditor.tsx.
class Vec3Like {
  constructor(
    public x: number,
    public y: number,
    public z: number,
  ) {}
}
const fromClassInstance = snapshotCadCamera(
  new Vec3Like(5, 6, 7),
  new Vec3Like(8, 9, 10),
);
check(
  "acepta instancias de clase con x/y/z, no sólo literales",
  fromClassInstance.position.x === 5 &&
    fromClassInstance.position.y === 6 &&
    fromClassInstance.position.z === 7 &&
    fromClassInstance.target.x === 8 &&
    fromClassInstance.target.y === 9 &&
    fromClassInstance.target.z === 10,
);

report("camera-continuity", 9);
