/**
 * EL BLOQUE DEL USUARIO, VUELTO DINÁMICO.
 *
 * Lo que aquí se mide es lo que separa «el programa trae dos familias» de «un
 * despacho puede hacer dinámica SU biblioteca»: que un parámetro declarado
 * dentro de la definición se lea, que estirarlo mueva sólo lo que está del lado
 * de la punta —la mesa se alarga, las patas de la izquierda no se mueven—, que
 * un círculo se mueva entero en vez de deformarse, que la línea del parámetro
 * NO salga en la geometría materializada, y que lo mal declarado se diga en vez
 * de quedar en un bloque que no obedece.
 */
import { strict as assert } from "node:assert";
import type { CadBlockDefinition, CadEntity } from "../cad-document";
import { cadDynamicShapes, materializeCadDynamicBlock } from "../dynamic-blocks";
import {
  CAD_DIN_DEFAULT,
  CAD_DIN_KIND,
  CAD_DIN_LABEL,
  CAD_DIN_MAX,
  CAD_DIN_MIN,
  CAD_DIN_PARAM,
  CAD_DIN_STEPS,
  cadUserDynamicFamilies,
  cadUserDynamicFamily,
} from "./user-dynamic-family";

let verdes = 0;
const ok = (condicion: unknown, mensaje: string) => {
  assert.ok(condicion, mensaje);
  verdes += 1;
};
const eq = (actual: unknown, esperado: unknown, mensaje: string) => {
  assert.equal(actual, esperado, mensaje);
  verdes += 1;
};

const linea = (
  id: string,
  a: [number, number],
  b: [number, number],
  metadata?: Record<string, string>,
): CadEntity =>
  ({
    id,
    type: "line",
    start: { x: a[0], y: a[1], z: 0 },
    end: { x: b[0], y: b[1], z: 0 },
    layer: "0",
    ...(metadata ? { context: { metadata } } : {}),
  }) as unknown as CadEntity;

const circulo = (id: string, centro: [number, number], radio: number): CadEntity =>
  ({
    id,
    type: "circle",
    center: { x: centro[0], y: centro[1], z: 0 },
    radius: radio,
    layer: "0",
  }) as unknown as CadEntity;

/**
 * Una MESA de 1.200 × 600 con cuatro patas —círculos— y un parámetro `largo`
 * que va del borde izquierdo al derecho. Es el ejemplo de manual: una mesa que
 * se estira sin redibujarla ni tener veinte bloques.
 */
function mesa(extra: Partial<Record<string, string>> = {}): CadBlockDefinition {
  return {
    id: "mesa",
    name: "Mesa de trabajo",
    basePoint: { x: 0, y: 0, z: 0 },
    entities: [
      linea("tapa-abajo", [0, 0], [1_200, 0]),
      linea("tapa-arriba", [0, 600], [1_200, 600]),
      linea("tapa-izq", [0, 0], [0, 600]),
      linea("tapa-der", [1_200, 0], [1_200, 600]),
      circulo("pata-1", [50, 50], 25),
      circulo("pata-2", [1_150, 50], 25),
      linea("param-largo", [0, 300], [1_200, 300], {
        [CAD_DIN_PARAM]: "largo",
        [CAD_DIN_KIND]: "lineal",
        [CAD_DIN_LABEL]: "Largo de la tapa",
        [CAD_DIN_DEFAULT]: "1200",
        [CAD_DIN_MIN]: "800",
        [CAD_DIN_MAX]: "2400",
        ...extra,
      }),
    ],
    version: 1,
  } as unknown as CadBlockDefinition;
}

// --- 1 · el parámetro se lee de dentro del bloque -------------------------
{
  const { family, findings } = cadUserDynamicFamily(mesa());
  assert.ok(family, "la mesa se lee como familia dinámica");
  verdes += 1;
  eq(findings.length, 0, "y sin hallazgos: está bien declarada");
  eq(family!.id, "mesa", "la familia ES el bloque, no una copia con otro nombre");
  eq(family!.parameters.length, 1, "un parámetro");
  eq(family!.parameters[0].name, "largo", "con su nombre");
  eq(family!.parameters[0].label, "Largo de la tapa", "y su rótulo, que es lo que se lee");
  eq(family!.parameters[0].min, 800, "el mínimo declarado");
  eq(family!.parameters[0].max, 2_400, "y el máximo");

  const suelto: CadBlockDefinition = {
    ...mesa(),
    entities: [linea("solo", [0, 0], [100, 0])],
  } as CadBlockDefinition;
  eq(
    cadUserDynamicFamily(suelto).family,
    null,
    "un bloque sin parámetros NO es una familia, y eso no es un error",
  );
}

// --- 2 · estirar mueve lo de la punta y deja lo de la base ---------------
{
  const { family } = cadUserDynamicFamily(mesa());
  const formas = cadDynamicShapes(family!, { largo: 1_800 });
  const entidades = formas.map((forma) =>
    forma.type === "entity" ? forma.entity : null,
  ) as (CadEntity | null)[];
  ok(
    entidades.every((entidad) => entidad !== null),
    "la geometría del usuario viaja entera, sin recortarla a cuatro primitivas",
  );

  const porId = new Map(entidades.map((entidad) => [entidad!.id, entidad!]));
  const abajo = porId.get("tapa-abajo") as Extract<CadEntity, { type: "line" }>;
  eq(abajo.start.x, 0, "el extremo izquierdo de la tapa NO se mueve");
  eq(abajo.end.x, 1_800, "y el derecho se va a 1.800: la mesa mide lo que se pidió");

  const izquierda = porId.get("tapa-izq") as Extract<CadEntity, { type: "line" }>;
  eq(izquierda.start.x, 0, "el costado izquierdo se queda quieto (start)");
  eq(izquierda.end.x, 0, "y entero (end): no se estira lo que no toca");

  const derecha = porId.get("tapa-der") as Extract<CadEntity, { type: "line" }>;
  eq(derecha.start.x, 1_800, "el costado derecho viaja entero (start)");
  eq(derecha.end.x, 1_800, "y su otro punto también: se mueve, no se deforma");

  const pata1 = porId.get("pata-1") as Extract<CadEntity, { type: "circle" }>;
  const pata2 = porId.get("pata-2") as Extract<CadEntity, { type: "circle" }>;
  eq(pata1.center.x, 50, "la pata de la izquierda no se entera");
  eq(pata2.center.x, 1_750, "la de la derecha acompaña a la tapa");
  eq(pata2.radius, 25, "y sigue siendo un círculo del mismo radio: no se convirtió en elipse");

  ok(
    !porId.has("param-largo"),
    "y la LÍNEA DEL PARÁMETRO no está en la geometría materializada: es declaración, no dibujo",
  );
}

// --- 3 · encoger también, y el bloque materializado es real --------------
{
  const { family } = cadUserDynamicFamily(mesa());
  const definicion = materializeCadDynamicBlock(family!, { largo: 900 });
  ok(definicion.id.startsWith("valle:din:mesa:"), `llave determinista: ${definicion.id}`);
  const abajo = definicion.entities.find((entidad) =>
    entidad.id.endsWith(":e0"),
  ) as Extract<CadEntity, { type: "line" }>;
  eq(abajo.end.x, 900, "encoger funciona igual que estirar");
  eq(
    definicion.entities.length,
    6,
    "seis entidades: las cuatro líneas de la tapa y las dos patas, sin la del parámetro",
  );
  // Dos materializaciones iguales tienen que dar lo mismo, byte a byte: es lo
  // que hace que dos mesas iguales compartan definición en vez de duplicarla.
  assert.deepEqual(
    materializeCadDynamicBlock(family!, { largo: 900 }),
    definicion,
    "materializar dos veces da el mismo bloque",
  );
  verdes += 1;
}

// --- 4 · lo mal declarado se DICE ----------------------------------------
{
  const angulo = cadUserDynamicFamily(mesa({ [CAD_DIN_KIND]: "angulo" }));
  eq(angulo.family, null, "un tipo que no se admite no produce familia a medias");
  ok(
    angulo.findings.some((hallazgo) => /todavía no se admite/.test(hallazgo.detail)),
    `y se dice cuál y por qué: ${angulo.findings.map((h) => h.detail).join(" / ")}`,
  );

  const conAcento = cadUserDynamicFamily(mesa({ [CAD_DIN_PARAM]: "tamaño máximo" }));
  ok(
    conAcento.findings.some((hallazgo) => /no sirve como nombre de parámetro/.test(hallazgo.detail)),
    "un nombre con acentos y espacios se rechaza: forma parte de la llave del bloque",
  );

  const cero = cadUserDynamicFamily({
    ...mesa(),
    entities: [linea("param", [0, 0], [0, 0], { [CAD_DIN_PARAM]: "nada" })],
  } as CadBlockDefinition);
  ok(
    cero.findings.some((hallazgo) => /mide cero/.test(hallazgo.detail)),
    "una línea de parámetro de longitud cero no dice ninguna dirección",
  );

  const sobreCirculo = cadUserDynamicFamily({
    ...mesa(),
    entities: [
      {
        ...(circulo("c", [0, 0], 10) as Record<string, unknown>),
        context: { metadata: { [CAD_DIN_PARAM]: "radio" } },
      } as unknown as CadEntity,
    ],
  } as CadBlockDefinition);
  ok(
    sobreCirculo.findings.some((hallazgo) => /tiene que ser una LÍNEA/.test(hallazgo.detail)),
    "declarar un parámetro sobre un círculo se rechaza con motivo",
  );

  const dosVeces = cadUserDynamicFamily({
    ...mesa(),
    entities: [
      ...mesa().entities,
      linea("otro", [0, 0], [500, 0], { [CAD_DIN_PARAM]: "largo" }),
    ],
  } as CadBlockDefinition);
  ok(
    dosVeces.findings.some((hallazgo) => /está declarado dos veces/.test(hallazgo.detail)),
    "el mismo nombre dos veces se caza: uno de los dos no obedecería",
  );
}

// --- 5 · las medidas comerciales se respetan -----------------------------
{
  const { family } = cadUserDynamicFamily(mesa({ [CAD_DIN_STEPS]: "900,1200,1500,1800" }));
  assert.deepEqual(
    family!.parameters[0].steps,
    [900, 1_200, 1_500, 1_800],
    "las medidas admitidas se leen de la declaración",
  );
  verdes += 1;
}

// --- 6 · el dibujo entero: sólo los bloques con parámetros son familias --
{
  const familias = cadUserDynamicFamilies([
    mesa(),
    { ...mesa(), id: "silla", name: "Silla", entities: [linea("l", [0, 0], [1, 0])] } as CadBlockDefinition,
  ]);
  eq(familias.length, 1, "de dos bloques, sólo uno es familia");
  eq(familias[0].id, "mesa", "y es el que declara el parámetro");
}

console.log(
  `Bloque del usuario vuelto dinámico: ${verdes} comprobaciones verdes — el parámetro vive DENTRO de la definición, estirar mueve lo de la punta y deja lo de la base, el círculo no se deforma y lo mal declarado se dice`,
);
