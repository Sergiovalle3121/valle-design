#!/usr/bin/env node
/**
 * Spec de las reglas de la sonda de integridad de comandos.
 *
 * La sonda en vivo sólo mide el registro de HOY; estas reglas existen por las
 * trampas que el registro de hoy no contiene. Cada regla lleva aquí su trampa
 * (la frase o la entidad real que se colaba) y su gemelo legítimo (un comando
 * de main que tiene que seguir en verde). El gate lo ejecuta antes de la sonda,
 * con tsx y desde apps/web: las pruebas de R2 evalúan las entidades con los
 * evaluadores REALES del producto, no con dobles.
 */
import assert from "node:assert/strict";
import { clasificar, entidadesTocadas, sinGeometria } from "./command-integrity-rules.mjs";

const { solid3dMesh, solid3dMassProperties } = await import(
  "../../apps/web/src/lib/cad/solid3d-build.ts"
);
const { regionArea } = await import("../../apps/web/src/lib/cad/solid3d-adapter.ts");
const EVALUADORES = { solid3dMesh, solid3dMassProperties, regionArea };

let checks = 0;
const eq = (actual, expected, message) => {
  assert.deepEqual(actual, expected, message);
  checks += 1;
};

/** Observación de un comando que terminó sin lote ni delegación. */
const sinEfecto = (messages, extra = {}) => ({
  steps: 2,
  maxSteps: 36,
  applied: 0,
  changed: false,
  delegated: false,
  messages: messages.map((text) => (typeof text === "string" ? { text, level: "info" } : text)),
  inputTrace: ["point", "distance"],
  probeAborted: false,
  mutates: true,
  ...extra,
});
const veredicto = (observacion) => clasificar(observacion).verdict;

// ─── El árbol de siempre, intacto ───────────────────────────────────────────

eq(veredicto(sinEfecto([], { steps: 36 })), "no-concluyente", "el tope de pasos sigue siendo no-concluyente");
eq(veredicto({ ...sinEfecto([]), applied: 1, changed: true }), "muta", "un lote que cambia el documento muta");
eq(veredicto({ ...sinEfecto([]), applied: 1, changed: false }), "ROJO", "un lote sin cambio es ROJO");
eq(veredicto({ ...sinEfecto(["Hecho."]), delegated: true }), "delegado", "delegar es un efecto");
eq(veredicto(sinEfecto(["Hecho."])), "ROJO", "«Hecho» sin efecto es ROJO");
eq(veredicto(sinEfecto([], { inputTrace: ["point", "enter"] })), "informa", "cierre con Enter sin mensaje");
eq(veredicto(sinEfecto([], { probeAborted: true })), "no-concluyente", "cancelado por la sonda");
eq(veredicto(sinEfecto([])), "ROJO", "silencio ante entradas sustantivas");
eq(veredicto(sinEfecto([], { steps: 0, inputTrace: [] })), "ROJO", "mutante que termina al invocarse sin decir nada");
eq(veredicto(sinEfecto([], { steps: 0, inputTrace: [], mutates: false })), "informa", "consulta que termina al invocarse");
eq(
  veredicto(sinEfecto(["UNION necesita DOS sólidos designados."])),
  "honesto-limitado",
  "declarar el límite es integridad",
);

// ─── R1: prometer mutar y quedarse en la promesa ────────────────────────────

// Trampa: THICKEN de la rama de MiMo (surfaces.ts), mutates:true, sin lote.
eq(
  clasificar(sinEfecto(["THICKEN: superficie espesada 10 unidades — operación pendiente de kernel."])),
  { verdict: "ROJO", note: "promete mutar y terminó sin lote, sin delegar y sin declarar límite" },
  "R1: THICKEN sin lote y sin límite es ROJO",
);
eq(
  veredicto(sinEfecto(["3DMOVE: la selección no contiene sólidos3D."])),
  "ROJO",
  "R1: sin palabra de éxito tampoco se libra un stub mutante (3DMOVE de MiMo)",
);
// Legítimos de main que la versión literal de R1 pondría en rojo.
eq(veredicto(sinEfecto(["LENGTHEN: Longitud actual = 100"])), "informa", "R1: una lectura no es promesa (LENGTHEN)");
eq(
  veredicto(sinEfecto(["Nombre   Color   Visible", "0        blanco  sí"])),
  "informa",
  "R1: una tabla no es promesa (-LAYER)",
);
eq(veredicto(sinEfecto(["AUDIT: 0 errores, no reparó nada."])), "informa", "R1: «no reparó» es límite (AUDIT)");
eq(veredicto(sinEfecto(["PASTECLIP: el portapapeles del dibujo está vacío."])), "informa", "R1: «vacío» es límite (PASTECLIP)");
eq(veredicto(sinEfecto(["RECTANG: saldría sin ancho."])), "informa", "R1: «saldría sin» es límite (RECTANG)");
eq(veredicto(sinEfecto(["Elija primero una inserción."])), "informa", "R1: «primero» es límite (BLOQUEDINSET)");
eq(veredicto(sinEfecto(["DIMTOLERANCE sólo toca cotas."])), "informa", "R1: «sólo toca» es límite");
eq(veredicto(sinEfecto(["XCLIP: designe sólo la inserción."])), "informa", "R1: «designe sólo» es límite");
eq(veredicto(sinEfecto(["STEELSHAPE: el perfil no deja hueco."])), "informa", "R1: «no deja» es límite");
eq(veredicto(sinEfecto(["Eso es una POLILÍNEA cerrada."])), "informa", "R1: «eso es una» es límite");
eq(
  veredicto(sinEfecto(["Capa activa: MURO"])),
  "ROJO",
  "R1: el mismo mensaje, en un comando que promete mutar, no basta",
);
eq(
  veredicto(sinEfecto(["Capa activa: MURO"], { mutates: false })),
  "informa",
  "R1: una consulta sin límite sigue informando",
);

// ─── R2: un lote que sólo inserta un cascarón no «muta» ──────────────────────

const P = (x, y, z = 0) => ({ x, y, z });
const linea = { id: "l1", type: "line", layer: "0", start: { x: 0, y: 0 }, end: { x: 100, y: 0 } };
// Trampa: MESH y PLANESURF de la rama de MiMo (meshes.ts, surfaces.ts).
const cascaron = {
  id: "probe1",
  type: "solid3d",
  layer: "0",
  root: "m",
  nodes: [{ id: "m", op: "brep", points: [], faces: [] }],
};
const caja = {
  id: "probe2",
  type: "solid3d",
  layer: "0",
  root: "n",
  nodes: [{ id: "n", op: "box", min: P(0, 0, 0), max: P(10, 10, 10) }],
};
const region = { id: "probe3", type: "region", layer: "0", outer: [P(0, 0), P(10, 0), P(10, 10)] };
const regionPlana = { id: "probe4", type: "region", layer: "0", outer: [P(0, 0), P(10, 0), P(20, 0)] };

eq(sinGeometria(cascaron, EVALUADORES)?.startsWith("no se puede evaluar"), true, "R2: el brep vacío no evalúa");
eq(sinGeometria(caja, EVALUADORES), null, "R2: una caja de verdad tiene geometría");
eq(sinGeometria(region, EVALUADORES), null, "R2: una región con área");
eq(sinGeometria(regionPlana, EVALUADORES), "región de área 0", "R2: una región degenerada");
eq(sinGeometria(linea, EVALUADORES), null, "R2: una línea no tiene arrays que vaciar");
eq(
  sinGeometria({ id: "m1", type: "mesh", vertices: [], faces: [] }, EVALUADORES),
  "mesh.faces vacío",
  "R2: cualquier array de geometría vacío",
);
eq(
  entidadesTocadas([linea], [linea, cascaron]).map((entity) => entity.id),
  ["probe1"],
  "R2: sólo se examina lo que el lote añadió",
);
eq(
  entidadesTocadas([linea], [{ ...linea, layer: "MURO" }]).map((entity) => entity.id),
  ["l1"],
  "R2: y lo que cambió",
);

const tras = (antes, despues) => ({
  ...sinEfecto([]),
  applied: 1,
  changed: true,
  vacias: entidadesTocadas(antes, despues).flatMap((entity) => {
    const motivo = sinGeometria(entity, EVALUADORES);
    return motivo ? [{ id: entity.id, motivo }] : [];
  }),
});
eq(veredicto(tras([linea], [linea, cascaron])), "ROJO", "R2: MESH con el cascarón es ROJO");
eq(
  veredicto(tras([linea], [linea, cascaron, { ...linea, id: "relleno" }])),
  "ROJO",
  "R2: una línea de relleno no esconde el cascarón",
);
eq(veredicto(tras([linea], [linea, caja])), "muta", "R2: BOX con geometría sigue mutando");
eq(veredicto(tras([linea], [])), "muta", "R2: borrar no deja entidades que evaluar y muta");

console.log(`command-integrity-rules.spec: ${checks} comprobaciones OK`);
