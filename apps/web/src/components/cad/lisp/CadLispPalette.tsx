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
  input: "text-indigo-300",
  value: "text-emerald-300",
  output: "text-gray-200",
  error: "text-red-400",
  info: "text-gray-400",
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
      className="pointer-events-auto flex w-full flex-col rounded-lg border border-white/10 bg-[#0b1020]/95 text-[12px] shadow-lg backdrop-blur"
    >
      <header className="flex items-center gap-2 border-b border-white/5 px-2 py-1">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-wide text-emerald-300">
          AutoLISP
        </span>
        <span data-testid="cad-lisp-command-count" className="text-[11px] text-gray-400">
          {snapshot.files.length} rutina{snapshot.files.length === 1 ? "" : "s"} ·{" "}
          {snapshot.commands.length} comando{snapshot.commands.length === 1 ? "" : "s"}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            data-testid="cad-lisp-appload"
            onClick={() => fileRef.current?.click()}
            className="rounded border border-white/15 px-1.5 py-0.5 font-mono text-[11px] text-indigo-200 hover:bg-white/10"
          >
            APPLOAD
          </button>
          <button
            type="button"
            data-testid="cad-lisp-clear"
            onClick={runtime.clearTranscript}
            className="rounded border border-white/15 px-1.5 py-0.5 font-mono text-[11px] text-gray-300 hover:bg-white/10"
          >
            Limpiar
          </button>
          <button
            type="button"
            data-testid="cad-lisp-close"
            onClick={runtime.close}
            aria-label="Cerrar la consola LISP"
            className="rounded border border-white/15 px-1.5 py-0.5 font-mono text-[11px] text-gray-300 hover:bg-white/10"
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
          <div className="text-gray-500">
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
              <span className="ml-1 text-[10px] text-gray-500">[{entry.origin}]</span>
            )}
          </div>
        ))}
      </div>

      {snapshot.lastTrace && (
        <details data-testid="cad-lisp-trace" className="border-t border-white/5 px-2 py-1">
          <summary className="cursor-pointer font-mono text-[11px] text-red-300">
            Traza · {snapshot.lastTrace.kind}
            {snapshot.lastTrace.reason ? ` (${snapshot.lastTrace.reason})` : ""}
          </summary>
          <dl className="mt-1 grid grid-cols-[7rem_1fr] gap-x-2 font-mono text-[11px] text-gray-300">
            <dt className="text-gray-500">invocación</dt>
            <dd className="break-all">{snapshot.lastTrace.invoke}</dd>
            <dt className="text-gray-500">origen</dt>
            <dd>{snapshot.lastTrace.origin}</dd>
            <dt className="text-gray-500">cargado</dt>
            <dd>{snapshot.lastTrace.loaded.join(", ") || "nada"}</dd>
            <dt className="text-gray-500">descartado</dt>
            <dd>
              {snapshot.lastTrace.discardedCommands} escritura
              {snapshot.lastTrace.discardedCommands === 1 ? "" : "s"} al dibujo
            </dd>
          </dl>
          {snapshot.lastTrace.output.trim() && (
            <pre className="mt-1 max-h-24 overflow-y-auto whitespace-pre-wrap font-mono text-[11px] text-gray-400">
              {snapshot.lastTrace.output}
            </pre>
          )}
        </details>
      )}

      <div className="flex items-center gap-1 border-t border-white/5 px-2 py-1">
        {(["routines", "variables"] as const).map((id) => (
          <button
            key={id}
            type="button"
            data-testid={`cad-lisp-tab-${id}`}
            onClick={() => setTab(id)}
            className={`rounded px-1.5 py-0.5 font-mono text-[11px] ${
              tab === id ? "bg-white/10 text-gray-100" : "text-gray-400 hover:bg-white/5"
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
            className="ml-auto rounded border border-white/15 px-1.5 py-0.5 font-mono text-[11px] text-gray-300 hover:bg-white/10"
          >
            Olvidar
          </button>
        )}
      </div>

      <div className="max-h-40 overflow-y-auto px-2 pb-1 font-mono text-[11px]">
        {tab === "routines" ? (
          <RoutineList runtime={runtime} snapshot={snapshot} />
        ) : (
          <VariableList snapshot={snapshot} />
        )}
      </div>

      <div className="flex items-center gap-1 border-t border-white/5 px-2 py-1">
        <span className="font-mono text-gray-500">_$</span>
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
          className="min-w-0 flex-1 bg-transparent font-mono text-gray-100 outline-none placeholder:text-gray-600"
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
          <span className="text-gray-200">{file.name}</span>
          <span className="text-gray-500">de fábrica</span>
          <span className="text-emerald-300">
            {file.commands.map((command) => command.toUpperCase()).join(" ") || "—"}
          </span>
        </li>
      ))}
      {snapshot.files.length === 0 && (
        <li className="text-gray-500">
          Ninguna rutina del estudio cargada todavía: usa APPLOAD para subir un .lsp.
        </li>
      )}
      {snapshot.storageProblems.map((problem) => (
        <li key={problem} className="text-amber-300">
          Almacén · {problem}
        </li>
      ))}
      {snapshot.shadowedByNative.length > 0 && (
        <li data-testid="cad-lisp-shadowed" className="text-amber-300">
          {snapshot.shadowedByNative.join(", ")} ya {snapshot.shadowedByNative.length === 1 ? "es" : "son"}{" "}
          del producto: el comando nativo gana y esa rutina no se puede invocar así.
        </li>
      )}
      {snapshot.collisions.map((collision) => (
        <li key={collision.command} className="text-amber-300">
          {collision.command} lo declaran {collision.files.join(" y ")}; gana el último cargado.
        </li>
      ))}
      {snapshot.files.map((file) => (
        <li key={file.id} className="flex items-baseline gap-1">
          <span className="text-gray-200">{file.name}</span>
          <span className="text-gray-500">v{file.version}</span>
          <span className="truncate text-gray-500" title={`${file.updatedBy} · ${file.updatedAt}`}>
            {file.updatedBy} · {file.updatedAt.slice(0, 10)}
          </span>
          <span className="text-emerald-300">
            {file.commands.length
              ? file.commands.map((command) => command.toUpperCase()).join(" ")
              : "—"}
          </span>
          <button
            type="button"
            data-testid={`cad-lisp-unload-${file.name}`}
            onClick={() => runtime.unload(file.name)}
            className="ml-auto rounded border border-white/15 px-1 text-gray-400 hover:bg-white/10"
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
      <div className="text-gray-500">
        La última ejecución no dejó nada ligado.
      </div>
    );
  return (
    <ul data-testid="cad-lisp-variables" className="flex flex-col">
      {snapshot.variables.map((variable) => (
        <li key={variable.name} className="flex items-baseline gap-1">
          <span className={variable.shadowsBuiltin ? "text-amber-300" : "text-indigo-200"}>
            {variable.name}
          </span>
          {variable.shadowsBuiltin && (
            <span className="text-[10px] text-amber-400" title="Tapa un nombre del sistema">
              tapa un builtin
            </span>
          )}
          <span className="truncate text-gray-300">{variable.value}</span>
        </li>
      ))}
    </ul>
  );
}

export default CadLispPalette;
