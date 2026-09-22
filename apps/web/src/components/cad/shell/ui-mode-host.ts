"use client";

/**
 * Dónde vive el modo de interfaz (Esencial/Pro), fuera de React.
 *
 * Mismo patrón que `onboarding/tour-host.ts` y por la misma razón: el estado
 * tiene que sobrevivir a los remontajes del editor y no puede costar un
 * `useState` en `Layout3DEditor.tsx`, cuyo presupuesto sólo puede BAJAR. Aquí
 * vive la decisión; cada componente que cambia con el modo la lee por su
 * cuenta con `useCadUiMode()` (abajo, en este mismo archivo), sin props nuevas
 * del monolito.
 *
 * ## Por qué «pro» mientras no se ate
 *
 * `CadRibbon.spec.ts`, `CadCommandLine.spec.ts` y cualquier
 * `renderToStaticMarkup` aislado pintan el estudio sin `CadStudioHost`, y por
 * tanto sin `attach`. Con «pro» de fábrica siguen viendo exactamente lo de
 * siempre: la cinta entera. Esencial sólo aparece cuando alguien ATA el
 * anfitrión a una sesión y la preferencia lo dice.
 *
 * ## Por qué la URL no se persiste
 *
 * `?cadUi=pro` es el acto de un golden o de quien depura; convertirlo en
 * preferencia dejaría al siguiente visitante de /demo en Pro sin haberlo
 * pedido. Mientras la sesión venga forzada así, `set` cambia lo que se ve y
 * no toca el almacén.
 */
import { useSyncExternalStore } from "react";
import { cadWorkspaceStorageKey } from "@/lib/cad/cad-workspace";
import {
  cadUiModeStorageKey,
  decideInitialCadUiMode,
  readCadUiModeSearchOverride,
  readStoredCadUiMode,
  storeCadUiMode,
  type CadUiMode,
  type CadUiModeStorage,
} from "@/lib/cad/ui-mode-preference";

export interface CadUiModeAttachOptions {
  userId?: string | null;
  tenantId?: string | null;
  /** Lo que la página pide la primera vez: /demo pasa `"esencial"`. */
  defaultMode?: CadUiMode;
  /** `location.search`, con o sin `?`. Manda y no se persiste. */
  search?: string | null;
}

/**
 * El almacén. Una instancia por módulo: en un momento dado hay un estudio
 * montado, y dos modos paralelos harían que la cinta dijera una cosa y la
 * barra de estado otra.
 */
class CadUiModeHost {
  private mode: CadUiMode = "pro";
  /** `null` = sin atar. Distinto de «atado a la clave sin usuario». */
  private key: string | null = null;
  /** La sesión llegó con `?cadUi=`: lo que se cambie no se guarda. */
  private forcedBySearch = false;
  private readonly listeners = new Set<() => void>();

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Un literal: `useSyncExternalStore` compara por identidad y aquí no hay copia posible. */
  getSnapshot = (): CadUiMode => this.mode;

  /** Para el render en servidor y para todo lo que pinta sin atar: la cinta entera. */
  getServerSnapshot = (): CadUiMode => "pro";

  /**
   * Ata el almacén a una sesión y resuelve el modo: URL > clave > primera vez.
   *
   * Idempotente por clave: llamarla en cada render con el mismo usuario no
   * relee ni publica. Se llama en el cuerpo del render (un `useMemo` en
   * `CadStudioHost`) y NO en un efecto, porque `CadRibbon` lee el modo en su
   * primer render y un efecto correría después de los hijos: un cuadro en Pro
   * y el salto a Esencial un tick más tarde.
   *
   * Sin clave, la decisión inicial se PERSISTE en el acto: así «primera vez»
   * ocurre una sola vez, aunque el espacio de trabajo se escriba después.
   */
  attach = (options: CadUiModeAttachOptions = {}): CadUiMode => {
    const key = cadUiModeStorageKey(options.userId);
    if (key === this.key) return this.mode;
    this.key = key;
    const storage = localStorageOrNull();
    const forced = readCadUiModeSearchOverride(options.search);
    this.forcedBySearch = forced !== null;
    let next = forced ?? readStoredCadUiMode(storage, key);
    if (next === null) {
      next = decideInitialCadUiMode({
        storage,
        workspaceKey: cadWorkspaceStorageKey({
          tenantId: options.tenantId,
          userId: options.userId,
        }),
        forceEsencial: options.defaultMode === "esencial",
      });
      storeCadUiMode(storage, key, next);
    }
    if (next !== this.mode) {
      this.mode = next;
      this.publish();
    }
    return this.mode;
  };

  /** Publica y persiste, salvo que la sesión venga forzada por la URL o no esté atada. */
  set = (mode: CadUiMode): void => {
    if (mode === this.mode) return;
    this.mode = mode;
    if (this.key !== null && !this.forcedBySearch) {
      storeCadUiMode(localStorageOrNull(), this.key, mode);
    }
    this.publish();
  };

  toggle = (): void => {
    this.set(this.mode === "pro" ? "esencial" : "pro");
  };

  /** Sólo para las specs: vuelve al estado de recién cargado. */
  reset = (): void => {
    this.mode = "pro";
    this.key = null;
    this.forcedBySearch = false;
    this.publish();
  };

  private publish(): void {
    for (const listener of this.listeners) listener();
  }
}

/**
 * El `localStorage` real, o nada. FALLA ABIERTO: en una pestaña privada el
 * mero acceso puede lanzar, y perder el modo no puede tirar el estudio. Los
 * lectores de `ui-mode-preference.ts` ya protegen `getItem`/`setItem`.
 */
function localStorageOrNull(): CadUiModeStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export const cadUiModeHost = new CadUiModeHost();

/**
 * El modo leído desde React, sin ocupar un `useState`. La instantánea de
 * servidor es «pro» por diseño: en SSR y en cualquier render sin `attach` se
 * pinta la cinta entera, que es lo que los specs aislados esperan.
 */
export function useCadUiMode(): CadUiMode {
  return useSyncExternalStore(
    cadUiModeHost.subscribe,
    cadUiModeHost.getSnapshot,
    cadUiModeHost.getServerSnapshot,
  );
}
