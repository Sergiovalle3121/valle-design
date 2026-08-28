import { strict as assert } from "node:assert";
import {
  CAD_ENTITY_TYPE_NAMES,
  cadEntityLabel,
  cadEntityLabels,
  cadTypeName,
} from "./entity-labels";

/* ── 1 · EL CASO QUE ABRIÓ EL DEFECTO ─────────────────────────────────────── */
{
  // Estos son los tipos y el orden del plano de ejemplo real, cuya primera
  // entidad (`cad_mt60y4ol_uzfo`) era literalmente la que veía todo el mundo en
  // el panel de propiedades.
  const plano = [
    { id: "cad_mt60y4ol_uzfo", type: "wall" },
    { id: "cad_mt60ygly_etyh", type: "wall" },
    { id: "cad_a", type: "opening" },
    { id: "cad_b", type: "wall" },
    { id: "cad_c", type: "dimension" },
    { id: "cad_d", type: "mtext" },
    { id: "cad_e", type: "dimension" },
  ];
  const nombres = cadEntityLabels(plano);
  assert.equal(nombres.get("cad_mt60y4ol_uzfo"), "Muro 1");
  assert.equal(nombres.get("cad_mt60ygly_etyh"), "Muro 2");
  assert.equal(nombres.get("cad_b"), "Muro 3");
  assert.equal(nombres.get("cad_a"), "Vano 1");
  assert.equal(nombres.get("cad_c"), "Cota 1");
  assert.equal(nombres.get("cad_e"), "Cota 2");
  assert.equal(nombres.get("cad_d"), "Texto 1");
}

/* ── 2 · CADA TIPO CUENTA POR SU CUENTA ───────────────────────────────────── */
{
  // El fallo clásico: un contador global que produce «Muro 1, Cota 2, Muro 3».
  const nombres = cadEntityLabels([
    { id: "1", type: "wall" },
    { id: "2", type: "dimension" },
    { id: "3", type: "wall" },
  ]);
  assert.equal(
    nombres.get("3"),
    "Muro 2",
    "el contador de muros no puede saltar por una cota en medio",
  );
}

/* ── 3 · DETERMINISMO ─────────────────────────────────────────────────────── */
{
  const plano = [
    { id: "a", type: "wall" },
    { id: "b", type: "wall" },
    { id: "c", type: "hatch" },
  ];
  assert.deepEqual([...cadEntityLabels(plano)], [...cadEntityLabels(plano)]);
  // Y el mismo nombre por las dos vías: si el panel de selección única y la
  // lista discreparan, el usuario vería dos nombres para el mismo objeto.
  for (const entity of plano) {
    assert.equal(
      cadEntityLabel(entity, plano),
      cadEntityLabels(plano).get(entity.id),
      `las dos vías discrepan en ${entity.id}`,
    );
  }
}

/* ── 4 · EL LÍMITE DECLARADO: BORRAR RENUMERA ─────────────────────────────── */
{
  // No es un defecto escondido, es la decisión escrita en la cabecera del
  // módulo. La prueba existe para que quien la cambie sepa que la cambia.
  const antes = [
    { id: "a", type: "wall" },
    { id: "b", type: "wall" },
    { id: "c", type: "wall" },
  ];
  assert.equal(cadEntityLabels(antes).get("c"), "Muro 3");
  const despues = antes.filter((entity) => entity.id !== "b");
  assert.equal(
    cadEntityLabels(despues).get("c"),
    "Muro 2",
    "borrar renumera: es la decisión declarada, no un accidente",
  );
}

/* ── 5 · TODOS LOS TIPOS TIENEN NOMBRE ────────────────────────────────────── */
{
  // Si alguien añade un tipo a la unión sin traducirlo, el panel enseñaría el
  // slug inglés. Esta tabla lo caza en la misma corrida.
  const tipos = Object.keys(CAD_ENTITY_TYPE_NAMES);
  assert.ok(tipos.length >= 24, `sólo hay ${tipos.length} tipos traducidos`);
  for (const [tipo, nombre] of Object.entries(CAD_ENTITY_TYPE_NAMES)) {
    assert.ok(nombre.length > 0, `${tipo} sin nombre`);
    assert.ok(
      /^[A-ZÁÉÍÓÚÑ]/u.test(nombre),
      `«${nombre}» debería empezar en mayúscula`,
    );
  }
  // El vocabulario del gremio, no el del diccionario general.
  assert.equal(CAD_ENTITY_TYPE_NAMES.opening, "Vano");
  assert.equal(CAD_ENTITY_TYPE_NAMES.wall, "Muro");
  assert.equal(CAD_ENTITY_TYPE_NAMES.dimension, "Cota");
  assert.equal(CAD_ENTITY_TYPE_NAMES.hatch, "Sombreado");
}

/* ── 6 · UN TIPO DESCONOCIDO NO INVENTA NADA ──────────────────────────────── */
{
  assert.equal(cadTypeName("tipo-que-no-existe"), "tipo-que-no-existe");
  assert.equal(
    cadEntityLabels([{ id: "x", type: "raro" }]).get("x"),
    "raro 1",
    "mejor el tipo crudo que un «Objeto» que esconda la falta de traducción",
  );
}

/* ── 7 · CASOS DE BORDE ───────────────────────────────────────────────────── */
{
  assert.equal(cadEntityLabels([]).size, 0);
  assert.equal(
    cadEntityLabel({ id: "huerfano", type: "wall" }, []),
    "Muro 1",
    "una entidad que no está en la lista sigue teniendo un nombre legible",
  );
}

console.log(
  "entity-labels: 7 grupos verdes — contador por tipo, determinismo, renumeración declarada, vocabulario del gremio y tipos sin traducir a la vista",
);
