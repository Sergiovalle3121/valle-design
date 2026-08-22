import { strict as assert } from "node:assert";
import {
  CAD_LAYOUT_TEMPLATES,
  instantiateCadLayoutTemplate,
} from "./templates";

assert.equal(
  new Set(CAD_LAYOUT_TEMPLATES.map((template) => template.id)).size,
  CAD_LAYOUT_TEMPLATES.length,
  "template ids are unique",
);

const bodega = instantiateCadLayoutTemplate("bodega-pyme", {
  width: 14000,
  height: 9000,
  gridSize: 100,
});
assert.ok(bodega.assets.length >= 8, "la bodega crea objetos editables");
assert.ok(
  bodega.assets.some((asset) => asset.layer === "architecture"),
  "la bodega trae muros y portones en la capa de arquitectura",
);

const chico = instantiateCadLayoutTemplate("casa-habitacion", {
  width: 6000,
  height: 4000,
  gridSize: 100,
});
assert.ok(chico.scale < 1, "una plantilla grande se reescala hacia abajo");
assert.ok(chico.warnings.length > 0, "la plantilla reescalada avisa");
assert.ok(
  chico.assets.every(
    (asset) =>
      asset.x >= 0 &&
      asset.y >= 0 &&
      asset.x + asset.w <= 6000 &&
      asset.y + asset.h <= 4000,
  ),
  "los objetos de la plantilla quedan dentro del área de dibujo",
);

// CAD universal (VD-CAD-UNIVERSAL-002): arranques para cualquiera.
for (const id of [
  "casa-habitacion",
  "local-comercial",
  "consultorio",
  "restaurante",
  "aula-escolar",
  "gimnasio",
  "oficina-coworking",
  "bodega-pyme",
  "taller-mecanico",
  "cafeteria",
  "salon-belleza",
  "farmacia",
  "jardin-eventos",
  "panaderia",
  "veterinaria",
  "lavanderia",
  "guarderia",
  "ferreteria",
  "habitacion-hotel",
  "consultorio-dental",
  "estacionamiento",
  "cancha-futbol",
  "salon-fiestas",
  "iglesia",
  "minisuper",
  "taqueria",
  "carniceria",
  "fruteria",
  "barberia",
  "tortilleria",
  "papeleria",
  "fondita",
  "estetica-canina",
  "fisioterapia",
  "spa",
  "cibercafe",
  "gimnasio-box",
  "polleria",
  "floreria",
  "cremeria",
  "neveria",
  "jugueria",
  "pescaderia",
  "boutique",
  "hostal",
  "autolavado",
  "llantera",
  "purificadora",
  "optica",
  "departamento",
  "rosticeria",
  "terraza-jardin",
  "vinateria",
  "pasteleria",
  "academia-baile",
  "refaccionaria",
  "imprenta",
  "salon-unas",
  "taller-celulares",
  "mercado",
  "parque-vecinal",
  "estancia-adultos",
  "salon-fiestas-infantil",
  "marisqueria",
  "hamburgueseria",
  "laboratorio-clinico",
  "funeraria",
  "notaria",
  "despacho-contable",
  "inmobiliaria",
  "banco-sucursal",
  "casa-empeno",
  "biblioteca",
  "cine-sala",
  "estudio-fotografico",
  "estudio-tatuajes",
  "taller-carpinteria",
  "zapateria",
  "joyeria",
  "muebleria",
  "tienda-deportes",
  "cocina-fantasma",
  "estudio-yoga",
  "taller-bicicletas",
  "consultorio-psicologia",
  "vivero",
  "cerrajeria",
  "material-construccion",
  "bar-cantina",
  "gasolinera",
  "agencia-autos",
  "escuela-primaria",
  "gimnasio-crossfit",
  "alberca-publica",
  "boliche",
  "teatro",
  "clinica-dental",
  "clinica-urgencias",
  "kinder",
  "nave-industrial",
  "call-center",
  "cerveceria-artesanal",
  "karaoke-bar",
  "estacion-bomberos",
  "plaza-comidas",
  "estacion-policia",
  "invernadero",
  "taller-soldadura",
  "hotel-lobby",
  "supermercado",
  "central-autobuses",
  "tienda-departamental",
  "universidad-facultad",
  "hospital-veterinario",
  "laboratorio-dental",
  "taller-textil",
  "estacionamiento-multinivel",
  "rastro-frigorifico",
  "clinica-estetica",
  "centro-datos",
  "recicladora",
  "estudio-tv",
  "club-deportivo",
  "antro-discoteca",
  "tienda-mascotas",
  "museo",
  "autoescuela",
  "balneario",
  "planta-tratamiento-agua",
  "planta-embotelladora",
  "establo-lecheria",
  "casino",
  "centro-rehabilitacion",
  "centro-distribucion",
  "granja-avicola",
  "torre-corporativa",
  "clinica-oftalmologica",
  "estacion-tren",
  "estudio-grabacion",
  "herbolaria",
  "centro-idiomas",
]) {
  const t = CAD_LAYOUT_TEMPLATES.find((template) => template.id === id);
  assert.ok(t, `${id} disponible`);
  assert.ok(
    ["arquitectura", "bodega", "taller"].includes(t?.category ?? ""),
    `${id} tiene categoría universal válida`,
  );
  assert.ok((t?.assets.length ?? 0) >= 8, `${id} trae cuartos y muebles`);
  assert.ok(
    t?.assets.some((a) => a.kind === "door"),
    `${id} tiene puerta de entrada`,
  );
}

// CAD universal POR DISCIPLINA (campaña de identidad, 2026-08-22): la prueba
// dibujable de que Valle Design no es sólo arquitectura. Estas cuatro NO llevan
// puerta ni cuartos —una pieza mecánica no tiene puerta— así que se verifican
// aparte, por lo que cada disciplina sí exige: escala propia, capa de cotas y
// una anotación que diga en qué unidades está el dibujo.
for (const [id, categoria] of [
  ["pieza-mecanica", "taller"],
  ["diagrama-unifilar", "instalaciones"],
  ["levantamiento-predio", "civil"],
  ["despiece-carpinteria", "taller"],
] as const) {
  const t = CAD_LAYOUT_TEMPLATES.find((template) => template.id === id);
  assert.ok(t, `${id} disponible`);
  assert.equal(t?.category, categoria, `${id} declara su disciplina`);
  assert.ok(
    (t?.assets.length ?? 0) >= 9,
    `${id} trae suficientes elementos para ser un arranque`,
  );
  assert.ok(
    t?.assets.some((a) => a.layer === "measurements"),
    `${id} trae su cuadro o su eje en la capa de cotas`,
  );
  assert.ok(
    (t?.annotations.length ?? 0) >= 3,
    `${id} explica en el propio dibujo qué es y en qué unidades está`,
  );
  const instancia = instantiateCadLayoutTemplate(id, {
    width: t!.baseWidth,
    height: t!.baseHeight,
    gridSize: 1,
  });
  assert.equal(
    instancia.scale,
    1,
    `${id} cabe en su propio footprint sin escalar`,
  );
  assert.ok(
    instancia.assets.every(
      (a) =>
        a.x >= 0 &&
        a.y >= 0 &&
        a.x + a.w <= t!.baseWidth &&
        a.y + a.h <= t!.baseHeight,
    ),
    `${id} no se sale de su área de dibujo`,
  );
}

// Ninguna disciplina se quedó sin arranque: el catálogo dejó de ser sólo
// edificios el día que la campaña de identidad corrigió el posicionamiento.
for (const disciplina of ["civil", "instalaciones", "taller", "estructura"]) {
  assert.ok(
    CAD_LAYOUT_TEMPLATES.some((t) => t.category === disciplina),
    `hay al menos una plantilla de ${disciplina}`,
  );
}

console.log("cad templates specs passed");
