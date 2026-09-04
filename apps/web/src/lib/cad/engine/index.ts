/**
 * Punto de entrada del motor de comandos.
 *
 * Un único sitio desde el que el editor obtiene el registro completo. La paleta
 * `Ctrl+K`, la línea de comandos, la barra de herramientas y los scripts leen
 * todos de aquí, así que un comando nuevo aparece en los cuatro sitios a la vez
 * o en ninguno. Ese es justamente el problema que existía con tres sistemas de
 * comandos que no se conocían entre sí.
 *
 * ## LOS METADATOS ESTÁTICOS, LA IMPLEMENTACIÓN A DEMANDA (2026-09-04)
 *
 * Este archivo hacía 106 `import` ESTÁTICOS de `./commands/*` sólo para
 * construir `CAD_COMMAND_DESCRIPTORS`, y `command-palette.ts` lo importa desde
 * `Layout3DEditor`. Medido con mapas de fuente sobre el build de producción
 * —el mismo método que cita `lib/cad/commands/lazy.ts`—: 728,5 KB minificados
 * del chunk del estudio (de 1.873,3 KB) eran alcanzables ÚNICAMENTE a través de
 * esas implementaciones, 2.463,3 KB de fuente en 208 ficheros. Abrir un plano
 * para dibujar una línea descargaba el motor de comparación de dibujos, el
 * parser de PDF, el trazado de tuberías y el enrutado eléctrico.
 *
 * El reparto que arregla eso es el que ya dejó escrito `commands/lazy.ts` un
 * piso más arriba: «el REGISTRO se queda estático a propósito». Aquí igual —
 * los 291 descriptores existen desde el primer instante con sus metadatos
 * reales (`command-manifest.ts`, GENERADO de los módulos), así que la cinta, la
 * paleta y los tres gates que cuentan comandos siguen viendo 291 de 291; lo que
 * llega a demanda es sólo la máquina de estados `begin`/`step`
 * (`lazy-commands.ts`).
 *
 * ## Y falla en voz alta
 *
 * Un descriptor cuya implementación no está cargada NO finge: termina con un
 * renglón que dice que no terminó de cargar, y dispara la carga para que el
 * segundo intento funcione. Regla 2 de la campaña de cimientos: ningún comando
 * responde éxito sin efecto. Quien despacha —`CadCommandEngineHost.dispatch`,
 * `script-runner.ts`, el `(command …)` de LISP— pide la implementación ANTES de
 * reducir, así que ese renglón es la red de seguridad, no el camino normal.
 */
import { CAD_COMMAND_MANIFEST, type CadCommandManifestEntry } from "./command-manifest";
import {
  cadCommandImplementation,
  cadWarmAllCommandModules,
  loadCadCommandModule,
} from "./lazy-commands";
import { asCadCommand, type CadAnyCommandDescriptor, type CadCommandStep } from "./command-types";
import { createCadCommandRegistry, type CadCommandRegistryImpl } from "./registry";

export * from "./command-types";
export * from "./command-engine";
export type { CadHostRequest } from "./host-requests";
export * from "./alias-table";
export * from "./prompt";
export * from "./input-pipeline";
export { createCadCommandRegistry, CadCommandRegistryImpl } from "./registry";
export { CAD_COMMAND_MANIFEST, type CadCommandManifestEntry } from "./command-manifest";
export {
  CAD_COMMAND_MODULE_LOADERS,
  cadCommandImplementation,
  type CadCommandModuleId,
} from "./lazy-commands";

/** Qué módulo implementa cada comando, por nombre canónico. */
const MODULE_BY_NAME = new Map<string, CadCommandManifestEntry["module"]>(
  CAD_COMMAND_MANIFEST.map((entry) => [entry.name.toUpperCase(), entry.module]),
);

/**
 * Trae la implementación de un comando. Idempotente y memoizada por módulo.
 *
 * Es el gemelo de `loadCadNlCommands()` de `lib/cad/commands/lazy.ts`, y existe
 * por lo mismo: quien despacha está en un contexto donde puede esperar, y
 * esperar una vez al teclear la primera orden es preferible a descargar las 291
 * implementaciones al abrir el plano.
 */
export async function loadCadCommand(name: string): Promise<CadAnyCommandDescriptor> {
  const canonical = CAD_COMMAND_REGISTRY_V2.get(name)?.name ?? name.trim().toUpperCase();
  const already = cadCommandImplementation(canonical);
  if (already) return already;
  const module = MODULE_BY_NAME.get(canonical);
  if (!module) throw new Error(`Comando desconocido "${name}".`);
  await loadCadCommandModule(module);
  const loaded = cadCommandImplementation(canonical);
  if (!loaded)
    throw new Error(`El módulo ${module} cargó pero no trae el comando ${canonical}.`);
  return loaded;
}

/** La implementación ya cargada, o `null`. Camino síncrono, como el precedente. */
export function cadCommandIfLoaded(name: string): CadAnyCommandDescriptor | null {
  return cadCommandImplementation(CAD_COMMAND_REGISTRY_V2.get(name)?.name ?? name);
}

/**
 * Carga las 291 implementaciones. Para NODE: la sonda de integridad
 * (`apps/web/scripts/command-integrity-probe.mts`) ejecuta los 291 comandos
 * REALES y los necesita todos. No es una exención ni una cuarentena — en Node
 * cargarlos no cuesta bytes de red.
 */
export async function cadWarmAllCommands(): Promise<void> {
  await cadWarmAllCommandModules();
}

/**
 * El paso que devuelve un descriptor cuya implementación todavía no está.
 *
 * Dice lo que pasa y arranca la carga; no finge un «Hecho» vacío ni se queda
 * mudo. Es el mismo trato que `Layout3DEditor.tsx` le da al intérprete de
 * frases cuando aún no ha llegado.
 */
function pasoSinImplementacion(entry: CadCommandManifestEntry): CadCommandStep<never> {
  void loadCadCommandModule(entry.module).catch(() => {
    /* el siguiente intento lo vuelve a pedir; el renglón ya avisó */
  });
  const text =
    `${entry.name} todavía no terminó de cargar (${entry.module}). ` +
    "Se está trayendo ahora; vuelva a teclearlo en un instante.";
  return {
    state: undefined as never,
    prompt: { message: text, options: [] },
    accepts: 0,
    result: { kind: "message", text },
  };
}

/**
 * Marca que distingue un descriptor PEREZOSO de uno real.
 *
 * Hace falta porque el anfitrión decide si tiene que esperar mirando el
 * descriptor que le devuelve SU registro, y ese registro no siempre es el del
 * producto: los specs del motor montan el suyo con los descriptores de verdad,
 * y el compuesto de LISP mezcla los del producto con las rutinas del usuario.
 * Preguntarle al registro global habría hecho esperar a comandos que ya estaban
 * delante. Es un símbolo global (`Symbol.for`) para que la marca sobreviva a
 * que dos copias del módulo convivan en un bundle.
 */
const PEREZOSO: unique symbol = Symbol.for("valle.cad.comando-perezoso") as never;

/**
 * `true` si a este descriptor le falta la implementación. `false` para un
 * descriptor real —el de un spec, el de una rutina `.lsp`— y para uno perezoso
 * cuyo módulo ya llegó.
 */
export function cadCommandNeedsImplementation(descriptor: CadAnyCommandDescriptor): boolean {
  if (!(descriptor as unknown as Record<symbol, unknown>)[PEREZOSO]) return false;
  return cadCommandImplementation(descriptor.name) === null;
}

/**
 * Descriptor con metadatos reales y máquina de estados delegada.
 *
 * Los campos que la interfaz lee al abrir —`name`, `aliases`, `kind`, y también
 * `transparent`, `selection`, `repeatable`, `mutates`, `spatial` y `cursor`,
 * que el reductor consulta antes de tocar el comando— son valores, no
 * funciones: no hay nada que cargar para responderlos.
 */
function descriptorPerezoso(entry: CadCommandManifestEntry): CadAnyCommandDescriptor {
  const descriptor = asCadCommand<never>({
    name: entry.name,
    aliases: entry.aliases,
    kind: entry.kind,
    transparent: entry.transparent,
    selection: entry.selection,
    repeatable: entry.repeatable,
    mutates: entry.mutates,
    ...(entry.spatial === undefined ? {} : { spatial: entry.spatial }),
    ...(entry.cursor === undefined ? {} : { cursor: entry.cursor }),
    begin(context) {
      const impl = cadCommandImplementation(entry.name);
      if (!impl) return pasoSinImplementacion(entry);
      return impl.begin(context) as CadCommandStep<never>;
    },
    step(state, input, context) {
      const impl = cadCommandImplementation(entry.name);
      if (!impl) return pasoSinImplementacion(entry);
      return impl.step(state, input, context) as CadCommandStep<never>;
    },
  });
  // La marca va fuera del literal: `CadCommandDescriptor` no la declara a
  // propósito —es un detalle de la carga, no del contrato de un comando— y
  // definirla no enumerable la deja fuera de cualquier copia con spread.
  Object.defineProperty(descriptor, PEREZOSO, { value: entry.module });
  return descriptor;
}

/** Todos los descriptores implementados hasta ahora. */
export const CAD_COMMAND_DESCRIPTORS: readonly CadAnyCommandDescriptor[] =
  CAD_COMMAND_MANIFEST.map(descriptorPerezoso);

/**
 * Registro compartido. Es inmutable en la práctica: se construye una vez al
 * cargar el módulo y nadie le añade comandos en caliente, porque un registro
 * que cambia según qué se haya importado antes convierte el comportamiento del
 * producto en una función del orden de los imports.
 */
export const CAD_COMMAND_REGISTRY_V2: CadCommandRegistryImpl =
  createCadCommandRegistry([...CAD_COMMAND_DESCRIPTORS]);
