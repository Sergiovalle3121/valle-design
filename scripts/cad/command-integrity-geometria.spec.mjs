#!/usr/bin/env node
/**
 * R7 del spec de las reglas: reescribir la geometría y dejarla IGUAL no es
 * mutar.
 *
 * Vive aparte de `command-integrity-rules.spec.mjs` por el presupuesto de
 * monolito —un archivo no presupuestado no pasa de 800 líneas— y no como spec
 * independiente: el gate ejecuta UN spec de reglas y exige que anuncie su
 * final, así que este bloque se exporta y el spec principal lo llama con su
 * propio contador y con sus fixtures. Es el mismo reparto que hizo R4 con
 * `command-integrity-exenciones.spec.mjs`.
 */
import { clasificar } from "./command-integrity-rules.mjs";
import { geometriaReescritaSinCambio, huellaGeometrica } from "./command-integrity-geometria.mjs";

/**
 * @param {(actual: unknown, esperado: unknown, mensaje: string) => void} eq
 *   el comparador del spec principal, que lleva la cuenta de comprobaciones
 * @param {object} contexto  fixtures y ayudas del spec principal
 * @param {(x: number, y: number, z?: number) => object} contexto.P
 * @param {object} contexto.caja       un SOLID3D de verdad (caja de 10×10×10)
 * @param {object} contexto.cascaron   un SOLID3D que no se puede evaluar
 * @param {object} contexto.linea      una entidad 2D de coordenadas explícitas
 * @param {object} contexto.EVALUADORES  los del producto
 * @param {(observacion: object) => string} contexto.veredicto
 * @param {(messages: string[], extra?: object) => object} contexto.sinEfecto
 */
export function compruebaGeometria(eq, { P, caja, cascaron, linea, EVALUADORES, veredicto, sinEfecto }) {

  const planoQuePasaDeLargo = { origin: P(0, -50, 0), normal: P(0, 1, 0) };
  const planoQueCorta = { origin: P(0, 5, 0), normal: P(0, 1, 0) };
  const corteInutil = {
    ...caja,
    root: "corte",
    nodes: [...caja.nodes, { id: "corte", op: "slice", operand: "n", plane: planoQuePasaDeLargo, keep: "positive" }],
  };
  const corteReal = {
    ...caja,
    root: "corte",
    nodes: [...caja.nodes, { id: "corte", op: "slice", operand: "n", plane: planoQueCorta, keep: "positive" }],
  };

  eq(
    huellaGeometrica(caja, EVALUADORES) === huellaGeometrica(corteInutil, EVALUADORES),
    true,
    "R7: el árbol crece un nodo y el cuerpo evaluado es el MISMO",
  );
  eq(
    geometriaReescritaSinCambio([caja], [corteInutil], EVALUADORES),
    "el lote no añade ni borra entidades y las 1 que reescribe (probe2) conservan su geometría evaluada",
    "R7: el `slice` que no corta se ve por lo que es",
  );
  eq(
    geometriaReescritaSinCambio([caja], [corteReal], EVALUADORES),
    null,
    "R7: gemelo legítimo — el corte que SÍ corta cambia el cuerpo",
  );
  // Gemelo legítimo y el más importante: LAYMCH es kind `modify`, en la pasada de
  // sólidos no dice nada, y lo que hace —mover una entidad de capa— es
  // exactamente lo que promete. La huella lleva la parte TEXTUAL de la entidad
  // para que un cambio de capa siga contando como efecto.
  eq(
    geometriaReescritaSinCambio([caja], [{ ...caja, layer: "MUROS" }], EVALUADORES),
    null,
    "R7: cambiar de capa un sólido es el efecto que LAYMCH promete",
  );
  eq(
    geometriaReescritaSinCambio([linea], [{ ...linea, end: { x: 50, y: 0 } }], EVALUADORES),
    null,
    "R7: en 2D las coordenadas son el texto, y moverlas sigue mutando",
  );
  eq(
    geometriaReescritaSinCambio([caja], [corteInutil, linea], EVALUADORES),
    null,
    "R7: un lote que AÑADE geometría no lo juzga esta regla",
  );
  eq(
    geometriaReescritaSinCambio([caja, linea], [corteInutil], EVALUADORES),
    null,
    "R7: ni uno que BORRA",
  );
  eq(
    geometriaReescritaSinCambio([caja], [caja], EVALUADORES),
    null,
    "R7: si el lote no tocó ninguna entidad, esta regla se calla",
  );
  eq(
    geometriaReescritaSinCambio([cascaron], [{ ...cascaron, layer: "MUROS" }], EVALUADORES),
    null,
    "R7: lo que no se puede evaluar no se declara intacto — de eso responde R2",
  );

  const conCorteInutil = (kind) => ({
    ...sinEfecto([]),
    applied: 1,
    changed: true,
    kind,
    sinCambioGeometrico: geometriaReescritaSinCambio([caja], [corteInutil], EVALUADORES),
  });
  eq(veredicto({ ...conCorteInutil("modify"), messages: [] }), "ROJO", "R7: un `modify` que reescribe y calla no muta");
  eq(
    veredicto({
      ...conCorteInutil("modify"),
      messages: [{ text: "SLICE no cortó nada: el plano de corte no atraviesa ninguno de los sólidos designados.", level: "info" }],
    }),
    "informa",
    "R7: se queda con la clase que su mensaje le gane, que es PEOR que muta",
  );
  for (const kind of ["draw", "annotate"]) {
    eq(veredicto({ ...conCorteInutil(kind), messages: [] }), "ROJO", `R7: tampoco un ${kind}`);
  }
  eq(
    veredicto(conCorteInutil("manage")),
    "muta",
    "R7: no se aplica a manage — ahí la contabilidad del documento ES el contrato",
  );
  eq(
    clasificar({ ...conCorteInutil("modify"), messages: [] }).note.startsWith(
      "el lote no añade ni borra entidades y las 1 que reescribe (probe2) conservan su geometría evaluada, así que el lote no cuenta como geometría;",
    ),
    true,
    "R7: el motivo no se pierde por el camino",
  );

}
