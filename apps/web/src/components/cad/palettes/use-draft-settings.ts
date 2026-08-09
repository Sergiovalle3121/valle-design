"use client";

/**
 * El anfitrión de las ayudas al dibujo, sostenido desde React sin ocupar un
 * `useState`.
 *
 * Mismo patrón que `use-command-engine.ts`: el anfitrión se crea UNA vez —lleva
 * dentro los puntos adquiridos por OTRACK, y recrearlo en un render perdería el
 * rastreo a medias— y la interfaz lo lee con `useSyncExternalStore`.
 */
import { useMemo, useSyncExternalStore } from "react";
import {
  CadDraftSettingsHost,
  type CadDraftSettingsSnapshot,
} from "./draft-settings-host";
import { CadPaletteHost, type CadPaletteSnapshot } from "./palette-host";

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
  return useSyncExternalStore(host.subscribe, host.getSnapshot, host.getSnapshot);
}

/** Qué paleta está abierta, con el mismo trato: una instancia y una suscripción. */
export function useCadPaletteHost(): CadPaletteHost {
  return useMemo(() => new CadPaletteHost(), []);
}

export function useCadPalette(host: CadPaletteHost): CadPaletteSnapshot {
  return useSyncExternalStore(host.subscribe, host.getSnapshot, host.getSnapshot);
}
