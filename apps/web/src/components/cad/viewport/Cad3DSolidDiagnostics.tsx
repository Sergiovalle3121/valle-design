"use client";

/**
 * Evidencia REAL de malla 3D — no la lista de botones recortada a 20 que
 * hasta hoy (campaña Paridad, OLA 0.2) era la única prueba de que el 3D
 * "se construyó". `allNativeEntities` (el origen de esa lista) se llena
 * desde el JSON del documento, con cero dependencia de si
 * `CadNativeMassHosts` llegó a montar una sola malla en la escena — un
 * borrador de la geometría 3D podía romperse por completo sin que el
 * indicador cambiara.
 *
 * Sondea `hostsRef.current?.getSnapshot()` por cuadro (más barato que un
 * conteo de vértices de verdad justifica: son dos comparaciones de número)
 * y sólo actualiza su propio estado —local a este componente, no al
 * monolito— cuando el número realmente cambió. Publica
 * `data-mesh-count`/`data-vertex-count` para que un golden lea el EFECTO,
 * no un botón.
 *
 * `data-visual-style` (T-10a) es la misma idea aplicada a VSCURRENT: antes,
 * la única prueba de que el estilo visual cambió era la ETIQUETA que el
 * propio comando escribía en la línea de comandos — un éxito falso posible,
 * porque nada obligaba a que la escena de verdad reflejara esa etiqueta.
 * Este atributo lee el estilo VIGENTE de `CadNativeMassHosts`, la misma
 * instancia que pinta muros y masas, así que un golden puede afirmar la
 * ESCENA en vez de la frase.
 */
import { useEffect, useState } from "react";
import type { CadNativeMassHosts } from "./native-mass-hosts";
import type { CadVisualStyleId } from "@/lib/cad/view/visual-styles";

interface Snapshot {
  meshCount: number;
  vertexCount: number;
  visualStyle: CadVisualStyleId;
}

const ZERO: Snapshot = { meshCount: 0, vertexCount: 0, visualStyle: "shaded" };

export function Cad3DSolidDiagnostics({
  hostsRef,
}: {
  hostsRef: React.RefObject<CadNativeMassHosts | null>;
}) {
  const [snapshot, setSnapshot] = useState<Snapshot>(ZERO);

  useEffect(() => {
    let frame = 0;
    // Actualizador funcional: compara contra el `prev` que React ya tiene, sin
    // leer una ref durante el render (regla `react-hooks/refs`). Devolver la
    // MISMA referencia cuando no cambió nada evita el re-render de sobra.
    const tick = () => {
      const next = hostsRef.current?.getSnapshot() ?? ZERO;
      setSnapshot((prev) =>
        prev.meshCount === next.meshCount &&
        prev.vertexCount === next.vertexCount &&
        prev.visualStyle === next.visualStyle
          ? prev
          : next,
      );
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [hostsRef]);

  return (
    <span
      data-testid="cad-3d-solid-diagnostics"
      data-mesh-count={snapshot.meshCount}
      data-vertex-count={snapshot.vertexCount}
      data-visual-style={snapshot.visualStyle}
      title="Mallas 3D reales en la escena (muros, masas) — no botones de la lista de entidades"
      className="type-micro text-muted-foreground"
    >
      3D {snapshot.meshCount} malla(s)
    </span>
  );
}
