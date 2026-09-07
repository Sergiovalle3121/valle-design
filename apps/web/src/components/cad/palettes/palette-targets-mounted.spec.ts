import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { globSync } from "glob";

/*
 * LO QUE ESTÁ MONTADO SE PUEDE ABRIR POR SU COMANDO.
 *
 * `PROPERTIES`/`PR` avisaba «la paleta no está montada» con el panel de
 * propiedades a la vista (F9 P-09), y LAYER había pasado por lo mismo antes:
 * el panel existía, pero nadie lo apuntaba en `palette-command-bus.ts`. Este
 * spec fija que cada destino con panel real en el estudio tiene quien lo
 * registre, mirando el código fuente y no un mock: si alguien retira el
 * registro, el comando vuelve a mentir y esto se pone en rojo.
 */
const MOUNTED_TARGETS = ["layer-manager", "properties", "draft-settings", "action-recorder"] as const;

const sources = globSync("src/components/cad/**/*.{ts,tsx}", { ignore: ["**/*.spec.ts"] })
  .map((file) => readFileSync(file, "utf8"))
  .join("\n");

let checks = 0;
for (const target of MOUNTED_TARGETS) {
  assert.ok(
    sources.includes(`registerCadUiHandler("${target}"`),
    `nadie registra "${target}" en el bus de paletas: su comando avisará «no está montada» con el panel a la vista`,
  );
  checks += 1;
}

console.log(`palette-targets-mounted.spec: OK — ${checks} destinos con panel real registrados`);
