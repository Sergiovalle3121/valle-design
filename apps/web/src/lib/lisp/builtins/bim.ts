/**
 * Las tres consultas BIM que AutoLISP no puede calcular por su cuenta.
 *
 * ## Por qué existen, y por qué son sólo TRES
 *
 * Una rutina de estudio sabe dibujar una tabla: recorre una lista, coloca
 * MTEXTs alineados, traza las líneas. Lo que no sabe es de dónde salen los
 * números. El cuadro de áreas exige recorrer el grafo plano que forman los ejes
 * de los muros y quedarse con sus caras acotadas —eso no se escribe en AutoLISP
 * sobre `ssget`, y quien lo intentase acabaría con una rutina que funciona en
 * plantas rectangulares y miente en las demás—. La medición exige saber qué
 * hueco vive en qué muro para descontar su superficie, y esa relación es del
 * esquema 7, no de la geometría que `entget` devuelve.
 *
 * Así que el reparto es: **TypeScript calcula, LISP presenta**. Estas tres
 * funciones devuelven los mismos números que enseña el producto —salen de
 * `bim-schedule.ts`, no de un cálculo paralelo— y la rutina decide cómo se
 * dibujan: con el cajetín del despacho, en su capa, con sus abreviaturas.
 *
 * Son tres y no una porque un cuadro de áreas, una tabla de carpintería y una
 * medición de obra son tres entregas distintas que casi nunca van juntas.
 *
 * ## No amplían el sandbox
 *
 * Son de LECTURA y PURAS: leen el documento por `host.document()`, que la
 * rutina ya alcanza con `entget`, y no pueden escribir — la única salida de
 * escritura sigue siendo `host.apply`. Lo que sí hacen es añadir una dependencia
 * del subsistema hacia `lib/cad/bim-schedule`, y eso está declarado en la
 * allowlist de `sandbox-surface.spec.ts`, que es donde tiene que verse.
 */
import { buildCadBimSchedule } from "../../cad/bim-schedule";
import { NIL, list, real, str, type LispCallContext } from "../values";
import { defsubr, type BuiltinTable } from "./define";
import { requireHost } from "./entities";

function schedule(ctx: LispCallContext, name: string) {
  return buildCadBimSchedule(requireHost(ctx, name).document());
}

export function installBimFunctions(table: BuiltinTable): void {
  /**
   * `(vd-areas)` → una lista por local: `(id área-ejes área-útil perímetro)`.
   *
   * El área útil es `nil` cuando el local tiene lados paralelos consecutivos y
   * no está definida. Se devuelve `nil` y no el área a ejes en su lugar: una
   * rutina que imprima el `nil` deja una celda vacía —que se ve— mientras que
   * imprimir el área a ejes disfrazada de útil deja un número creíble y falso.
   */
  defsubr(table, "vd-areas", 0, 0, (_args, ctx) =>
    list(
      schedule(ctx, "vd-areas").rooms.map((room) =>
        list([
          str(room.id),
          real(room.axisArea),
          room.clearArea === undefined ? NIL : real(room.clearArea),
          real(room.perimeter),
        ]),
      ),
    ),
  );

  /**
   * `(vd-carpinteria)` → una lista por TIPO: `(marca ancho alto cantidad)`.
   *
   * Por tipo y no por unidad, que es como se pide a un carpintero y como se
   * entrega la tabla. Las unidades individuales siguen estando en el dibujo
   * para quien las quiera recorrer con `ssget`.
   */
  defsubr(table, "vd-carpinteria", 0, 0, (_args, ctx) =>
    list(
      schedule(ctx, "vd-carpinteria").openings.map((row) =>
        list([str(row.mark), real(row.width), real(row.height), real(row.count)]),
      ),
    ),
  );

  /**
   * `(vd-muros)` → una lista por capa y grosor:
   * `(capa grosor unidades longitud superficie volumen hueco-descontado)`.
   *
   * La superficie viene YA descontados los huecos, y el descuento se devuelve
   * aparte para que la rutina pueda enseñar la resta. Una medición que no
   * permite auditar de dónde sale su número no se firma.
   */
  defsubr(table, "vd-muros", 0, 0, (_args, ctx) =>
    list(
      schedule(ctx, "vd-muros").walls.map((row) =>
        list([
          str(row.layer),
          real(row.thickness),
          real(row.count),
          real(row.length),
          real(row.faceArea),
          real(row.volume),
          real(row.openingArea),
        ]),
      ),
    ),
  );
}
