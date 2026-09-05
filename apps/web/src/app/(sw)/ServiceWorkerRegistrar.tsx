"use client";

/**
 * EL REGISTRO DEL SERVICE WORKER, Y EL AVISO DE VERSIÓN NUEVA.
 *
 * Este componente CABLEA; no decide. Traduce los eventos del navegador
 * (`updatefound`, `statechange`, `controllerchange`, el rechazo de `register`)
 * a los eventos de `update-lifecycle.ts`, ejecuta los efectos que ese reductor
 * devuelve —`postMessage`, `location.reload`, un temporizador— y pinta el aviso
 * cuando la fase lo pide. Toda la lógica que se puede equivocar vive allí,
 * donde un spec la puede ejercer sin navegador.
 *
 * ## Las cuatro decisiones que sí son de este archivo
 *
 * 1. **Se engancha a `load`.** Registrar durante el primer render compite por
 *    ancho de banda con el JavaScript que el usuario está esperando, y el
 *    worker no sirve de nada hasta la SIGUIENTE visita de todas formas: la
 *    página que lo instala ya se descargó sin él.
 * 2. **En desarrollo se DESREGISTRA** salvo que esté la bandera
 *    (`NEXT_PUBLIC_SW_EN_DESARROLLO=1`). Ver `debeRegistrar`: un worker
 *    instalado una tarde en `localhost` sobrevive a todos los `next dev`
 *    siguientes y sirve el cascarón de aquella tarde, sin error, sólo con
 *    cambios que «no se aplican».
 * 3. **El aviso vive en un subcomponente.** `useTranslations` necesita el
 *    proveedor de next-intl; el REGISTRO no necesita nada. Separándolos, el
 *    worker se registra igual aunque el aviso no se pueda pintar, en vez de que
 *    un proveedor ausente se lleve por delante la única pieza que importa.
 * 4. **No se pinta nada mientras no haya versión nueva.** Sin aviso, sin
 *    marcador, sin nodo: el caso normal —99 de cada 100 cargas— es `null`.
 *
 * ## Lo que este componente NO hace
 *
 * No pide `registro.update()` por su cuenta ni con temporizador. El navegador
 * ya comprueba el script en cada navegación (y como mucho cada 24 h), y añadir
 * un sondeo propio sería tráfico constante para adelantar un aviso que sólo
 * sirve para recargar una pestaña que ya funciona.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { RefreshCw } from "lucide-react";
import { Button, Surface } from "@/components/ui";
import { SW_MENSAJE_SALTAR_ESPERA, SW_ROUTE } from "./service-worker-policy";
import {
  ESTADO_INICIAL,
  avisoVisible,
  debeRegistrar,
  siguiente,
  type EstadoSW,
  type EventoSW,
} from "./update-lifecycle";

export function ServiceWorkerRegistrar() {
  const [estado, setEstado] = useState<EstadoSW>(ESTADO_INICIAL);

  /**
   * El estado TAMBIÉN en una ref. No es duplicación por comodidad: los oyentes
   * del service worker se registran una sola vez y viven toda la sesión, así
   * que si leyeran `estado` leerían el del render en que se crearon. La ref es
   * la única copia que siempre está al día dentro de un oyente viejo.
   */
  const estadoRef = useRef<EstadoSW>(ESTADO_INICIAL);
  const registroRef = useRef<ServiceWorkerRegistration | null>(null);
  const plazoRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * La ref del propio despachador. El único evento que nace DENTRO del
   * componente es `plazo-agotado`, y lo arma un temporizador que tiene que
   * poder llamar al despachador que exista cuando venza; la ref evita que la
   * función se refiera a sí misma por su propio nombre, que es legal pero se
   * lee peor y ata el orden de declaración.
   */
  const despacharRef = useRef<(evento: EventoSW) => void>(() => {});

  const despachar = useCallback((evento: EventoSW) => {
    const paso = siguiente(estadoRef.current, evento);
    estadoRef.current = paso.estado;
    setEstado(paso.estado);
    for (const efecto of paso.efectos) {
      switch (efecto.tipo) {
        case "saltar-espera":
          /* Al worker EN ESPERA, no al controlador: el que tiene que saltarse
             la espera es el nuevo. El controlador actual ignoraría el mensaje
             (su `skipWaiting` no significa nada) y el relevo no llegaría. */
          registroRef.current?.waiting?.postMessage(SW_MENSAJE_SALTAR_ESPERA);
          break;
        case "armar-plazo":
          if (plazoRef.current !== null) clearTimeout(plazoRef.current);
          plazoRef.current = setTimeout(
            () => despacharRef.current({ tipo: "plazo-agotado" }),
            efecto.ms,
          );
          break;
        case "recargar":
          if (plazoRef.current !== null) clearTimeout(plazoRef.current);
          plazoRef.current = null;
          window.location.reload();
          break;
      }
    }
  }, []);

  useEffect(() => {
    despacharRef.current = despachar;
  }, [despachar]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      despachar({ tipo: "sin-soporte" });
      return;
    }

    const contenedor = navigator.serviceWorker;
    const limpiezas: Array<() => void> = [];
    let desmontado = false;

    /* `controllerchange` se escucha DESDE EL PRINCIPIO, antes incluso de
       registrar: el relevo puede llegar de otra pestaña que ya tenía el worker
       nuevo instalado, y ese aviso llega igual a esta página. */
    const alCambiarControlador = () => despachar({ tipo: "cambio-de-controlador" });
    contenedor.addEventListener("controllerchange", alCambiarControlador);
    limpiezas.push(() =>
      contenedor.removeEventListener("controllerchange", alCambiarControlador),
    );

    /** Sigue al worker entrante hasta que se pueda usar, o hasta que muera. */
    const vigilar = (worker: ServiceWorker | null) => {
      if (!worker) return;
      const revisar = () => {
        if (worker.state === "redundant") {
          despachar({ tipo: "worker-descartado" });
          return;
        }
        /* `installed` basta para avisar. Este worker salta la espera en
           `install`, así que normalmente pasa de largo hacia `activated`; se
           aceptan las tres para no depender de qué política de relevo tenga el
           worker que hay del otro lado. */
        if (
          worker.state === "installed" ||
          worker.state === "activating" ||
          worker.state === "activated"
        ) {
          despachar({ tipo: "worker-listo" });
        }
      };
      revisar();
      worker.addEventListener("statechange", revisar);
      limpiezas.push(() => worker.removeEventListener("statechange", revisar));
    };

    const arrancar = async () => {
      /* Desarrollo sin bandera: se limpia lo que hubiera y se para aquí. */
      if (!debeRegistrar(process.env.NODE_ENV, process.env.NEXT_PUBLIC_SW_EN_DESARROLLO)) {
        try {
          const registros = await contenedor.getRegistrations();
          await Promise.all(registros.map((registro) => registro.unregister()));
        } catch {
          /* Un navegador que no deja enumerar registros tampoco los tenía.
             Callar aquí es correcto: no hay nada que el usuario pueda hacer. */
        }
        if (!desmontado) despachar({ tipo: "desactivado-en-desarrollo" });
        return;
      }

      try {
        const registro = await contenedor.register(SW_ROUTE, { scope: "/" });
        if (desmontado) return;
        registroRef.current = registro;
        /* La FOTO del registro antes de escuchar nada: `register()` puede
           resolver cuando el worker nuevo ya estaba instalándose, o con uno en
           espera de una visita anterior. Esos dos casos no vuelven a emitir
           `updatefound`, así que sin esta foto se perderían. */
        despachar({
          tipo: "registro-aceptado",
          controlado: Boolean(contenedor.controller),
          hayEsperando: Boolean(registro.waiting),
          hayInstalando: Boolean(registro.installing),
        });
        vigilar(registro.installing);

        const alEncontrarActualizacion = () => {
          despachar({ tipo: "worker-entrante" });
          vigilar(registro.installing);
        };
        registro.addEventListener("updatefound", alEncontrarActualizacion);
        limpiezas.push(() =>
          registro.removeEventListener("updatefound", alEncontrarActualizacion),
        );
      } catch (error) {
        /* NO se relanza y NO se le enseña a nadie. Sin worker la aplicación
           funciona igual mientras haya red; lo único que se pierde es el
           cascarón sin conexión. Un error visible aquí sería alarmar por algo
           que el usuario no puede arreglar. */
        if (!desmontado) {
          despachar({ tipo: "registro-rechazado", detalle: String(error) });
        }
      }
    };

    if (document.readyState === "complete") {
      void arrancar();
    } else {
      const alCargar = () => void arrancar();
      window.addEventListener("load", alCargar, { once: true });
      limpiezas.push(() => window.removeEventListener("load", alCargar));
    }

    return () => {
      desmontado = true;
      if (plazoRef.current !== null) clearTimeout(plazoRef.current);
      plazoRef.current = null;
      for (const limpiar of limpiezas) limpiar();
    };
  }, [despachar]);

  if (!avisoVisible(estado)) return null;

  return (
    <AvisoDeVersionNueva
      recargando={estado.fase === "recargando"}
      alRecargar={() =>
        despachar({
          tipo: "recarga-pedida",
          hayEsperando: Boolean(registroRef.current?.waiting),
        })
      }
      alDescartar={() => despachar({ tipo: "aviso-descartado" })}
    />
  );
}

/**
 * EL AVISO. Ni una palabra escrita en este archivo: todo sale del namespace
 * `appUpdate` de los dos catálogos, y `src/i18n/key-driven-copy.spec.ts` exige
 * que tengan el mismo juego de claves y que ninguna se quede muerta.
 *
 * Va abajo a la izquierda a propósito: los toasts del producto entran arriba a
 * la derecha (`ToastContext`), y este aviso no es un toast —no caduca, espera—.
 * `role="status"` con `aria-live="polite"` lo anuncia sin interrumpir lo que el
 * lector de pantalla esté leyendo, que es exactamente el tono que merece: hay
 * una versión nueva, no hay ninguna urgencia.
 */
function AvisoDeVersionNueva({
  recargando,
  alRecargar,
  alDescartar,
}: {
  recargando: boolean;
  alRecargar: () => void;
  alDescartar: () => void;
}) {
  const t = useTranslations("appUpdate");

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[200] flex justify-center p-4 sm:justify-start sm:p-6">
      <Surface
        role="status"
        aria-live="polite"
        elevation="floating"
        padded="sm"
        className="pointer-events-auto w-[min(24rem,100%)]"
      >
        <div className="flex gap-3">
          <RefreshCw aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary-ink" />
          <div className="min-w-0">
            <p className="type-small font-semibold text-foreground">{t("title")}</p>
            <p className="type-small mt-1 text-muted-foreground">{t("body")}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="primary" loading={recargando} onClick={alRecargar}>
                {t("reloadAction")}
              </Button>
              <Button size="sm" variant="ghost" onClick={alDescartar}>
                {t("dismissAction")}
              </Button>
            </div>
          </div>
        </div>
      </Surface>
    </div>
  );
}
