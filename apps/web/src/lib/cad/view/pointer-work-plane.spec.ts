/**
 * El punto del puntero cae en el plano de trabajo, no en el suelo.
 *
 * La prueba que decide si esto sirve: con un SCU apoyado en una FACHADA, el
 * punto tiene que satisfacer la ECUACIÓN de ese plano. Se comprueba con el
 * producto escalar contra su normal y no contra un número calculado a mano, que
 * sería comprobar la fórmula consigo misma.
 *
 * Y la otra mitad, igual de importante: sin plano de trabajo el resultado tiene
 * que ser el de siempre, dígito a dígito, porque ese es el 99 % del trabajo y lo
 * que cubre toda la suite dorada.
 */
import { strict as assert } from "node:assert";
import * as THREE from "three";
import { cadUcsFromPlane, type CadNamedUcs } from "../ucs";
import { cadPointerWorldFromRay, type CadPointerFrame } from "./pointer-work-plane";

/** Marco realista del editor: una planta de 12.000 × 10.000. */
const MARCO: CadPointerFrame = { s: 0.02, W: 12_000, H: 10_000 };

function marco(nombre: string, origen: { x: number; y: number; z: number }, normal: { x: number; y: number; z: number }, ejeX: { x: number; y: number; z: number }): CadNamedUcs {
  const salida = cadUcsFromPlane(nombre, origen, normal, ejeX);
  assert.ok(salida.ok, `el marco ${nombre} se construye`);
  return (salida as { ok: true; ucs: CadNamedUcs }).ucs;
}

/** Distancia con signo de un punto al plano del marco. Cero = está en él. */
function fueraDelPlano(ucs: CadNamedUcs, p: { x: number; y: number; z?: number }): number {
  const d = {
    x: p.x - ucs.origin.x,
    y: p.y - ucs.origin.y,
    z: (p.z ?? 0) - ucs.origin.z,
  };
  return d.x * ucs.zAxis.x + d.y * ucs.zAxis.y + d.z * ucs.zAxis.z;
}

// --- sin plano de trabajo: el suelo, exactamente como siempre ---------------
{
  // Un rayo que baja en vertical por el origen de la escena. Contra el suelo
  // (y = 0 de escena) corta en (0,0,0), que en dibujo es el centro de la huella.
  const rayo = new THREE.Ray(
    new THREE.Vector3(0, 100, 0),
    new THREE.Vector3(0, -1, 0),
  );
  const punto = cadPointerWorldFromRay(rayo, MARCO, null);
  assert.ok(punto, "un rayo que baja corta el suelo");
  assert.equal(punto!.wx, MARCO.W / 2, "cae en el centro de la huella en X");
  assert.equal(punto!.wy, MARCO.H / 2, "y en el centro en Y");
  assert.equal(
    punto!.wz,
    undefined,
    "sin plano de trabajo NO se inventa una cota: eso cambiaría los bytes de todo documento dibujado a mano",
  );
}

// --- un rayo paralelo al suelo no corta, y se dice --------------------------
{
  const rasante = new THREE.Ray(
    new THREE.Vector3(0, 50, 0),
    new THREE.Vector3(1, 0, 0),
  );
  assert.equal(
    cadPointerWorldFromRay(rasante, MARCO, null),
    null,
    "un rayo paralelo al suelo devuelve null en vez de un punto inventado",
  );
}

// --- con el SCU en una FACHADA: el punto cae EN la fachada ------------------
{
  // Fachada vertical: normal +Y del dibujo, a 7.500 de fondo. Es el caso del
  // defecto medido en el navegador.
  const fachada = marco(
    "FACHADA",
    { x: 6_000, y: 7_500, z: 1_500 },
    { x: 0, y: 1, z: 0 },
    { x: 1, y: 0, z: 0 },
  );

  // Un rayo oblicuo que la mira de frente. En coordenadas de ESCENA: la Y del
  // dibujo es la Z de la escena, así que avanzar en +Y de dibujo es avanzar en
  // +Z de escena.
  const origenEscena = new THREE.Vector3(0, 60, -60);
  const rayo = new THREE.Ray(origenEscena, new THREE.Vector3(0, -0.4, 1).normalize());

  const punto = cadPointerWorldFromRay(rayo, MARCO, fachada);
  assert.ok(punto, "con el SCU en la fachada hay punto");
  assert.equal(typeof punto!.wz, "number", "y ese punto SÍ trae cota: está fuera del suelo");
  const fuera = fueraDelPlano(fachada, { x: punto!.wx, y: punto!.wy, z: punto!.wz });
  assert.ok(
    Math.abs(fuera) <= 1e-6,
    `el punto está EN el plano de la fachada (distancia ${fuera})`,
  );

  // Y no es el punto que habría dado el suelo. Si lo fuera, el arreglo no hace
  // nada: el defecto medido era exactamente que salían iguales.
  const enElSuelo = cadPointerWorldFromRay(rayo, MARCO, null);
  assert.ok(enElSuelo, "el mismo rayo también corta el suelo");
  assert.ok(
    Math.abs(punto!.wy - enElSuelo!.wy) > 1,
    "el punto de la fachada NO es el que daba el plano del suelo",
  );
}

// --- un faldón inclinado a 45°, que es el caso que no cabe en «vertical» ----
{
  const faldon = marco(
    "FALDON",
    { x: 0, y: 0, z: 3_000 },
    { x: 0, y: Math.SQRT1_2, z: Math.SQRT1_2 },
    { x: 1, y: 0, z: 0 },
  );
  const rayo = new THREE.Ray(
    new THREE.Vector3(0, 200, 0),
    new THREE.Vector3(0, -1, 0.2).normalize(),
  );
  const punto = cadPointerWorldFromRay(rayo, MARCO, faldon);
  assert.ok(punto, "el faldón también da punto");
  const fuera = fueraDelPlano(faldon, { x: punto!.wx, y: punto!.wy, z: punto!.wz });
  assert.ok(
    Math.abs(fuera) <= 1e-6,
    `el punto está EN el plano del faldón (distancia ${fuera})`,
  );
  // La cota tiene que ser distinta de cero: si saliera 0, seguiría en el suelo.
  assert.ok(
    Math.abs(punto!.wz ?? 0) > 1,
    `sobre un faldón a 3.000 la cota no puede ser cero (fue ${punto!.wz})`,
  );
}

// --- un plano paralelo al rayo se dice, no se inventa ----------------------
{
  // Plano cuya normal es perpendicular a la dirección del rayo: paralelos.
  const canto = marco(
    "CANTO",
    { x: 0, y: 0, z: 0 },
    { x: 1, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 },
  );
  // Rayo que avanza en +Y de dibujo (= +Z de escena), sin componente X.
  const rayo = new THREE.Ray(
    new THREE.Vector3(0, 0, -100),
    new THREE.Vector3(0, 0, 1),
  );
  assert.equal(
    cadPointerWorldFromRay(rayo, MARCO, canto),
    null,
    "un rayo paralelo al plano de trabajo devuelve null",
  );
}

// --- la huella descentrada no descoloca la dirección -----------------------
// El error clásico de esta conversión es meterle el `+W/2` a la dirección. Con
// una huella grande y un rayo oblicuo, ese error saca el punto del plano.
{
  const grande: CadPointerFrame = { s: 0.005, W: 200_000, H: 150_000 };
  const fachada = marco(
    "FACHADA-LEJOS",
    { x: 190_000, y: 140_000, z: 0 },
    { x: 0, y: 1, z: 0 },
    { x: 1, y: 0, z: 0 },
  );
  const rayo = new THREE.Ray(
    new THREE.Vector3(300, 200, -300),
    new THREE.Vector3(0.3, -0.5, 1).normalize(),
  );
  const punto = cadPointerWorldFromRay(rayo, grande, fachada);
  assert.ok(punto, "con la huella descentrada también hay punto");
  const fuera = fueraDelPlano(fachada, { x: punto!.wx, y: punto!.wy, z: punto!.wz });
  assert.ok(
    Math.abs(fuera) <= 1e-6,
    `con huella descentrada el punto sigue EN el plano (distancia ${fuera})`,
  );
}

console.log("cad pointer work plane specs passed");
