"use client";

/**
 * Todo lo que la SESIÓN recuerda y el documento no puede guardar.
 *
 * Variables de sistema, filtros de selección con nombre, estados de capa,
 * tipos de línea cargados, paletas de herramientas y SCU con nombre. Seis
 * cosas distintas con un rasgo común: `CadDocument` no tiene sección para
 * ninguna, y `cad-document.ts` pertenece a otra sesión en esta ola.
 *
 * Están juntas aquí y no repartidas por seis hooks porque el motor las pide
 * juntas —un `CadSessionCatalogs`— y porque así hay UN sitio donde mirar qué
 * sobrevive a una recarga y qué no. Hoy: sólo las paletas de herramientas, que
 * se guardan por inquilino con la misma clave que las preferencias del espacio
 * de trabajo. Lo demás dura lo que la pestaña.
 *
 * No hay endpoint nuevo ni contrato tocado: se usa lo que ya hay.
 */
import { useEffect, useMemo } from "react";
import {
  registerCadUiHandler,
  pickCadTextFile,
} from "@/components/cad/palettes/palette-command-bus";
import type { CadSessionCatalogs } from "@/lib/cad/engine/command-types";
import { CadLayerStateCatalog } from "@/lib/cad/layer-states";
import {
  CadLinetypeCatalog,
  parseCadLinetypeLibrary,
} from "@/lib/cad/linetype-lin";
import { CadFilterCatalog } from "@/lib/cad/selection/selection-filter";
import { CadSystemVariableStore } from "@/lib/cad/system-variables";
import {
  CadToolPaletteCatalog,
  loadCadToolPalettes,
  saveCadToolPalettes,
} from "@/lib/cad/tool-palettes";
import { CadUcsCatalog } from "@/lib/cad/ucs";

export interface CadSessionState {
  variables: CadSystemVariableStore;
  catalogs: CadSessionCatalogs;
  linetypes: CadLinetypeCatalog;
  toolPalettes: CadToolPaletteCatalog;
}

export interface CadSessionScope {
  tenantId?: string | null;
  userId?: string | null;
}

/** Almacén del navegador, o uno de mentira en servidor. */
function storage(): { getItem(key: string): string | null; setItem(key: string, value: string): void } {
  if (typeof window === "undefined" || !window.localStorage)
    return { getItem: () => null, setItem: () => {} };
  return window.localStorage;
}

/**
 * Crea el estado de sesión UNA vez.
 *
 * Sin dependencias en el `useMemo` a propósito, igual que el anfitrión del
 * motor: recrear los catálogos en un render borraría los filtros que el usuario
 * acaba de guardar. El ámbito se lee al construir; cambiar de inquilino cambia
 * de sesión entera, no de catálogo.
 */
export function useCadSessionState(scope: CadSessionScope = {}): CadSessionState {
  return useMemo(() => {
    const variables = new CadSystemVariableStore();
    const filters = new CadFilterCatalog();
    const layerStates = new CadLayerStateCatalog();
    const linetypes = new CadLinetypeCatalog();
    const coordinateSystems = new CadUcsCatalog();
    const toolPalettes = new CadToolPaletteCatalog(
      loadCadToolPalettes(storage(), scope),
      (palettes) => {
        saveCadToolPalettes(storage(), scope, palettes);
      },
    );
    return {
      variables,
      linetypes,
      toolPalettes,
      catalogs: { filters, layerStates, linetypes, toolPalettes, coordinateSystems },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/**
 * Apunta los manejadores que necesitan leer un archivo.
 *
 * Son los dos que no pueden vivir dentro del motor: SCRIPT necesita el texto de
 * un `.scr` y LINETYPE el de un `.lin`. Se sirven creando el selector de
 * archivos del navegador al vuelo, sin montar interfaz — así funcionan sin
 * tocar el monolito, que en esta ola pertenece a otra sesión.
 */
export function useCadFileCommandHandlers(
  session: CadSessionState,
  onScript: (name: string, text: string) => void,
): void {
  useEffect(() => {
    const unregister = [
      registerCadUiHandler("linetype-file", () => {
        void pickCadTextFile(".lin,text/plain").then((file) => {
          if (!file) return;
          session.linetypes.load(parseCadLinetypeLibrary(file.text));
        });
        return true;
      }),
      registerCadUiHandler("script-file", () => {
        void pickCadTextFile(".scr,text/plain").then((file) => {
          if (!file) return;
          onScript(file.name, file.text);
        });
        return true;
      }),
    ];
    return () => {
      for (const off of unregister) off();
    };
  }, [session, onScript]);
}
