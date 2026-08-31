"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  createCallSessionHost,
  type CallSessionHost,
  type CallSessionSnapshot,
} from "./call-session-host";

/**
 * El puente React del anfitrión: lo crea UNA vez por montaje —el
 * inicializador perezoso de `useState`, no una escritura a un ref durante
 * el render— lo suscribe con `useSyncExternalStore` (la forma correcta de
 * leer estado externo sin el "tearing" de un `useState`+`useEffect` a mano)
 * y lo cierra al desmontar — `dispose()` cuelga si la llamada seguía
 * activa, así que navegar fuera del estudio nunca deja una
 * `RTCPeerConnection` huérfana.
 */
export function useCallSession(
  documentId: string,
  displayName?: string,
): { snapshot: CallSessionSnapshot; host: CallSessionHost } {
  const [host] = useState<CallSessionHost>(() =>
    createCallSessionHost({ documentId, displayName }),
  );

  const snapshot = useSyncExternalStore(
    host.subscribe,
    host.getSnapshot,
    host.getSnapshot,
  );

  useEffect(() => {
    return () => host.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { snapshot, host };
}
