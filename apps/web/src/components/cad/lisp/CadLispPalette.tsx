"use client";

/**
 * La consola AutoLISP.
 *
 * Sin ella, cargar una rutina es un acto de fe: se teclea APPLOAD, se elige un
 * fichero y no hay forma de saber qué comandos aportó, qué dejó definido, ni por
 * qué falló. Un veterano depura sus `.lsp` leyendo la ventana de texto; ésta es
 * esa ventana, con lo que el intérprete SÍ puede contar con certeza.
 *
 * Cuatro paneles y ninguno decorativo:
 *
 *  - **Histórico.** Lo tecleado, lo impreso, el valor devuelto y los errores, en
 *    orden y distinguibles por color. Es donde se lee `3` después de teclear
 *    `(+ 1 2)`.
 *  - **Rutinas.** Qué ficheros hay, en qué versión, quién los subió y cuándo, y
 *    qué comandos aporta cada uno. Con las colisiones a la vista: dos ficheros
 *    que declaran `c:CAJETIN` cuestan una tarde si nadie lo dice.
 *  - **Variables.** Lo que la última ejecución dejó ligado, marcando lo que tapa
 *    un nombre del sistema — que es la causa número uno de «me funcionaba ayer».
 *  - **Error.** El último fallo con su traza.
 *
 * ## Por qué la consola no ejecuta nada por su cuenta
 *
 * Lo que se teclea aquí sale por `submitCadLisp`, es decir, por el anfitrión del
 * motor de comandos, exactamente igual que si se hubiera escrito en la línea de
 * comandos. La consola no llama al intérprete ni al documento. Si lo hiciera
 * habría dos rutas de mutación y deshacer después de usarla dejaría el dibujo en
 * un estado que nadie compuso.
 *
 * ## Dónde vive
 *
 * Se pinta junto a la línea de comandos, no como cuadro flotante del editor: el
 * registro de paletas (`components/cad/palettes/use-palettes.ts`) sólo conoce
 * las que el monolito enumera, y añadirla allí exige una línea en
 * `Layout3DEditor.tsx`, que es de otra sesión. Está pedida en el PR; mientras
 * tanto se abre con APPLOAD o LISPCON desde la línea de comandos, que es como se
 * abre en AutoCAD.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import type { CadCommandEngineHost } from "../command-line/command-engine-host";
import { loadPickedLispFiles } from "./appload";
import { submitCadLisp } from "./use-lisp";
import type {
  CadLispEntryLevel,
  CadLispRuntime,
  CadLispSnapshot,
} from "./lisp-runtime";

const LEVEL_CLASS: Record<CadLispEntryLevel, string> = {
  input: "text-primary-ink",
  value: "text-success-ink",
  output: "text-foreground",
  error: "text-danger-ink",
  info: "text-muted-foreground",
};

const LEVEL_MARK: Record<CadLispEntryLevel, string> = {
  input: "_$ ",
  value: "= ",
  output: "",
  error: "; error: ",
  info: "; ",
};

export interface CadLispPaletteProps {
  runtime: CadLispRuntime;
  snapshot: CadLispSnapshot;
  /** La única puerta de ejecución. Véase la cabecera. */
  host: CadCommandEngineHost;
  /** El dibujo está en sólo lectura: se puede mirar, no ejecutar. */
  disabled?: boolean;
}

export function CadLispPalette({ runtime, snapshot, host, disabled }: CadLispPaletteProps) {
  const [value, setValue] = useState("");
  const [tab, setTab] = useState<"routines" | "variables">("routines");
  const logRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const lastPick = useRef(0);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [snapshot.transcript]);

  // APPLOAD pide el selector; el contador evita que dos cargas seguidas exijan
  // rearmar nada y que un render cualquiera lo vuelva a abrir.
  useEffect(() => {
    if (snapshot.filePickerRequest === lastPick.current) return;
    lastPick.current = snapshot.filePickerRequest;
    if (snapshot.filePickerRequest > 0) fileRef.current?.click();
  }, [snapshot.filePickerRequest]);

  const onFiles = useCallback(
    async (files: FileList | null) => {
      // La carga vive en `appload.ts` y no aquí: es la pieza que decide si un
      // despacho puede traerse sus rutinas, y dentro de un manejador de React
      // sólo se puede probar montando un DOM. Véase su cabecera.
      await loadPickedLispFiles(runtime, Array.from(files ?? []));
      // El input se vacía para que volver a elegir EL MISMO fichero dispare otro
      // `change`. Sin esto, corregir un `.lsp` y recargarlo no haría nada.
      if (fileRef.current) fileRef.current.value = "";
    },
    [runtime],
  );

  const submit = useCallback(() => {
    const source = value.trim();
    if (!source || disabled) return;
    setValue("");
    submitCadLisp(host, source);
  }, [disabled, host, value]);

  return (
    <div
      data-testid="cad-lisp-palette"
      className="pointer-events-auto flex w-full flex-col rounded-control border border-border bg-[#0b1020]/95 type-caption shadow-lg backdrop-blur"
    >
      <header className="flex items-center gap-2 border-b border-border px-2 py-1">
        <span className="font-mono type-micro font-semibold uppercase tracking-wide text-success-ink">
          AutoLISP
        </span>
        {/*
          LOS DOS NÚMEROS NO CUENTAN LO MISMO, y por eso se dicen con todas sus
          letras. Las rutinas son las DEL ESTUDIO —lo que alguien cargó con
          APPLOAD—; los comandos son TODOS los que se pueden teclear, incluidos
          los de las cuatro rutinas de fábrica que vienen puestas. Decir «1
          rutina · 5 comandos» a secas se leía como que una rutina había traído
          cinco comandos, y la lista de abajo, que sí enseña las de fábrica,
          contradecía al encabezado.
        */}
        <span data-testid="cad-lisp-command-count" className="type-micro text-muted-foreground">
          {snapshot.files.length} rutina{snapshot.files.length === 1 ? "" : "s"} del
          estudio ·{" "}
          {snapshot.commands.length} comando
          {snapshot.commands.length === 1 ? "" : "s"} disponible
          {snapshot.commands.length === 1 ? "" : "s"}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            data-testid="cad-lisp-appload"
            onClick={() => fileRef.current?.click()}
            className="rounded border border-border px-1.5 py-0.5 font-mono type-micro text-primary-ink hover:bg-muted"
          >
            APPLOAD
          </button>
          <button
            type="button"
            data-testid="cad-lisp-clear"
            onClick={runtime.clearTranscript}
            className="rounded border border-border px-1.5 py-0.5 font-mono type-micro text-foreground hover:bg-muted"
          >
            Limpiar
          </button>
          <button
            type="button"
            data-testid="cad-lisp-close"
            onClick={runtime.close}
            aria-label="Cerrar la consola LISP"
            className="rounded border border-border px-1.5 py-0.5 font-mono type-micro text-foreground hover:bg-muted"
          >
            ✕
          </button>
        </div>
      </header>

      <input
        ref={fileRef}
        type="file"
        accept=".lsp,text/plain"
        multiple
        data-testid="cad-lisp-file-input"
        className="hidden"
        onChange={(event) => void onFiles(event.target.files)}
      />

      <div
        ref={logRef}
        data-testid="cad-lisp-log"
        className="max-h-40 min-h-[4rem] overflow-y-auto px-2 py-1 font-mono leading-snug"
      >
        {snapshot.transcript.length === 0 && (
          <div className="text-muted-foreground">
            Carga un .lsp con APPLOAD, o escribe una expresión: (+ 1 2)
          </div>
        )}
        {snapshot.transcript.map((entry) => (
          <div key={entry.id} className={LEVEL_CLASS[entry.level]}>
            <span className="whitespace-pre-wrap">
              {LEVEL_MARK[entry.level]}
              {entry.text}
            </span>
            {entry.origin && entry.level === "input" && (
              <span className="ml-1 type-micro text-muted-foreground">[{entry.origin}]</span>
            )}
          </div>
        ))}
      </div>

      {snapshot.lastTrace && (
        <details data-testid="cad-lisp-trace" className="border-t border-border px-2 py-1">
          <summary className="cursor-pointer font-mono type-micro text-danger-ink">
            Traza · {snapshot.lastTrace.kind}
            {snapshot.lastTrace.reason ? ` (${snapshot.lastTrace.reason})` : ""}
          </summary>
          <dl className="mt-1 grid grid-cols-[7rem_1fr] gap-x-2 font-mono type-micro text-foreground">
            <dt className="text-muted-foreground">invocación</dt>
            <dd className="break-all">{snapshot.lastTrace.invoke}</dd>
            <dt className="text-muted-foreground">origen</dt>
            <dd>{snapshot.lastTrace.origin}</dd>
            <dt className="text-muted-foreground">cargado</dt>
            <dd>{snapshot.lastTrace.loaded.join(", ") || "nada"}</dd>
            <dt className="text-muted-foreground">descartado</dt>
            <dd>
              {snapshot.lastTrace.discardedCommands} escritura
              {snapshot.lastTrace.discardedCommands === 1 ? "" : "s"} al dibujo
            </dd>
          </dl>
          {snapshot.lastTrace.output.trim() && (
            <pre className="mt-1 max-h-24 overflow-y-auto whitespace-pre-wrap font-mono type-micro text-muted-foreground">
              {snapshot.lastTrace.output}
            </pre>
          )}
        </details>
      )}

      <div className="flex items-center gap-1 border-t border-border px-2 py-1">
        {(["routines", "variables"] as const).map((id) => (
          <button
            key={id}
            type="button"
            data-testid={`cad-lisp-tab-${id}`}
            onClick={() => setTab(id)}
            className={`rounded px-1.5 py-0.5 font-mono type-micro ${
              tab === id ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50"
            }`}
          >
            {id === "routines" ? "Rutinas" : "Variables"}
          </button>
        ))}
        {tab === "variables" && snapshot.variables.length > 0 && (
          <button
            type="button"
            data-testid="cad-lisp-reset-variables"
            onClick={runtime.resetVariables}
            className="ml-auto rounded border border-border px-1.5 py-0.5 font-mono type-micro text-foreground hover:bg-muted"
          >
            Olvidar
          </button>
        )}
      </div>

      <div className="max-h-40 overflow-y-auto px-2 pb-1 font-mono type-micro">
        {tab === "routines" ? (
          <RoutineList runtime={runtime} snapshot={snapshot} />
        ) : (
          <VariableList snapshot={snapshot} />
        )}
      </div>

      <div className="flex items-center gap-1 border-t border-border px-2 py-1">
        <span className="font-mono text-muted-foreground">_$</span>
        <input
          data-testid="cad-lisp-input"
          value={value}
          disabled={disabled}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            submit();
          }}
          spellCheck={false}
          autoComplete="off"
          aria-label="Consola AutoLISP"
          placeholder={disabled ? "dibujo en sólo lectura" : "(setq a 5)"}
          className="min-w-0 flex-1 bg-transparent font-mono text-foreground outline-none placeholder:text-muted-foreground"
        />
      </div>
    </div>
  );
}

function RoutineList({
  runtime,
  snapshot,
}: {
  runtime: CadLispRuntime;
  snapshot: CadLispSnapshot;
}) {
  return (
    <ul data-testid="cad-lisp-routines" className="flex flex-col gap-1">
      {/*
        Las de fábrica van PRIMERO y sin botón de descargar: están siempre y no
        son de la organización. Enseñarlas junto a las del estudio con el mismo
        control invitaría a intentar borrar algo que no se borra.
      */}
      {snapshot.factory.map((file) => (
        <li key={file.id} className="flex items-baseline gap-1">
          <span className="text-foreground">{file.name}</span>
          <span className="text-muted-foreground">de fábrica</span>
          <span className="text-success-ink">
            {file.commands.map((command) => command.toUpperCase()).join(" ") || "—"}
          </span>
        </li>
      ))}
      {snapshot.files.length === 0 && (
        <li className="text-muted-foreground">
          Ninguna rutina del estudio cargada todavía: usa APPLOAD para subir un .lsp.
        </li>
      )}
      {snapshot.storageProblems.map((problem) => (
        <li key={problem} className="text-warning-ink">
          Almacén · {problem}
        </li>
      ))}
      {snapshot.shadowedByNative.length > 0 && (
        <li data-testid="cad-lisp-shadowed" className="text-warning-ink">
          {snapshot.shadowedByNative.join(", ")} ya {snapshot.shadowedByNative.length === 1 ? "es" : "son"}{" "}
          del producto: el comando nativo gana y esa rutina no se puede invocar así.
        </li>
      )}
      {snapshot.collisions.map((collision) => (
        <li key={collision.command} className="text-warning-ink">
          {collision.command} lo declaran {collision.files.join(" y ")}; gana el último cargado.
        </li>
      ))}
      {snapshot.files.map((file) => (
        <li key={file.id} className="flex items-baseline gap-1">
          <span className="text-foreground">{file.name}</span>
          <span className="text-muted-foreground">v{file.version}</span>
          <span className="truncate text-muted-foreground" title={`${file.updatedBy} · ${file.updatedAt}`}>
            {file.updatedBy} · {file.updatedAt.slice(0, 10)}
          </span>
          <span className="text-success-ink">
            {file.commands.length
              ? file.commands.map((command) => command.toUpperCase()).join(" ")
              : "—"}
          </span>
          <button
            type="button"
            data-testid={`cad-lisp-unload-${file.name}`}
            onClick={() => runtime.unload(file.name)}
            className="ml-auto rounded border border-border px-1 text-muted-foreground hover:bg-muted"
          >
            descargar
          </button>
        </li>
      ))}
    </ul>
  );
}

function VariableList({ snapshot }: { snapshot: CadLispSnapshot }) {
  if (snapshot.variables.length === 0)
    return (
      <div className="text-muted-foreground">
        La última ejecución no dejó nada ligado.
      </div>
    );
  return (
    <ul data-testid="cad-lisp-variables" className="flex flex-col">
      {snapshot.variables.map((variable) => (
        <li key={variable.name} className="flex items-baseline gap-1">
          <span className={variable.shadowsBuiltin ? "text-warning-ink" : "text-primary-ink"}>
            {variable.name}
          </span>
          {variable.shadowsBuiltin && (
            <span className="type-micro text-amber-400" title="Tapa un nombre del sistema">
              tapa un builtin
            </span>
          )}
          <span className="truncate text-foreground">{variable.value}</span>
        </li>
      ))}
    </ul>
  );
}

export default CadLispPalette;
