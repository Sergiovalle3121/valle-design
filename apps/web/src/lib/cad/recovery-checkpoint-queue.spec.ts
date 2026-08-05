/**
 * La cola de checkpoints no puede DESCARTAR peticiones.
 *
 * El caso que importa es el cierre: el editor pide un checkpoint al ocultarse
 * la pestaña mientras una escritura periódica sigue en vuelo. Si esa petición
 * se tira, el journal conserva el estado anterior y la recuperación que se
 * ofrece después no es el dibujo que la persona tenía al cerrar.
 */
import { strict as assert } from "node:assert";
import { createCadCheckpointQueue } from "./recovery-checkpoint-queue";

/** Escritura controlable: se resuelve cuando el test lo decide. */
function deferredWriter() {
  const written: string[] = [];
  const pending: Array<{ resolve: () => void; reject: (cause: Error) => void }> = [];
  return {
    written,
    pending,
    write(value: string) {
      written.push(value);
      return new Promise<void>((resolve, reject) => {
        pending.push({ resolve, reject: (cause) => reject(cause) });
      });
    },
    /** Termina la escritura n-ésima que sigue abierta. */
    finish(index = 0) {
      pending.splice(index, 1)[0].resolve();
    },
    fail(index = 0, message = "cuota agotada") {
      pending.splice(index, 1)[0].reject(new Error(message));
    },
  };
}

/**
 * Vacía la cola: termina cada escritura abierta hasta que no queda ninguna.
 * Necesario porque una escritura final ABRE otra escritura, así que resolver la
 * primera no deja la cola en reposo.
 */
async function drain(
  queue: { readonly writing: boolean; settled: () => Promise<void> },
  writer: ReturnType<typeof deferredWriter>,
) {
  // La condición de parada es el estado de la COLA, no si quedan escrituras
  // abiertas: entre resolver una y que la final abra la siguiente pasan varias
  // microtareas, y parar ahí dejaría el test esperando a `settled()` para
  // siempre. Se cede a un macrotask en cada vuelta para vaciarlas todas.
  for (let guard = 0; guard < 200 && queue.writing; guard += 1) {
    if (writer.pending.length) writer.finish();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.equal(queue.writing, false, "la cola no volvió a reposo");
  assert.equal(writer.pending.length, 0, "quedaron escrituras sin terminar");
  await queue.settled();
}

void (async () => {
  /* ── 1. Petición en reposo: escribe de inmediato ─────────────────────────── */
  {
    const writer = deferredWriter();
    const state = "v1";
    const queue = createCadCheckpointQueue({
      snapshot: () => state,
      write: (value) => writer.write(value),
    });
    queue.request();
    assert.deepEqual(writer.written, ["v1"]);
    assert.equal(queue.writing, true);
    await drain(queue, writer);
  }

  /* ── 2. EL DEFECTO: petición con otra en vuelo NO puede perderse ─────────── */
  {
    const writer = deferredWriter();
    let state = "periodico";
    const queue = createCadCheckpointQueue({
      snapshot: () => state,
      write: (value) => writer.write(value),
    });
    queue.request(); // escritura periódica, ahora en vuelo
    assert.deepEqual(writer.written, ["periodico"]);

    // La pestaña se oculta: el usuario ha seguido dibujando desde entonces.
    state = "al-ocultarse";
    queue.request();
    assert.equal(
      queue.trailing,
      true,
      "la petición que llega con otra en vuelo se encola, no se descarta",
    );

    await drain(queue, writer); // termina la periódica → arranca la final
    assert.deepEqual(
      writer.written,
      ["periodico", "al-ocultarse"],
      "el checkpoint del cierre TIENE que llegar al journal",
    );
    // Y captura el estado del momento de escribir, no el de cuando se pidió.
    assert.equal(writer.written.at(-1), "al-ocultarse");
  }

  /* ── 3. Varias peticiones seguidas colapsan en UNA sola final ────────────── */
  {
    const writer = deferredWriter();
    let state = "a";
    const queue = createCadCheckpointQueue({
      snapshot: () => state,
      write: (value) => writer.write(value),
    });
    queue.request();
    state = "b";
    queue.request();
    state = "c";
    queue.request();
    state = "d";
    queue.request();
    await drain(queue, writer);
    assert.deepEqual(
      writer.written,
      ["a", "d"],
      "los estados intermedios no se escriben: sólo el primero y el último",
    );
  }

  /* ── 4. La final captura al ESCRIBIR, no al pedirse ──────────────────────── */
  {
    const writer = deferredWriter();
    let state = "inicial";
    const queue = createCadCheckpointQueue({
      snapshot: () => state,
      write: (value) => writer.write(value),
    });
    queue.request();
    state = "cuando-se-pidio";
    queue.request();
    // El usuario sigue dibujando DESPUÉS de pedir la final.
    state = "cuando-se-escribe";
    await drain(queue, writer);
    assert.equal(
      writer.written.at(-1),
      "cuando-se-escribe",
      "persistir el estado del momento de la petición dejaría el defecto vivo",
    );
  }

  /* ── 5. Una escritura fallida no cancela la final ni mata la cola ────────── */
  {
    const writer = deferredWriter();
    const errors: unknown[] = [];
    let state = "primera";
    const queue = createCadCheckpointQueue({
      snapshot: () => state,
      write: (value) => writer.write(value),
      onError: (cause) => errors.push(cause),
    });
    queue.request();
    state = "segunda";
    queue.request();
    writer.fail(0, "cuota agotada");
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(errors.length, 1, "el fallo se reporta");
    assert.deepEqual(
      writer.written,
      ["primera", "segunda"],
      "un fallo transitorio no puede llevarse por delante el estado más reciente",
    );
    // La cola sigue viva tras el fallo: "segunda" sigue en vuelo, así que
    // "tercera" se encola como final en vez de perderse.
    state = "tercera";
    queue.request();
    assert.equal(queue.trailing, true);
    await drain(queue, writer);
    assert.deepEqual(writer.written, ["primera", "segunda", "tercera"]);
  }

  /* ── 6. onWritten sólo tras éxito; onError sólo tras fallo ───────────────── */
  {
    const writer = deferredWriter();
    const ok: string[] = [];
    const errors: unknown[] = [];
    const queue = createCadCheckpointQueue({
      snapshot: () => "x",
      write: (value) => writer.write(value),
      onWritten: (value) => ok.push(value),
      onError: (cause) => errors.push(cause),
    });
    queue.request();
    writer.fail(0);
    await drain(queue, writer);
    assert.deepEqual(ok, [], "una escritura fallida no se anuncia como guardada");
    assert.equal(errors.length, 1);
    queue.request();
    await drain(queue, writer);
    assert.deepEqual(ok, ["x"]);
    assert.equal(errors.length, 1);
  }

  /* ── 7. stop() al desmontar: ni finales nuevas ni peticiones nuevas ──────── */
  {
    const writer = deferredWriter();
    const queue = createCadCheckpointQueue({
      snapshot: () => "v",
      write: (value) => writer.write(value),
    });
    queue.request();
    queue.request(); // final encolada
    assert.equal(queue.trailing, true);
    queue.stop();
    assert.equal(queue.trailing, false, "stop() retira la final pendiente");
    await drain(queue, writer);
    assert.deepEqual(writer.written, ["v"], "tras stop() no se escribe más");
    queue.request();
    assert.deepEqual(writer.written, ["v"], "stop() también ignora peticiones nuevas");
  }

  /* ── 8. Un snapshot que revienta no deja la cola bloqueada para siempre ──── */
  {
    const errors: unknown[] = [];
    const queue = createCadCheckpointQueue({
      snapshot: () => {
        throw new Error("documento inconsistente");
      },
      write: () => Promise.resolve(),
      onError: (cause) => errors.push(cause),
    });
    queue.request();
    await queue.settled();
    assert.equal(errors.length, 1);
    assert.equal(
      queue.writing,
      false,
      "si el snapshot lanza, la cola vuelve a reposo en vez de quedar en vuelo para siempre",
    );
  }

  console.log(
    "recovery-checkpoint-queue: un solo escritor, sin descartes, con escritura final",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
