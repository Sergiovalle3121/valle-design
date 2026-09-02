/** Cobertura registro ↔ cinta, orden DECLARADO, y que cada comando trae su resumen. */
import { strict as assert } from "node:assert";
import { CAD_COMMAND_DESCRIPTORS } from "./engine";
import {
  CAD_RIBBON_DATA,
  CAD_RIBBON_TABS,
  cadRibbonCoverageGaps,
  cadRibbonExposedNames,
  cadRibbonPanelFallbacks,
  findCadRibbonCommand,
} from "./ribbon";
import { CAD_RIBBON_PANEL_ORDER } from "./ribbon-order";

assert.deepEqual(
  cadRibbonCoverageGaps(),
  [],
  "todo comando del registro real está en alguna pestaña de la cinta o declarado no-expuesto",
);

assert.equal(
  CAD_RIBBON_DATA.length,
  CAD_RIBBON_TABS.length,
  "hay una entrada de cinta por cada pestaña declarada",
);

// Los espejos de Inicio repiten seis botones de Anotar a propósito: la
// cobertura se mide en NOMBRES únicos, no en botones.
assert.equal(
  cadRibbonExposedNames().size,
  CAD_COMMAND_DESCRIPTORS.length,
  "la cinta expone exactamente los nombres del registro (sin huérfanos; los espejos no cuentan dos veces)",
);

for (const tab of CAD_RIBBON_DATA) {
  const names = tab.panels.flatMap((panel) => panel.commands.map((command) => command.name));
  assert.equal(
    new Set(names).size,
    names.length,
    `ningún nombre dos veces en la pestaña ${tab.id}: sólo la pestaña activa se monta y cad-ribbon-command-X debe ser único`,
  );
  for (const panel of tab.panels) {
    assert.ok(panel.commands.length > 0, `panel vacío: ${tab.id}/${panel.label}`);
    for (const command of panel.commands) {
      assert.ok(command.summary.length > 0, `${command.name} sin resumen`);
      // El icono del botón sale de `command.panel`: un espejo compartido con
      // el objeto de Anotar saldría con el icono de Cotas dentro de Inicio.
      assert.equal(command.panel, panel.label, `${command.name} dice panel «${command.panel}» y está montado en «${panel.label}»`);
    }
  }
  // Sin cadáveres en el orden declarado: toda etiqueta nombra un panel real.
  const labels = new Set(tab.panels.map((panel) => panel.label));
  for (const label of CAD_RIBBON_PANEL_ORDER[tab.id]) {
    assert.ok(labels.has(label), `ribbon-order declara «${label}» en ${tab.id} y ese panel no existe`);
  }
}

// La red de seguridad está vacía: todo comando tiene panel por patrón. Un
// comando nuevo sin patrón aparece aquí por su nombre, no en una papelera.
assert.deepEqual(cadRibbonPanelFallbacks(), [], "todo comando tiene panel por patrón; el reposo es sólo red de seguridad");

// ── Orden declarado. Medido antes de `ribbon-order.ts`: el primer panel de
// Inicio era «Capas y propiedades» (2 botones) y LINE el 15.º de 31 en Dibujo.
const inicio = CAD_RIBBON_DATA.find((tab) => tab.id === "inicio");
assert.ok(inicio, "existe la pestaña Inicio");
assert.deepEqual(
  inicio.panels.slice(0, 6).map((panel) => panel.label),
  ["Dibujo", "Modificar", "Anotación", "Capas", "Bloque", "Propiedades"],
  "Inicio empieza como la Home de AutoCAD: Dibujo · Modificar · Anotación · Capas · Bloque · Propiedades",
);
assert.deepEqual(
  inicio.panels[0].commands.slice(0, 5).map((command) => command.name),
  ["LINE", "PLINE", "CIRCLE", "ARC", "RECTANG"],
  "en Dibujo la línea va primero, no ARC por orden alfabético",
);
const kindOf = new Map(CAD_COMMAND_DESCRIPTORS.map((descriptor) => [descriptor.name, descriptor.kind]));
for (const command of inicio.panels[0].commands) {
  assert.equal(kindOf.get(command.name), "draw", `${command.name} no dibuja y está en Dibujo (la papelera de antes)`);
}
assert.deepEqual(
  inicio.panels.find((panel) => panel.label === "Anotación")?.commands.map((command) => command.name),
  ["TEXT", "MTEXT", "DIMLINEAR", "DIMALIGNED", "MLEADER", "TABLE"],
  "Inicio > Anotación es el espejo de seis botones de la pestaña Anotar",
);
assert.ok(
  inicio.panels.find((panel) => panel.label === "Capas")?.commands[0]?.name === "LAYER",
  "LAYER vive en Inicio > Capas y es su primer botón (golden 61 lo pulsa desde Inicio)",
);

const parametrico = CAD_RIBBON_DATA.find((tab) => tab.id === "parametrico");
assert.ok(
  parametrico?.panels.some((panel) => panel.label === "Geométricas" && panel.commands.some((command) => command.name === "GCCOINCIDENT")),
  "las restricciones GC* tienen pestaña Paramétrico, como en AutoCAD, y no la papelera Herramientas",
);

const administrar = CAD_RIBBON_DATA.find((tab) => tab.id === "administrar");
assert.ok(
  !administrar?.panels.some((panel) => panel.label === "Herramientas"),
  "el panel de reposo «Herramientas» está vacío: antes tenía 31 comandos sin clasificar",
);

const anotar = CAD_RIBBON_DATA.find((tab) => tab.id === "anotar");
assert.ok(
  anotar?.panels.find((panel) => panel.label === "Cotas")?.commands[0]?.name === "DIMLINEAR",
  "Anotar > Cotas conserva DIMLINEAR primero (golden 61 lo pulsa desde Anotar)",
);
assert.deepEqual(
  anotar?.panels.find((panel) => panel.label === "Estilos")?.commands.map((command) => command.name),
  ["DIMSTYLE", "MLEADERSTYLE", "STYLE", "TABLESTYLE"],
  "los cuatro estilos van juntos en Anotar > Estilos, no uno por panel en Administrar",
);

assert.ok(findCadRibbonCommand("LINE"), "LINE, comando básico de dibujo, se encuentra en la cinta");
assert.ok(findCadRibbonCommand("DIMLINEAR"), "la cota lineal está en la cinta");

console.log(
  `cad ribbon specs passed — ${cadRibbonExposedNames().size} comandos únicos en ${CAD_RIBBON_DATA.length} pestañas, Inicio con ${inicio.commandCount} botones`,
);
