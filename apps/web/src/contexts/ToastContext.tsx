'use client';

import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

type Kind = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  kind: Kind;
  title?: string;
  message: string;
}

interface ToastApi {
  show: (message: string, opts?: { kind?: Kind; title?: string }) => void;
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
}

const ToastCtx = createContext<ToastApi | null>(null);

/**
 * Notificaciones estilo Apple: tarjetas limpias arriba a la derecha, con blur,
 * borde sutil y entrada/salida con spring. Los acuses se descartan solos a los
 * ~3.5 s; los ERRORES viven cuatro veces más, porque piden una decisión. Respeta
 * prefers-reduced-motion. Reutilizable en toda la app vía useToast().
 */
/**
 * Cuánto vive una tarjeta, según lo que tenga que hacer quien la lee.
 *
 * Un «Guardado» se entiende de un vistazo y estorba si se queda. Un ERROR es
 * lo contrario: pide una decisión —volver a iniciar sesión, esperar, exportar
 * una copia— y hasta ahora se iba a los 3,5 s igual que un acuse. Provocando
 * de verdad una sesión caducada a media edición, el aviso que explicaba qué
 * hacer desaparecía antes de que nadie pudiera leerlo y en pantalla sólo
 * quedaba «Error de guardado · cambios pendientes», sin decir por qué. Un
 * mensaje que no da tiempo a leerse no es un mensaje.
 */
const LIFETIME_MS: Record<Kind, number> = {
  success: 3_500,
  info: 3_500,
  error: 12_000,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  // Tarjetas visibles por contenido, con su temporizador. Dos caminos de código
  // pueden anunciar EXACTAMENTE lo mismo casi a la vez (dos guardados en vuelo
  // que reciben el mismo 409, por ejemplo): apilar dos tarjetas idénticas no
  // informa dos veces, sólo duplica. La repetida renueva el temporizador.
  const liveRef = useRef(new Map<string, { id: number; timer: ReturnType<typeof setTimeout> }>());

  const remove = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
    for (const [key, entry] of liveRef.current)
      if (entry.id === id) {
        clearTimeout(entry.timer);
        liveRef.current.delete(key);
      }
  }, []);

  const show = useCallback(
    (message: string, opts?: { kind?: Kind; title?: string }) => {
      const kind = opts?.kind ?? 'success';
      const key = `${kind}·${opts?.title ?? ''}·${message}`;
      const existing = liveRef.current.get(key);
      if (existing) {
        clearTimeout(existing.timer);
        existing.timer = setTimeout(() => remove(existing.id), LIFETIME_MS[kind]);
        return;
      }
      const id = Date.now() + Math.random();
      const timer = setTimeout(() => remove(id), LIFETIME_MS[kind]);
      liveRef.current.set(key, { id, timer });
      setToasts((t) => [...t, { id, kind, title: opts?.title, message }]);
    },
    [remove],
  );

  const api: ToastApi = {
    show,
    success: (m, title) => show(m, { kind: 'success', title }),
    error: (m, title) => show(m, { kind: 'error', title }),
    info: (m, title) => show(m, { kind: 'info', title }),
  };

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="fixed top-4 right-4 z-[300] flex flex-col gap-2 w-[min(380px,calc(100vw-2rem))] pointer-events-none">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              // Identificador NUEVO (no renombra ninguno): la OLA 2.4 mide los
              // mensajes de error contra el stack real, y hasta ahora la única
              // forma de encontrarlos era buscar su texto literal — lo que
              // obliga a que la prueba conozca de antemano el mensaje que está
              // auditando, que es justo lo contrario de auditarlo.
              data-testid="app-toast"
              data-toast-kind={t.kind}
              layout
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: -16, scale: 0.96 }}
              animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, x: 24, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              // El contenedor flota sobre la barra de herramientas del CAD.
              // Una notificación transitoria NUNCA debe robar un clic a un
              // control real: la tarjeta no captura puntero y sólo el botón de
              // cerrar vuelve a habilitarlo.
              className="pointer-events-none flex items-start gap-3 rounded-2xl px-4 py-3 bg-white/85 dark:bg-neutral-900/85 backdrop-blur-xl border border-black/5 dark:border-white/10 shadow-[0_8px_30px_-8px_rgba(0,0,0,0.25)]"
            >
              <ToastIcon kind={t.kind} />
              <div className="min-w-0 flex-1">
                {t.title && <p className="text-sm font-semibold leading-tight text-black dark:text-white">{t.title}</p>}
                <p className="text-sm text-gray-600 dark:text-gray-300 leading-snug">{t.message}</p>
              </div>
              <button onClick={() => remove(t.id)} className="pointer-events-auto text-gray-400 hover:text-black dark:hover:text-white p-0.5 -mr-1 -mt-0.5" aria-label="Cerrar">
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}

function ToastIcon({ kind }: { kind: Kind }) {
  if (kind === 'error') return <AlertCircle className="w-5 h-5 text-rose-500 flex-shrink-0 mt-0.5" />;
  if (kind === 'info') return <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />;
  return <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />;
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastCtx);
  if (!ctx) {
    // No-op seguro si el provider no está montado (no debería pasar).
    const noop = () => undefined;
    return { show: noop, success: noop, error: noop, info: noop };
  }
  return ctx;
}
