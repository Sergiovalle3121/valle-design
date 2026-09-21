/**
 * La familia MODERNA (AC1024/AC1027/AC1032) en la frontera del PRODUCTO.
 *
 * POR QUÉ EXISTE ESTA SPEC. El códec pasó a leer las tres versiones modernas
 * con CERO discrepancias contra el gemelo AC1015 del mismo dibujo, y el
 * producto seguía rechazándolas: `readDwgNeutralDatabase` sólo admitía
 * `AC1015` y `AC1018`. Ese hueco —leer bien y no dejar entrar— es la
 * distancia exacta entre un laboratorio y un producto, y esta spec vigila el
 * cableado que lo cierra.
 *
 * Vigila las DOS direcciones, que es lo que hace que sirva de algo:
 *
 * 1. **Con firma la conjunción de tres abre.** `ownerSigned` es `true` desde
 *    la firma del titular (2026-09-16), así que la conjunción devuelve `true`
 *    cuando las tres condiciones se cumplen. Si alguien apaga la firma, esta
 *    spec FALLA.
 * 2. **Con `allowModern` entrarían exactamente TRES.** Ni una más ni una
 *    menos: se comprueba que la puerta acumula (AC1015 siempre, AC1018 con su
 *    permiso, las tres modernas con el suyo) y que ninguna combinación deja
 *    colar una versión que nadie autorizó. Probar sólo la dirección 1 dejaría
 *    pasar un cableado que no cablea nada.
 */
import { strict as assert } from "node:assert";
import {
  DWG_AC1018_BETA_AUTHORIZATION,
  DWG_BETA_AUTHORIZATION,
  DWG_MODERN_BETA_AUTHORIZATION,
  dwgModernBetaImportIsEnabled,
} from "./dwg-interop-flag";
import { readDwgNeutralDatabase } from "./dwg-native-reader";

// ─── 1. CON FIRMA: la conjunción de tres abre cuando las tres se cumplen ──

assert.equal(
  DWG_MODERN_BETA_AUTHORIZATION.ownerSigned,
  true,
  "el titular firmó la familia moderna el 2026-09-16: esto sigue en true",
);
assert.equal(
  DWG_MODERN_BETA_AUTHORIZATION.profile,
  "AC1024_AC1027_AC1032_MODELSPACE_2D_V1",
  "la familia moderna tiene su propio nombre de perfil, distinto del de AC1015 y del de AC1018",
);
// Con las tres condiciones: abre.
assert.equal(
  dwgModernBetaImportIsEnabled(true, true),
  true,
  "dwgModernBetaImportIsEnabled(true, true) debe ser true: bandera encendida, firma real, beta base autorizada",
);
// Sin la bandera moderna: cierra.
assert.equal(
  dwgModernBetaImportIsEnabled(false, true),
  false,
  "dwgModernBetaImportIsEnabled(false, true) debe ser false: falta la bandera moderna",
);
// Sin la beta base: cierra.
assert.equal(
  dwgModernBetaImportIsEnabled(true, false),
  false,
  "dwgModernBetaImportIsEnabled(true, false) debe ser false: falta la beta base",
);
// Sin ninguna de las dos: cierra.
assert.equal(
  dwgModernBetaImportIsEnabled(false, false),
  false,
  "dwgModernBetaImportIsEnabled(false, false) debe ser false: faltan las dos",
);

// El mecanismo es PROPIO: encender AC1018 no puede encender la familia
// moderna aunque compartan el contenedor R2004. Que las dos firmadas sigan
// firmadas es parte del contrato — si alguien las apagara, el contraste de
// arriba dejaría de significar nada.
assert.equal(DWG_BETA_AUTHORIZATION.ownerSigned, true);
assert.equal(DWG_AC1018_BETA_AUTHORIZATION.ownerSigned, true);
assert.notEqual(
  DWG_MODERN_BETA_AUTHORIZATION.profile,
  DWG_AC1018_BETA_AUTHORIZATION.profile,
  "compartir contenedor R2004 no es compartir autorización: cada familia entra por su puerta",
);

// ─── 2. La PUERTA: qué versiones admite cada combinación de permisos ───────

/** Cabecera mínima con una firma concreta; basta para el rechazo por versión. */
function bytesConFirma(signature: string): Uint8Array {
  const bytes = new Uint8Array(256);
  for (let index = 0; index < signature.length; index += 1) {
    bytes[index] = signature.charCodeAt(index);
  }
  return bytes;
}

/**
 * Veredicto de la PUERTA de versiones, en tres estados y no en dos.
 *
 * Que sean tres importa: la primera versión de esta spec devolvía `null` para
 * "no rechazado por versión", y `null` tapaba por igual "pasó la puerta" y
 * "falló ANTES de llegar a ella". Con eso el spec daba verde aunque la puerta
 * no dejara pasar nada — que es exactamente el falso positivo que una prueba
 * de cableado no se puede permitir. Ahora se exige la marca POSITIVA de haber
 * pasado: el mensaje posterior nombra la versión reconocida.
 */
type VeredictoPuerta =
  | { estado: "rechazado-por-version"; mensaje: string }
  | { estado: "paso-la-puerta"; mensaje: string }
  | { estado: "fallo-antes"; mensaje: string };

function veredictoDeLaPuerta(
  signature: string,
  options: Parameters<typeof readDwgNeutralDatabase>[1],
): VeredictoPuerta {
  try {
    readDwgNeutralDatabase(bytesConFirma(signature), options);
    // Estos bytes no son un DWG completo: llegar aquí sería un lector que no
    // valida nada, y eso también es un fallo de esta prueba.
    return { estado: "fallo-antes", mensaje: "no lanzó: los bytes sintéticos no son un DWG" };
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error);
    if (mensaje.includes("Esta beta sólo lee")) {
      return { estado: "rechazado-por-version", mensaje };
    }
    if (mensaje.includes(`se reconoce como ${signature}`)) {
      return { estado: "paso-la-puerta", mensaje };
    }
    return { estado: "fallo-antes", mensaje };
  }
}

const MODERNAS = ["AC1024", "AC1027", "AC1032"] as const;

// Sin permisos: las tres modernas se rechazan, y el mensaje nombra lo que SÍ
// se admite en vez de dejar al usuario adivinando.
for (const signature of MODERNAS) {
  const veredicto = veredictoDeLaPuerta(signature, {});
  assert.equal(
    veredicto.estado,
    "rechazado-por-version",
    `${signature} sin allowModern debe rechazarse por versión: ${veredicto.mensaje}`,
  );
  assert.ok(
    veredicto.mensaje.includes("AutoCAD 2000 (AC1015)"),
    `el rechazo de ${signature} debe decir qué versión SÍ se admite: ${veredicto.mensaje}`,
  );
}

// Con AC1018 pero sin la familia moderna: siguen fuera. Es la ampliación
// silenciosa que el mecanismo separado existe para impedir.
for (const signature of MODERNAS) {
  assert.equal(
    veredictoDeLaPuerta(signature, { allowAc1018: true }).estado,
    "rechazado-por-version",
    `${signature} no puede colarse por el permiso de AC1018: son autorizaciones distintas`,
  );
}

// Con `allowModern`: las tres PASAN la puerta, y se exige la marca positiva.
// Que después fallen por estructura es lo correcto —estos bytes no son un DWG
// completo— y es justo lo que distingue "pasó" de "ni llegó".
for (const signature of MODERNAS) {
  const veredicto = veredictoDeLaPuerta(signature, { allowModern: true });
  assert.equal(
    veredicto.estado,
    "paso-la-puerta",
    `${signature} con allowModern debe pasar la puerta de versiones y fallar DESPUÉS, ` +
      `por estructura: ${veredicto.mensaje}`,
  );
}

// Y una que NADIE autorizó sigue fuera con todos los permisos encendidos: la
// puerta acumula versiones concretas, no abre por familia. AC1021 (R2007) es
// el caso que lo prueba — comparte época con las modernas y su contenedor es
// otro, así que el códec la rechaza por diseño.
const ac1021 = veredictoDeLaPuerta("AC1021", { allowAc1018: true, allowModern: true });
assert.equal(
  ac1021.estado,
  "rechazado-por-version",
  `AC1021 no está en ninguna autorización y debe seguir fuera con todo encendido: ${ac1021.mensaje}`,
);
// Y con todo encendido el mensaje enumera las CINCO admitidas: si esa lista se
// desincroniza del conjunto real, el usuario acaba leyendo que no admitimos un
// formato que sí admitimos.
for (const etiqueta of ["AC1015", "AC1018", "AC1024", "AC1027", "AC1032"]) {
  assert.ok(
    ac1021.mensaje.includes(etiqueta),
    `el mensaje con todos los permisos debe nombrar ${etiqueta}: ${ac1021.mensaje}`,
  );
}

console.log(
  "dwg-native-reader (familia moderna AC1024/AC1027/AC1032): con firma la conjunción de tres " +
    "abre; sin permiso las tres se rechazan por versión nombrando la admitida; con el permiso de " +
    "AC1018 siguen fuera (autorizaciones distintas); con allowModern las tres PASAN la puerta y " +
    "fallan después por estructura; y AC1021 sigue rechazada con todo encendido, con el mensaje " +
    "enumerando las cinco versiones admitidas.",
);
