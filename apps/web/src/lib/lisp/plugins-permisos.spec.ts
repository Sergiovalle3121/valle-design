/**
 * El SDK de plugins como CONTRATO: permisos declarados que se hacen cumplir,
 * ciclo de vida, presupuesto compartido y los dos ejemplos de verdad.
 *
 * Lo que esta spec existe para demostrar —y lo que la separa de
 * `dcl-and-plugins.spec.ts`, que comprueba el registro— es una sola propiedad,
 * la que convierte un permiso en un permiso: **el plugin que no lo declaró no
 * puede, y se entera**. Un `apply` que no hiciera nada sería peor que no tener
 * permisos, porque el autor creería haber escrito y el usuario tendría un
 * dibujo distinto del que cree.
 *
 * Se comprueba por las DOS puertas por las que un plugin toca el dibujo, porque
 * cerrar una sola habría dejado la otra abierta:
 *
 *  1. `PluginDocumentApi.apply`, que es lo que llama el plugin.
 *  2. El lote de un COMANDO de plugin conducido desde LISP con `(command …)`,
 *     que no pasa por la API de documento sino por el motor.
 *
 * Y con sujetos reales: los dos ejemplos de `plugins/examples/` son los que se
 * dan de alta aquí, así que si la API cambia y el ejemplo deja de valer, la
 * corrida se pone roja en vez de que la plantilla del desarrollador envejezca
 * en un archivo que nadie abre.
 */
import { strict as assert } from "node:assert";
import type { CadDocument } from "../cad/cad-document";
import {
  CAD_ACCEPT_POINT,
  CAD_COMMAND_REGISTRY_V2,
  asCadCommand,
  type CadCommandDescriptor,
} from "../cad/engine";
import { COMMAND_REGISTRY } from "./builtins/interaction";
import { CAD_LISP_BUILTINS } from "./cad-builtins";
import { CadDocumentLispHost } from "./document-host";
import { LispAbort } from "./errors";
import { CadPluginRegistry, createPluginDocumentApi, type CadPlugin } from "./plugins/api";
import { MARCO_LAMINA_PLUGIN } from "./plugins/examples/marco-lamina";
import {
  RECUENTO_CAPAS_PLUGIN,
  recuentoPorCapa,
  textoDelRecuento,
} from "./plugins/examples/recuento-capas";
import {
  PLUGIN_PERMISSIONS,
  PLUGIN_PERMISSION_MEANING,
  PluginPermissionError,
  PluginPermissions,
  isPluginPermission,
  unknownPluginPermissions,
} from "./plugins/permissions";
import { LispSession } from "./session";

let checks = 0;
function ok(condition: unknown, message: string): void {
  assert.ok(condition, message);
  checks += 1;
}
function eq<T>(actual: T, expected: T, message: string): void {
  assert.deepEqual(actual, expected, message);
  checks += 1;
}

function documento(): CadDocument {
  return {
    meta: { version: 1, schema: 3, unit: "mm" },
    layers: [
      { id: "0", name: "0", color: "#fff", visible: true, locked: false },
      { id: "l1", name: "MUROS", color: "#fff", visible: true, locked: false },
    ],
    entities: [],
    history: [],
    modelSpace: { entityIds: [] },
    paperSpaces: [],
    styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
    blocks: [],
    constraints: [],
    externalReferences: [],
    unsupportedEntities: [],
    lossManifest: [],
    publications: [],
  };
}

function anfitrion(): CadDocumentLispHost {
  let serial = 0;
  return new CadDocumentLispHost(documento(), {
    activeLayer: "0",
    newEntityId: () => {
      serial += 1;
      return `p${serial}`;
    },
  });
}

/** Comando de mentira que dibuja un círculo donde le digan. Para los casos límite. */
function comandoQueDibuja(name: string, aliases: readonly string[] = []): CadCommandDescriptor<null> {
  return {
    name,
    aliases,
    kind: "draw",
    transparent: false,
    selection: "none",
    repeatable: true,
    mutates: true,
    begin: () => ({ state: null, prompt: { message: "Punto", options: [] }, accepts: CAD_ACCEPT_POINT }),
    step: (state, input, context) =>
      input.kind === "point"
        ? {
            state,
            prompt: { message: "", options: [] },
            accepts: 0,
            result: {
              kind: "document",
              commands: [
                {
                  type: "insert",
                  entity: {
                    id: context.newEntityId(),
                    type: "circle",
                    center: { x: input.point.x, y: input.point.y, z: 0 },
                    radius: 7,
                    layer: context.activeLayer,
                  },
                },
              ],
              label: name,
            },
          }
        : { state, prompt: { message: "Punto", options: [] }, accepts: CAD_ACCEPT_POINT },
  };
}

// --- 1. la tabla de permisos: cuatro, cada uno con su frase ------------------------
{
  eq(PLUGIN_PERMISSIONS.length, 4, "cuatro permisos, ni uno más");
  for (const permission of PLUGIN_PERMISSIONS) {
    ok(
      (PLUGIN_PERMISSION_MEANING[permission] ?? "").length > 20,
      `el permiso "${permission}" tiene que traer la frase que se le enseña al usuario`,
    );
    ok(isPluginPermission(permission), `"${permission}" se reconoce como permiso`);
  }
  eq(
    Object.keys(PLUGIN_PERMISSION_MEANING).sort(),
    [...PLUGIN_PERMISSIONS].sort(),
    "la tabla de significados no puede tener ni de más ni de menos que la lista",
  );
  eq(isPluginPermission("documento:escritur"), false, "un permiso mal escrito no es un permiso");
  eq(
    unknownPluginPermissions(["documento:lectura", "todo:todo"]),
    ["todo:todo"],
    "los desconocidos se devuelven para poder nombrarlos en el rechazo",
  );

  // El conjunto concedido conserva de QUIÉN es: sin eso, el error diría qué
  // permiso falta pero no a quién, que es lo primero que se pregunta.
  const permisos = new PluginPermissions("uno-cualquiera", ["documento:lectura"]);
  eq(permisos.has("documento:lectura"), true, "lo declarado se tiene");
  eq(permisos.has("documento:escritura"), false, "lo no declarado no");
  eq(permisos.list(), ["documento:lectura"], "y se puede enumerar para enseñarlo");
  assert.throws(
    () => permisos.exigir("documento:escritura", "escribir"),
    (error: unknown) =>
      error instanceof PluginPermissionError &&
      error.name === "PluginPermissionError" &&
      error.pluginId === "uno-cualquiera" &&
      error.permission === "documento:escritura",
    "el rechazo lleva nombre, plugin y permiso como DATOS, no dentro de una cadena",
  );
  checks += 1;
}

// --- 2. los dos ejemplos se dan de alta ENTEROS ------------------------------------
{
  const host = anfitrion();
  const registry = new CadPluginRegistry(CAD_COMMAND_REGISTRY_V2, { host });

  eq(registry.register(MARCO_LAMINA_PLUGIN), [], "el plugin que dibuja entra entero");
  eq(registry.register(RECUENTO_CAPAS_PLUGIN), [], "el de sólo lectura también");
  eq(registry.estado("marco-lamina"), "activo", "y queda activo");
  eq(registry.estado("recuento-capas"), "activo", "los dos");

  const composed = registry.composed();
  eq(composed.get("MARCOLAMINA")?.name, "MARCOLAMINA", "su comando se encuentra");
  eq(composed.get("mlam")?.name, "MARCOLAMINA", "por su alias, sin distinguir mayúsculas");
  eq(composed.get("-MARCOLAMINA")?.name, "MARCOLAMINA", "y por la variante con guion");
  eq(composed.get("RECUENTOCAPAS")?.name, "RECUENTOCAPAS", "y el del otro ejemplo");
  eq(composed.get("LINE")?.name, "LINE", "sin perder los del producto");
  eq(
    CAD_COMMAND_REGISTRY_V2.get("MARCOLAMINA"),
    undefined,
    "y el registro del producto sigue sin conocerlos: se COMPONE, no se muta",
  );

  // El panel es del que pidió `ui:panel`. El otro no lo pidió y no lo tiene.
  eq(registry.panels().length, 1, "un panel declarado");
  eq(registry.panels()[0].title, "Recuento por capa", "el del plugin de sólo lectura");

  // `activate` corrió de verdad: los dos dejaron su nota, y la del recuento
  // lleva números leídos del documento.
  ok(
    registry.notas("marco-lamina")[0]?.includes('capa "0"'),
    `el activate del que dibuja miró la capa activa: ${registry.notas("marco-lamina")[0]}`,
  );
  ok(
    registry.notas("recuento-capas")[0]?.includes("0 objeto(s) en 2 capa(s)"),
    `el activate del recuento contó el dibujo vacío: ${registry.notas("recuento-capas")[0]}`,
  );

  eq(
    registry.permisosDe("recuento-capas")?.list(),
    ["documento:lectura", "comandos:registro", "ui:panel"],
    "lo concedido se puede enseñar, en el orden canónico y no en el del manifiesto",
  );
  eq(
    registry.permisosDe("recuento-capas")?.has("documento:escritura"),
    false,
    "y el ejemplo de sólo lectura NO pide escritura: es el punto del ejemplo",
  );
}

// --- 3. el de sólo lectura recibe un error NOMBRADO al intentar apply --------------
{
  const host = anfitrion();
  const api = createPluginDocumentApi(host, RECUENTO_CAPAS_PLUGIN);

  // Lo que sí puede: leer.
  eq(api.entities().length, 0, "puede leer las entidades");
  eq(api.layers().length, 2, "y la tabla de capas");
  eq(api.activeLayer(), "0", "y la capa activa");

  assert.throws(
    () =>
      api.apply(
        [
          {
            type: "insert",
            entity: {
              id: "colado",
              type: "circle",
              center: { x: 0, y: 0, z: 0 },
              radius: 1,
              layer: "0",
            },
          },
        ],
        "colar una entidad",
      ),
    (error: unknown) =>
      error instanceof PluginPermissionError &&
      error.name === "PluginPermissionError" &&
      error.pluginId === "recuento-capas" &&
      error.permission === "documento:escritura" &&
      error.message.includes("documento:escritura"),
    "un plugin sin escritura recibe un rechazo con nombre, no un apply mudo",
  );
  checks += 1;

  // Y —esto es lo que separa un permiso de un adorno— el documento NO cambió.
  eq(host.document().entities.length, 0, "el documento no cambió");
  eq(host.pendingCommands.length, 0, "no se acumuló ninguna escritura");
  eq(host.appliedLabels.length, 0, "y no hay paso de deshacer que enseñar");

  // Pedir un identificador es el primer gesto de una escritura, y también se
  // niega: dejarlo pasar habría dado un id que sólo sirve para lo prohibido.
  assert.throws(
    () => api.newEntityId(),
    (error: unknown) => error instanceof PluginPermissionError && error.permission === "documento:escritura",
    "newEntityId también pide escritura",
  );
  checks += 1;

  // El que sí la pidió, escribe.
  const escritor = createPluginDocumentApi(host, MARCO_LAMINA_PLUGIN);
  escritor.apply(
    [
      {
        type: "insert",
        entity: {
          id: escritor.newEntityId(),
          type: "circle",
          center: { x: 1, y: 2, z: 0 },
          radius: 3,
          layer: escritor.activeLayer(),
        },
      },
    ],
    "un hito",
  );
  eq(host.document().entities.length, 1, "el plugin con escritura sí escribe");
  eq(
    host.appliedLabels[0],
    "plugin:marco-lamina un hito",
    "y el historial dice quién lo hizo sin abrir el código",
  );

  // Un plugin de sólo lectura tampoco puede leer si no lo declaró: los permisos
  // no se heredan unos de otros.
  const mudo = createPluginDocumentApi(host, {
    manifiesto: 1,
    id: "sin-nada",
    name: "Sin nada",
    version: "1",
    permisos: [],
  });
  assert.throws(
    () => mudo.entities(),
    (error: unknown) => error instanceof PluginPermissionError && error.permission === "documento:lectura",
    "sin `documento:lectura` no se leen ni las entidades",
  );
  checks += 1;
}

// --- 4. un plugin que pide un nombre del producto se rechaza EN BLOQUE -------------
{
  const registry = new CadPluginRegistry();
  const impostor: CadPlugin = {
    manifiesto: 1,
    id: "impostor",
    name: "Impostor",
    version: "1",
    permisos: ["comandos:registro"],
    commands: [
      asCadCommand(comandoQueDibuja("SUYOPROPIO")),
      asCadCommand(comandoQueDibuja("LINE")),
    ],
  };
  const problems = registry.register(impostor);
  eq(problems.length, 1, "registrar LINE da un problema");
  ok(problems[0].problem.includes("ya existe en el producto"), "diciendo exactamente eso");
  eq(registry.list().length, 0, "y el plugin NO entra");
  eq(
    registry.composed().get("SUYOPROPIO"),
    undefined,
    "su comando bueno tampoco queda suelto: entra entero o no entra",
  );
  eq(registry.estado("impostor"), undefined, "y no queda ni rastro en el ciclo de vida");
}

// --- 5. el comando del plugin se CONDUCE desde LISP -------------------------------
{
  const host = anfitrion();
  const registry = new CadPluginRegistry(CAD_COMMAND_REGISTRY_V2, { host });
  eq(registry.register(MARCO_LAMINA_PLUGIN), [], "el ejemplo entra");

  const session = new LispSession({
    builtins: CAD_LISP_BUILTINS,
    host,
    state: [[COMMAND_REGISTRY, registry.composed()]],
  });
  const result = session.run('(command "MARCOLAMINA" (list 0 0) (list 420 297) 10)');
  ok(result.ok, `la rutina conduce el comando del plugin: ${result.ok ? "" : result.failure.message}`);

  const entities = host.document().entities;
  eq(entities.length, 2, "dibujó el borde de la lámina y su marco");
  const borde = entities[0];
  const marco = entities[1];
  eq(borde.type === "polyline" && borde.closed, true, "el borde es una polilínea cerrada");
  eq(
    borde.type === "polyline" && borde.vertices.map((v) => [v.x, v.y]),
    [
      [0, 0],
      [420, 0],
      [420, 297],
      [0, 297],
    ],
    "por las dos esquinas que dio la rutina",
  );
  eq(
    marco.type === "polyline" && marco.vertices.map((v) => [v.x, v.y]),
    [
      [20, 10],
      [410, 10],
      [410, 287],
      [20, 287],
    ],
    "y el marco con el margen pedido, doble por la izquierda: el de encuadernación",
  );
  eq(marco.layer, "0", "en la capa activa del anfitrión");

  // UN solo paso de deshacer, con la etiqueta del plugin. Es lo que hace que
  // Ctrl+Z quite la lámina entera y que el historial diga de dónde salió.
  eq(host.appliedLabels, ["plugin:marco-lamina MARCOLAMINA"], "un paso de deshacer, a nombre del plugin");
  eq(host.pendingCommands.length, 2, "con las dos escrituras dentro del mismo lote");

  // Enter toma el margen por defecto, como en cualquier comando del producto.
  const porDefecto = session.run('(command "MARCOLAMINA" (list 0 0) (list 200 200) "")');
  ok(porDefecto.ok, "el Enter acepta el margen por defecto");
  const segundoMarco = host.document().entities[3];
  eq(
    segundoMarco.type === "polyline" && segundoMarco.vertices[0].x,
    20,
    "margen 10 por defecto, doblado a 20 por la izquierda",
  );

  // Y una lámina más pequeña que su margen no dibuja un marco del revés: lo dice.
  const antes = host.document().entities.length;
  const degenerada = session.run('(command "MARCOLAMINA" (list 0 0) (list 5 5) 10)');
  ok(degenerada.ok, "la orden termina");
  eq(host.document().entities.length, antes, "y no dibuja nada: ni marco degenerado ni silencio");

  // Sin inyectar el registro compuesto, el comando del plugin no existe: la
  // composición es explícita y no un efecto global.
  const aislada = new LispSession({ builtins: CAD_LISP_BUILTINS, host: anfitrion() });
  ok(
    !aislada.run('(command "MARCOLAMINA" (list 0 0) (list 420 297) 10)').ok,
    "sin el registro compuesto inyectado, el comando del plugin no existe",
  );
}

// --- 6. la OTRA puerta: un comando de plugin sin escritura tampoco dibuja ----------
{
  const host = anfitrion();
  const registry = new CadPluginRegistry(CAD_COMMAND_REGISTRY_V2, { host });
  // Registrar comandos sólo necesita `comandos:registro`. Lo que este plugin no
  // tiene es permiso para que su comando ESCRIBA, y ahí es donde se le para.
  eq(
    registry.register({
      manifiesto: 1,
      id: "sin-escritura",
      name: "Sin escritura",
      version: "1",
      permisos: ["comandos:registro"],
      commands: [asCadCommand(comandoQueDibuja("HITOPRUEBA"))],
    }),
    [],
    "un plugin puede registrar un comando sin pedir escritura",
  );

  const session = new LispSession({
    builtins: CAD_LISP_BUILTINS,
    host,
    state: [[COMMAND_REGISTRY, registry.composed()]],
  });
  const result = session.run('(command "HITOPRUEBA" (list 10 10))');
  eq(result.ok, false, "pero su lote no se aplica");
  ok(
    !result.ok && result.failure.message.includes("documento:escritura"),
    `y el fallo nombra el permiso que falta: ${result.ok ? "" : result.failure.message}`,
  );
  eq(host.document().entities.length, 0, "el dibujo no cambió");
  eq(host.pendingCommands.length, 0, "ni se acumuló nada que aplicar después");

  // Un permiso denegado NO es un error del programa: la rutina no puede
  // repararlo y no debe poder tragárselo. Misma decisión que con el corte por
  // presupuesto (`errors.ts`: sólo `LispError` es capturable).
  const tragado = session.run(
    '(vl-catch-all-apply (function (lambda () (command "HITOPRUEBA" (list 20 20)))) nil)',
  );
  eq(tragado.ok, false, "vl-catch-all-apply no atrapa un permiso denegado");
  eq(host.document().entities.length, 0, "y sigue sin dibujarse nada");

  // El mismo comando, con el permiso declarado, sí dibuja. Es la comprobación
  // que impide que lo anterior pase por estar roto el camino entero.
  const conPermiso = new CadPluginRegistry(CAD_COMMAND_REGISTRY_V2, { host });
  eq(
    conPermiso.register({
      manifiesto: 1,
      id: "con-escritura",
      name: "Con escritura",
      version: "1",
      permisos: ["comandos:registro", "documento:escritura"],
      commands: [asCadCommand(comandoQueDibuja("HITOPRUEBA"))],
    }),
    [],
    "el mismo comando en un plugin que sí lo declara",
  );
  const permitida = new LispSession({
    builtins: CAD_LISP_BUILTINS,
    host,
    state: [[COMMAND_REGISTRY, conPermiso.composed()]],
  });
  ok(permitida.run('(command "HITOPRUEBA" (list 30 40))').ok, "se conduce igual");
  eq(host.document().entities.length, 1, "y esta vez sí dibuja");
  eq(
    host.appliedLabels,
    ["plugin:con-escritura HITOPRUEBA"],
    "con la etiqueta del plugin en el paso de deshacer",
  );
}

// --- 7. el ciclo de vida: activar, desactivar, dar de baja -------------------------
{
  const host = anfitrion();
  const registry = new CadPluginRegistry(CAD_COMMAND_REGISTRY_V2, { host });
  registry.register(MARCO_LAMINA_PLUGIN);
  registry.register(RECUENTO_CAPAS_PLUGIN);

  eq(registry.deactivate("marco-lamina"), true, "se puede desactivar");
  const composed = registry.composed();
  eq(composed.get("MARCOLAMINA"), undefined, "y el nombre se retira");
  eq(composed.get("MLAM"), undefined, "y el alias");
  eq(composed.get("-MARCOLAMINA"), undefined, "y la variante con guion: nada queda huérfano");
  eq(registry.ownerOf("MARCOLAMINA"), undefined, "ni el dueño");
  eq(registry.estado("marco-lamina"), "inactivo", "sigue dado de alta, inactivo");
  eq(registry.list().length, 2, "y sigue en la lista, para poder volver a activarlo");
  eq(registry.activos().length, 1, "aunque no cuente entre los activos");
  eq(registry.deactivate("marco-lamina"), false, "desactivar dos veces no miente");

  // Un plugin desactivado no publica panel: el editor no puede montar el
  // componente de algo que ya no responde.
  eq(registry.deactivate("recuento-capas"), true, "se desactiva el del panel");
  eq(registry.panels().length, 0, "y su panel se retira con él");

  const notasAntes = registry.notas("marco-lamina").length;
  eq(registry.activate("marco-lamina"), [], "se vuelve a activar");
  eq(registry.composed().get("MLAM")?.name, "MARCOLAMINA", "y su comando vuelve entero");
  ok(
    registry.notas("marco-lamina").length > notasAntes,
    "y su activate volvió a correr: el ciclo de vida no es un booleano cosmético",
  );

  eq(registry.unregister("marco-lamina"), true, "se da de baja");
  eq(registry.estado("marco-lamina"), undefined, "y desaparece de la lista");
  eq(registry.composed().get("MARCOLAMINA"), undefined, "con su comando");
  eq(registry.unregister("marco-lamina"), false, "dar de baja dos veces no miente");

  // Entre la baja y el alta, otro se quedó con el nombre: reactivar sin volver a
  // mirar habría dejado dos dueños para el mismo comando.
  const disputa = new CadPluginRegistry();
  const uno: CadPlugin = {
    manifiesto: 1,
    id: "el-primero",
    name: "Primero",
    version: "1",
    permisos: ["comandos:registro"],
    commands: [asCadCommand(comandoQueDibuja("DISPUTADO"))],
  };
  disputa.register(uno);
  disputa.deactivate("el-primero");
  eq(
    disputa.register({
      manifiesto: 1,
      id: "el-segundo",
      name: "Segundo",
      version: "1",
      permisos: ["comandos:registro"],
      commands: [asCadCommand(comandoQueDibuja("DISPUTADO"))],
    }),
    [],
    "mientras estaba desactivado, otro plugin se queda con el nombre",
  );
  const reactivacion = disputa.activate("el-primero");
  eq(reactivacion.length, 1, "y reactivar al primero se rechaza");
  ok(reactivacion[0].problem.includes("el-segundo"), "nombrando a quién lo tiene ahora");
  eq(disputa.estado("el-primero"), "inactivo", "que se queda inactivo, no a medias");
  eq(disputa.composed().get("DISPUTADO")?.name, "DISPUTADO", "y el comando sigue siendo del segundo");
  eq(disputa.ownerOf("DISPUTADO"), "el-segundo", "sin dos dueños para el mismo nombre");
}

// --- 8. los caminos que FALLAN tampoco dejan huérfanos -----------------------------
{
  const registry = new CadPluginRegistry();
  const problems = registry.register({
    manifiesto: 1,
    id: "arranque-roto",
    name: "Arranque roto",
    version: "1",
    permisos: ["comandos:registro"],
    commands: [asCadCommand(comandoQueDibuja("ROTO"))],
    activate: () => {
      throw new Error("me faltaba un ajuste");
    },
  });
  eq(problems.length, 1, "un activate que revienta impide el alta");
  ok(problems[0].problem.includes("me faltaba un ajuste"), "diciendo qué pasó");
  eq(registry.composed().get("ROTO"), undefined, "y su comando no queda puesto");
  eq(registry.list().length, 0, "ni el plugin en la lista");

  // Al revés: un `deactivate` roto no puede impedir la retirada. Se anota.
  const conDespedidaRota = new CadPluginRegistry();
  conDespedidaRota.register({
    manifiesto: 1,
    id: "despedida-rota",
    name: "Despedida rota",
    version: "1",
    permisos: ["comandos:registro"],
    commands: [asCadCommand(comandoQueDibuja("ADIOS"))],
    deactivate: () => {
      throw new Error("no quiero irme");
    },
  });
  eq(conDespedidaRota.deactivate("despedida-rota"), true, "se retira igual");
  eq(conDespedidaRota.composed().get("ADIOS"), undefined, "y su comando se va con él");
  ok(
    conDespedidaRota.notas("despedida-rota").some((nota) => nota.includes("no quiero irme")),
    "pero el fallo queda anotado en vez de tragarse",
  );
}

// --- 9. el manifiesto v1 se valida entero -----------------------------------------
{
  const registry = new CadPluginRegistry();
  const base = { id: "validado", name: "Validado", version: "1" } as const;

  const version = registry.register({ ...base, manifiesto: 2 as 1, permisos: [] });
  eq(version.length, 1, "una versión de manifiesto que no se entiende se rechaza");
  ok(version[0].problem.includes("sólo entiende la 1"), "diciéndolo");

  const desconocido = registry.register({
    ...base,
    manifiesto: 1,
    permisos: ["documento:total" as "documento:lectura"],
  });
  eq(desconocido.length, 1, "un permiso que no existe se rechaza");
  ok(desconocido[0].problem.includes("documento:total"), "nombrando el que se escribió mal");

  const sinPermisoDeComandos = registry.register({
    ...base,
    manifiesto: 1,
    permisos: [],
    commands: [asCadCommand(comandoQueDibuja("SINDECLARAR"))],
  });
  eq(sinPermisoDeComandos.length, 1, "traer comandos sin `comandos:registro` se rechaza");
  ok(sinPermisoDeComandos[0].problem.includes("comandos:registro"), "nombrando el permiso");

  const sinPermisoDePanel = registry.register({
    ...base,
    manifiesto: 1,
    permisos: [],
    panels: [{ id: "p", title: "P", placement: "right", component: "X" }],
  });
  eq(sinPermisoDePanel.length, 1, "publicar un panel sin `ui:panel` se rechaza");
  ok(sinPermisoDePanel[0].problem.includes("ui:panel"), "nombrando el permiso");

  // Un manifiesto sin `permisos` —lo que llega de un JSON de terceros, donde
  // TypeScript no vigila nada— no concede nada: se rechaza pidiéndolo.
  const sinCampo = registry.register({
    ...base,
    manifiesto: 1,
    commands: [asCadCommand(comandoQueDibuja("SINCAMPO"))],
  } as unknown as CadPlugin);
  ok(
    sinCampo.some((problem) => problem.problem.includes('declarar "permisos"')),
    "omitir `permisos` no concede nada: obliga a escribir que no se pide nada",
  );
  eq(registry.list().length, 0, "ninguno de los cinco entró");
}

// --- 10. el presupuesto es COMPARTIDO con el del LISP ------------------------------
{
  const host = anfitrion();
  // Un presupuesto de juguete: lo que se demuestra es de quién es el
  // presupuesto, no cuánto vale.
  const session = new LispSession({
    builtins: CAD_LISP_BUILTINS,
    host,
    limits: { maxSteps: 400, maxCells: 2_000, maxDepth: 50, maxMillis: 5_000 },
  });
  const api = createPluginDocumentApi(host, RECUENTO_CAPAS_PLUGIN, {
    meter: session.interpreter.meter,
  });

  ok(session.run("(setq a 1)").ok, "la rutina arranca con presupuesto de sobra");

  let llamadas = 0;
  let corte: unknown = null;
  try {
    for (let i = 0; i < 100_000; i += 1) {
      api.layers();
      llamadas += 1;
    }
  } catch (cause) {
    corte = cause;
  }
  ok(corte instanceof LispAbort, `el plugin se corta con el mismo aborto que una rutina: ${String(corte)}`);
  ok(llamadas > 0 && llamadas < 100_000, `y se cortó a mitad, no al principio ni nunca (${llamadas} llamadas)`);

  // Y aquí está lo que significa «compartido»: la rutina que prestó su medidor
  // se queda sin presupuesto. Un plugin no puede gastarse el navegador aunque
  // el código LISP que lo llamó se estuviera portando bien.
  const despues = session.run("(+ 1 1)");
  eq(despues.ok, false, "la rutina que compartía el medidor también queda cortada");
  ok(!despues.ok && despues.failure.kind === "abort", "y como corte de presupuesto, no como error del programa");

  // Sin medidor prestado NO significa sin límite: la API crea el suyo.
  const suelto = createPluginDocumentApi(anfitrion(), RECUENTO_CAPAS_PLUGIN);
  let cortado = false;
  try {
    for (let i = 0; i < 10_000_000; i += 1) suelto.layers();
  } catch (cause) {
    cortado = cause instanceof LispAbort;
  }
  ok(cortado, "un plugin sin medidor prestado sigue teniendo presupuesto propio");
}

// --- 11. el recuento del ejemplo de sólo lectura ------------------------------------
{
  const capas = [
    { id: "0", name: "0", color: "#fff", visible: true, locked: false },
    { id: "l1", name: "MUROS", color: "#fff", visible: true, locked: false },
    { id: "l2", name: "VACIA", color: "#fff", visible: true, locked: false },
  ];
  const entidades = [
    { id: "a", type: "circle" as const, center: { x: 0, y: 0, z: 0 }, radius: 1, layer: "MUROS" },
    { id: "b", type: "circle" as const, center: { x: 0, y: 0, z: 0 }, radius: 1, layer: "MUROS" },
    { id: "c", type: "circle" as const, center: { x: 0, y: 0, z: 0 }, radius: 1, layer: "0" },
    // Una entidad de un dibujo importado, en una capa que no está en la tabla.
    { id: "d", type: "circle" as const, center: { x: 0, y: 0, z: 0 }, radius: 1, layer: "AJENA" },
  ];
  const recuento = recuentoPorCapa(entidades, capas);
  eq(
    recuento,
    [
      { capa: "0", objetos: 1 },
      { capa: "MUROS", objetos: 2 },
      { capa: "VACIA", objetos: 0 },
      { capa: "AJENA", objetos: 1 },
    ],
    "cuenta por capa, enseña las vacías y no esconde la capa huérfana sumándola a «0»",
  );
  eq(
    textoDelRecuento(recuento).startsWith("4 objeto(s) en 4 capa(s)"),
    true,
    "y el renglón que lee una persona empieza por el total",
  );

  // El comando del ejemplo contesta con ese mismo recuento: una sola función
  // para el comando, el panel y la nota de arranque.
  const host = anfitrion();
  const registry = new CadPluginRegistry(CAD_COMMAND_REGISTRY_V2, { host });
  registry.register(RECUENTO_CAPAS_PLUGIN);
  const descriptor = registry.composed().get("RECUENTOCAPAS");
  const paso = descriptor?.begin({
    entityIds: [],
    entity: () => undefined,
    layers: () => capas,
    selection: [],
    activeLayer: "0",
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => "x",
  });
  eq(paso?.result?.kind, "message", "la consulta termina en su primer paso, sin preguntar nada");
  ok(
    paso?.result?.kind === "message" && paso.result.text.includes("0 objeto(s) en 3 capa(s)"),
    `y contesta el recuento: ${paso?.result?.kind === "message" ? paso.result.text : ""}`,
  );
}

console.log(
  `plugins-permisos: ${checks} aserciones verdes (manifiesto v1 con permisos que se HACEN CUMPLIR por las dos ` +
    `puertas —la API de documento y el lote de un comando de plugin—, ciclo de vida sin huérfanos ni en los ` +
    `caminos que fallan, presupuesto compartido con el del LISP, y los dos ejemplos reales dados de alta enteros).`,
);
