"use client";

import type { CadNativeEntity } from "@/lib/cad/entity-runtime";
import { cadEntityLabels } from "@/lib/cad/entity-labels";

/**
 * LA LISTA DE ENTIDADES DEL PLANO — con nombres que se pueden leer.
 *
 * ── QUÉ SUSTITUYE ───────────────────────────────────────────────────────────
 * Veinte filas dentro del monolito del editor que enseñaban esto:
 *
 *     cad_mt60y4ol_uzfo                                              WALL
 *     cad_mt60ygly_etyh                                              WALL
 *     cad_mt60yh2k_qq1a                                              MTEXT
 *
 * Eso no es una lista de entidades: son veinte cadenas indistinguibles con un
 * slug en inglés al lado. No se recorre con la vista, no se dice en voz alta y
 * no sirve para encontrar nada. Ahora dice «Muro 1 · Muros», «Muro 2 · Muros»,
 * «Texto 1 · Textos»: tipo en español con su ordinal, y la CAPA a la derecha,
 * que es el dato con el que de verdad se organiza un plano.
 *
 * ── DOS COSAS QUE NO CAMBIAN, Y ES DELIBERADO ───────────────────────────────
 *   · El `data-testid` de cada fila sigue llevando el id. Es la identidad real
 *     del objeto y lo que hace que una prueba de navegador pueda señalar una
 *     fila concreta; cambiarlo por el nombre haría que renumerar al borrar
 *     rompiera pruebas.
 *   · El id sigue estando a la vista de quien lo necesite, en el `title`. Un
 *     reporte de fallo o una consulta a soporte lo pide, y esconderlo del todo
 *     habría cambiado un problema por otro.
 *
 * ── POR QUÉ ES UN MÓDULO PROPIO ─────────────────────────────────────────────
 * Porque `Layout3DEditor.tsx` tiene un presupuesto de líneas que SÓLO puede
 * bajar, y la instrucción del gate cuando se rebasa es explícita: «mueve el
 * código nuevo a un módulo aparte». Extraer esta lista es exactamente el tipo de
 * corte que el presupuesto existe para forzar — un bloque de presentación sin
 * estado, que no necesitaba estar dentro del monolito y que ahí no se podía ni
 * leer ni probar por separado.
 */

export function CadNativeEntityList({
  entities,
  limit = 20,
  onSelect,
}: {
  entities: readonly CadNativeEntity[];
  /** Cuántas filas se pintan. El resto se declara, no se esconde. */
  limit?: number;
  onSelect: (id: string) => void;
}) {
  if (entities.length === 0) return null;

  // Los nombres se calculan sobre TODAS las entidades, no sobre las visibles:
  // el ordinal de «Muro 3» sólo significa algo dentro del plano completo.
  const nombres = cadEntityLabels(entities);
  const visibles = entities.slice(0, limit);
  const ocultas = entities.length - visibles.length;

  return (
    <div
      className="rounded-xl border border-primary/15 bg-primary/[0.04] p-2.5"
      data-testid="cad-native-entity-list"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="type-micro uppercase tracking-wide text-primary-ink">
          Entidades nativas
        </span>
        <span className="type-numeric rounded-full bg-muted/60 px-1.5 py-0.5 type-micro text-foreground">
          {entities.length}
        </span>
      </div>
      <div className="space-y-1">
        {visibles.map((entity) => (
          <button
            key={entity.id}
            data-testid={`cad-native-entity-${entity.id}`}
            title={`Identificador técnico: ${entity.id}`}
            onClick={() => onSelect(entity.id)}
            className="motion-fast flex w-full items-center justify-between gap-2 rounded-lg bg-surface/80 px-2 py-1.5 text-left type-micro text-foreground transition-[background-color] hover:bg-muted/60"
          >
            <span className="truncate">
              {nombres.get(entity.id) ?? entity.id}
            </span>
            <span className="truncate type-micro text-primary-ink">
              {entity.layer}
            </span>
          </button>
        ))}
      </div>
      {ocultas > 0 ? (
        // Un corte silencioso es una mentira pequeña: quien ve veinte filas de
        // un plano de trescientas cree que su plano tiene veinte objetos.
        <p className="mt-2 type-micro text-muted-foreground">
          y <span className="type-numeric">{ocultas}</span> más
        </p>
      ) : null}
    </div>
  );
}
