"use client";

/**
 * Los anfitriones de las paletas, sostenidos desde React sin ocupar un
 * `useState`.
 *
 * Mismo patrón que `use-command-engine.ts`: cada anfitrión se crea UNA vez
 * —el de ayudas al dibujo lleva dentro los puntos adquiridos por OTRACK, y
 * recrearlo en un render perdería el rastreo a medias— y la interfaz lo lee con
 * `useSyncExternalStore`.
 */
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { registerCadUiHandler } from "./palette-command-bus";
import {
  CadDraftSettingsHost,
  type CadDraftSettingsSnapshot,
} from "./draft-settings-host";
import { CadPaletteHost, type CadPaletteSnapshot } from "./palette-host";
import {
  CadLayerManagerHost,
  type CadLayerManagerSnapshot,
} from "./layer-manager-host";
import {
  CadStyleManagerHost,
  type CadStyleManagerSnapshot,
} from "./style-manager-host";

export function useCadDraftSettingsHost(): CadDraftSettingsHost {
  return useMemo(() => new CadDraftSettingsHost(), []);
}

/**
 * `getSnapshot` devuelve el MISMO objeto mientras nada cambie, así que sirve
 * igual como instantánea de servidor: en SSR nadie ha tocado los ajustes y el
 * objeto inicial es el correcto.
 */
export function useCadDraftSettings(
  host: CadDraftSettingsHost,
): CadDraftSettingsSnapshot {
  return useSyncExternalStore(
    host.subscribe,
    host.getSnapshot,
    host.getSnapshot,
  );
}

export function useCadLayerManagerHost(): CadLayerManagerHost {
  return useMemo(() => new CadLayerManagerHost(), []);
}

export function useCadLayerManager(
  host: CadLayerManagerHost,
): CadLayerManagerSnapshot {
  return useSyncExternalStore(
    host.subscribe,
    host.getSnapshot,
    host.getSnapshot,
  );
}

export function useCadStyleManagerHost(): CadStyleManagerHost {
  return useMemo(() => new CadStyleManagerHost(), []);
}

export function useCadStyleManager(
  host: CadStyleManagerHost,
): CadStyleManagerSnapshot {
  return useSyncExternalStore(
    host.subscribe,
    host.getSnapshot,
    host.getSnapshot,
  );
}

/**
 * Qué paleta está abierta, con el mismo trato: una instancia y una suscripción.
 *
 * Además se apunta en el puente de comandos, y eso es lo que hace que teclear
 * `DSETTINGS` abra el cuadro de ayudas al dibujo. El registro se hace en un
 * efecto y no en el cuerpo del render porque apuntarse es un efecto secundario:
 * hacerlo al renderizar dejaría manejadores vivos de árboles que React
 * descartó.
 *
 * Sólo se declaran los dos destinos que este anfitrión SABE servir. El gestor
 * de capas y la paleta de propiedades viven anclados y su visibilidad la
 * decide el editor, así que aquí no se anuncian: anunciarlos y no abrirlos
 * sería peor que decir que no están.
 */
export function useCadPaletteHost(): CadPaletteHost {
  const host = useMemo(() => new CadPaletteHost(), []);
  useEffect(() => {
    const unregister = [
      registerCadUiHandler("draft-settings", () => {
        host.show("draft-settings");
        return true;
      }),
      // OSNAP es la pestaña de referencias del MISMO cuadro; en AutoCAD también
      // abren los dos lo mismo.
      registerCadUiHandler("osnap", () => {
        host.show("draft-settings");
        return true;
      }),
      registerCadUiHandler("styles", () => {
        host.show("styles");
        return true;
      }),
    ];
    return () => {
      for (const off of unregister) off();
    };
  }, [host]);
  return host;
}

export function useCadPalette(host: CadPaletteHost): CadPaletteSnapshot {
  return useSyncExternalStore(
    host.subscribe,
    host.getSnapshot,
    host.getSnapshot,
  );
}

export {
  useCadPaperSpaces,
  useCadPaperSpacesHost,
  type CadPaperSpacesSnapshot,
} from "./paper-spaces-host";
