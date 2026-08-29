/**
 * PRECARGA DEL EDITOR DESDE EL TABLERO.
 *
 * Quien llega al tablero va a abrir un plano. Es lo único que se hace ahí. Y el
 * editor son ~3,8 MB de JavaScript que hoy empiezan a descargarse **en el
 * momento del clic**, con la persona ya mirando la pantalla de carga.
 *
 * Esta función los pide antes, mientras el navegador está ocioso. Si el usuario
 * abre un documento, el código ya está en caché y la espera desaparece; si no lo
 * abre, se han gastado unos segundos de red que no le costaron nada porque la
 * página ya era usable.
 *
 * ## Las tres condiciones para NO precargar
 *
 * Precargar megas por si acaso es de mala educación con la conexión de otro.
 * Se respeta lo que el navegador declara:
 *
 * 1. `saveData` — el usuario pidió explícitamente ahorrar datos. No se discute.
 * 2. Conexión `2g` o `slow-2g` — precargar ahí compite con lo que sí se está
 *    usando y hace la página MÁS lenta, no menos.
 * 3. Ya se precargó — `import()` cachea, pero comprobarlo evita programar
 *    trabajo ocioso una vez por render del tablero.
 *
 * La API de `navigator.connection` no existe en todos los navegadores; su
 * ausencia se trata como «adelante», que es el caso de la mayoría de los
 * escritorios.
 */

type ConexionDeRed = {
  saveData?: boolean;
  effectiveType?: string;
};

let yaPedido = false;

/** Sólo para las pruebas: olvida que ya se precargó. */
export function resetCadStudioPrefetch() {
  yaPedido = false;
}

/** ¿Debe este navegador gastar ancho de banda en adelantar el editor? */
export function shouldPrefetchCadStudio(conexion: ConexionDeRed | undefined): boolean {
  if (!conexion) return true;
  if (conexion.saveData === true) return false;
  const tipo = conexion.effectiveType;
  return tipo !== "2g" && tipo !== "slow-2g";
}

/**
 * Pide el chunk del editor cuando el navegador esté ocioso. Idempotente.
 *
 * Devuelve la función que cancela la petición ociosa, para que un tablero que se
 * desmonta antes de tiempo no deje trabajo programado.
 */
export function prefetchCadStudio(): () => void {
  if (typeof window === "undefined" || yaPedido) return () => {};
  const conexion = (navigator as Navigator & { connection?: ConexionDeRed })
    .connection;
  if (!shouldPrefetchCadStudio(conexion)) return () => {};
  yaPedido = true;

  const pedir = () => {
    // El fallo se traga a propósito: esto es una optimización, y una red que
    // falla aquí no debe ensuciar la consola ni, peor, escalar a un error de
    // aplicación. Si falla, el clic lo volverá a pedir.
    void import("@/components/cad/CadStudioHost").catch(() => {
      yaPedido = false;
    });
  };

  const ocioso = (
    window as Window & {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    }
  ).requestIdleCallback;

  if (typeof ocioso === "function") {
    const id = ocioso(pedir, { timeout: 4_000 });
    return () => {
      (window as Window & { cancelIdleCallback?: (id: number) => void })
        .cancelIdleCallback?.(id);
    };
  }
  // Safari no tiene `requestIdleCallback`. Dos segundos es tiempo de sobra para
  // que el tablero termine de pintar y pedir sus datos.
  const id = window.setTimeout(pedir, 2_000);
  return () => window.clearTimeout(id);
}
