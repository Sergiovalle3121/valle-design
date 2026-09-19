/**
 * El contrato fail-closed del catálogo de rótulos, contra el registro REAL y
 * contra la cinta que los pinta.
 *
 *   1. Todo comando registrado tiene rótulo; un comando nuevo sin el suyo
 *      rompe el CI aquí, con su nombre, antes de salir a la cinta con el
 *      nombre en inglés.
 *   2. Todo rótulo corresponde a un comando registrado: sin cadáveres.
 *   3. El rótulo CABE en el botón que lo pinta: un botón pequeño de la cinta
 *      mide 7 rem (`CadRibbonButton.tsx`); aquí se exige la cota gruesa de 16
 *      caracteres, y los píxeles los mide el golden 214 (`command-labels.ts`);
 *      un botón grande envuelve en dos líneas de 12 caracteres. Que un
 *      rótulo se salga del botón es esconder texto, y aquí se impide con el
 *      dato, no con `truncate`.
 *
 * Correr: npx tsx src/lib/cad/engine/command-labels.spec.ts
 */
import { strict as assert } from "node:assert";
import { CAD_COMMAND_LABELS, cadCommandLabel } from "./command-labels";
import { CAD_COMMAND_REGISTRY_V2 } from "./index";
import { CAD_RIBBON_DATA } from "../ribbon";

const names = CAD_COMMAND_REGISTRY_V2.all().map((command) => command.name);
const nameSet = new Set(names);

const silent = names.filter((name) => !CAD_COMMAND_LABELS[name]);
assert.deepEqual(silent, [], `comandos registrados sin rótulo: ${silent.join(", ")}`);

const orphans = Object.keys(CAD_COMMAND_LABELS).filter((name) => !nameSet.has(name));
assert.deepEqual(orphans, [], `rótulos de comandos que ya no existen: ${orphans.join(", ")}`);

for (const [name, label] of Object.entries(CAD_COMMAND_LABELS)) {
  assert.ok(label.trim() === label && label.length >= 2, `${name}: rótulo vacío o con espacios sobrantes`);
  assert.ok(!label.includes("\n"), `${name}: el rótulo tiene salto de línea`);
  assert.ok(!label.endsWith("."), `${name}: un rótulo de botón no termina en punto`);
  assert.ok(label !== name, `${name}: el rótulo es el nombre canónico a secas, no un rótulo`);
  assert.ok(label.split(" ").length <= 3, `${name}: «${label}» tiene más de tres palabras`);
}

// Lo que se pinta pequeño cabe en una línea de 16; lo que se pinta grande
// envuelve por palabras de 12 como mucho. Se lee de la cinta real: un mismo
// comando puede ser grande en un panel y pequeño en otro.
for (const tab of CAD_RIBBON_DATA) {
  for (const panel of tab.panels) {
    for (const command of panel.commands) {
      const label = cadCommandLabel(command.name);
      if (command.primary) {
        for (const word of label.split(" ")) {
          assert.ok(
            word.length <= 12,
            `${command.name} es botón grande en ${tab.id}/${panel.label} y la palabra «${word}» no cabe en su ancho`,
          );
        }
      } else {
        assert.ok(
          label.length <= 16,
          `${command.name} es botón pequeño en ${tab.id}/${panel.label} y «${label}» (${label.length}) no cabe en 16 caracteres`,
        );
      }
    }
  }
}

assert.equal(cadCommandLabel("line"), "Línea", "insensible a mayúsculas");
assert.throws(() => cadCommandLabel("COMANDO_QUE_NO_EXISTE"), /no tiene rótulo/, "un comando mudo lanza");

console.log(`rótulos de cinta: ${Object.keys(CAD_COMMAND_LABELS).length} para ${names.length} comandos`);
