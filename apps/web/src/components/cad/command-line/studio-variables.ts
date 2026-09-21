import type { CadDocument } from "@/lib/cad/cad-document";
import { resolveCadLayerId } from "@/lib/cad/resolve-layer-id";
import type {
  CadVariableAccess,
  CadSystemVariableValue,
} from "@/lib/cad/system-variables";

interface StudioVariablePort {
  document: { current: CadDocument | null };
  activeLayer: string;
  setActiveLayer?(id: string): void;
  linetypeScale?: { get(): number; set(value: number): void };
}

export interface CadStudioVariableAccess extends CadVariableAccess {
  bind(port: StudioVariablePort): void;
  syncActiveLayer(layer?: string): void;
}

/** Session variables connected to the editor without document/history writes. */
export function createCadStudioVariableAccess(
  session: CadVariableAccess,
  initialPort?: StudioVariablePort,
): CadStudioVariableAccess {
  let bound = initialPort;
  const live = () => {
    if (!bound)
      throw new Error("La fachada de variables no está conectada al estudio.");
    return bound;
  };
  let observedLayer: string | undefined;
  let commandLayer: string | undefined;
  const syncActiveLayer = (layer = live().activeLayer) => {
    // A later panel selection wins. Until React acknowledges a command's
    // setter, commands in the same script must already read its new layer.
    if (layer !== observedLayer) {
      observedLayer = layer;
      commandLayer = observedLayer;
    }
  };
  const activeLayer = () => {
    syncActiveLayer();
    const port = live();
    const layers = port.document.current?.layers ?? [];
    return (
      resolveCadLayerId(layers, commandLayer ?? port.activeLayer) ??
      port.activeLayer
    );
  };
  const write = (
    method: "set" | "publish",
    name: string,
    value: CadSystemVariableValue,
  ) => {
    const key = name.toUpperCase();
    const port = live();
    if (key === "CLAYER") {
      const id = resolveCadLayerId(
        port.document.current?.layers ?? [],
        String(value),
      );
      if (!id)
        return { ok: false as const, reason: `No existe la capa "${value}".` };
      const previous = activeLayer();
      const outcome = session[method](name, id);
      if (outcome.ok) {
        commandLayer = id;
        if (previous !== id) port.setActiveLayer?.(id);
      }
      return outcome;
    }
    const outcome = session[method](name, value);
    if (outcome.ok && key === "LTSCALE" && typeof outcome.value === "number") {
      port.linetypeScale?.set(outcome.value);
    }
    return outcome;
  };
  return {
    bind: (port) => {
      bound = port;
      syncActiveLayer(port.activeLayer);
    },
    syncActiveLayer,
    get: (name) => {
      if (name.toUpperCase() === "CLAYER") return activeLayer();
      if (name.toUpperCase() === "LTSCALE" && live().linetypeScale)
        return live().linetypeScale!.get();
      return session.get(name);
    },
    set: (name, value) => write("set", name, value),
    publish: (name, value) => write("publish", name, value),
  };
}
