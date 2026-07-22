import { strict as assert } from "node:assert";
import {
  CAD_SYMBOL_LIBRARY,
  createCadSymbolPlacement,
  getCadSymbol,
  searchCadSymbols,
} from "./symbols";

assert.ok(
  CAD_SYMBOL_LIBRARY.length >= 25,
  "ships a manufacturing-grade industrial symbol set",
);
assert.equal(
  new Set(CAD_SYMBOL_LIBRARY.map((symbol) => symbol.id)).size,
  CAD_SYMBOL_LIBRARY.length,
  "symbol ids are unique",
);
assert.ok(
  searchCadSymbols("aoi").some((symbol) => symbol.id === "aoi"),
  "search finds AOI",
);
// CAD universal (AXOS-CAD-UNIVERSAL-001): el catálogo sirve a cualquiera
// diseñando cualquier cosa — búsquedas en español de casa/oficina/comercio.
assert.ok(
  searchCadSymbols("puerta").some((symbol) => symbol.id === "door-90"),
  "search finds puertas (arquitectura)",
);
assert.ok(
  searchCadSymbols("cama").some((symbol) => symbol.id === "bed-queen"),
  "search finds camas (mobiliario)",
);
assert.ok(
  searchCadSymbols("escritorio").some((symbol) => symbol.id === "desk"),
  "search finds escritorios (oficina)",
);
assert.ok(
  searchCadSymbols("restaurante").some(
    (symbol) => symbol.id === "restaurant-table-4",
  ),
  "search finds mesas de restaurante (comercio)",
);
assert.ok(
  CAD_SYMBOL_LIBRARY.filter((symbol) =>
    ["architecture", "furniture", "office", "commerce"].includes(
      symbol.category,
    ),
  ).length >= 20,
  "ships a universal (non-EMS) symbol set",
);
assert.ok(
  searchCadSymbols("pick").some((symbol) => symbol.id === "pick-and-place"),
  "search finds pick-and-place equipment",
);
for (const id of [
  "solder-paste-printer",
  "spi",
  "pick-and-place",
  "reflow-oven",
  "ict-tester",
  "functional-test-bench",
  "quality-gate",
]) {
  const symbol = getCadSymbol(id);
  assert.ok(symbol, `${id} is available`);
  assert.equal(symbol?.layer, "Equipment", `${id} uses the Equipment layer`);
  assert.ok(symbol?.ports.length, `${id} exposes flow ports`);
}
for (const symbol of CAD_SYMBOL_LIBRARY) {
  for (const port of symbol.ports) {
    assert.ok(
      port.x >= -0.5 && port.x <= 0.5 && port.y >= -0.5 && port.y <= 0.5,
      `${symbol.id}.${port.id} port stays inside the normalized footprint`,
    );
  }
}
const placement = createCadSymbolPlacement("smt-line", 100, 200, "p1");
assert.equal(
  placement?.width,
  12000,
  "placement uses default symbol dimensions",
);
assert.equal(placement?.layer, "Equipment", "placement carries default layer");
const reflow = createCadSymbolPlacement("reflow-oven", 400, 800, "reflow-1");
assert.equal(reflow?.height, 1800, "new symbols keep their default footprint");
assert.ok(
  reflow?.tags.includes("thermal"),
  "symbol placement preserves manufacturing tags",
);
console.log("cad symbols specs passed");

// Segunda tanda universal (AXOS-CAD-UNIVERSAL-004): escuela, gimnasio,
// exterior y baño público con búsqueda en español.
assert.ok(
  searchCadSymbols("caminadora").some((symbol) => symbol.id === "treadmill"),
  "search finds caminadora (gimnasio)",
);
assert.ok(
  searchCadSymbols("pupitre").some((symbol) => symbol.id === "school-desk"),
  "search finds pupitre (escuela)",
);
assert.ok(
  searchCadSymbols("estacionamiento").some(
    (symbol) => symbol.id === "parking-spot",
  ),
  "search finds cajón de estacionamiento (exterior)",
);
assert.equal(
  getCadSymbol("parking-spot")?.defaultWidth,
  2500,
  "cajón de estacionamiento a medida real (2.5 m)",
);

// Tercera tanda universal (AXOS-CAD-UNIVERSAL-009): taller mecánico con
// búsqueda en español y medidas reales.
assert.ok(
  searchCadSymbols("elevador").some((symbol) => symbol.id === "car-lift"),
  "search finds elevador de auto (taller)",
);
assert.ok(
  searchCadSymbols("banco de trabajo").some(
    (symbol) => symbol.id === "workbench",
  ),
  "search finds banco de trabajo (taller)",
);
assert.ok(
  searchCadSymbols("llantas").some((symbol) => symbol.id === "tire-rack"),
  "search finds estante de llantas (taller)",
);
assert.equal(
  getCadSymbol("car")?.defaultHeight,
  4500,
  "auto a medida real (4.5 m de largo)",
);

// Cuarta tanda universal (AXOS-CAD-UNIVERSAL-012): salón de belleza.
assert.ok(
  searchCadSymbols("estilista").some((symbol) => symbol.id === "styling-chair"),
  "search finds silla de estilista (salón)",
);
assert.ok(
  searchCadSymbols("lavacabezas").some(
    (symbol) => symbol.id === "wash-station",
  ),
  "search finds lavacabezas (salón)",
);
assert.ok(
  searchCadSymbols("tocador").some((symbol) => symbol.id === "styling-mirror"),
  "search finds tocador con espejo (salón)",
);

// Quinta tanda universal (AXOS-CAD-UNIVERSAL-015): panadería.
assert.ok(
  searchCadSymbols("horno").some((symbol) => symbol.id === "oven"),
  "search finds horno (panadería)",
);
assert.ok(
  searchCadSymbols("amasadora").some((symbol) => symbol.id === "dough-mixer"),
  "search finds amasadora (panadería)",
);
assert.ok(
  searchCadSymbols("vitrina").some((symbol) => symbol.id === "display-case"),
  "search finds vitrina (panadería)",
);

// Sexta tanda universal (AXOS-CAD-UNIVERSAL-016): veterinaria.
assert.ok(
  searchCadSymbols("jaula").some((symbol) => symbol.id === "kennel-cage"),
  "search finds jaula para mascotas (veterinaria)",
);

// Séptima tanda universal (AXOS-CAD-UNIVERSAL-017): lavandería.
assert.ok(
  searchCadSymbols("lavadora").some((symbol) => symbol.id === "washer"),
  "search finds lavadora (lavandería)",
);
assert.ok(
  searchCadSymbols("secadora").some((symbol) => symbol.id === "dryer"),
  "search finds secadora (lavandería)",
);

// Octava tanda universal (AXOS-CAD-UNIVERSAL-018): guardería.
assert.ok(
  searchCadSymbols("cuna").some((symbol) => symbol.id === "crib"),
  "search finds cuna (guardería)",
);

// Novena tanda universal (AXOS-CAD-UNIVERSAL-020): hotel.
assert.ok(
  searchCadSymbols("buró").some((symbol) => symbol.id === "nightstand"),
  "search finds buró (hotel)",
);
assert.ok(
  searchCadSymbols("mesa de noche").some(
    (symbol) => symbol.id === "nightstand",
  ),
  "search finds mesa de noche (hotel)",
);

// Décima tanda universal (AXOS-CAD-UNIVERSAL-021): consultorio dental.
assert.ok(
  searchCadSymbols("sillón dental").some(
    (symbol) => symbol.id === "dental-chair",
  ),
  "search finds sillón dental",
);
assert.ok(
  searchCadSymbols("dentista").some((symbol) => symbol.id === "dental-chair"),
  "search finds dentista → sillón dental",
);

// Undécima tanda universal (AXOS-CAD-UNIVERSAL-023): deportes.
assert.ok(
  searchCadSymbols("portería").some((symbol) => symbol.id === "goal"),
  "search finds portería (cancha)",
);

// Duodécima tanda universal (AXOS-CAD-UNIVERSAL-024): fiestas.
assert.ok(
  searchCadSymbols("brincolín").some((symbol) => symbol.id === "bounce-house"),
  "search finds brincolín (fiestas)",
);
assert.ok(
  searchCadSymbols("inflable").some((symbol) => symbol.id === "bounce-house"),
  "search finds inflable (fiestas)",
);

// Decimotercera tanda universal (AXOS-CAD-UNIVERSAL-025): iglesia.
assert.ok(
  searchCadSymbols("banca de iglesia").some((symbol) => symbol.id === "pew"),
  "search finds banca de iglesia",
);
assert.ok(
  searchCadSymbols("púlpito").some((symbol) => symbol.id === "pulpit"),
  "search finds púlpito (iglesia)",
);
assert.ok(
  searchCadSymbols("templo").some((symbol) => symbol.id === "pew"),
  "search finds templo → banca de iglesia",
);

// Decimocuarta tanda universal (AXOS-CAD-UNIVERSAL-028): comercio.
assert.ok(
  searchCadSymbols("congelador").some((symbol) => symbol.id === "freezer"),
  "search finds congelador",
);
assert.ok(
  searchCadSymbols("cafetera").some(
    (symbol) => symbol.id === "coffee-machine",
  ),
  "search finds cafetera",
);
assert.ok(
  searchCadSymbols("báscula").some((symbol) => symbol.id === "scale"),
  "search finds báscula",
);
assert.ok(
  searchCadSymbols("carnicería").some((symbol) => symbol.id === "freezer"),
  "search finds carnicería → congelador",
);

// Decimoquinta tanda universal (AXOS-CAD-UNIVERSAL-030): frutería.
assert.ok(
  searchCadSymbols("huacal").some((symbol) => symbol.id === "fruit-crate"),
  "search finds huacal (frutería)",
);
assert.ok(
  searchCadSymbols("cajón de fruta").some(
    (symbol) => symbol.id === "fruit-crate",
  ),
  "search finds cajón de fruta",
);

// Decimosexta tanda universal (AXOS-CAD-UNIVERSAL-032): tortillería.
assert.ok(
  searchCadSymbols("tortilladora").some(
    (symbol) => symbol.id === "tortilla-machine",
  ),
  "search finds tortilladora",
);
assert.ok(
  searchCadSymbols("tortillería").some(
    (symbol) => symbol.id === "tortilla-machine",
  ),
  "search finds tortillería → máquina",
);

// Decimoséptima tanda universal (AXOS-CAD-UNIVERSAL-033): papelería.
assert.ok(
  searchCadSymbols("copiadora").some((symbol) => symbol.id === "copier"),
  "search finds copiadora",
);
assert.ok(
  searchCadSymbols("fotocopiadora").some((symbol) => symbol.id === "copier"),
  "search finds fotocopiadora",
);

// Decimoctava tanda universal (AXOS-CAD-UNIVERSAL-036): salud.
assert.ok(
  searchCadSymbols("camilla").some((symbol) => symbol.id === "exam-table"),
  "search finds camilla",
);
assert.ok(
  searchCadSymbols("fisioterapia").some(
    (symbol) => symbol.id === "exam-table",
  ),
  "search finds fisioterapia → camilla",
);

// Decimonovena tanda universal (AXOS-CAD-UNIVERSAL-039): box.
assert.ok(
  searchCadSymbols("costal").some((symbol) => symbol.id === "punching-bag"),
  "search finds costal de box",
);
assert.ok(
  searchCadSymbols("boxeo").some((symbol) => symbol.id === "punching-bag"),
  "search finds boxeo → costal",
);

// Vigésima tanda universal (AXOS-CAD-UNIVERSAL-041): detalles.
assert.ok(
  searchCadSymbols("maceta").some((symbol) => symbol.id === "plant-pot"),
  "search finds maceta",
);
assert.ok(
  searchCadSymbols("perchero").some((symbol) => symbol.id === "coat-rack"),
  "search finds perchero",
);

// Vigesimoprimera tanda universal (AXOS-CAD-UNIVERSAL-043): mostrador.
assert.ok(
  searchCadSymbols("registradora").some(
    (symbol) => symbol.id === "cash-register",
  ),
  "search finds caja registradora",
);
assert.ok(
  searchCadSymbols("basura").some((symbol) => symbol.id === "trash-bin"),
  "search finds bote de basura",
);
assert.ok(
  searchCadSymbols("garrafon").some(
    (symbol) => symbol.id === "water-dispenser",
  ),
  "search finds garrafón",
);

// Vigesimosegunda tanda universal (AXOS-CAD-UNIVERSAL-046): eléctricos.
assert.ok(
  searchCadSymbols("pantalla").some((symbol) => symbol.id === "tv-screen"),
  "search finds pantalla",
);
assert.ok(
  searchCadSymbols("microondas").some((symbol) => symbol.id === "microwave"),
  "search finds microondas",
);
assert.ok(
  searchCadSymbols("ventilador").some(
    (symbol) => symbol.id === "pedestal-fan",
  ),
  "search finds ventilador",
);

// Vigesimotercera tanda universal (AXOS-CAD-UNIVERSAL-049): cocina y barra.
assert.ok(
  searchCadSymbols("fregadero").some((symbol) => symbol.id === "kitchen-sink"),
  "search finds fregadero",
);
assert.ok(
  searchCadSymbols("tarja").some((symbol) => symbol.id === "kitchen-sink"),
  "search finds tarja",
);
assert.ok(
  searchCadSymbols("banco alto").some((symbol) => symbol.id === "bar-stool"),
  "search finds banco alto",
);
assert.ok(
  searchCadSymbols("campana").some((symbol) => symbol.id === "range-hood"),
  "search finds campana",
);

// Vigesimocuarta tanda universal (AXOS-CAD-UNIVERSAL-051): recámara y patio.
assert.ok(
  searchCadSymbols("espejo de pared").some(
    (symbol) => symbol.id === "wall-mirror",
  ),
  "search finds espejo de pared",
);
assert.ok(
  searchCadSymbols("litera").some((symbol) => symbol.id === "bunk-bed"),
  "search finds litera",
);
assert.ok(
  searchCadSymbols("asador").some((symbol) => symbol.id === "grill"),
  "search finds asador",
);
assert.ok(
  searchCadSymbols("parrilla").some((symbol) => symbol.id === "grill"),
  "search finds parrilla",
);

// Vigesimoquinta tanda universal (AXOS-CAD-UNIVERSAL-054): autolavado.
assert.ok(
  searchCadSymbols("aspiradora").some(
    (symbol) => symbol.id === "vacuum-cleaner",
  ),
  "search finds aspiradora",
);
assert.ok(
  searchCadSymbols("hidrolavadora").some(
    (symbol) => symbol.id === "pressure-washer",
  ),
  "search finds hidrolavadora",
);
assert.ok(
  searchCadSymbols("cono").some((symbol) => symbol.id === "traffic-cone"),
  "search finds cono de tráfico",
);

// Vigesimosexta tanda universal (AXOS-CAD-UNIVERSAL-057): patio.
assert.ok(
  searchCadSymbols("tinaco").some((symbol) => symbol.id === "water-tank"),
  "search finds tinaco",
);
assert.ok(
  searchCadSymbols("tanque de gas").some((symbol) => symbol.id === "gas-tank"),
  "search finds tanque de gas",
);
assert.ok(
  searchCadSymbols("boiler").some((symbol) => symbol.id === "water-heater"),
  "search finds boiler",
);
assert.ok(
  searchCadSymbols("calentador").some(
    (symbol) => symbol.id === "water-heater",
  ),
  "search finds calentador",
);

// Vigesimoséptima tanda universal (AXOS-CAD-UNIVERSAL-060): patio de casa.
assert.ok(
  searchCadSymbols("lavadero").some((symbol) => symbol.id === "laundry-sink"),
  "search finds lavadero",
);
assert.ok(
  searchCadSymbols("tendedero").some((symbol) => symbol.id === "clothesline"),
  "search finds tendedero",
);
assert.ok(
  searchCadSymbols("columpios").some((symbol) => symbol.id === "playground"),
  "search finds columpios",
);
assert.ok(
  searchCadSymbols("resbaladilla").some(
    (symbol) => symbol.id === "playground",
  ),
  "search finds resbaladilla",
);

// Vigesimoctava tanda universal (AXOS-CAD-UNIVERSAL-061): terraza.
assert.ok(
  searchCadSymbols("sombrilla").some(
    (symbol) => symbol.id === "patio-umbrella",
  ),
  "search finds sombrilla",
);
assert.ok(
  searchCadSymbols("rosticero").some((symbol) => symbol.id === "rotisserie"),
  "search finds rosticero",
);
assert.ok(
  searchCadSymbols("picnic").some((symbol) => symbol.id === "picnic-table"),
  "search finds mesa de picnic",
);

// Vigesimonovena tanda universal (AXOS-CAD-UNIVERSAL-064): protección civil.
assert.ok(
  searchCadSymbols("extintor").some(
    (symbol) => symbol.id === "fire-extinguisher",
  ),
  "search finds extintor",
);
assert.ok(
  searchCadSymbols("botiquin").some((symbol) => symbol.id === "first-aid-kit"),
  "search finds botiquín",
);
assert.ok(
  searchCadSymbols("salida de emergencia").some(
    (symbol) => symbol.id === "emergency-exit-sign",
  ),
  "search finds salida de emergencia",
);
assert.ok(
  searchCadSymbols("proteccion civil").some(
    (symbol) => symbol.id === "fire-extinguisher",
  ),
  "search finds protección civil → extintor",
);

// Trigésima tanda universal (AXOS-CAD-UNIVERSAL-066): masa y repostería.
assert.ok(
  searchCadSymbols("espiguero").some((symbol) => symbol.id === "bread-rack"),
  "search finds espiguero",
);
assert.ok(
  searchCadSymbols("batidora").some((symbol) => symbol.id === "stand-mixer"),
  "search finds batidora",
);
assert.ok(
  searchCadSymbols("nixtamal").some((symbol) => symbol.id === "nixtamal-mill"),
  "search finds molino de nixtamal",
);

// Trigésima primera tanda universal (AXOS-CAD-UNIVERSAL-068): escenario.
assert.ok(
  searchCadSymbols("bocina").some((symbol) => symbol.id === "speaker"),
  "search finds bocina",
);
assert.ok(
  searchCadSymbols("tarima").some((symbol) => symbol.id === "stage"),
  "search finds tarima",
);
assert.ok(
  searchCadSymbols("ballet").some((symbol) => symbol.id === "ballet-barre"),
  "search finds barra de ballet",
);

// Trigésima segunda tanda universal (AXOS-CAD-UNIVERSAL-078): velación.
assert.ok(
  searchCadSymbols("ataud").some((symbol) => symbol.id === "coffin"),
  "search finds ataúd",
);
assert.ok(
  searchCadSymbols("reclinatorio").some((symbol) => symbol.id === "kneeler"),
  "search finds reclinatorio",
);
assert.ok(
  searchCadSymbols("corona funebre").some(
    (symbol) => symbol.id === "wreath-stand",
  ),
  "search finds corona fúnebre",
);

// Trigésima tercera tanda universal (AXOS-CAD-UNIVERSAL-080): templo.
assert.ok(
  searchCadSymbols("altar mayor").some((symbol) => symbol.id === "church-altar"),
  "search finds altar mayor",
);
assert.ok(
  searchCadSymbols("confesionario").some(
    (symbol) => symbol.id === "confessional",
  ),
  "search finds confesionario",
);
assert.ok(
  searchCadSymbols("pila bautismal").some(
    (symbol) => symbol.id === "baptismal-font",
  ),
  "search finds pila bautismal",
);

// Trigésima cuarta tanda universal (AXOS-CAD-UNIVERSAL-083): laboratorio.
assert.ok(
  searchCadSymbols("centrifuga").some((symbol) => symbol.id === "centrifuge"),
  "search finds centrífuga",
);
assert.ok(
  searchCadSymbols("autoclave").some((symbol) => symbol.id === "autoclave"),
  "search finds autoclave",
);
assert.ok(
  searchCadSymbols("flebotomia").some(
    (symbol) => symbol.id === "phlebotomy-chair",
  ),
  "search finds sillón de flebotomía",
);
