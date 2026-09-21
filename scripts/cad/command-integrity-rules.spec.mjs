#!/usr/bin/env node
/**
 * Spec de las reglas de la sonda de integridad de comandos.
 *
 * La sonda en vivo sólo mide el registro de HOY; estas reglas existen por las
 * trampas que el registro de hoy no contiene. Cada regla lleva aquí su trampa
 * (la frase o la entidad real que se colaba) y su gemelo legítimo (un comando
 * de main que tiene que seguir en verde). El gate lo ejecuta antes de la sonda,
 * con tsx y desde apps/web: las pruebas de R2 y de R7 evalúan las entidades con
 * los evaluadores REALES del producto, no con dobles.
 */
import assert from "node:assert/strict";
import { compruebaExenciones } from "./command-integrity-exenciones.spec.mjs";
import { compruebaGeometria } from "./command-integrity-geometria.spec.mjs";
import {
  clasificar,
  afirmacionSinCoartada,
  clausulasAfirmativas,
  coordenadasImposibles,
  combinarPasadas,
  entidadesTocadas,
  limiteDesmentido,
  sinGeometria,
  soloBanderasDeMetadatos,
} from "./command-integrity-rules.mjs";

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
// Su frase real («superficie espesada…») la atrapa además R3; aquí se quita el
// participio para probar que R1 la atrapa sola.
eq(
  clasificar(sinEfecto(["THICKEN: espesor de 10 unidades — operación pendiente de kernel."])),
  { verdict: "ROJO", note: "promete mutar y terminó sin lote, sin delegar y sin declarar límite" },
  "R1: THICKEN sin lote y sin límite es ROJO",
);
eq(
  veredicto(sinEfecto(["3DMOVE: desplazamiento de 10 unidades en Z."])),
  "ROJO",
  "R1: sin palabra de éxito tampoco se libra un stub mutante",
);
// Trampas: una locución con «no» que no niega el resultado no es un límite.
for (const trampa of [
  "THICKEN: operación pendiente de kernel; no olvide guardar.",
  "THICKEN: operación pendiente de kernel, no obstante sigue en cola.",
  "THICKEN: no dude en repetirlo cuando haya kernel.",
  "THICKEN: no sólo espesa, también une — pendiente de kernel.",
  "THICKEN: pendiente de kernel (nota)",
  // Stubs de la rama de MiMo (surfaces.ts): la negación confiesa que el
  // comando no existe, no un límite de la entrada.
  "SURFBLEND: transición suave — operación aún no implementada en el kernel.",
  "CONVTOSURFACE: 2 entidad(es) — conversión a superficie aún no implementada en el kernel.",
  "SURFTRIM: la selección no contiene superficies; operación aún no implementada.",
  "SURFPATCH: relleno no soportado por el kernel.",
  "SURFOFFSET: offset no disponible sin kernel de superficies.",
  "SURFSCULPT: operación sin implementar, no genera geometría.",
  "SURFNETWORK: no genera superficie, pendiente de kernel.",
]) {
  eq(veredicto(sinEfecto([trampa])), "ROJO", `R1 sigue atrapando: ${trampa}`);
}
// Gemelos legítimos: 3DMOVE (transform-3d.ts) y 3DROTATE (transform-3d-rotate.ts)
// de la rama de MiMo, implementados de verdad, sin sólidos en la selección del
// documento 2D de la sonda. La lista cerrada de R1 los ponía en rojo.
for (const legitimo of [
  "3DMOVE: la selección no contiene sólidos3D.",
  "3DROTATE: la selección no contiene sólidos3D.",
  "La designación no incluye cotas.",
  "FILLET: no encontró dos bordes que se corten.",
  "OFFSET — no hubo intersección con el contorno",
]) {
  eq(veredicto(sinEfecto([legitimo])), "informa", `R1: una negación es límite: ${legitimo}`);
}
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

// ─── R2 ampliado: números IMPOSIBLES en lo que el lote tocó ─────────────────
//
// Trampa: TEXTALIGN ascendía a «muta» escribiendo NaN. Su lote entero era un
// `replace(t1)` y el cambio medido era `rotation` MÁS dos coordenadas basura;
// el texto NO se movía. `changed` era cierto porque la serialización cambiaba
// —NaN sale como `null` en el JSON— y el gate lo contaba como efecto
// verificado. La causa: el esquema define el texto nativo con x/y y la semilla
// lo escribía con `position`, así que entity.x/entity.y eran undefined y la
// proyección daba {NaN, NaN}. El mismo NaN lo propagaban ALIGN, MOVE, ROTATE,
// COPY, MIRROR, ARRAY, y TCOUNT/LAYMCH/GROUP tocaban el texto sin coordenadas.
const textoNaN = { id: "t1", type: "text", layer: "COTAS", x: NaN, y: NaN, rotation: 26.5, text: "PRUEBA" };
const textoSinCoordenadas = { id: "t1", type: "text", layer: "COTAS", position: { x: 10, y: 80 }, text: "PRUEBA" };
const textoBueno = { id: "t1", type: "text", layer: "COTAS", x: 10, y: 80, text: "PRUEBA", height: 5 };

eq(
  coordenadasImposibles(textoNaN),
  "número no finito: x = NaN, y = NaN",
  "R2: el NaN que TEXTALIGN escribía se ve y se dice dónde",
);
eq(
  coordenadasImposibles(textoSinCoordenadas),
  "text sin las coordenadas que su tipo exige: x, y",
  "R2: la CAUSA —un texto con `position` en vez de x/y— se delata sola",
);
eq(
  coordenadasImposibles({ ...linea, end: { x: Infinity, y: 0 } }),
  "número no finito: end.x = Infinity",
  "R2: el infinito también es imposible, y con su ruta",
);
eq(
  coordenadasImposibles({ id: "c9", type: "circle", layer: "0", center: { x: 1, y: 2 }, radius: 3 }),
  null,
  "R2: un círculo con centro y radio es posible",
);
eq(coordenadasImposibles(textoBueno), null, "R2: gemelo legítimo — el texto del esquema");
eq(coordenadasImposibles(linea), null, "R2: gemelo legítimo — la línea de la semilla, sin z");
eq(coordenadasImposibles(caja), null, "R2: gemelo legítimo — un sólido de verdad");
eq(sinGeometria(textoNaN, EVALUADORES), "número no finito: x = NaN, y = NaN", "R2: sinGeometria lo hereda");
eq(veredicto(tras([textoBueno], [textoNaN])), "ROJO", "R2: el «muta» de TEXTALIGN con NaN es ROJO");
eq(
  veredicto(tras([textoSinCoordenadas], [{ ...textoSinCoordenadas, layer: "0" }])),
  "ROJO",
  "R2: tocar una entidad que ya venía sin coordenadas tampoco es mutar",
);
eq(
  veredicto(tras([textoBueno], [{ ...textoBueno, x: 10, y: 10, rotation: 0 }])),
  "muta",
  "R2: mover el texto de verdad sigue mutando",
);

// ─── R6: una bandera de metadatos no es la geometría prometida ──────────────
//
// Trampa: REGION ascendía a «muta» SIN producir geometría. Conducido sobre la
// probeta ANTES de que ésta tuviera un contorno cerrado de aristas sueltas,
// `planCadRegions` devolvía created=0, tagged=2 y su lote entero eran dos
// banderas `{region: true}` sobre `p1` y `c1`, que ya eran contornos cerrados;
// los ocho intentos de crear región se rechazaban. El documento cambiaba —la
// serialización incluye el `context`— y un comando de kind `draw` cobraba
// «muta» sin dibujar. Si se borrara entera la rama que CREA regiones, el gate
// seguiría diciendo «muta»: esa rama no aporta ni un comando al lote.

const LOTE_DE_REGION = [
  { type: "metadata", entityId: "p1", patch: { region: true } },
  { type: "metadata", entityId: "c1", patch: { region: true } },
];
// Gemelo legítimo: el lote REAL de GROUP. Es metadatos y nada más, y eso es
// exactamente lo que GROUP hace — la pertenencia la consume después
// `cadExpandSelectionByGroup`. Su kind es `manage`: la contabilidad del
// documento ES su contrato, y R6 no le pide geometría.
const LOTE_DE_GROUP = [
  { type: "metadata", entityId: "l1", patch: { "cad:groups": "PROBE2" } },
  { type: "metadata", entityId: "l2", patch: { "cad:groups": "PROBE2" } },
];
const PREVIOS = new Set(["l1", "l2", "p1", "c1"]);

eq(
  soloBanderasDeMetadatos(LOTE_DE_REGION, PREVIOS),
  "el lote entero son banderas de metadatos (region) sobre entidades preexistentes",
  "R6: el lote de REGION se ve por lo que es",
);
eq(
  soloBanderasDeMetadatos([...LOTE_DE_REGION, { type: "add", entityId: "probe1" }], PREVIOS),
  null,
  "R6: en cuanto el lote añade algo, ya no son sólo banderas",
);
eq(
  soloBanderasDeMetadatos([{ type: "metadata", entityId: "probe1", patch: { region: true } }], PREVIOS),
  null,
  "R6: marcar lo que el propio lote acaba de crear viene con su geometría",
);
eq(soloBanderasDeMetadatos([], PREVIOS), null, "R6: sin lote no hay nada que juzgar");

const conLote = (lote, kind) => ({
  ...sinEfecto([]),
  applied: 1,
  changed: true,
  kind,
  soloMetadatos: soloBanderasDeMetadatos(lote, PREVIOS),
});
eq(
  veredicto({ ...conLote(LOTE_DE_REGION, "draw"), messages: [] }),
  "ROJO",
  "R6: un `draw` que sólo marca banderas y calla no muta",
);
eq(
  veredicto({
    ...conLote(LOTE_DE_REGION, "draw"),
    messages: [{ text: "REGION: ninguna región nueva. Un TEXT no aporta un borde.", level: "info" }],
  }),
  "honesto-limitado",
  "R6: se queda con la clase que su mensaje le gane, que es PEOR que muta",
);
eq(
  clasificar({ ...conLote(LOTE_DE_REGION, "draw"), messages: [] }).note.startsWith(
    "el lote entero son banderas de metadatos (region) sobre entidades preexistentes, así que el lote no cuenta como geometría;",
  ),
  true,
  "R6: el motivo no se pierde por el camino",
);
eq(veredicto(conLote(LOTE_DE_GROUP, "manage")), "muta", "R6: GROUP y su `cad:groups` siguen mutando");
eq(veredicto(conLote(LOTE_DE_GROUP, "view")), "muta", "R6: `view` tampoco promete geometría");
eq(
  veredicto(conLote(LOTE_DE_GROUP, "inquiry")),
  "muta",
  "R6: `inquiry` tampoco — R6 sólo mira a draw, modify y annotate",
);
for (const kind of ["draw", "modify", "annotate"]) {
  eq(
    veredicto({ ...conLote(LOTE_DE_GROUP, kind), messages: [] }),
    "ROJO",
    `R6: ningún ${kind} dibuja con una bandera, ni con una que sí se consuma`,
  );
}
eq(
  veredicto({ ...conLote([{ type: "replace", entityId: "l1" }], "draw"), messages: [] }),
  "muta",
  "R6: gemelo legítimo — un lote que sustituye geometría sigue mutando",
);

// R7 —el lote que reescribe la geometría y la deja igual— vive en su propio
// archivo por el presupuesto de monolito, y se cuenta aquí con este mismo `eq`.
compruebaGeometria(eq, { P, caja, cascaron, linea, EVALUADORES, veredicto, sinEfecto });

// ─── R3: un mensaje no puede ser a la vez éxito y límite ────────────────────

// Trampas de la rama de MiMo (render-commands.ts, transform-3d-viz…).
for (const trampa of [
  "POINTLIGHT creada con intensidad 1 — requiere WebGL.",
  "SPOTLIGHT creada con intensidad 1 — requiere WebGL.",
  "DISTANTLIGHT creada con intensidad 1 — requiere WebGL.",
  "CAMERA: cámara definida — requiere el visor 3D.",
  "NAVBAR activada — requiere el visor 3D.",
  "NAVVCUBE activada (requiere el visor 3D).",
  "RENDERPRESETS: preset seleccionado; no disponible sin WebGL.",
  "THICKEN: superficie espesada 10 unidades — operación pendiente de kernel.",
]) {
  eq(clausulasAfirmativas(trampa).length > 0, true, `R3 atrapa: ${trampa}`);
  eq(veredicto(sinEfecto([trampa], { mutates: false })), "ROJO", `R3 es ROJO aunque no prometa mutar: ${trampa}`);
}
eq(
  veredicto({ ...sinEfecto(["POINTLIGHT creada — requiere WebGL."]), delegated: true }),
  "delegado",
  "R3 no toca lo que sí delegó",
);
// Legítimos de main que un vocabulario sin negaciones pondría en rojo.
for (const legitimo of [
  "UNION necesita DOS sólidos designados.",
  "SUBTRACT necesita al menos un sólido seleccionado para restar.",
  "EXPORT necesita un nombre de archivo; no se ha exportado nada.",
  "SLICE: no se ha generado ningún corte.",
  "MSPACE necesita una hoja con una ventana abierta.",
  "LAYMCH: los objetos ya están en esa capa.",
  "REGION: las líneas forman una cadena ABIERTA.",
  "REVISA: quedan 2 ediciones abiertas.",
  "TRIM: el punto designado no queda sobre ningún borde.",
  "UCSICON: el icono está activado.",
  "Si está activado, se dibuja en el origen.",
  "¿Borrado definitivo? Pulse Intro.",
  "Nombre   Estado\n0        activada",
]) {
  eq(clausulasAfirmativas(legitimo), [], `R3 no marca: ${legitimo}`);
}
eq(
  veredicto(sinEfecto(["LAYMCH: los objetos ya están en esa capa."])),
  "honesto-limitado",
  "R3: un límite sin afirmación sigue siendo honesto",
);

// ─── La rama de AFIRMACIÓN, por cláusulas ───────────────────────────────────
//
// Leía el mensaje entero: bastaba una palabra de CLAIMS en cualquier sitio, y
// el único escape era que el mensaje dijera además algo de HONESTY. Eso ponía
// en ROJO el rechazo legítimo de SECTION por la palabra «designados» —la misma
// que PARTICIPIO_DE_EXITO ya excluyó a conciencia de R3—. Ahora se juzga
// cláusula a cláusula, con las palabras que RECHAZAN la afirmación pero SIN
// las de estado: «objetos» no puede ser coartada, o «3 objetos borrados» sin
// efecto se escaparía.

// Trampas: una afirmación sin efecto sigue siendo ROJO.
for (const trampa of [
  "3 objetos borrados.",
  "Hecho.",
  "Capa MURO renombrada a TABIQUE",
  "Listo",
  "Cota actualizada.",
]) {
  eq(afirmacionSinCoartada(trampa) !== null, true, `afirmación: atrapa «${trampa}»`);
  eq(veredicto(sinEfecto([trampa])), "ROJO", `afirmación sin efecto es ROJO: «${trampa}»`);
}
// Trampas de LAVADO POR COMA: la rama no cortaba por coma, así que cualquier
// palabra de PREVIO_QUE_RECHAZA_AFIRMACION puesta al principio de la frase
// servía de coartada para la afirmación que venía DESPUÉS de la coma. Es una
// receta de seis palabras para blanquear un «Hecho» vacío, y le servía a todo
// comando con `mutates: false` —los de kind manage/query, que son los que
// imprimen resultados y no tienen la red de R1—. En main, que leía el mensaje
// entero, las seis eran ROJO.
for (const trampa of [
  "Sin tocar el documento, 3 objetos borrados.",
  "Si designas más entidades, 3 objetos borrados.",
  "Ningún error, 2 bloques insertados.",
  "Nunca falla, capa renombrada.",
  "Ni un solo aviso, sólido creado.",
  "Sin sólidos nuevos, la cota ha sido actualizada.",
]) {
  eq(afirmacionSinCoartada(trampa) !== null, true, `afirmación: la coma no es coartada «${trampa}»`);
  eq(
    veredicto(sinEfecto([trampa], { mutates: false })),
    "ROJO",
    `afirmación: lavado por coma sin efecto es ROJO aunque no prometa mutar: «${trampa}»`,
  );
}
// Y la coma NO se le añade a R3: «necesita DOS sólidos designados, y hay 0» es
// una sola proposición y tiene que seguir leyéndose entera.
eq(
  clausulasAfirmativas("INTERFERE necesita DOS sólidos designados, y hay 0."),
  [],
  "la coma es sólo de la rama de afirmación: R3 sigue leyendo la cláusula entera",
);
// «3 objetos borrados» es el caso que obliga a dejar «objetos» FUERA de las
// coartadas: con la lista completa de PREVIO_QUE_ANULA se escaparía por ahí, y
// R3 tampoco lo atraparía por la misma razón.
eq(clausulasAfirmativas("3 objetos borrados."), [], "«objetos» es coartada para R3 y no puede serlo aquí");
eq(afirmacionSinCoartada("3 objetos borrados."), "3 objetos borrado", "y aquí sí se atrapa");
// Gemelo legítimo: el rechazo de SECTION. La palabra «designados» describe la
// ENTRADA, y la cláusula la niega antes de llegar a ella.
eq(
  afirmacionSinCoartada("El plano de corte no atraviesa ninguno de los sólidos designados."),
  null,
  "afirmación: el rechazo de SECTION no es una afirmación",
);
eq(
  veredicto(sinEfecto(["El plano de corte no atraviesa ninguno de los sólidos designados."])),
  "informa",
  "afirmación: el rechazo de SECTION deja de ser ROJO",
);
for (const legitimo of [
  "UNION necesita DOS sólidos designados.",
  "Esta orden necesita SOLID3D designados. Crea uno con EXTRUDE, REVOLVE, SWEEP o LOFT.",
  "INTERFERE necesita al menos DOS sólidos designados; hay 0.",
  "No hay ninguna presentación abierta: crea una con LAYOUT.",
  "¿Borrado definitivo? Pulse Intro.",
  "Si está activado, se dibuja en el origen.",
  "Nada designado: no se ha borrado ninguna entidad.",
  "LAYMCH: los objetos ya están en esa capa.",
]) {
  eq(afirmacionSinCoartada(legitimo), null, `afirmación: no marca «${legitimo}»`);
}
// Y la coartada tiene que estar en LA MISMA cláusula: un límite en otra no
// borra la afirmación. Es lo mismo que exige R3.
eq(
  afirmacionSinCoartada("Capa creada; no se pudo activar."),
  "Capa creada",
  "afirmación: un límite en otra cláusula no tapa la afirmación",
);

// ─── R4: una exención sólo vale si su spec conduce el comando y comprueba ────
//
// El bloque vive en `command-integrity-exenciones.spec.mjs` por el presupuesto
// de monolito, y se llama con ESTE contador: el gate ejecuta un solo spec de
// reglas y exige que anuncie su final.
compruebaExenciones(eq);

// ─── R5: un límite que la probeta DESMIENTE es ROJO ─────────────────────────
//
// El agujero que cierra: hasta la probeta, 18 comandos de sólidos y 9 de lámina
// declaraban un límite que la sonda nunca podía desmentir, y eso les valía
// honesto-limitado. Decir la verdad sobre algo que nunca se te da no cuesta
// nada. Ahora que se les da, la misma frase es una carencia FALSA para no hacer
// nada — el «Hecho» vacío del revés.
//
// Verificado contra main: con la probeta nueva NADIE dice hoy estas frases, así
// que R5 no mueve ninguna cifra. Es una trampa puesta para el futuro, y por eso
// su valor está aquí y no en el recuento.

const conDotacion = { solidos: 2, lamina: true };
const sinDotacion = { solidos: 0, lamina: false };

// Trampas: el comando que responde siempre la misma precondición sin
// implementar nada, con la precondición ya cumplida.
for (const trampa of [
  "3DMOVE: la selección no contiene sólidos 3D.",
  "Esta orden necesita SOLID3D designados. Crea uno con EXTRUDE, REVOLVE, SWEEP o LOFT.",
  "EXPORT necesita SOLID3D designados.",
  "INTERFERE necesita al menos DOS sólidos designados; hay 0.",
  "No hay ninguna presentación abierta: crea una con LAYOUT.",
  "MSPACE necesita una presentación abierta.",
]) {
  eq(
    veredicto(sinEfecto([trampa], { dotacion: conDotacion })),
    "ROJO",
    `R5 atrapa el límite desmentido: ${trampa}`,
  );
  // Gemelo legítimo: la MISMA frase en la pasada que no trae ni sólidos ni
  // lámina sigue siendo honestidad. La regla juzga la DOTACIÓN, no la frase.
  eq(
    veredicto(sinEfecto([trampa], { dotacion: sinDotacion })) !== "ROJO",
    true,
    `R5 no marca la misma frase sin dotación: ${trampa}`,
  );
}
eq(
  limiteDesmentido([{ text: "No hay ninguna presentación abierta.", level: "info" }], { solidos: 2 }),
  null,
  "R5: tener sólidos no desmiente un límite de lámina",
);
eq(
  limiteDesmentido([{ text: "Esta orden necesita SOLID3D designados.", level: "info" }], { lamina: true }),
  null,
  "R5: tener lámina no desmiente un límite de sólidos",
);
// Y R5 no puede tocar a quien SÍ produjo un efecto: un comando que aplicó su
// lote no está poniendo excusas, diga lo que diga en el camino.
eq(
  veredicto({
    ...sinEfecto(["Esta orden necesita SOLID3D designados."], { dotacion: conDotacion }),
    applied: 1,
    changed: true,
  }),
  "muta",
  "R5 va después de las ramas de efecto",
);
eq(
  veredicto({
    ...sinEfecto(["MSPACE necesita una presentación abierta."], { dotacion: conDotacion }),
    delegated: true,
  }),
  "delegado",
  "R5 no toca lo que delegó",
);

// ─── La combinación de las DOS pasadas, y el fixture que la alimenta ────────
//
// La probeta de sólidos y lámina le quita a 27 comandos la excusa de una
// precondición que la sonda nunca cumplía. El peligro del cambio es el
// contrario del que cierra: con un documento rico, «muta» se concede en cuanto
// un lote se aplica y la serialización cambia, así que una deriva del fixture
// podría ASCENDER comandos sin que nadie lo viera. Las trampas van aquí.

const pasada = (verdict, note) => ({ verdict, ...(note ? { note } : {}) });
const combinado = (a, b) => combinarPasadas(pasada(a), pasada(b));

// Trampa: un comando que con la probeta SIGUE sin producir efecto no puede
// salir mejor. Ésta es la razón de ser de la regla: si con sólidos y lámina
// delante un comando no hace nada, no hay verde que darle.
eq(
  combinado("honesto-limitado", "honesto-limitado").verdict,
  "honesto-limitado",
  "combinación: sin efecto en la probeta, NADIE sube a muta",
);
eq(
  combinado("honesto-limitado", "informa").verdict,
  "honesto-limitado",
  "combinación: pasar de declarar el límite a informar NO es un efecto, no asciende",
);
eq(
  combinado("informa", "honesto-limitado").verdict,
  "informa",
  "combinación: manda la pasada base cuando la probeta no aporta efecto",
);
// Trampa: un ROJO no se compensa nunca con el verde de la otra pasada, en
// ninguno de los dos sentidos. Es lo que hace que la precondición imposible
// deje de tapar a EXPORT, REVOLVE y SECTION.
eq(
  combinado("muta", "ROJO").verdict,
  "ROJO",
  "combinación: un ROJO en la probeta gana sobre el muta de la pasada base",
);
eq(
  combinado("ROJO", "muta").verdict,
  "ROJO",
  "combinación: un ROJO en la pasada base gana sobre el muta de la probeta",
);
// Gemelos legítimos: un efecto verificado SÍ asciende, y una degradación por
// el fixture (designar una región o un texto rompe la familia GC*) no le quita
// a nadie el veredicto que la pasada base ya midió.
eq(combinado("honesto-limitado", "muta").verdict, "muta", "combinación: un lote verificado asciende");
eq(
  combinado("honesto-limitado", "delegado").verdict,
  "delegado",
  "combinación: una petición al anfitrión asciende",
);
eq(combinado("muta", "honesto-limitado").verdict, "muta", "combinación: la probeta no degrada a nadie");
eq(combinado("muta", "informa").verdict, "muta", "combinación: la probeta no degrada a nadie");
eq(
  combinado("no-concluyente", "muta").verdict,
  "muta",
  "combinación: si una concluye y la otra no, vale la que concluye",
);
eq(
  combinado("honesto-limitado", "no-concluyente").verdict,
  "honesto-limitado",
  "combinación: que la probeta no lo termine no borra lo que la base midió",
);
// Trampa: el LAVADERO del no-concluyente, que ya tapaba un comando real. PLOT
// decía en plano2d «No hay ninguna presentación abierta: crea una con LAYOUT»
// —la frase EXACTA que R5 declara límite falso— y en la pasada con la lámina
// abierta la sonda no lo llevaba a término, así que `clasificar` devolvía
// no-concluyente en su PRIMERA rama, antes de R5. La combinación devolvía la
// base y PLOT se quedaba con honesto-limitado sostenido por una precondición
// que la probeta desmiente, sin pagar exención porque el veredicto combinado no
// era no-concluyente. Que la sonda no sepa terminarlo no convierte la excusa en
// verdad.
const conMensajes = (verdict, messages = [], dotacion = {}) => ({
  verdict,
  messages: messages.map((text) => ({ text, level: "info" })),
  dotacion,
});
const EXCUSA_DE_LAMINA = "No hay ninguna presentación abierta: crea una con LAYOUT.";
eq(
  combinarPasadas(
    conMensajes("honesto-limitado", [EXCUSA_DE_LAMINA]),
    conMensajes("no-concluyente", [], { solidos: 2, lamina: true }),
  ).verdict,
  "ROJO",
  "combinación: la base no se queda con una excusa que la probeta desmiente",
);
eq(
  combinarPasadas(
    conMensajes("honesto-limitado", ["Esta orden necesita SOLID3D designados."]),
    conMensajes("no-concluyente", [], { solidos: 2, lamina: true }),
  ).verdict,
  "ROJO",
  "combinación: y lo mismo con la excusa de los sólidos",
);
// Gemelos legítimos: sin la dotación que la desmiente, la misma frase sigue
// siendo honestidad; y un límite que la probeta NO desmiente tampoco cambia.
eq(
  combinarPasadas(
    conMensajes("honesto-limitado", [EXCUSA_DE_LAMINA]),
    conMensajes("no-concluyente", [], { solidos: 2, lamina: false }),
  ).verdict,
  "honesto-limitado",
  "combinación: sin lámina en la probeta, la frase de lámina sigue siendo honesta",
);
eq(
  combinarPasadas(
    conMensajes("honesto-limitado", ["FILLET: no encontró dos bordes que se corten."]),
    conMensajes("no-concluyente", [], { solidos: 2, lamina: true }),
  ).verdict,
  "honesto-limitado",
  "combinación: un límite que la probeta no desmiente no se toca",
);
eq(
  combinarPasadas(
    conMensajes("muta", [EXCUSA_DE_LAMINA]),
    conMensajes("no-concluyente", [], { solidos: 2, lamina: true }),
  ).verdict,
  "muta",
  "combinación: R5 va después de las ramas de efecto, también aquí",
);
eq(
  combinado("no-concluyente", "no-concluyente").verdict,
  "no-concluyente",
  "combinación: sin conclusión en ninguna, sigue exigiendo su exención declarada",
);
eq(combinado("muta", "ROJO").pasada, "solidos3d", "combinación: se dice QUÉ pasada decidió");
eq(combinado("honesto-limitado", "muta").pasada, "solidos3d", "combinación: se dice QUÉ pasada decidió");
eq(combinado("informa", "informa").pasada, "plano2d", "combinación: se dice QUÉ pasada decidió");

// Y el fixture no puede moverse por su cuenta: se construye DOS veces y se
// exige el mismo texto canónico, los mismos triángulos, el mismo volumen, la
// misma área y la misma región, medidos con los evaluadores del producto. Sin
// esto, «muta» —que se concede comparando serializaciones— podría concederse
// por una deriva del documento inicial y no por el comando.
const { comprobarProbeta, probetaEvidencia, PROBETA_INVARIANTES } = await import(
  "../../apps/web/scripts/command-integrity-probeta.mts"
);
const { probeDocumentSeed } = await import("../../apps/web/scripts/command-integrity-probe-seed.mts");
eq(comprobarProbeta(probeDocumentSeed), [], "la probeta cumple sus invariantes y serializa igual dos veces");
eq(
  probetaEvidencia(probeDocumentSeed),
  {
    solidos: PROBETA_INVARIANTES.solidos,
    triangulos: PROBETA_INVARIANTES.triangulosPorSolido,
    volumen: PROBETA_INVARIANTES.volumenPorSolido,
    area: PROBETA_INVARIANTES.areaPorSolido,
    region: PROBETA_INVARIANTES.region,
    aristasDelContorno: PROBETA_INVARIANTES.aristasDelContorno,
    areaDelContorno: PROBETA_INVARIANTES.areaDelContorno,
    lamina: PROBETA_INVARIANTES.lamina,
    viewports: PROBETA_INVARIANTES.viewports,
    vistasDerivadas: PROBETA_INVARIANTES.vistasDerivadas,
  },
  "lo que la probeta manda al artefacto es lo que sus invariantes declaran",
);

console.log(`command-integrity-rules.spec: ${checks} comprobaciones OK`);
