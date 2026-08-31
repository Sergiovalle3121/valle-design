/** Cobertura registro ↔ cinta, y que cada comando trae su resumen. */
import { strict as assert } from "node:assert";
import { CAD_COMMAND_DESCRIPTORS } from "./engine";
import {
  CAD_RIBBON_DATA,
  CAD_RIBBON_TABS,
  cadRibbonCoverageGaps,
  findCadRibbonCommand,
} from "./ribbon";

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

const totalRibbonCommands = CAD_RIBBON_DATA.reduce(
  (total, tab) => total + tab.commandCount,
  0,
);
assert.equal(
  totalRibbonCommands,
  CAD_COMMAND_DESCRIPTORS.length,
  "la cinta expone exactamente los comandos del registro (sin duplicados ni huérfanos)",
);

for (const tab of CAD_RIBBON_DATA) {
  for (const panel of tab.panels) {
    assert.ok(panel.commands.length > 0, `panel vacío: ${tab.id}/${panel.label}`);
    for (const command of panel.commands) {
      assert.ok(command.summary.length > 0, `${command.name} sin resumen`);
    }
  }
}

assert.ok(
  findCadRibbonCommand("LINE"),
  "LINE, comando básico de dibujo, se encuentra en la cinta",
);
assert.ok(
  findCadRibbonCommand("DIM") || findCadRibbonCommand("DIMLINEAR"),
  "alguna variante de acotación está en la cinta",
);

console.log(
  `cad ribbon specs passed — ${totalRibbonCommands} comandos en ${CAD_RIBBON_DATA.length} pestañas`,
);
