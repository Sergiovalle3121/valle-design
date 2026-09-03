/**
 * QUE UN CONDUCTOR SEPA QUÉ ES, Y QUE UN NÚMERO REPETIDO NO LLEGUE A LA OBRA.
 *
 * ## Lo medido antes de escribir el módulo
 *
 * Sondeé catorce nombres de la familia eléctrica contra `engine/` —AEWIRE,
 * AECOMPONENT, AEPANEL, AELADDER, AEPLC, WIRENUMBER, AEBOM…— y salieron CERO
 * aciertos; `conductor`, `canalización`, `wireNumber` y `voltage` no aparecen
 * en `lib/cad`. Lo único eléctrico eran cuatro símbolos colocables. Esto es el
 * primer trozo de conductor de verdad.
 *
 * ## Qué se afirma aquí, y qué NO
 *
 * No se afirma que «existe un módulo». Se afirma lo que un electricista
 * comprobaría: que el número siguiente sale del DIBUJO —así que dos personas
 * del mismo despacho no fabrican dos «14» en el mismo circuito—, que un hueco
 * NO se reutiliza, que un número repetido se caza aunque venga de copiar y
 * pegar, y que una marca a medias se CUENTA en vez de desaparecer.
 */
import { strict as assert } from "node:assert";
import type { CadDocument, CadEntity } from "../cad-document";
import {
  CAD_IE_CIRCUIT,
  CAD_IE_GAUGE,
  CAD_IE_NUMBER,
  cadNextWireNumber,
  cadWireClashes,
  cadWireDefects,
  cadWireMetadata,
  cadWiresOf,
} from "./wire-numbering";

let verdes = 0;
const ok = (condicion: unknown, mensaje: string) => {
  assert.ok(condicion, mensaje);
  verdes += 1;
};
const eq = (actual: unknown, esperado: unknown, mensaje: string) => {
  assert.equal(actual, esperado, mensaje);
  verdes += 1;
};

/** Una polilínea con la marca eléctrica que se le quiera poner. */
const conductor = (
  id: string,
  metadata: Record<string, string | number>,
): CadEntity =>
  ({
    id,
    type: "polyline",
    vertices: [
      { x: 0, y: 0, z: 0 },
      { x: 1_000, y: 0, z: 0 },
    ],
    closed: false,
    layer: "IE-CIR",
    context: { metadata },
  }) as unknown as CadEntity;

const doc = (entities: CadEntity[]): Pick<CadDocument, "entities"> => ({ entities });

// --- 1 · un conductor se lee de sus metadatos, sin entidad nueva ------------
{
  const documento = doc([
    conductor("c1", cadWireMetadata({ circuit: "C-1", number: 1, gauge: "12" })),
  ]);
  const leidos = cadWiresOf(documento);
  eq(leidos.length, 1, "la polilínea marcada se lee como conductor");
  eq(leidos[0].circuit, "C-1", "con su circuito");
  eq(leidos[0].number, 1, "con su número");
  eq(leidos[0].gauge, "12", "y con su calibre");

  // Y una polilínea SIN marca sigue siendo una polilínea: esto no captura el
  // dibujo entero, sólo lo que se declaró conductor.
  const mezclado = doc([
    ...documento.entities,
    { id: "raya", type: "line", start: { x: 0, y: 0, z: 0 }, end: { x: 1, y: 1, z: 0 }, layer: "0" } as CadEntity,
  ]);
  eq(cadWiresOf(mezclado).length, 1, "una raya sin marca no es un conductor");
}

// --- 2 · el número siguiente sale del DIBUJO, no de un contador -------------
{
  const documento = doc([
    conductor("c1", cadWireMetadata({ circuit: "C-1", number: 1 })),
    conductor("c2", cadWireMetadata({ circuit: "C-1", number: 7 })),
    conductor("c3", cadWireMetadata({ circuit: "C-2", number: 3 })),
  ]);
  eq(cadNextWireNumber(documento, "C-1"), 8, "sigue al mayor del circuito, no al conteo");
  eq(cadNextWireNumber(documento, "C-2"), 4, "cada circuito lleva su propia cuenta");
  eq(cadNextWireNumber(documento, "C-9"), 1, "un circuito nuevo empieza en 1");
  eq(
    cadNextWireNumber(documento, "c-1"),
    8,
    "y el circuito no distingue mayúsculas: lo teclea una persona",
  );

  // El hueco NO se rellena. Borrar el 7 no debe devolver el 7: el «7» del plano
  // entregado y el «7» nuevo serían conductores distintos con el mismo nombre.
  const sinElSiete = doc(documento.entities.filter((e) => e.id !== "c2"));
  eq(
    cadNextWireNumber(sinElSiete, "C-1"),
    2,
    "control: sin el 7, el siguiente es 2 — el hueco queda libre y a la vista",
  );
}

// --- 3 · un número repetido se caza, venga de donde venga -------------------
{
  const documento = doc([
    conductor("c1", cadWireMetadata({ circuit: "C-1", number: 4 })),
    // El clásico: alguien copió y pegó el conductor. Dos rayas idénticas en
    // pantalla, dos conductores «4» en el mismo circuito en la obra.
    conductor("c2", cadWireMetadata({ circuit: "C-1", number: 4 })),
    conductor("c3", cadWireMetadata({ circuit: "C-2", number: 4 })),
  ]);
  const choques = cadWireClashes(documento);
  eq(choques.length, 1, "un solo choque: el 4 repetido dentro de C-1");
  eq(choques[0].circuit, "C-1", "con su circuito");
  eq(choques[0].number, 4, "y su número");
  assert.deepEqual(choques[0].entityIds, ["c1", "c2"], "y quiénes lo llevan");
  verdes += 1;

  // El mismo número en OTRO circuito no es un choque: es lo normal.
  ok(
    !choques.some((choque) => choque.circuit === "C-2"),
    "el 4 de C-2 no es un choque: cada circuito numera desde su tablero",
  );
}

// --- 4 · una marca a medias SE CUENTA, no desaparece ------------------------
{
  const documento = doc([
    conductor("bueno", cadWireMetadata({ circuit: "C-1", number: 1 })),
    conductor("sin-circuito", { [CAD_IE_NUMBER]: "5" }),
    conductor("sin-numero", { [CAD_IE_CIRCUIT]: "C-1" }),
    conductor("numero-raro", { [CAD_IE_CIRCUIT]: "C-1", [CAD_IE_NUMBER]: "doce" }),
    conductor("numero-cero", { [CAD_IE_CIRCUIT]: "C-1", [CAD_IE_NUMBER]: "0" }),
  ]);
  eq(cadWiresOf(documento).length, 1, "sólo el bien marcado cuenta como conductor");

  const fuera = cadWireDefects(documento);
  eq(fuera.length, 4, "y los otros cuatro se cuentan, no desaparecen");
  ok(
    fuera.some((d) => d.entityId === "sin-circuito" && /de qué circuito/.test(d.reason)),
    "el que no dice su circuito, con su motivo",
  );
  ok(
    fuera.some((d) => d.entityId === "sin-numero" && /no lleva número/.test(d.reason)),
    "el que no lleva número, también",
  );
  ok(
    fuera.some((d) => d.entityId === "numero-raro" && /entero positivo/.test(d.reason)),
    "el número ilegible",
  );
  ok(
    fuera.some((d) => d.entityId === "numero-cero" && /entero positivo/.test(d.reason)),
    "y el cero, que no es un ordinal",
  );

  // Lo importante del fallo cerrado: un número ilegible NO entra en la
  // numeración. Si entrara, `cadNextWireNumber` daría NaN y el conductor
  // siguiente saldría sin número.
  eq(
    cadNextWireNumber(documento, "C-1"),
    2,
    "control: el número ilegible no envenena la numeración",
  );
}

// --- 5 · el calibre es opcional y no se inventa -----------------------------
{
  const sinCalibre = cadWireMetadata({ circuit: "C-1", number: 1 });
  ok(!(CAD_IE_GAUGE in sinCalibre), "sin calibre, no se escribe la clave");
  const vacio = cadWireMetadata({ circuit: "C-1", number: 1, gauge: "   " });
  ok(!(CAD_IE_GAUGE in vacio), "y un calibre en blanco tampoco se escribe");
  eq(
    cadWiresOf(doc([conductor("c", sinCalibre)]))[0].gauge,
    null,
    "quien lee obtiene `null`, no un calibre supuesto",
  );
}

console.log(
  `wire-numbering: ${verdes} comprobaciones verdes — el número sale del dibujo, el hueco no se reutiliza, el repetido se caza y la marca a medias se cuenta`,
);
