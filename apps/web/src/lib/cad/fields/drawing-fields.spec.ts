/**
 * LOS CAMPOS DEL DIBUJO.
 *
 * Lo que se mide aquí es lo que separa un campo de un texto: que el valor salga
 * de la GEOMETRÍA y no de lo que alguien tecleó, que al cambiar el dibujo el
 * campo cambie, que lo que hoy no se puede resolver CONSERVE su último valor y
 * se cuente —un cero silencioso en una tabla de superficies es un error que se
 * imprime—, y que actualizar no emita órdenes para lo que no cambió.
 */
import { strict as assert } from "node:assert";
import type { CadDocument, CadEntity } from "../cad-document";
import {
  CAD_FIELD_METADATA,
  cadFieldEntities,
  cadFieldRunLength,
  cadFormatFieldExpression,
  cadParseFieldExpression,
  cadResolveField,
  cadUpdateFields,
} from "./drawing-fields";

let verdes = 0;
const eq = (actual: unknown, esperado: unknown, mensaje: string) => {
  assert.equal(actual, esperado, mensaje);
  verdes += 1;
};

const local = (id: string, lado: number): CadEntity =>
  ({
    id,
    type: "polyline",
    vertices: [
      { x: 0, y: 0, z: 0 },
      { x: lado, y: 0, z: 0 },
      { x: lado, y: lado, z: 0 },
      { x: 0, y: lado, z: 0 },
    ],
    closed: true,
    layer: "0",
  }) as unknown as CadEntity;

const campo = (id: string, expresion: string, texto: string): CadEntity =>
  ({
    id,
    type: "mtext",
    insertion: { x: 0, y: 0, z: 0 },
    text: texto,
    height: 250,
    layer: "0",
    context: { metadata: { [CAD_FIELD_METADATA]: expresion } },
  }) as unknown as CadEntity;

const doc = (entities: CadEntity[]) =>
  ({ entities, meta: { unit: "mm" } }) as unknown as Pick<CadDocument, "entities" | "meta">;

// --- 1 · la expresión se lee y se escribe igual --------------------------
{
  assert.deepEqual(
    cadParseFieldExpression("%<Area:e1>%"),
    { kind: "area", argument: "e1" },
    "la forma canónica",
  );
  assert.deepEqual(
    cadParseFieldExpression("%< área : e1 >%"),
    { kind: "area", argument: "e1" },
    "con acento y espacios, que es como se teclea",
  );
  assert.deepEqual(
    cadParseFieldExpression("%<Fecha>%"),
    { kind: "fecha", argument: "" },
    "y sin argumento cuando no lleva",
  );
  verdes += 3;
  eq(cadParseFieldExpression("%<Clima:mañana>%"), null, "una clase que no existe no se lee");
  eq(cadParseFieldExpression("Area de la sala"), null, "y un texto normal tampoco");
  eq(
    cadFormatFieldExpression({ kind: "area", argument: "e1" }),
    "%<Area:e1>%",
    "se escribe con la misma sintaxis del cajetín, no con otra",
  );
}

// --- 2 · el área sale de la GEOMETRÍA ------------------------------------
{
  const dibujo = doc([local("sala", 5_000)]);
  eq(
    cadResolveField({ kind: "area", argument: "sala" }, { document: dibujo, date: "2026-09-04" }),
    "25.00 m²",
    "5 × 5 m en un dibujo en milímetros son 25 m²",
  );
  eq(
    cadResolveField({ kind: "longitud", argument: "sala" }, { document: dibujo, date: "2026-09-04" }),
    "15.00 m",
    "y su recorrido son los tres lados tecleados: la polilínea cerrada no repite el último",
  );
  eq(
    cadResolveField({ kind: "fecha", argument: "" }, { document: dibujo, date: "2026-09-04" }),
    "2026-09-04",
    "la fecha se INYECTA: `new Date()` haría los planos irreproducibles",
  );
  eq(
    cadResolveField(
      { kind: "variable", argument: "CLAYER" },
      { document: dibujo, date: "x", variable: () => "MUROS" },
    ),
    "MUROS",
    "y una variable de sistema se lee del anfitrión",
  );
  eq(
    cadResolveField({ kind: "variable", argument: "CLAYER" }, { document: dibujo, date: "x" }),
    null,
    "sin anfitrión que la exponga, no se inventa un valor",
  );
  eq(
    cadResolveField({ kind: "area", argument: "no-existe" }, { document: dibujo, date: "x" }),
    null,
    "ni para un objeto que ya no está",
  );
}

// --- 3 · una línea mide, un círculo no recorre ---------------------------
{
  const linea = {
    id: "l",
    type: "line",
    start: { x: 0, y: 0, z: 0 },
    end: { x: 3_000, y: 4_000, z: 0 },
    layer: "0",
  } as unknown as CadEntity;
  eq(cadFieldRunLength(linea), 5_000, "la línea mide su hipotenusa");
  eq(
    cadFieldRunLength({ id: "c", type: "circle", center: { x: 0, y: 0, z: 0 }, radius: 10, layer: "0" } as unknown as CadEntity),
    null,
    "un círculo no es un recorrido: se dice que no, en vez de devolver cero",
  );
}

// --- 4 · el campo cambia cuando cambia el dibujo -------------------------
{
  const antes = doc([local("sala", 5_000), campo("t1", "%<Area:sala>%", "25.00 m²")]);
  const sinCambios = cadUpdateFields({ document: antes, date: "2026-09-04" });
  eq(sinCambios.updated.length, 0, "un campo al día no se reescribe");
  eq(sinCambios.unchanged, 1, "se cuenta como ya al día");
  eq(
    sinCambios.commands.length,
    0,
    "y NO se emite orden: un paso de deshacer que no hizo nada rompe la confianza en Ctrl+Z",
  );

  // Alguien mueve un muro: la sala pasa a 6 × 6.
  const despues = doc([local("sala", 6_000), campo("t1", "%<Area:sala>%", "25.00 m²")]);
  const update = cadUpdateFields({ document: despues, date: "2026-09-04" });
  eq(update.updated.length, 1, "el campo se entera");
  eq(update.updated[0].from, "25.00 m²", "de dónde venía");
  eq(update.updated[0].to, "36.00 m²", "y a dónde va");
  eq(update.commands.length, 1, "con su orden de escritura");
  assert.deepEqual(
    update.commands[0],
    { type: "properties", entityId: "t1", patch: { text: "36.00 m²" } },
    "que es un cambio de propiedad, no una entidad nueva",
  );
  verdes += 1;
}

// --- 5 · lo que no se resuelve CONSERVA su valor y se cuenta -------------
{
  const huerfano = doc([campo("t1", "%<Area:borrada>%", "25.00 m²")]);
  const update = cadUpdateFields({ document: huerfano, date: "2026-09-04" });
  eq(update.unresolved.length, 1, "el campo huérfano se cuenta");
  eq(update.unresolved[0].expression, "%<Area:borrada>%", "diciendo cuál es");
  eq(update.commands.length, 0, "y NO se toca su texto: sigue enseñando su último valor");
  eq(update.updated.length, 0, "no cuenta como actualizado");
}

// --- 6 · sólo lo designado, cuando se designa ----------------------------
{
  const dibujo = doc([
    local("sala", 6_000),
    campo("t1", "%<Area:sala>%", "25.00 m²"),
    campo("t2", "%<Area:sala>%", "25.00 m²"),
  ]);
  eq(cadFieldEntities(dibujo).length, 2, "los dos campos se encuentran");
  const uno = cadUpdateFields({ document: dibujo, date: "2026-09-04" }, ["t2"]);
  eq(uno.updated.length, 1, "sólo el designado se actualiza");
  eq(uno.updated[0].entityId, "t2", "y es el que se designó");
}

console.log(
  `Campos del dibujo: ${verdes} comprobaciones verdes — el valor sale de la geometría, cambia cuando cambia el dibujo, lo irresoluble conserva su valor y se cuenta, y lo que no cambió no se reescribe`,
);
