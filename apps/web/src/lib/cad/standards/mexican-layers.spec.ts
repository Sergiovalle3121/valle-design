/**
 * La norma de capas mexicana, comprobada donde puede fallar de verdad.
 *
 * Lo que se afirma no es que la tabla exista. Es que:
 *
 *  1. **Toda capa cita su fuente y la fuente existe.** Ésta es la comprobación
 *     que sostiene la credibilidad entera del trabajo: una capa que se quede sin
 *     su cita convierte la tabla en «lo que a alguien le pareció bien», y un
 *     arquitecto lo detecta antes que nosotros.
 *  2. **Los grosores salen de la serie de ISO 128-20.** Decir que se sigue una
 *     norma de grosores y colar un 0,30 mm es exactamente el claim falso que hay
 *     que evitar.
 *  3. **Los nombres son válidos para DXF.** Un nombre con dos puntos produce un
 *     archivo que AutoCAD no abre, y el arquitecto lo descubre en el despacho
 *     del estructurista.
 *  4. **Las colisiones de aspecto están documentadas, no escondidas.** La lista
 *     de capas que se ven igual está anclada: si aparece una nueva sin querer,
 *     esta prueba lo dice.
 */
import { strict as assert } from "node:assert";
import { isValidLayerName } from "../layer";
import { LINETYPES } from "../linetype";
import {
  CAD_ISO_LINEWEIGHTS_MM,
  CAD_MEXICAN_LAYERS,
  CadMexicanLayerError,
  cadMexicanLayer,
  cadMexicanLayerAppearance,
  cadMexicanLayerCollisions,
  cadMexicanLayerDefs,
  cadMexicanLayerSourceProblems,
  cadMexicanLayersByGroup,
} from "./mexican-layers";
import { cadStandardSource } from "./mexican-drafting-sources";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

// --- TODA CAPA CITA SU FUENTE, Y LA FUENTE EXISTE ---------------------------
{
  assert.deepEqual(
    cadMexicanLayerSourceProblems(),
    [],
    "una capa sin fuente convierte la norma en una opinión con documentación",
  );
  for (const item of CAD_MEXICAN_LAYERS) {
    ok(item.sources.length > 0, `${item.id} cita al menos una fuente`);
    for (const id of item.sources) {
      const source = cadStandardSource(id);
      ok(
        source.kind === "norma" || source.kind === "costumbre",
        `${item.id}: la fuente ${id} se declara como norma o como costumbre`,
      );
    }
    // Y el nombre de la capa no es la fuente: el propósito lo lee una persona.
    ok(item.purpose.length > 10, `${item.id} explica para qué es`);
  }
  // La honestidad concreta: el nombre de las capas NO está normado en México, y
  // la tabla lo dice apoyándose en esa costumbre y no en una norma inventada.
  const nomenclatura = cadStandardSource("capas-nombre-espanol");
  assert.equal(nomenclatura.kind, "costumbre");
  ok(
    nomenclatura.kind === "costumbre" && !!nomenclatura.ignoredStandard,
    "se dice que ISO 13567 existe y que no se sigue",
  );
}

// --- NOMBRES QUE UN DXF ADMITE ----------------------------------------------
{
  const ids = CAD_MEXICAN_LAYERS.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length, "hay un id de capa repetido");
  for (const id of ids) {
    ok(isValidLayerName(id), `«${id}» es un nombre de capa válido para DXF`);
    assert.equal(id, id.toUpperCase(), `«${id}» va en mayúsculas, como se escribe en México`);
    ok(!id.includes(" "), `«${id}» no lleva espacios`);
    ok(id.length <= 24, `«${id}» es corto: una capa que no cabe en la paleta no se usa`);
  }
}

// --- GROSORES DE LA SERIE, TIPOS DE LÍNEA QUE EXISTEN -----------------------
{
  for (const item of CAD_MEXICAN_LAYERS) {
    ok(
      CAD_ISO_LINEWEIGHTS_MM.includes(item.lineweight),
      `${item.id}: ${item.lineweight} mm está en la serie de ISO 128-20`,
    );
    ok(
      Object.prototype.hasOwnProperty.call(LINETYPES, item.linetype),
      `${item.id}: el tipo de línea ${item.linetype} existe de verdad`,
    );
    ok(/^#[0-9a-f]{6}$/.test(item.color), `${item.id}: color en hexadecimal de seis dígitos`);
  }
  // La serie es la de la norma, en orden y sin invenciones.
  assert.deepEqual(
    [...CAD_ISO_LINEWEIGHTS_MM],
    [0.13, 0.18, 0.25, 0.35, 0.5, 0.7, 1, 1.4, 2],
  );
}

// --- LO QUE PIDE EL OFICIO ESTÁ ---------------------------------------------
{
  const ids = new Set(CAD_MEXICAN_LAYERS.map((item) => item.id));
  // La lista literal de lo que un despacho mexicano dibuja. Si una desaparece,
  // el producto deja de traer de fábrica algo que el usuario tendría que crear.
  for (const expected of [
    "MURO",
    "MURO-DEM",
    "MURO-NUE",
    "MURO-EXI",
    "EJE",
    "COTA",
    "TEXTO",
    "MOBILIARIO",
    "INST-HID",
    "INST-SAN",
    "INST-ELE",
    "INST-GAS",
    "EST",
    "EST-CIM",
    "CANCEL",
    "VEGETACION",
    "TERRENO-NAT",
    "TERRENO-PRO",
  ])
    ok(ids.has(expected), `la norma trae la capa ${expected}`);

  // Los grupos parten la tabla en lo que se lee de un vistazo.
  ok(cadMexicanLayersByGroup("demolicion").length === 3, "demolición son las tres de siempre");
  ok(cadMexicanLayersByGroup("instalaciones").length >= 5, "las cuatro instalaciones y su simbología");
}

// --- FALLO CERRADO -----------------------------------------------------------
{
  assert.throws(
    () => cadMexicanLayer("MURO-INVENTADO"),
    (error: unknown) => {
      assert.ok(error instanceof CadMexicanLayerError);
      assert.equal(error.code, "cad_mexican_layer_unknown");
      // El mensaje enumera las que sí: sin eso hay que leer el código fuente.
      assert.match(error.message, /MURO/);
      return true;
    },
  );
  assert.throws(() => cadMexicanLayerDefs(["NO-EXISTE"]), CadMexicanLayerError);
  checks += 2;
}

// --- LA FORMA QUE PERSISTE EL DOCUMENTO -------------------------------------
{
  const defs = cadMexicanLayerDefs(["MURO", "EJE", "AUXILIAR", "MURO", "EST-CIM"]);
  // El duplicado se colapsa conservando el primer orden, que es el de la paleta.
  assert.deepEqual(
    defs.map((item) => item.id),
    ["MURO", "EJE", "AUXILIAR", "EST-CIM"],
  );
  const muro = defs[0];
  assert.equal(muro.name, "Muros");
  assert.equal(muro.color, "#ffffff");
  assert.equal(muro.lineweight, 0.35);
  assert.equal(muro.visible, true);
  assert.equal(muro.locked, false);
  assert.equal(muro.plot, true);
  // `CONTINUOUS` se OMITE a propósito: es el valor por defecto del esquema y
  // escribirlo engordaría cada documento sin decir nada nuevo.
  assert.equal(muro.linetype, undefined);
  assert.equal(defs[1].linetype, "CENTER");
  assert.equal(defs[3].linetype, "HIDDEN");
  // La auxiliar no se traza. Es la única, y por eso está anclado.
  assert.equal(defs[2].plot, false);
  assert.equal(
    CAD_MEXICAN_LAYERS.filter((item) => !item.plot).map((item) => item.id).join(","),
    "AUXILIAR",
  );
}

// --- LAS COLISIONES DE ASPECTO, DICHAS ---------------------------------------
//
// Dos capas con el mismo color, tipo de línea y grosor son indistinguibles una
// vez impreso el plano. Aquí se ancla la lista COMPLETA de las que se repiten en
// toda la norma: cada una es una reutilización deliberada entre disciplinas que
// nunca comparten lámina —la vialidad de un plano de conjunto y el muro
// existente de una remodelación no se cruzan—. Que la lista esté anclada es lo
// que hace que una colisión NUEVA salga a la luz en vez de colarse.
{
  const pairs = cadMexicanLayerCollisions(CAD_MEXICAN_LAYERS.map((item) => item.id))
    .map(([a, b]) => `${a}=${b}`)
    .sort();
  assert.deepEqual(pairs, [
    "CORTE=LINDERO",
    "INST-SAN=TERRENO-PRO",
    "MOBILIARIO=VEGETACION",
    "MURO-EXI=VIALIDAD",
    "VANO=INST-ELE",
  ]);

  // El detector detecta de verdad: dos capas que sí se ven igual salen como par.
  assert.deepEqual(cadMexicanLayerCollisions(["MURO-EXI", "VIALIDAD"]), [
    ["MURO-EXI", "VIALIDAD"],
  ]);
  // Y dos que comparten color pero no tipo de línea, NO: el amarillo del muro
  // por demoler y el del vano se distinguen porque uno va a trazos.
  assert.deepEqual(cadMexicanLayerCollisions(["VANO", "MURO-DEM"]), []);
  assert.notEqual(
    cadMexicanLayerAppearance(cadMexicanLayer("VANO")),
    cadMexicanLayerAppearance(cadMexicanLayer("MURO-DEM")),
  );
  // Lo que no se traza no colisiona: nunca llega al papel.
  assert.deepEqual(cadMexicanLayerCollisions(["AUXILIAR", "ARQ-FONDO"]), []);
}

// --- LA COSTUMBRE DE DEMOLICIÓN, TAL CUAL SE DIBUJA -------------------------
{
  const dem = cadMexicanLayer("MURO-DEM");
  const nue = cadMexicanLayer("MURO-NUE");
  const exi = cadMexicanLayer("MURO-EXI");
  assert.equal(dem.color, "#ffff00");
  assert.equal(dem.linetype, "DASHED");
  assert.equal(nue.color, "#ff0000");
  assert.equal(exi.color, "#808080");
  // Y la tabla DICE que el código no es obligatorio: hay oficinas que lo
  // invierten. Una norma inventada se cae por aquí.
  ok(!!dem.note && /invierten/.test(dem.note), "se advierte de que el código varía");
  const fuente = cadStandardSource("demolicion-amarillo-rojo");
  assert.equal(fuente.kind, "costumbre");
}

console.log(`mexican-layers.spec: ${CAD_MEXICAN_LAYERS.length} capas, ${checks} comprobaciones nombradas OK`);
