/**
 * El contrato fail-closed del catálogo de iconos, contra el registro REAL.
 *
 * Dos direcciones, ninguna opcional:
 *
 *   1. Todo comando registrado tiene icono. Un comando nuevo sin el suyo rompe
 *      el CI aquí, con su nombre, antes de salir a la cinta con un genérico.
 *   2. Todo icono del catálogo corresponde a un comando registrado. Un comando
 *      retirado se lleva su fila; esta tabla no acumula cadáveres.
 *
 * Y una tercera que no es un contrato sino una MEDIDA, publicada para que la
 * campaña pueda citarla: cuántos dibujos distintos hay de verdad. Un catálogo
 * de 247 filas con seis iconos no arregla nada.
 */
import { strict as assert } from "node:assert";
import { CAD_COMMAND_ICONS, cadCommandIcon } from "./command-icons";
import { CAD_COMMAND_REGISTRY_V2 } from "@/lib/cad/engine/index";

const nombres = CAD_COMMAND_REGISTRY_V2.all().map((command) => command.name);
const registrados = new Set(nombres);

const mudos = nombres.filter((name) => !CAD_COMMAND_ICONS[name]);
assert.deepEqual(mudos, [], `comandos registrados sin icono: ${mudos.join(", ")}`);

const huerfanos = Object.keys(CAD_COMMAND_ICONS).filter((name) => !registrados.has(name));
assert.deepEqual(huerfanos, [], `iconos de comandos que ya no existen: ${huerfanos.join(", ")}`);

for (const name of nombres)
  assert.ok(cadCommandIcon(name.toLowerCase()), `${name} se resuelve sin distinguir mayúsculas`);

const distintos = new Set(Object.values(CAD_COMMAND_ICONS)).size;
// El número no es un techo ni un suelo negociable: es la medida que el informe
// de distancia cita. Se afirma un MÍNIMO para que nadie colapse el catálogo a
// media docena de dibujos sin que el CI lo cante.
assert.ok(
  distintos >= 150,
  `el catálogo tiene que seguir distinguiendo de verdad: ${distintos} dibujos para ${nombres.length} comandos`,
);

console.log(
  `iconos de comando: ${nombres.length} comandos, ${distintos} dibujos distintos, 0 mudos`,
);
