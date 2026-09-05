/**
 * EL CICLO DE ACTUALIZACIÓN DEL SERVICE WORKER, COMO REDUCTOR PURO.
 *
 * Aquí no se registra nada, no se escucha nada y no se recarga nada: se DECIDE.
 * `ServiceWorkerRegistrar.tsx` traduce los eventos del navegador a los eventos
 * de este módulo, ejecuta los efectos que devuelve y pinta el aviso; todo lo
 * demás —cuándo hay versión nueva, cuándo se recarga y, sobre todo, cuándo NO
 * se recarga— vive en esta función.
 *
 * ## Por qué separado, si son treinta líneas de `switch`
 *
 * Porque este ciclo no se puede probar en su sitio. Las tres piezas que lo
 * mueven —`updatefound`, `statechange` y `controllerchange`— sólo las emite un
 * service worker de verdad instalándose sobre otro service worker de verdad, y
 * eso pide un navegador, dos despliegues distintos y una espera. No hay forma de
 * escribir esa prueba con `tsx` y `node:assert`. Lo que sí se puede probar es la
 * DECISIÓN, si la decisión no toca el DOM: aquí los eventos se inyectan y los
 * efectos se devuelven como datos.
 *
 * ## Los dos defectos clásicos de este patrón, y dónde se paran
 *
 * 1. **EL BUCLE DE RECARGA.** La receta que circula por todas partes es
 *    «recarga en `controllerchange`». Como `activate` del worker llama a
 *    `clients.claim()`, la página recibe ese evento en cuanto el worker nuevo
 *    toma el mando; si además el worker nuevo vuelve a activarse por cualquier
 *    motivo, la página recargada recibe otro `controllerchange` y recarga otra
 *    vez. La guarda es `recargado`: una sola recarga por vida de la página, y
 *    se aplica en UN sitio (`conRecarga`) para que no haya una segunda salida
 *    que se olvide de mirarla.
 *
 * 2. **LA RECARGA QUE NADIE PIDIÓ.** Peor que el bucle. Este worker llama a
 *    `skipWaiting()` dentro de `install` (está razonado en
 *    `service-worker-source.ts`: la pantalla de emergencia conviene tenerla
 *    cuanto antes y no hay migración de datos que coordinar), así que el
 *    relevo ocurre SOLO, sin que nadie pulse nada. Una página que recargue en
 *    cada `controllerchange` se recarga sola encima de un plano abierto. En un
 *    CAD eso no es una molestia: es el trabajo de la última media hora que se
 *    va con el `undo` en RAM. Por eso el reductor sólo recarga si la recarga
 *    SE PIDIÓ (`recarga-pedida` mueve la fase a `recargando`, y sólo desde ahí
 *    `cambio-de-controlador` recarga).
 *
 * ## La otra regla que no es obvia
 *
 * **La primera instalación no avisa.** Un worker que se instala sin haber
 * ningún controlador vivo no es una actualización: es la primera visita de este
 * navegador. Decirle «hay una versión nueva» a alguien que acaba de abrir el
 * producto por primera vez es mentira y encima confunde. Por eso `controlado`
 * —había controlador cuando la página cargó— es lo primero que se mira.
 */

/** Las fases visibles del ciclo. `sondeando` es antes de saber nada. */
export type FaseSW =
  | "sondeando"
  | "sin-service-worker"
  | "al-dia"
  | "instalando"
  | "version-nueva"
  | "recargando";

/** Por qué no hay service worker. Sólo tiene valor en la fase homónima. */
export type MotivoSinWorker =
  | "sin-soporte"
  | "registro-rechazado"
  | "desactivado-en-desarrollo";

export interface EstadoSW {
  readonly fase: FaseSW;
  /** Por qué no hay worker; `null` mientras lo haya. */
  readonly motivo: MotivoSinWorker | null;
  /** El texto del rechazo, para diagnóstico. Nunca se pinta en la UI. */
  readonly detalle: string | null;
  /** ¿Había un controlador cuando esta página cargó? */
  readonly controlado: boolean;
  /** Ya se disparó una recarga. La guarda contra el bucle. */
  readonly recargado: boolean;
  /** El usuario cerró el aviso. Se reabre solo si llega OTRA versión. */
  readonly avisoDescartado: boolean;
}

/**
 * Los eventos que el componente inyecta. Ninguno lleva objetos del navegador:
 * un `ServiceWorkerRegistration` dentro de un evento obligaría a este módulo a
 * conocer el DOM y al spec a fabricarlo.
 */
export type EventoSW =
  /** El navegador no trae `serviceWorker` (Firefox en privado, navegador viejo). */
  | { tipo: "sin-soporte" }
  /** `register()` resolvió. Los tres booleanos son la foto del registro. */
  | {
      tipo: "registro-aceptado";
      controlado: boolean;
      hayEsperando: boolean;
      hayInstalando: boolean;
    }
  /** `register()` rechazó: MIME equivocado, ámbito prohibido, cookies bloqueadas. */
  | { tipo: "registro-rechazado"; detalle: string }
  /** Desarrollo sin la bandera: se desregistró lo que hubiera. */
  | { tipo: "desactivado-en-desarrollo" }
  /** `updatefound`: hay un worker nuevo instalándose. */
  | { tipo: "worker-entrante" }
  /** El worker entrante llegó a `installed` (o más allá): ya se puede usar. */
  | { tipo: "worker-listo" }
  /** El worker entrante murió en `redundant`: su `install` falló. */
  | { tipo: "worker-descartado" }
  /** `controllerchange`: otro worker tomó el mando de esta página. */
  | { tipo: "cambio-de-controlador" }
  /** El usuario pulsó «recargar». `hayEsperando`, en ese instante. */
  | { tipo: "recarga-pedida"; hayEsperando: boolean }
  /** El usuario cerró el aviso sin recargar. */
  | { tipo: "aviso-descartado" }
  /** Se pidió el relevo y no llegó a tiempo. */
  | { tipo: "plazo-agotado" };

/**
 * Lo que el componente tiene que HACER. Son datos, no funciones: un efecto que
 * fuera un callback no se podría comparar en un `assert`, y entonces el spec
 * volvería a probar sólo la mitad barata.
 */
export type EfectoSW =
  /** `postMessage(SW_MENSAJE_SALTAR_ESPERA)` al worker en espera. */
  | { tipo: "saltar-espera" }
  /** `location.reload()`. Como mucho una vez por vida de la página. */
  | { tipo: "recargar" }
  /** Armar el plazo de `ms` que acaba en `plazo-agotado`. */
  | { tipo: "armar-plazo"; ms: number };

export interface PasoSW {
  readonly estado: EstadoSW;
  readonly efectos: readonly EfectoSW[];
}

export const ESTADO_INICIAL: EstadoSW = {
  fase: "sondeando",
  motivo: null,
  detalle: null,
  controlado: false,
  recargado: false,
  avisoDescartado: false,
};

/**
 * Cuánto se espera al relevo antes de recargar a secas.
 *
 * Se le pide al worker en espera que salte la espera y se aguarda su
 * `controllerchange`, que en la práctica llega en decenas de milisegundos. El
 * plazo existe para el caso en que NO llegue —un worker en espera que otra
 * pestaña vieja mantiene bloqueado, o un navegador que ignora el mensaje— y su
 * único trabajo es que el botón no se quede girando para siempre. Cuatro
 * segundos es tiempo de sobra para el camino normal y espera corta para el
 * roto; al vencer se recarga igual, que es lo que el usuario pidió.
 */
export const PLAZO_DE_RELEVO_MS = 4_000;

/**
 * ¿Se registra el worker en este entorno?
 *
 * En producción, siempre. En desarrollo, sólo con la bandera puesta — y si no
 * está, el componente además DESREGISTRA lo que hubiera. El motivo es una
 * cicatriz conocida de cualquiera que haya servido una PWA desde `localhost`:
 * el worker se instala una tarde, sobrevive a todos los `next dev` siguientes y
 * empieza a servir el cascarón de aquella tarde. El síntoma es peor que el
 * fallo: no hay error, sólo cambios que «no se aplican» y una tarde perdida
 * antes de acordarse de mirar `chrome://serviceworker-internals`.
 *
 * La bandera existe porque probar el worker de verdad ANTES de desplegar es
 * legítimo: `next build && next start` con `NEXT_PUBLIC_SW_EN_DESARROLLO=1`.
 */
export const BANDERA_SW_EN_DESARROLLO = "NEXT_PUBLIC_SW_EN_DESARROLLO";

export function debeRegistrar(
  entorno: string | undefined,
  bandera: string | undefined,
): boolean {
  if (entorno === "production") return true;
  return bandera === "1" || bandera === "true";
}

/** ¿Se pinta el aviso de versión nueva? */
export function avisoVisible(estado: EstadoSW): boolean {
  if (estado.avisoDescartado) return false;
  return estado.fase === "version-nueva" || estado.fase === "recargando";
}

/** Sin cambios y sin efectos. */
const quieto = (estado: EstadoSW): PasoSW => ({ estado, efectos: [] });

/**
 * LA ÚNICA PUERTA POR LA QUE SALE UNA RECARGA.
 *
 * Todas las rutas que quieren recargar pasan por aquí, y aquí se mira
 * `recargado`. Tener la guarda en un solo sitio es lo que hace que la invariante
 * «nunca dos recargas» se pueda probar de una vez para todos los eventos, en vez
 * de comprobar caso por caso y descubrir el que falta cuando ya está en
 * producción recargándole el plano a alguien en bucle.
 */
const conRecarga = (estado: EstadoSW): PasoSW =>
  estado.recargado
    ? quieto(estado)
    : {
        estado: { ...estado, fase: "recargando", recargado: true },
        efectos: [{ tipo: "recargar" }],
      };

const sinWorker = (
  estado: EstadoSW,
  motivo: MotivoSinWorker,
  detalle: string | null = null,
): PasoSW => ({
  estado: { ...estado, fase: "sin-service-worker", motivo, detalle },
  efectos: [],
});

/**
 * EL REDUCTOR. Estado + evento → estado + efectos. No lee nada del entorno, no
 * escribe nada fuera, no muta el estado que recibe.
 */
export function siguiente(estado: EstadoSW, evento: EventoSW): PasoSW {
  switch (evento.tipo) {
    case "sin-soporte":
      return sinWorker(estado, "sin-soporte");

    case "desactivado-en-desarrollo":
      return sinWorker(estado, "desactivado-en-desarrollo");

    /* El rechazo NO lanza y NO se le enseña a nadie. Un `register()` que falla
       —MIME equivocado, ámbito prohibido, almacenamiento bloqueado por el
       navegador— deja la aplicación exactamente como estaba: con red funciona
       todo, sin red se ve la página de error del navegador. Es una degradación,
       no una avería, y un diálogo de error por ella sería asustar al usuario
       con algo que no puede arreglar. */
    case "registro-rechazado":
      return sinWorker(estado, "registro-rechazado", evento.detalle);

    /* La foto del registro. `register()` puede resolver DESPUÉS de que el
       navegador ya haya empezado a instalar el worker nuevo —o con uno en
       espera de una visita anterior—, y esos dos casos no emiten `updatefound`
       para nosotros: se perderían si sólo escucháramos eventos. */
    case "registro-aceptado": {
      if (estado.fase !== "sondeando") return quieto(estado);
      const base = { ...estado, controlado: evento.controlado, motivo: null };
      if (!evento.controlado) return quieto({ ...base, fase: "al-dia" });
      if (evento.hayEsperando) return quieto({ ...base, fase: "version-nueva" });
      if (evento.hayInstalando) return quieto({ ...base, fase: "instalando" });
      return quieto({ ...base, fase: "al-dia" });
    }

    /* `updatefound` sin controlador es la PRIMERA instalación anunciándose a sí
       misma. No hay nada que actualizar y no se avisa. */
    case "worker-entrante":
      if (!estado.controlado) return quieto(estado);
      if (estado.fase === "recargando") return quieto(estado);
      return quieto({ ...estado, fase: "instalando", avisoDescartado: false });

    case "worker-listo":
      if (estado.fase !== "instalando") return quieto(estado);
      return quieto({ ...estado, fase: "version-nueva" });

    /* El worker entrante murió en `redundant`: su `install` falló. Con este
       worker eso significa que una URL del cascarón no respondió 200 (el
       precacheo es todo-o-nada). Lo que había sigue sirviendo, así que se
       vuelve a «al día» y se retira el aviso: ofrecer recargar hacia una
       versión que no llegó a instalarse es ofrecer una recarga inútil. */
    case "worker-descartado":
      if (estado.fase !== "instalando" && estado.fase !== "version-nueva") {
        return quieto(estado);
      }
      return quieto({ ...estado, fase: "al-dia" });

    case "cambio-de-controlador": {
      /* Se pidió: éste es el relevo que esperábamos. */
      if (estado.fase === "recargando") return conRecarga(estado);
      /* No se pidió, y había controlador: el worker nuevo tomó el mando solo.
         NO se recarga —ver el defecto 2 de la cabecera—, se avisa. */
      if (estado.controlado) {
        return quieto({ ...estado, fase: "version-nueva" });
      }
      /* No había controlador: es el `clients.claim()` de la primera
         instalación adoptando esta pestaña. Ni aviso ni recarga; a partir de
         ahora esta página sí está controlada. */
      return quieto({ ...estado, fase: "al-dia", controlado: true });
    }

    case "recarga-pedida": {
      /* Sólo desde el aviso. Un segundo clic mientras ya se está recargando no
         puede disparar otra recarga (y `conRecarga` lo pararía igual). */
      if (estado.fase !== "version-nueva") return quieto(estado);
      /* Hay un worker en espera: se le pide el relevo y se aguarda su
         `controllerchange`, para que la página nueva arranque ya bajo el worker
         nuevo. Sin el plazo, un relevo que no llega deja el botón girando. */
      if (evento.hayEsperando) {
        return {
          estado: { ...estado, fase: "recargando" },
          efectos: [{ tipo: "saltar-espera" }, { tipo: "armar-plazo", ms: PLAZO_DE_RELEVO_MS }],
        };
      }
      /* No hay nadie en espera porque el worker nuevo YA tomó el mando por su
         cuenta (`skipWaiting` en `install`). Entonces no hay relevo que
         esperar: recargar es todo lo que falta. */
      return conRecarga(estado);
    }

    case "plazo-agotado":
      if (estado.fase !== "recargando") return quieto(estado);
      return conRecarga(estado);

    case "aviso-descartado":
      if (!avisoVisible(estado)) return quieto(estado);
      return quieto({ ...estado, avisoDescartado: true });
  }
}
