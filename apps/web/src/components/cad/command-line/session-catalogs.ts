"use client";

/**
 * Todo lo que la SESIÓN recuerda y el documento no puede guardar.
 *
 * Variables de sistema, filtros de selección con nombre, tipos de línea
 * cargados, paletas de herramientas y SCU con nombre: cosas distintas con un
 * rasgo común — `CadDocument` no tiene sección para ninguna.
 *
 * Los ESTADOS DE CAPA dejaron de estar en esa lista con el esquema 9:
 * LAYERSTATE lee y escribe `document.layerStates` y sobrevive a la recarga.
 * El catálogo `layerStates` de aquí se conserva con OTRO trabajo: es la
 * memoria del aislamiento de LAYISO/LAYWALK (`settings-layer-tools.ts`), que
 * sí es de la sesión — dos personas con el mismo plano aíslan cada una lo
 * suyo.
 *
 * Están juntas aquí y no repartidas por hooks porque el motor las pide juntas
 * —un `CadSessionCatalogs`— y porque así hay UN sitio donde mirar qué
 * sobrevive a una recarga y qué no. Hoy: sólo las paletas de herramientas, que
 * se guardan por inquilino con la misma clave que las preferencias del espacio
 * de trabajo. Lo demás dura lo que la pestaña.
 *
 * No hay endpoint nuevo ni contrato tocado: se usa lo que ya hay.
 */
import { useEffect, useMemo } from "react";
import {
  registerCadUiHandler,
  pickCadFiles,
  pickCadTextFile,
} from "@/components/cad/palettes/palette-command-bus";
import { cadGeoBundleName, encodeCadGeoBundle } from "@/lib/cad/geo-import-bundle";
import {
  CAD_IMAGE_ATTACH_ACCEPT,
  CAD_IMAGE_ATTACH_MAX_BYTES,
  CAD_IMAGE_PAYLOAD_ERROR_KIND,
  CAD_IMAGE_PAYLOAD_KIND,
  cadImageDataUri,
  cadImageMimeFor,
  encodeCadImagePayload,
} from "@/lib/cad/image-attach-payload";
import type { CadSessionCatalogs } from "@/lib/cad/engine/command-types";
import { CadLayerStateCatalog } from "@/lib/cad/layer-states";
import {
  CadLinetypeCatalog,
  parseCadLinetypeLibrary,
} from "@/lib/cad/linetype-lin";
import { CadPlotStyleCatalog } from "@/lib/cad/plot/plot-style-catalog";
import { importCadPlotStyleTable } from "@/lib/cad/plot/plot-style-table";
import { cadPdfInflate } from "@/lib/cad/pdf/pdf-inflate";
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
  /** Tablas de plumas: las tres de fábrica más las que se carguen. */
  plotStyles: CadPlotStyleCatalog;
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
    const plotStyles = new CadPlotStyleCatalog();
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
      plotStyles,
      catalogs: {
        filters,
        layerStates,
        linetypes,
        toolPalettes,
        coordinateSystems,
        plotStyles,
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/**
 * Apunta los manejadores que necesitan leer un archivo.
 *
 * Son los TRES que no pueden vivir dentro del motor: SCRIPT necesita el texto
 * de un `.scr`, LINETYPE el de un `.lin` y DXFIN el del plano que acaba de
 * llegar por correo. Se sirven creando el selector de archivos del navegador al
 * vuelo, sin montar interfaz — así funcionan sin tocar el monolito, que en esta
 * ola pertenece a otra sesión.
 *
 * El de DXF es el que decide si un despacho se queda: es la puerta por la que
 * entra el archivo del estructurista.
 */
export function useCadFileCommandHandlers(
  session: CadSessionState,
  onScript: (name: string, text: string) => void,
  onDxf: (name: string, text: string) => void,
  onGeo: (name: string, text: string) => void,
  onImage: (name: string, text: string) => void,
): void {
  useEffect(() => {
    const unregister = [
      registerCadUiHandler("image-file", () => {
        // IMAGEATTACH (Ola H): el navegador decodifica la imagen UNA vez para
        // saber su tamaño y la entrega como `data:` en un sobre. Lo que no
        // se puede adjuntar vuelve como sobre de error, con su motivo, para
        // que la orden lo diga en la línea de comandos.
        void pickCadFiles(CAD_IMAGE_ATTACH_ACCEPT).then(async (files) => {
          const file = files[0];
          if (!file) return;
          onImage(file.name, await readCadImagePayload(file));
        });
        return true;
      }),
      registerCadUiHandler("geo-file", () => {
        // Los cuatro del shapefile y el GeoJSON, varios a la vez: el sobre
        // (`geo-import-bundle.ts`) los lleva por la misma puerta que el DXF.
        void pickCadFiles(".shp,.shx,.dbf,.prj,.cpg,.geojson,.json").then((files) => {
          if (files.length === 0) return;
          onGeo(cadGeoBundleName(files), encodeCadGeoBundle(files));
        });
        return true;
      }),
      registerCadUiHandler("dxf-file", () => {
        // `.dxf` a secas en el filtro: un DWG no se ofrece porque no se sabe
        // leer, y ofrecerlo para después rechazarlo sería prometer soporte que
        // no existe justo en el momento en que el usuario más lo cree.
        void pickCadTextFile(".dxf,text/plain").then((file) => {
          if (!file) return;
          onDxf(file.name, file.text);
        });
        return true;
      }),
      registerCadUiHandler("linetype-file", () => {
        void pickCadTextFile(".lin,text/plain").then((file) => {
          if (!file) return;
          session.linetypes.load(parseCadLinetypeLibrary(file.text));
        });
        return true;
      }),
      registerCadUiHandler("plot-style-file", () => {
        // El `.ctb` del despacho. Puede venir COMPRIMIDO detrás de la cabecera
        // de AutoCAD, así que llega en bytes y el inflador es el mismo que ya
        // descomprime los flujos de un PDF: uno solo en el árbol, no dos.
        void pickCadFiles(".ctb,.stb").then((files) => {
          const file = files[0];
          if (!file) return;
          const name = file.name.replace(/\.(ctb|stb)$/i, "");
          try {
            const imported = importCadPlotStyleTable(file.bytes, name, {
              inflate: (data) => cadPdfInflate(data).data,
              deflate: () => {
                // Este camino sólo IMPORTA. Exportar una tabla comprimida es
                // otra orden y todavía no existe: prometerlo aquí sería un
                // éxito falso esperando a que alguien lo llame.
                throw new Error("Comprimir una tabla de plumas no está implementado.");
              },
            });
            session.plotStyles.load(imported.table);
          } catch {
            // Un archivo ilegible no entra y no rompe la sesión; el usuario lo
            // ve al listar, que es donde va a mirar.
          }
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
  }, [session, onScript, onDxf, onGeo, onImage]);
}

/** El sobre de IMAGEATTACH a partir del archivo elegido, o el motivo por el que no. */
async function readCadImagePayload(file: { name: string; bytes: Uint8Array }): Promise<string> {
  const reject = (reason: string) => encodeCadImagePayload({ kind: CAD_IMAGE_PAYLOAD_ERROR_KIND, name: file.name, reason });
  const mime = cadImageMimeFor(file.name);
  if (!mime) return reject("no es PNG, JPEG, GIF, WebP ni BMP.");
  if (file.bytes.byteLength > CAD_IMAGE_ATTACH_MAX_BYTES)
    return reject(`pesa ${(file.bytes.byteLength / 1_000_000).toFixed(1)} MB y el tope es ${CAD_IMAGE_ATTACH_MAX_BYTES / 1_000_000} MB; reduce la resolución del escaneo.`);
  if (typeof createImageBitmap === "undefined") return reject("este navegador no sabe decodificar imágenes.");
  try {
    const bitmap = await createImageBitmap(new Blob([file.bytes as BlobPart], { type: mime }));
    const { width, height } = bitmap;
    bitmap.close();
    if (!(width > 0 && height > 0)) return reject("el archivo no tiene píxeles.");
    return encodeCadImagePayload({ kind: CAD_IMAGE_PAYLOAD_KIND, name: file.name, dataUri: cadImageDataUri(mime, file.bytes), width, height });
  } catch {
    return reject("el archivo no se pudo decodificar como imagen.");
  }
}
