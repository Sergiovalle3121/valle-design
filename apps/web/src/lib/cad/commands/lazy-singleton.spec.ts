/**
 * T-72(e): un cargador que falla no puede envenenar el singleton para
 * siempre. `pending` tiene que limpiarse en el rechazo para que la siguiente
 * llamada a `get()` reintente el `load()`, no devuelva la misma promesa rota.
 */
import { strict as assert } from "node:assert";
import { createLazySingleton } from "./lazy-singleton";

async function rejectsWith(promise: Promise<unknown>, message: string) {
  try {
    await promise;
    assert.fail("se esperaba un rechazo");
  } catch (error) {
    assert.equal((error as Error).message, message);
  }
}

async function main() {
  // El caso feliz: una sola llamada al cargador, valor memoizado.
  {
    let calls = 0;
    const lazy = createLazySingleton(async () => {
      calls += 1;
      return { value: 42 };
    });
    assert.equal(lazy.loadedValue(), null, "nada cargado todavía");
    const first = await lazy.get();
    const second = await lazy.get();
    assert.equal(first, second, "misma instancia memoizada");
    assert.equal(calls, 1, "el cargador se llama una sola vez");
    assert.deepEqual(lazy.loadedValue(), { value: 42 }, "el valor queda accesible sin await");
  }

  // El caso que rompía la sesión: un chunk caído no envenena el singleton.
  {
    let calls = 0;
    const lazy = createLazySingleton(async () => {
      calls += 1;
      if (calls === 1) throw new Error("chunk load failed");
      return { value: "recuperado" };
    });

    await rejectsWith(lazy.get(), "chunk load failed");
    assert.equal(lazy.loadedValue(), null, "no queda ningún valor cargado tras el rechazo");

    // Sin el fix, esta segunda llamada devolvería la MISMA promesa rechazada
    // (pending seguía apuntando a ella) y nunca volvería a invocar load().
    const recovered = await lazy.get();
    assert.deepEqual(recovered, { value: "recuperado" }, "el segundo intento sí carga");
    assert.equal(calls, 2, "load() se reintenta tras el rechazo, no se reutiliza la promesa rota");
  }

  // Dos rechazos consecutivos también se recuperan (no sólo el primero).
  {
    let calls = 0;
    const lazy = createLazySingleton(async () => {
      calls += 1;
      if (calls <= 2) throw new Error(`fallo ${calls}`);
      return "ok";
    });
    await rejectsWith(lazy.get(), "fallo 1");
    await rejectsWith(lazy.get(), "fallo 2");
    assert.equal(await lazy.get(), "ok", "el tercer intento carga");
    assert.equal(calls, 3);
  }
}

main().then(() => console.log("lazy-singleton: OK"));
