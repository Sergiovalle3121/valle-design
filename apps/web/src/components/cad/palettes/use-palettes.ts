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
import { useMemo, useSyncExternalStore } from "react";
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

/** Qué paleta está abierta, con el mismo trato: una instancia y una suscripción. */
export function useCadPaletteHost(): CadPaletteHost {
  return useMemo(() => new CadPaletteHost(), []);
}

export function useCadPalette(host: CadPaletteHost): CadPaletteSnapshot {
  return useSyncExternalStore(
    host.subscribe,
    host.getSnapshot,
    host.getSnapshot,
  );
}
