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

const smt = instantiateCadLayoutTemplate("smt-line", {
  width: 20000,
  height: 8000,
  gridSize: 100,
});
assert.ok(smt.assets.length >= 8, "SMT template creates editable assets");
assert.ok(smt.connectors.length >= 6, "SMT template creates flow connectors");
assert.ok(
  smt.assets.some((asset) => asset.layer === "safety"),
  "SMT template includes safety layer objects",
);

const supermarket = instantiateCadLayoutTemplate("supermarket-kitting", {
  width: 16000,
  height: 9500,
  gridSize: 100,
});
assert.ok(
  supermarket.assets.length >= 16,
  "supermarket template creates a complete editable kitting area",
);
assert.ok(
  supermarket.assets.some((asset) => asset.tags.includes("kanban")),
  "supermarket template includes kanban lanes",
);
assert.ok(
  supermarket.assets.some((asset) => asset.tags.includes("kitting")),
  "supermarket template includes kitting carts/areas",
);
assert.ok(
  supermarket.assets.some((asset) => asset.layer === "aisles"),
  "supermarket template includes aisle objects",
);
assert.ok(
  supermarket.assets.some((asset) => asset.layer === "safety"),
  "supermarket template includes safety objects",
);
assert.ok(
  supermarket.connectors.some((connector) => connector.kind === "material") &&
    supermarket.connectors.some((connector) => connector.kind === "flow"),
  "supermarket template creates material and flow connectors",
);

const small = instantiateCadLayoutTemplate("ems-mini-factory", {
  width: 9000,
  height: 6000,
  gridSize: 100,
});
assert.ok(small.scale < 1, "large factory template scales down");
assert.ok(small.warnings.length > 0, "scaled template reports warnings");
assert.ok(
  small.assets.every(
    (asset) =>
      asset.x >= 0 &&
      asset.y >= 0 &&
      asset.x + asset.w <= 9000 &&
      asset.y + asset.h <= 6000,
  ),
  "template assets stay inside the footprint",
);

console.log("cad templates specs passed");

// CAD universal (AXOS-CAD-UNIVERSAL-002): arranques para cualquiera.
for (const id of ["casa-habitacion", "local-comercial", "consultorio", "restaurante", "aula-escolar", "gimnasio", "oficina-coworking", "bodega-pyme", "taller-mecanico", "cafeteria", "salon-belleza", "farmacia", "jardin-eventos", "panaderia", "veterinaria", "lavanderia", "guarderia", "ferreteria", "habitacion-hotel", "consultorio-dental", "estacionamiento", "cancha-futbol", "salon-fiestas", "iglesia", "minisuper", "taqueria", "carniceria", "fruteria", "barberia", "tortilleria", "papeleria", "fondita", "estetica-canina", "fisioterapia", "spa", "cibercafe", "gimnasio-box", "polleria", "floreria", "cremeria", "neveria", "jugueria", "pescaderia", "boutique", "hostal", "autolavado", "llantera", "purificadora", "optica", "departamento", "rosticeria", "terraza-jardin", "vinateria", "pasteleria", "academia-baile", "refaccionaria", "imprenta", "salon-unas", "taller-celulares", "mercado", "parque-vecinal", "estancia-adultos", "salon-fiestas-infantil", "marisqueria", "hamburgueseria", "laboratorio-clinico", "funeraria", "notaria", "despacho-contable", "inmobiliaria", "banco-sucursal", "casa-empeno", "biblioteca", "cine-sala", "estudio-fotografico", "estudio-tatuajes", "taller-carpinteria", "zapateria", "joyeria", "muebleria", "tienda-deportes", "cocina-fantasma", "estudio-yoga", "taller-bicicletas", "consultorio-psicologia", "vivero", "cerrajeria", "material-construccion", "bar-cantina", "gasolinera", "agencia-autos", "escuela-primaria", "gimnasio-crossfit", "alberca-publica", "boliche", "teatro", "clinica-dental", "clinica-urgencias", "kinder", "nave-industrial", "call-center", "cerveceria-artesanal", "karaoke-bar", "estacion-bomberos", "plaza-comidas", "estacion-policia", "invernadero", "taller-soldadura", "hotel-lobby", "supermercado", "central-autobuses", "tienda-departamental", "universidad-facultad", "hospital-veterinario", "laboratorio-dental", "taller-textil", "estacionamiento-multinivel", "rastro-frigorifico", "clinica-estetica", "centro-datos", "recicladora", "estudio-tv", "club-deportivo", "antro-discoteca", "tienda-mascotas"]) {
  const t = CAD_LAYOUT_TEMPLATES.find((template) => template.id === id);
  assert.ok(t, `${id} disponible`);
  assert.ok(
    ["architecture", "warehouse", "factory"].includes(t?.category ?? ""),
    `${id} tiene categoría universal válida`,
  );
  assert.ok((t?.assets.length ?? 0) >= 8, `${id} trae cuartos y muebles`);
  assert.ok(
    t?.assets.some((a) => a.kind === "door"),
    `${id} tiene puerta de entrada`,
  );
}
