/**
 * Las funciones de entidad: `entget`, `entmod`, `entmake`, `entdel`,
 * `entnext`, `entlast`, `handent`.
 *
 * Es el bloque por el que una rutina heredada toca el dibujo, y todo él pasa
 * por dos sitios: el TRADUCTOR (`dxf/`) para leer y escribir listas de códigos,
 * y `host.apply` para mutar. No hay una tercera vía, y eso es lo que garantiza
 * que una rutina de un tercero no pueda saltarse el historial ni el CAS.
 *
 * ## `entnext` recorre el ORDEN DE DIBUJO
 *
 * No el array `entities` —que va ordenado por id para que el serializado sea
 * determinista— sino `modelSpace.entityIds`, que es el z-order real del plano.
 * La diferencia importa: una rutina que recorre el dibujo para numerar ejes
 * espera el orden en que se crearon las cosas, no el alfabético de unos
 * identificadores que el usuario nunca ve.
 *
 * ## `entdel` no resucita
 *
 * En AutoCAD, `entdel` sobre una entidad ya borrada la RECUPERA dentro de la
 * misma sesión de dibujo. Aquí no: el borrado va por `CadEntityCommand`, entra
 * en el historial y se deshace con Ctrl+Z como cualquier otra cosa.
 * Reimplementar la resurrección exigiría una papelera paralela al historial —
 * es decir, un segundo modelo de deshacer conviviendo con el del producto. Se
 * rechaza DICIÉNDOLO: llamar a `entdel` sobre algo que ya no está da error con
 * ese motivo, en vez de devolver nil y dejar creer que se recuperó.
 */
import type { CadEntityCommand } from "../../cad/entity-commands";
import { CAD_ENTITY_REGISTRY } from "../../cad/entity-runtime";
import { measureCadMText } from "../../cad/mtext-layout";
import { dxfEntries, dxfNumber, dxfText } from "../dxf/codes";
import { cadEntityToDxf } from "../dxf/from-entity";
import { findLayerRecord, layerIdFromEname, layerRecordDxf } from "../dxf/layer-record";
import { dxfPatchEntity, dxfToNewEntity } from "../dxf/to-entity";
import { LispError } from "../errors";
import {
  NIL,
  ename,
  list,
  pointValue,
  real,
  str,
  type LispCallContext,
  type LispEval,
  type LispHostServices,
  type LispValue,
} from "../values";
import { defgen, defsubr, wantList, wantString, type BuiltinTable } from "./define";

/** El anfitrión o un error que lo dice. Sin anfitrión no hay dibujo que tocar. */
export function requireHost(ctx: LispCallContext, name: string): LispHostServices {
  if (!ctx.host)
    throw new LispError(
      `${name} necesita un dibujo abierto. Esta sesión LISP se creó sin acceso al documento.`,
    );
  return ctx.host;
}

/** Comprueba que el valor es un ename y devuelve su id. */
function wantEname(value: LispValue, name: string): string {
  if (value.t !== "ename")
    throw new LispError(`bad argument type: ${name}: se esperaba un nombre de entidad`);
  return value.id;
}

/**
 * Entidad viva por id, o error. Un ename cuya entidad ya no existe —porque la
 * borró la propia rutina— es el caso que más se da y el que peor se diagnostica
 * si se devuelve nil en silencio.
 */
function liveEntity(host: LispHostServices, id: string, name: string) {
  const entity = host.entity(id);
  if (!entity)
    throw new LispError(`${name}: la entidad ${id} ya no está en el dibujo.`);
  return entity;
}

export function installEntityFunctions(table: BuiltinTable): void {
  /**
   * `entget` devuelve la lista de códigos, o nil si la entidad no tiene forma
   * DXF honesta (las proyecciones del editor histórico). Devolver nil es lo
   * correcto aquí y no un error: recorrer el dibujo y saltarse lo que no se
   * entiende es un gesto normal de una rutina.
   */
  defsubr(table, "entget", 1, 2, (args, ctx) => {
    const host = requireHost(ctx, "entget");
    const id = wantEname(args[0], "entget");
    // Un nombre de la TABLA DE SÍMBOLOS —el que devuelve `tblobjname`— no
    // apunta al espacio modelo. Se atiende aquí porque en AutoCAD `entget` lee
    // igual una entidad que un registro de capa, y porque devolver nil habría
    // convertido a `tblobjname` en un valor bonito e inservible.
    const layerId = layerIdFromEname(id);
    if (layerId !== null) {
      const layer = findLayerRecord(host.layers(), layerId);
      // La capa se borró entre el `tblobjname` y el `entget`: nil, igual que
      // una entidad que ya no está.
      if (!layer) return NIL;
      ctx.charge(12);
      return layerRecordDxf(layer, true);
    }
    const entity = host.entity(id);
    if (!entity) return NIL;
    const dxf = cadEntityToDxf(entity);
    if (!dxf) return NIL;
    ctx.charge(40);
    return dxf;
  });

  defsubr(table, "entmod", 1, 1, (args, ctx) => {
    const host = requireHost(ctx, "entmod");
    const entries = wantList(args[0]);
    const first = entries.t === "cons" ? entries.car : NIL;
    if (first.t !== "cons" || first.car.t !== "int" || first.car.v !== -1 || first.cdr.t !== "ename")
      throw new LispError(
        "bad argument type: entmod: la lista debe empezar por (-1 . <nombre de entidad>), " +
          "que es lo que devuelve entget.",
      );
    const id = first.cdr.id;
    refuseSymbolTable("entmod", id);
    const entity = liveEntity(host, id, "entmod");
    if (!CAD_ENTITY_REGISTRY.supports(entity))
      throw new LispError(`entmod: ${id} no es una entidad nativa y no se puede modificar por DXF.`);
    const patched = dxfPatchEntity(entity, entries);
    host.apply([{ type: "replace", entityId: id, entity: patched }], "LISP entmod");
    return args[0];
  });

  defsubr(table, "entmake", 1, 1, (args, ctx) => {
    const host = requireHost(ctx, "entmake");
    const entity = dxfToNewEntity(wantList(args[0]), {
      newEntityId: () => host.newEntityId(),
      activeLayer: () => host.activeLayer(),
    });
    const command: CadEntityCommand = { type: "insert", entity };
    host.apply([command], `LISP entmake ${entity.type}`);
    // AutoLISP devuelve la lista pasada; las rutinas encadenan con `entlast`
    // para quedarse con el nombre de la entidad recién creada.
    return args[0];
  });

  defsubr(table, "entdel", 1, 1, (args, ctx) => {
    const host = requireHost(ctx, "entdel");
    const id = wantEname(args[0], "entdel");
    refuseSymbolTable("entdel", id);
    if (!host.entity(id))
      throw new LispError(
        `entdel: ${id} ya no está en el dibujo. A diferencia de AutoCAD, aquí entdel no ` +
          `resucita: el borrado va por el historial y se deshace con Ctrl+Z.`,
      );
    host.apply([{ type: "delete", entityId: id }], "LISP entdel");
    return args[0];
  });

  /**
   * `(entnext)` da la PRIMERA entidad del dibujo; `(entnext e)` la siguiente en
   * orden de dibujo. Devolver nil al final es cómo se termina el bucle:
   *
   *     (while (setq e (entnext e)) ...)
   */
  defsubr(table, "entnext", 0, 1, (args, ctx) => {
    const host = requireHost(ctx, "entnext");
    const ids = host.entityIds();
    if (args.length === 0 || args[0].t === "nil") return ids.length ? ename(ids[0]) : NIL;
    const current = wantEname(args[0], "entnext");
    const index = ids.indexOf(current);
    if (index < 0)
      throw new LispError(`entnext: la entidad ${current} ya no está en el dibujo.`);
    return index + 1 < ids.length ? ename(ids[index + 1]) : NIL;
  });

  defsubr(table, "entlast", 0, 0, (args, ctx) => {
    const host = requireHost(ctx, "entlast");
    const ids = host.entityIds();
    return ids.length ? ename(ids[ids.length - 1]) : NIL;
  });

  /**
   * `handent` busca por el HANDLE del DXF de origen. Sólo lo tienen las
   * entidades importadas que lo traían: el documento canónico no reparte
   * handles a la geometría nacida aquí, y fabricar uno derivándolo del id sería
   * inventarse una identidad estable que el fichero no tiene. Sin handle,
   * devuelve nil — que es lo que AutoLISP hace ante un handle desconocido.
   */
  defsubr(table, "handent", 1, 1, (args, ctx) => {
    const host = requireHost(ctx, "handent");
    const handle = wantString(args[0]).v;
    for (const id of host.entityIds()) {
      const entity = host.entity(id);
      if (entity?.context?.handle === handle) return ename(id);
    }
    return NIL;
  });

  /** El inverso: el handle de una entidad, o nil si no tiene. */
  defsubr(table, "enthandle", 1, 1, (args, ctx) => {
    const host = requireHost(ctx, "enthandle");
    const entity = host.entity(wantEname(args[0], "enthandle"));
    const handle = entity?.context?.handle;
    return handle ? str(handle) : NIL;
  });

  /**
   * `(textbox datos)` → `((x-mín y-mín 0.0) (x-máx y-máx 0.0))`: la caja que
   * ocupa un rótulo, EN SU PROPIO sistema de coordenadas y con el origen en su
   * punto de inserción.
   *
   * Es la función con la que se dibuja un recuadro alrededor de un texto, se
   * centra una etiqueta en una casilla de cajetín o se reparte una columna de
   * cotas sin que se toquen. Sin ella, esas rutinas estiman el ancho
   * multiplicando la altura por el número de letras, que sale mal en cuanto el
   * texto lleva una eme o una i.
   *
   * ## Se MIDE con el mismo medidor que dibuja
   *
   * El ancho sale de `measureCadMText`, que es el que usan el adaptador de TEXT
   * y el sprite que se pinta en pantalla. Estimarlo aquí habría hecho que el
   * recuadro que dibuja la rutina y el texto que dibuja el editor discreparan
   * en un plano impreso, que es donde se ve.
   *
   * ## Dos límites declarados
   *
   * 1. La caja es la de la MAQUETA —línea base a línea base—, no el contorno de
   *    los trazos: no baja por debajo de cero para el rabo de una «g». AutoCAD
   *    sí lo hace en algunas tipografías, y quien centre verticalmente notará
   *    la diferencia de una fracción de la altura.
   * 2. La rotación NO entra, y es lo correcto: la caja se pide en el sistema
   *    del texto, así que un rótulo girado devuelve la misma que sin girar. La
   *    rutina que quiera el contorno en coordenadas del mundo gira los dos
   *    puntos ella misma, que es lo que hacen las rutinas reales.
   *
   * Acepta lo mismo que el original: la lista de `entget` —de la que se lee el
   * `(1 . texto)` y el `(40 . altura)`— o una lista escrita a mano con esos dos
   * códigos. Un dato sin texto devuelve nil, como AutoLISP ante algo que no es
   * un rótulo.
   */
  defsubr(table, "textbox", 1, 1, (args, ctx) => {
    const entries = dxfEntries(wantList(args[0]));
    const text = dxfText(entries, 1);
    if (text === null) return NIL;
    // La altura por defecto es la de la variable TEXTSIZE del producto cuando
    // el dato no la trae; sin tabla a mano, la del propio documento no se
    // adivina: se usa 1.0, que es la unidad y no un tamaño inventado.
    const height = dxfNumber(entries, 40) ?? 1;
    const lines = text.split(/\r?\n/);
    const width = Math.max(0, ...lines.map((line) => measureCadMText(line, height)));
    ctx.charge(lines.length + 4);
    return list([
      pointValue({ x: 0, y: 0, z: 0 }),
      list([real(width), real(height * lines.length), real(0)]),
    ]);
  });

  /**
   * `entupd` regenera la pantalla tras un `entmod`. Aquí es un no-op honesto:
   * el anfitrión repinta desde el documento en cuanto éste cambia, así que no
   * hay nada que forzar. Existe porque las rutinas la llaman siempre, y que
   * falte sería un «no function definition» en mitad de una rutina que
   * funcionaba.
   */
  defgen(table, "entupd", 1, 1, function* (args): LispEval {
    return args[0];
  });
}

/**
 * La tabla de símbolos NO se escribe por `entmod` ni por `entdel`.
 *
 * En AutoCAD sí se puede, y aquí no: crear, renombrar o borrar una capa produce
 * comandos canónicos de capa (`{type: "layer"}`), y la única ruta que los
 * produce es el comando `-LAYER`. Dejar que `entmod` construyera uno a partir
 * de una lista de códigos habría abierto una segunda puerta a la tabla de capas
 * —con su propia validación, su propio nombre de paso de deshacer y su propia
 * idea de qué es un color— justo al lado de la que ya existe.
 *
 * Se dice con la alternativa escrita, que es lo que convierte un «no» en una
 * instrucción.
 */
function refuseSymbolTable(caller: string, id: string): void {
  const layerId = layerIdFromEname(id);
  if (layerId === null) return;
  throw new LispError(
    `${caller}: "${layerId}" es un registro de la tabla de capas, y las tablas de símbolos no ` +
      `se modifican por ${caller} en esta versión. La capa se crea, se pone actual, se apaga o ` +
      `se bloquea con (command "-LAYER" …), que es la ruta que produce los comandos canónicos ` +
      `de capa y un solo paso de deshacer.`,
  );
}
