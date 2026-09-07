'use client';

import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

type Kind = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  kind: Kind;
  title?: string;
  message: string;
  /** Saliendo: la tarjeta sigue montada mientras dura su animación de salida. */
  leaving?: boolean;
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
 * borde sutil y entrada/salida animadas. Los acuses se descartan solos a los
 * ~3.5 s; los ERRORES viven cuatro veces más, porque piden una decisión.
 * Reutilizable en toda la app vía useToast().
 *
 * La entrada y la salida son dos keyframes de `globals.css` (`valle-toast-in`
 * / `valle-toast-out`), no Framer Motion: este proveedor vive en el layout raíz
 * y era el ÚNICO importador de la librería, así que ~40 KB gzip viajaban en el
 * cascarón de TODAS las rutas —la portada incluida, donde Lighthouse los medía
 * 85 % sin usar— para animar una tarjeta que la mayoría de las sesiones no ve.
 * `prefers-reduced-motion` la aplasta desde la regla global, como al resto.
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

/** Duración de `valle-toast-out` en `globals.css`; si cambia allí, cambia aquí. */
const LEAVE_MS = 220;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  // Tarjetas visibles por contenido, con su temporizador. Dos caminos de código
  // pueden anunciar EXACTAMENTE lo mismo casi a la vez (dos guardados en vuelo
  // que reciben el mismo 409, por ejemplo): apilar dos tarjetas idénticas no
  // informa dos veces, sólo duplica. La repetida renueva el temporizador.
  const liveRef = useRef(new Map<string, { id: number; timer: ReturnType<typeof setTimeout> }>());

  // Tarjetas en salida, con el cinturón que las desmonta si `animationend`
  // no llegara (una pestaña en segundo plano no pinta y no dispara el evento).
  const leavingRef = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const unmount = useCallback((id: number) => {
    const pending = leavingRef.current.get(id);
    if (pending !== undefined) clearTimeout(pending);
    leavingRef.current.delete(id);
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const remove = useCallback(
    (id: number) => {
      for (const [key, entry] of liveRef.current)
        if (entry.id === id) {
          clearTimeout(entry.timer);
          liveRef.current.delete(key);
        }
      if (leavingRef.current.has(id)) return;
      setToasts((t) => t.map((x) => (x.id === id ? { ...x, leaving: true } : x)));
      leavingRef.current.set(id, setTimeout(() => unmount(id), LEAVE_MS + 60));
    },
    [unmount],
  );

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
      {/*
        T-75(h): este contenedor no anunciaba NADA a un lector de pantalla —
        ni `aria-live`, ni `role` — así que cualquier aviso, incluido un
        fallo de guardado, era mudo fuera de la vista.

        Una región `polite` y otra `assertive` en dos `<div>` separados
        (primer intento) rompía la pila visual: los dos llevaban EXACTAMENTE
        el mismo `fixed top-4 right-4`, así que un éxito y un error a la vez
        se pintaban superpuestos en la misma esquina en vez de apilados. El
        golden `53-cad-bim-wall.spec.ts` lo cazó por accidente (buscaba UN
        `div.fixed.top-4.right-4` y encontró dos). El `aria-live` va en cada
        TARJETA, no en un contenedor — sigue siendo un patrón válido (el
        nodo que aparece es el que lleva el atributo) y deja una sola pila
        visual con el orden de aparición real, aciertos y errores
        intercalados como siempre.
      */}
      <div className="fixed top-4 right-4 z-[300] flex flex-col gap-2 w-[min(380px,calc(100vw-2rem))] pointer-events-none">
        {toasts.map((t) => (
          <Toast key={t.id} toast={t} onClose={() => remove(t.id)} onLeft={() => unmount(t.id)} />
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

function Toast({
  toast: t,
  onClose,
  onLeft,
}: {
  toast: ToastItem;
  onClose: () => void;
  /** La animación de salida terminó: ya se puede desmontar. */
  onLeft: () => void;
}) {
  return (
    <div
      // Identificador NUEVO (no renombra ninguno): la OLA 2.4 mide los
      // mensajes de error contra el stack real, y hasta ahora la única
      // forma de encontrarlos era buscar su texto literal — lo que
      // obliga a que la prueba conozca de antemano el mensaje que está
      // auditando, que es justo lo contrario de auditarlo.
      data-testid="app-toast"
      data-toast-kind={t.kind}
      role={t.kind === 'error' ? 'alert' : 'status'}
      // Un error interrumpe (assertive): la persona tiene que enterarse YA,
      // no cuando termine de leer lo que estaba leyendo. Un acierto/info no
      // interrumpe (polite). El propio nodo que aparece lleva el atributo —
      // no hace falta que el CONTENEDOR sea la región viva.
      aria-live={t.kind === 'error' ? 'assertive' : 'polite'}
      aria-atomic="true"
      onAnimationEnd={(event) => {
        if (t.leaving && event.target === event.currentTarget) onLeft();
      }}
      // El contenedor flota sobre la barra de herramientas del CAD.
      // Una notificación transitoria NUNCA debe robar un clic a un
      // control real: la tarjeta no captura puntero y sólo el botón de
      // cerrar vuelve a habilitarlo.
      className={`${t.leaving ? 'valle-toast-out' : 'valle-toast-in'} pointer-events-none flex items-start gap-3 rounded-card px-4 py-3 bg-popover/85 backdrop-blur-xl border border-border shadow-floating`}
    >
      <ToastIcon kind={t.kind} />
      <div className="min-w-0 flex-1">
        {t.title && <p className="type-small font-semibold leading-tight text-foreground">{t.title}</p>}
        <p className="type-small text-muted-foreground leading-snug">{t.message}</p>
      </div>
      <button
        onClick={onClose}
        className="pointer-events-auto p-0.5 -mr-1 -mt-0.5 text-muted-foreground hover:text-foreground"
        aria-label="Cerrar"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function ToastIcon({ kind }: { kind: Kind }) {
  if (kind === 'error') return <AlertCircle aria-hidden="true" className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" />;
  if (kind === 'info') return <Info aria-hidden="true" className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />;
  return <CheckCircle2 aria-hidden="true" className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />;
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
