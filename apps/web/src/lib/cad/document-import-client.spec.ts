/**
 * T-75(f): la importación moría a los 45 s aunque estuviera avanzando — un
 * reloj de PLAZO TOTAL, no de ATASCO. `createStallWatchdog` es la pieza que
 * lo arregla, aislada de `importDocumentFile` para poder probarla sin un
 * `Worker` real (Node no tiene la API de Worker del navegador). Usa
 * temporizadores reales de milisegundos, no simulados: son cortos a
 * propósito para que la prueba siga siendo rápida.
 */
import { strict as assert } from "node:assert";
import { createStallWatchdog } from "./document-import-client";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  // El defecto que arregla: progreso constante (arm() repetido) NUNCA
  // dispara, por muy larga que sea la importación total.
  {
    let fired = false;
    const watchdog = createStallWatchdog(30, () => {
      fired = true;
    });
    watchdog.arm();
    for (let i = 0; i < 5; i += 1) {
      await wait(15); // menos que stallMs: cada vuelta reinicia el reloj
      watchdog.arm();
    }
    assert.equal(fired, false, "el progreso constante no dispara el atasco, aunque el total supere stallMs (75ms > 30ms)");
    watchdog.stop();
  }

  // El caso real: SIN progreso durante stallMs, dispara una vez.
  {
    let fireCount = 0;
    const watchdog = createStallWatchdog(20, () => {
      fireCount += 1;
    });
    watchdog.arm();
    await wait(60);
    assert.equal(fireCount, 1, "sin señales de vida, el atasco dispara");
    watchdog.stop();
  }

  // "Seguir esperando": rearmar tras el disparo reinicia el reloj, no lo
  // deja disparando en bucle ni lo deja muerto.
  {
    let fireCount = 0;
    const watchdog = createStallWatchdog(20, () => {
      fireCount += 1;
      watchdog.arm(); // el equivalente a pulsar "Seguir esperando"
    });
    watchdog.arm();
    await wait(70);
    assert.ok(fireCount >= 1 && fireCount <= 4, `disparó ${fireCount} veces en 70ms con un reloj de 20ms — algo más que 1 y muchas menos que un bucle apretado`);
    watchdog.stop();
  }

  // stop() es definitivo: nada dispara después, ni con arm() pendiente.
  {
    let fired = false;
    const watchdog = createStallWatchdog(15, () => {
      fired = true;
    });
    watchdog.arm();
    watchdog.stop();
    await wait(40);
    assert.equal(fired, false, "stop() cancela el reloj para siempre");
    watchdog.arm(); // un arm() después de stop() tampoco revive el reloj
    await wait(40);
    assert.equal(fired, false, "arm() después de stop() no reactiva el reloj");
  }
}

main().then(() => console.log("document-import-client (stall watchdog): OK"));
