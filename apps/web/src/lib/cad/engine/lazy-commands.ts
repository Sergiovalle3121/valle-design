/**
 * Las IMPLEMENTACIONES de los comandos, cargadas cuando se usa la primera orden
 * y no al abrir el estudio.
 *
 * ## Por qué existe, medido
 *
 * `engine/index.ts` hacía 106 `import` ESTÁTICOS de `./commands/*` sólo para
 * construir `CAD_COMMAND_DESCRIPTORS`, y `command-palette.ts` lo importa desde
 * `Layout3DEditor`. El diagnóstico de partida —mapas de fuente sobre el build de
 * producción, el mismo método que cita `lib/cad/commands/lazy.ts`— atribuyó
 * 728,5 KB minificados del chunk del estudio EXCLUSIVAMENTE a esas
 * implementaciones. Lo que este archivo produjo de punta a punta está medido en
 * `lib/cad/benchmark/frontend-load-baseline.json`, observación `20260904-…`:
 * ahí vive la cifra, y aquí no se copia (regla 4 de la campaña de cimientos).
 *
 * En castellano: abrir un plano para dibujar una línea descargaba el motor de
 * comparación de dibujos, el parser de PDF, el trazado de tuberías y el
 * enrutado eléctrico.
 *
 * ## El diseño es el precedente, un piso más abajo
 *
 * `lib/cad/commands/lazy.ts` dejó escrita la regla: «el REGISTRO se queda
 * estático a propósito: la asistencia de la línea de comandos y la paleta Cmd-K
 * lo leen al abrir para proponer frases». Aquí igual con los descriptores: LOS
 * METADATOS SON ESTÁTICOS —viven en `command-manifest.ts`, GENERADO de los
 * módulos reales— y sólo la máquina de estados `begin`/`step` llega a demanda.
 * Por eso los tres gates que cuentan comandos siguen contando 294 de 294.
 *
 * Los thunks son LITERALES, uno por línea, para que el empaquetador pueda
 * partirlos en 108 chunks; un `import(variable)` le obliga a incluirlos todos.
 *
 * ## Honestidad
 *
 * Un módulo que no llega no se traga: `cadCommandImplementation` devuelve `null`
 * y quien pregunta lo dice en voz alta, igual que `Layout3DEditor.tsx` dice «El
 * intérprete de frases no terminó de cargar» en vez de fingir que aplicó. Regla
 * 2 de la campaña de cimientos: ningún comando responde éxito sin efecto.
 */
import type { CadAnyCommandDescriptor } from "./command-types";

/**
 * Los 108 módulos que implementan el registro, con su thunk literal.
 *
 * `scripts/cad/build-command-manifest.mjs` los importa DE VERDAD en Node —donde
 * el peso es gratis— y de ahí saca los metadatos de los 294 comandos. Esta
 * tabla es la única lista escrita a mano del arreglo; todo lo demás se genera
 * de ella y `--check` falla si el manifiesto committeado no coincide.
 */
export const CAD_COMMAND_MODULE_LOADERS = {
  "commands/annotate-dimension-chains": () => import("./commands/annotate-dimension-chains"),
  "commands/annotate-dimensions": () => import("./commands/annotate-dimensions"),
  "commands/annotate-dimensions-angular": () => import("./commands/annotate-dimensions-angular"),
  "commands/annotate-dimensions-radial": () => import("./commands/annotate-dimensions-radial"),
  "commands/annotate-hatch": () => import("./commands/annotate-hatch"),
  "commands/annotate-leaders": () => import("./commands/annotate-leaders"),
  "commands/annotate-quick": () => import("./commands/annotate-quick"),
  "commands/annotate-quickleader": () => import("./commands/annotate-quickleader"),
  "commands/annotate-styles": () => import("./commands/annotate-styles"),
  "commands/annotate-table-edit": () => import("./commands/annotate-table-edit"),
  "commands/annotate-text": () => import("./commands/annotate-text"),
  "commands/annotate-tolerance": () => import("./commands/annotate-tolerance"),
  "commands/architecture-roof": () => import("./commands/architecture-roof"),
  "commands/architecture-stair": () => import("./commands/architecture-stair"),
  "commands/automation-actions": () => import("./commands/automation-actions"),
  "commands/automation-script": () => import("./commands/automation-script"),
  "commands/blocks": () => import("./commands/blocks"),
  "commands/blocks-burst": () => import("./commands/blocks-burst"),
  "commands/blocks-edit": () => import("./commands/blocks-edit"),
  "commands/clipboard": () => import("./commands/clipboard"),
  "commands/compare-drawings": () => import("./commands/compare-drawings"),
  "commands/data-extraction-commands": () => import("./commands/data-extraction-commands"),
  "commands/delivery-review": () => import("./commands/delivery-review"),
  "commands/design-center": () => import("./commands/design-center"),
  "commands/dimension-tolerance": () => import("./commands/dimension-tolerance"),
  "commands/draw-annotation-v4": () => import("./commands/draw-annotation-v4"),
  "commands/draw-basics": () => import("./commands/draw-basics"),
  "commands/draw-construction": () => import("./commands/draw-construction"),
  "commands/draw-curves": () => import("./commands/draw-curves"),
  "commands/draw-fills": () => import("./commands/draw-fills"),
  "commands/draw-opening": () => import("./commands/draw-opening"),
  "commands/draw-pline": () => import("./commands/draw-pline"),
  "commands/draw-points": () => import("./commands/draw-points"),
  "commands/draw-rectang": () => import("./commands/draw-rectang"),
  "commands/draw-rings": () => import("./commands/draw-rings"),
  "commands/draw-spline": () => import("./commands/draw-spline"),
  "commands/draw-wall": () => import("./commands/draw-wall"),
  "commands/drawing-fields": () => import("./commands/drawing-fields"),
  "commands/dynamic-block": () => import("./commands/dynamic-block"),
  "commands/electrical-circuit": () => import("./commands/electrical-circuit"),
  "commands/electrical-tag": () => import("./commands/electrical-tag"),
  "commands/electrical-wire": () => import("./commands/electrical-wire"),
  "commands/etransmit-commands": () => import("./commands/etransmit-commands"),
  "commands/express-tools": () => import("./commands/express-tools"),
  "commands/geo-cogo": () => import("./commands/geo-cogo"),
  "commands/geo-location": () => import("./commands/geo-location"),
  "commands/groups": () => import("./commands/groups"),
  "commands/history-commands": () => import("./commands/history-commands"),
  "commands/inquiry-list": () => import("./commands/inquiry-list"),
  "commands/inquiry-measure": () => import("./commands/inquiry-measure"),
  "commands/inquiry-region": () => import("./commands/inquiry-region"),
  "commands/interop-dxf": () => import("./commands/interop-dxf"),
  "commands/layout-commands": () => import("./commands/layout-commands"),
  "commands/manage-audit": () => import("./commands/manage-audit"),
  "commands/manage-laytrans": () => import("./commands/manage-laytrans"),
  "commands/manage-recover": () => import("./commands/manage-recover"),
  "commands/manage-standards": () => import("./commands/manage-standards"),
  "commands/map-import": () => import("./commands/map-import"),
  "commands/mechanical-annotate": () => import("./commands/mechanical-annotate"),
  "commands/mechanical-parts": () => import("./commands/mechanical-parts"),
  "commands/mechanical-symbols": () => import("./commands/mechanical-symbols"),
  "commands/mep-symbol": () => import("./commands/mep-symbol"),
  "commands/mep-tracing": () => import("./commands/mep-tracing"),
  "commands/modify-align": () => import("./commands/modify-align"),
  "commands/modify-array": () => import("./commands/modify-array"),
  "commands/modify-basics": () => import("./commands/modify-basics"),
  "commands/modify-blend": () => import("./commands/modify-blend"),
  "commands/modify-cleanup": () => import("./commands/modify-cleanup"),
  "commands/modify-edges": () => import("./commands/modify-edges"),
  "commands/modify-foreign": () => import("./commands/modify-foreign"),
  "commands/modify-join": () => import("./commands/modify-join"),
  "commands/modify-mirror": () => import("./commands/modify-mirror"),
  "commands/modify-pedit": () => import("./commands/modify-pedit"),
  "commands/modify-stretch": () => import("./commands/modify-stretch"),
  "commands/modify-transform": () => import("./commands/modify-transform"),
  "commands/parametric-dimensions": () => import("./commands/parametric-dimensions"),
  "commands/parametric-geometry": () => import("./commands/parametric-geometry"),
  "commands/pdf-underlay-commands": () => import("./commands/pdf-underlay-commands"),
  "commands/plant-equipment": () => import("./commands/plant-equipment"),
  "commands/plant-iso": () => import("./commands/plant-iso"),
  "commands/plant-line": () => import("./commands/plant-line"),
  "commands/plant-route": () => import("./commands/plant-route"),
  "commands/plot-commands": () => import("./commands/plot-commands"),
  "commands/raster-image": () => import("./commands/raster-image"),
  "commands/reference-edit": () => import("./commands/reference-edit"),
  "commands/select-query": () => import("./commands/select-query"),
  "commands/select-similar": () => import("./commands/select-similar"),
  "commands/settings-layer-tools": () => import("./commands/settings-layer-tools"),
  "commands/settings-mexican-standard": () => import("./commands/settings-mexican-standard"),
  "commands/settings-palettes": () => import("./commands/settings-palettes"),
  "commands/settings-variables": () => import("./commands/settings-variables"),
  "commands/sheet-set-commands": () => import("./commands/sheet-set-commands"),
  "commands/solids-create": () => import("./commands/solids-create"),
  "commands/solids-edit": () => import("./commands/solids-edit"),
  "commands/solids-flatshot": () => import("./commands/solids-flatshot"),
  "commands/solids-inquiry": () => import("./commands/solids-inquiry"),
  "commands/solids-interop": () => import("./commands/solids-interop"),
  "commands/solids-modify": () => import("./commands/solids-modify"),
  "commands/solids-primitives": () => import("./commands/solids-primitives"),
  "commands/solids-push-face": () => import("./commands/solids-push-face"),
  "commands/solview-commands": () => import("./commands/solview-commands"),
  "commands/ucs-commands": () => import("./commands/ucs-commands"),
  "commands/ucs-view-commands": () => import("./commands/ucs-view-commands"),
  "commands/vectorize-raster": () => import("./commands/vectorize-raster"),
  "commands/view-navigation": () => import("./commands/view-navigation"),
  "commands/view-navigation-3d": () => import("./commands/view-navigation-3d"),
  "commands/view-visual": () => import("./commands/view-visual"),
  "commands/xrefs": () => import("./commands/xrefs"),
} as const;

export type CadCommandModuleId = keyof typeof CAD_COMMAND_MODULE_LOADERS;

/** Implementaciones ya cargadas, por NOMBRE canónico en mayúsculas. */
const implementations = new Map<string, CadAnyCommandDescriptor>();
/** Una promesa por módulo, memoizada como el `pending ??=` del precedente. */
const pending = new Map<string, Promise<void>>();

/**
 * Registra las implementaciones que traiga un módulo ya importado.
 *
 * Es público porque `all-commands.ts` —los 108 módulos con `import` ESTÁTICO,
 * para Node— lo llama con todos de golpe: en un spec o en una sonda no hay
 * forma de esperar a un `import()` (los `.spec.ts` se cargan como CommonJS y no
 * admiten `await` de nivel superior), y una línea de import estático les
 * devuelve el registro completo sin tocar lo que descarga el navegador.
 */
export function cadRegisterCommandModules(modules: readonly unknown[]): void {
  for (const cargado of modules) harvest(cargado as Record<string, unknown>);
}

function harvest(module: Record<string, unknown>): void {
  // Se cosecha TODO array exportado que contenga descriptores: un módulo puede
  // exportar la familia y además el array compuesto que la concatena (así lo
  // hace `express-tools.ts` con `express-tools-text.ts`), y quedarse sólo con
  // uno de los dos dejaría comandos sin implementación según qué nombre se
  // hubiera elegido. Verificado el 2026-09-04: cosechar así da exactamente los
  // 294 del registro, ni uno de más ni de menos, y ninguno en dos módulos.
  for (const value of Object.values(module)) {
    if (!Array.isArray(value)) continue;
    for (const candidate of value) {
      if (!candidate || typeof candidate !== "object") continue;
      const descriptor = candidate as Partial<CadAnyCommandDescriptor>;
      if (typeof descriptor.name !== "string") continue;
      if (typeof descriptor.begin !== "function" || typeof descriptor.step !== "function") continue;
      implementations.set(descriptor.name.toUpperCase(), descriptor as CadAnyCommandDescriptor);
    }
  }
}

/** Carga un módulo de comandos. Idempotente: la promesa se memoiza. */
export function loadCadCommandModule(id: CadCommandModuleId): Promise<void> {
  const already = pending.get(id);
  if (already) return already;
  const loader = CAD_COMMAND_MODULE_LOADERS[id];
  if (!loader) return Promise.reject(new Error(`Módulo de comandos desconocido: ${id}`));
  const promise = loader().then((module) => {
    harvest(module as Record<string, unknown>);
  });
  pending.set(id, promise);
  // Un módulo que falló no puede quedarse memoizado como fallido para siempre:
  // el usuario que vuelve a teclear la orden merece un segundo intento (una red
  // que se cayó a media descarga es el caso típico).
  promise.catch(() => {
    if (pending.get(id) === promise) pending.delete(id);
  });
  return promise;
}

/** La implementación ya cargada, o `null`. Camino síncrono. */
export function cadCommandImplementation(name: string): CadAnyCommandDescriptor | null {
  return implementations.get(name.trim().toUpperCase()) ?? null;
}

/**
 * Carga los 108 módulos. Es para NODE —la sonda de integridad, las specs y el
 * generador del manifiesto—, donde cargarlos todos no cuesta nada; en el
 * navegador devolvería exactamente los bytes que este archivo saca del camino.
 */
export async function cadWarmAllCommandModules(): Promise<void> {
  const ids = Object.keys(CAD_COMMAND_MODULE_LOADERS) as CadCommandModuleId[];
  await Promise.all(ids.map((id) => loadCadCommandModule(id)));
}
