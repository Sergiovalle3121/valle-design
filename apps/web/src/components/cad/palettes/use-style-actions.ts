"use client";

/**
 * Acciones del gestor de estilos.
 *
 * Crear, escribir y borrar sobre `document.styles`, siempre por la MISMA
 * puerta canónica que usa el resto del editor: quien llama pasa `commit`, y
 * aquí no se toca ni la red ni el documento por cuenta propia.
 *
 * También cuenta las REFERENCIAS de cada estilo, que es lo que permite negarse
 * a borrar uno que está en uso. Las entidades guardan el nombre del estilo, no
 * un identificador: borrar el estilo que usan las dejaría apuntando a algo que
 * ya no existe, y el dibujo cambiaría de aspecto sin que nadie lo pidiera.
 */
import { useCallback, useRef } from "react";
import { commitChange, type CadDocument } from "@/lib/cad/cad-document";
import type { CadStyleManagerHost } from "./style-manager-host";
import {
  cadStyleFamilyDescriptor,
  createCadStyle,
  deleteCadStyle,
  writeCadStyleValue,
  type CadStyleFamily,
  type CadStyleValue,
} from "./style-manager-model";

/** Tipo de entidad que referencia cada familia por su campo `style`. */
const REFERENCING_TYPE: Partial<Record<CadStyleFamily, string>> = {
  text: "mtext",
  dimension: "dimension",
  mleader: "mleader",
};

/**
 * Cuántas entidades usan cada estilo de la familia.
 *
 * `table` y `plot` devuelven cero: el modelo canónico todavía no tiene
 * entidades TABLE ni una referencia de ploteo desde las presentaciones, así
 * que no hay nada que contar. Es un cero HONESTO —no hay referencias— y no un
 * «no lo sé»: el día que existan, basta añadirlos al mapa de arriba.
 */
export function cadStyleUsage(
  document: CadDocument | null,
  family: CadStyleFamily,
): Record<string, number> {
  const type = REFERENCING_TYPE[family];
  const usage: Record<string, number> = {};
  if (!document || !type) return usage;
  for (const entity of document.entities) {
    if (entity.type !== type) continue;
    const style = (entity as { style?: string }).style;
    if (!style) continue;
    usage[style] = (usage[style] ?? 0) + 1;
  }
  return usage;
}

export interface CadStyleActionsOptions {
  host: CadStyleManagerHost;
  commit: (
    mutate: (document: CadDocument) => CadDocument,
    success: string,
  ) => boolean;
  notify: { error: (message: string) => void };
}

export interface CadStyleActions {
  create: () => void;
  edit: (name: string, key: string, value: CadStyleValue) => void;
  remove: (name: string) => void;
}

export function useCadStyleActions(
  options: CadStyleActionsOptions,
): CadStyleActions {
  const live = useRef(options);
  live.current = options;

  /**
   * Traduce el rechazo del modelo en un aviso y NO deja pasar el cambio. El
   * modelo lanza con el motivo exacto —nombre inválido, duplicado, número por
   * debajo del mínimo— y ese es el texto que el usuario necesita leer.
   */
  const guarded = (
    mutate: (document: CadDocument) => CadDocument,
    success: string,
  ) => {
    try {
      live.current.commit(mutate, success);
    } catch (cause) {
      live.current.notify.error(
        cause instanceof Error ? cause.message : "No se pudo editar el estilo.",
      );
    }
  };

  const create = useCallback(() => {
    const { host } = live.current;
    const family = host.family;
    const name = host.draftName.trim();
    if (!name) return;
    guarded(
      (document) =>
        commitChange(
          { ...document, styles: createCadStyle(document.styles, family, name) },
          `style:create:${family}:${name}`,
        ),
      `Estilo ${cadStyleFamilyDescriptor(family).label} «${name}» creado.`,
    );
    host.setDraftName("");
  }, []);

  const edit = useCallback((name: string, key: string, value: CadStyleValue) => {
    const family = live.current.host.family;
    guarded(
      (document) =>
        commitChange(
          {
            ...document,
            styles: writeCadStyleValue(document.styles, family, name, key, value),
          },
          `style:update:${family}:${name}`,
        ),
      `Estilo «${name}» actualizado.`,
    );
  }, []);

  const remove = useCallback((name: string) => {
    const family = live.current.host.family;
    guarded(
      (document) =>
        commitChange(
          { ...document, styles: deleteCadStyle(document.styles, family, name) },
          `style:delete:${family}:${name}`,
        ),
      `Estilo «${name}» borrado.`,
    );
  }, []);

  return { create, edit, remove };
}
