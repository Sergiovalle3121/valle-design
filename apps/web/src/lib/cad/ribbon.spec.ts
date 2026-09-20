/** Cobertura registro ↔ cinta, orden DECLARADO, y que cada comando trae su resumen. */
import { strict as assert } from "node:assert";
import { CAD_COMMAND_DESCRIPTORS } from "./engine";
import {
  CAD_RIBBON_DATA,
  CAD_RIBBON_TABS,
  CAD_RIBBON_UNEXPOSED,
  cadRibbonCoverageGaps,
  cadRibbonExposedNames,
  cadRibbonPanelFallbacks,
  findCadRibbonCommand,
} from "./ribbon";
import {
  CAD_RIBBON_PANEL_COLLAPSE_ORDER,
  CAD_RIBBON_PANEL_ORDER,
  CAD_RIBBON_PRIMARY,
} from "./ribbon-order";

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
//
// Cada nombre del registro está en la cinta O declarado no-expuesto con su
// razón —nunca en los dos, nunca en ninguno— y la cinta no monta nada que el
// registro no tenga. Es la misma ecuación que `check-ribbon-coverage.mjs`
// (expuestos + no-expuestos = registro). Los no-expuestos de hoy son las
// órdenes que aún no hacen nada (`engine/command-availability.ts`): su botón
// era un botón muerto.
const registryNames = new Set(CAD_COMMAND_DESCRIPTORS.map((descriptor) => descriptor.name));
const exposedNames = cadRibbonExposedNames();
for (const name of exposedNames) {
  assert.ok(registryNames.has(name), `la cinta monta «${name}», que no está en el registro (huérfano)`);
}
for (const [name, reason] of Object.entries(CAD_RIBBON_UNEXPOSED)) {
  assert.ok(registryNames.has(name), `CAD_RIBBON_UNEXPOSED declara «${name}», que no está en el registro`);
  assert.ok(!exposedNames.has(name), `«${name}» está declarado no-expuesto y aun así tiene botón`);
  assert.ok(reason.trim().length > 0, `«${name}» no-expuesto sin razón escrita`);
}
assert.equal(
  exposedNames.size + Object.keys(CAD_RIBBON_UNEXPOSED).length,
  CAD_COMMAND_DESCRIPTORS.length,
  "la cinta expone exactamente los nombres del registro menos los declarados no-expuestos (los espejos no cuentan dos veces)",
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
      assert.ok(command.label.length > 0 && command.label !== command.name, `${command.name} sin rótulo en español`);
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

// ── Sólidos 3D es pestaña propia (como en AutoCAD), no el 13.º panel de Inicio.
assert.deepEqual(
  CAD_RIBBON_TABS.map((tab) => tab.id),
  ["inicio", "insertar", "anotar", "parametrico", "vista", "solidos3d", "salida", "administrar", "superficies", "mallas"],
  "el orden de pestañas es Inicio · Insertar · Anotar · Paramétrico · Vista · Sólidos 3D · Salida · Administrar · Superficies · Mallas",
);
assert.ok(
  !inicio.panels.some((panel) => panel.label === "Sólidos" || panel.label === "Sombreado"),
  "Inicio ya no tiene los paneles «Sólidos» ni «Sombreado»: a 1366 px no caben trece paneles",
);
assert.ok(
  inicio.panels[0].commands.some((command) => command.name === "HATCH"),
  "HATCH vive en Inicio > Dibujo, como en el panel Draw de AutoCAD",
);
const solidos3d = CAD_RIBBON_DATA.find((tab) => tab.id === "solidos3d");
assert.deepEqual(
  solidos3d?.panels.map((panel) => panel.label),
  ["Primitivas", "Sólido", "Booleanas", "Edición de sólidos", "Consulta 3D"],
  "Sólidos 3D reparte sus paneles como la pestaña Solid de AutoCAD",
);
assert.ok(
  solidos3d?.panels.find((panel) => panel.label === "Sólido")?.commands[0]?.name === "EXTRUDE",
  "EXTRUDE es el primer botón de Sólidos 3D > Sólido",
);
assert.equal(
  solidos3d?.commandCount,
  23,
  "los 23 comandos de sólidos están en su pestaña y en ninguna otra",
);

// ── Botones grandes: uno o dos por panel, todos reales, sin claves muertas.
const allLabels = new Set(CAD_RIBBON_DATA.flatMap((tab) => tab.panels.map((panel) => panel.label)));
for (const [label, names] of Object.entries(CAD_RIBBON_PRIMARY)) {
  assert.ok(allLabels.has(label), `CAD_RIBBON_PRIMARY nombra el panel «${label}», que no existe en la cinta`);
  for (const name of names) {
    assert.ok(kindOf.has(name), `primario «${name}» (panel ${label}) no existe en el registro`);
    assert.ok(cadRibbonExposedNames().has(name), `primario «${name}» no tiene botón en la cinta`);
  }
}
for (const tab of CAD_RIBBON_DATA) {
  for (const panel of tab.panels) {
    const primaries = panel.commands.filter((command) => command.primary);
    // Ola 1 «cinta»: un panel puede quedarse SIN botón grande (Grupos,
    // Utilidades, Portapapeles en Inicio) — sus comandos siguen expuestos,
    // sólo bajan a botón pequeño. Lo que no puede pasar es que un panel
    // declare TRES o más: eso era el problema de origen (14 en Inicio).
    assert.ok(
      primaries.length <= 2,
      `${tab.id}/${panel.label} tiene ${primaries.length} botones grandes; como mucho dos`,
    );
  }
  for (const label of CAD_RIBBON_PANEL_COLLAPSE_ORDER[tab.id]) {
    assert.ok(
      tab.panels.some((panel) => panel.label === label),
      `el orden de plegado de ${tab.id} nombra «${label}» y ese panel no existe`,
    );
  }
}
// ── Ola 1 «cinta»: el recorte concreto de los 14 primarios de Inicio a 9,
// medido en producción como el motivo de que el lienzo sólo fuera el 49,8 %
// de la ventana. Dibujo y Modificar conservan sus dos; Anotación, Capas,
// Bloque y Propiedades bajan a uno; Grupos, Utilidades y Portapapeles se
// quedan sin botón grande — y sus comandos NO desaparecen del registro.
{
  const primariesOf = (label: string) =>
    inicio.panels.find((panel) => panel.label === label)?.commands.filter((command) => command.primary).length ?? -1;
  assert.deepEqual(
    { Dibujo: primariesOf("Dibujo"), Modificar: primariesOf("Modificar") },
    { Dibujo: 2, Modificar: 2 },
    "Dibujo y Modificar conservan sus dos botones grandes: el par que abre cada oficio",
  );
  for (const label of ["Anotación", "Capas", "Bloque", "Propiedades"]) {
    assert.equal(primariesOf(label), 1, `Inicio > ${label} baja a un solo botón grande`);
  }
  for (const label of ["Grupos", "Utilidades", "Portapapeles"]) {
    assert.equal(primariesOf(label), 0, `Inicio > ${label} se queda sin botón grande: sus comandos entran como pequeños`);
    const panel = inicio.panels.find((entry) => entry.label === label)!;
    assert.ok(panel.commands.length > 0, `Inicio > ${label} sigue teniendo sus comandos, sólo que pequeños`);
  }
}

// Lo que los goldens 61 y 86 pulsan sin abrir nada vive en paneles que nunca
// se pliegan a un botón (no están en el orden de plegado de su pestaña).
for (const [tabId, name] of [
  ["inicio", "LINE"], ["inicio", "CIRCLE"], ["inicio", "ARC"], ["inicio", "MOVE"], ["inicio", "COPY"],
  ["inicio", "ROTATE"], ["inicio", "TRIM"], ["inicio", "ERASE"], ["inicio", "LAYER"], ["anotar", "DIMLINEAR"],
] as const) {
  const panel = CAD_RIBBON_DATA.find((tab) => tab.id === tabId)?.panels.find((entry) =>
    entry.commands.some((command) => command.name === name),
  );
  assert.ok(panel, `${name} no está en la pestaña ${tabId}`);
  assert.ok(
    !CAD_RIBBON_PANEL_COLLAPSE_ORDER[tabId].includes(panel.label),
    `${name} vive en ${tabId}/${panel.label}, que puede plegarse a un botón: los goldens lo pulsan sin abrir nada`,
  );
}
assert.ok(findCadRibbonCommand("LINE")?.primary, "LINE es botón grande de Dibujo");
assert.ok(!findCadRibbonCommand("XLINE")?.primary, "XLINE es botón pequeño");

assert.ok(findCadRibbonCommand("LINE"), "LINE, comando básico de dibujo, se encuentra en la cinta");
assert.ok(findCadRibbonCommand("DIMLINEAR"), "la cota lineal está en la cinta");

console.log(
  `cad ribbon specs passed — ${cadRibbonExposedNames().size} comandos únicos en ${CAD_RIBBON_DATA.length} pestañas, Inicio con ${inicio.commandCount} botones`,
);
