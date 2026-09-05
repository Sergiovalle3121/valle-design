/**
 * Los permisos que un plugin DECLARA, y quién los hace cumplir.
 *
 * ## Por qué un permiso y no una buena costumbre
 *
 * La API de plugins ya tenía sus tres reglas —no se pisa un comando del
 * producto, no hay documento mutable, la escritura sale por `host.apply`—, pero
 * todas eran iguales para todos: el plugin que sólo cuenta capas tenía la misma
 * llave para escribir que el que dibuja un cajetín. Un manifiesto que declara
 * qué necesita sirve para dos cosas distintas, y las dos hacen falta:
 *
 *  1. **Se lo enseña al usuario ANTES.** «Este plugin puede escribir en tu
 *     dibujo» es una frase que se puede leer sin abrir el código.
 *  2. **Se hace cumplir.** Y esto es lo que separa un permiso de un adorno: el
 *     plugin que no declaró `documento:escritura` no recibe un `apply` que no
 *     hace nada —eso sería la peor versión, un «éxito sin efecto» de los que
 *     prohíbe la regla 2 de la casa—, recibe un `PluginPermissionError` con el
 *     nombre del permiso que le falta y la línea que tiene que añadir a su
 *     manifiesto.
 *
 * ## Por qué cuatro y no quince
 *
 * Un permiso sólo vale si el usuario lo entiende y si hay UN sitio donde se
 * comprueba. Los cuatro se corresponden con las cuatro cosas que un plugin
 * puede hacerle al programa hoy, ni una más: leer el dibujo, escribirlo,
 * ocupar un nombre de comando y ocupar un sitio en la pantalla. Un catálogo de
 * quince permisos finos que nadie sabe conceder por separado es un formulario,
 * no una frontera.
 *
 * ## Lo que NO hacen
 *
 * No aíslan al plugin del resto de la página: eso lo daría un worker o un
 * iframe, y no lo hay (lo dice `docs/cad/third-party-extension-policy.md`, en
 * «no garantizamos aislamiento entre extensiones»). Lo que sí acotan por
 * completo es lo que el plugin alcanza del DOCUMENTO, porque el documento sólo
 * se alcanza por `PluginDocumentApi` y esa puerta la construye el anfitrión con
 * estos permisos en la mano.
 */

/**
 * Los cuatro permisos del manifiesto v1. En español porque viajan al
 * manifiesto de un tercero y de ahí a la pantalla del usuario: un permiso que
 * el dibujante no entiende no lo puede conceder.
 */
export const PLUGIN_PERMISSIONS = [
  "documento:lectura",
  "documento:escritura",
  "comandos:registro",
  "ui:panel",
] as const;

export type PluginPermission = (typeof PLUGIN_PERMISSIONS)[number];

/**
 * Qué concede cada uno, con la frase que el anfitrión puede enseñar tal cual
 * al pedir la autorización. Vive junto a la lista para que un permiso nuevo no
 * pueda entrar sin su explicación: `PLUGIN_PERMISSIONS` y esta tabla se
 * comprueban una contra otra en `plugins-permisos.spec.ts`.
 */
export const PLUGIN_PERMISSION_MEANING: Readonly<Record<PluginPermission, string>> = {
  "documento:lectura":
    "Leer las entidades, las capas y la capa activa del dibujo abierto.",
  "documento:escritura":
    "Escribir en el dibujo: crear, modificar y borrar entidades. Todo lo que haga entra como un paso de deshacer a su nombre.",
  "comandos:registro":
    "Ocupar nombres de comando y alias, que el usuario podrá teclear como los del producto.",
  "ui:panel": "Publicar paneles en el espacio de trabajo del editor.",
};

export function isPluginPermission(value: string): value is PluginPermission {
  return (PLUGIN_PERMISSIONS as readonly string[]).includes(value);
}

/**
 * El rechazo con NOMBRE.
 *
 * Tiene clase propia —y no un `Error` corriente— por dos razones concretas:
 *
 *  - El anfitrión tiene que poder distinguirlo para enseñar el diálogo de
 *    «este plugin pide un permiso que no tiene» en vez de un renglón de error
 *    genérico, y para eso necesita `pluginId` y `permission` como DATOS, no
 *    dentro de una cadena que habría que parsear.
 *  - No es un `LispError`, así que `vl-catch-all-apply` NO lo atrapa
 *    (`errors.ts`: `isCatchable` sólo es cierto para `LispError`). Es
 *    deliberado y es la misma decisión que con el corte por presupuesto: un
 *    permiso que el propio código medido puede tragarse y reintentar no es un
 *    permiso. Una rutina que conduce un comando de plugin sin escritura ve la
 *    ejecución terminada, no un `nil` que podría confundir con «no había nada
 *    que dibujar».
 */
export class PluginPermissionError extends Error {
  constructor(
    readonly pluginId: string,
    readonly permission: PluginPermission,
    /** Qué se intentó: `apply`, `newEntityId`, `MARCOLAMINA`… */
    readonly operation: string,
  ) {
    super(
      `El plugin "${pluginId}" intentó ${operation} sin el permiso "${permission}". ` +
        `${PLUGIN_PERMISSION_MEANING[permission]} ` +
        `Declárelo en su manifiesto (permisos: ["${permission}"]) y el usuario decidirá si se lo concede.`,
    );
    this.name = "PluginPermissionError";
  }
}

/**
 * Los permisos concedidos a UN plugin, ya validados.
 *
 * Es una clase y no un `Set` suelto porque lo que se pasa por ahí no es «un
 * conjunto de cadenas»: es la autorización de un plugin concreto, y el error
 * que produce tiene que saber de quién es. Con un `Set` anónimo, el mensaje
 * diría «falta documento:escritura» sin decir a quién le falta, que es lo
 * primero que pregunta quien lee un registro de incidencias.
 */
export class PluginPermissions {
  private readonly granted: ReadonlySet<PluginPermission>;

  constructor(
    readonly pluginId: string,
    declared: Iterable<PluginPermission> = [],
  ) {
    this.granted = new Set(declared);
  }

  has(permission: PluginPermission): boolean {
    return this.granted.has(permission);
  }

  /**
   * Exige un permiso o lanza. Es el ÚNICO sitio donde se decide que algo no se
   * puede hacer: quien llame a esto no tiene que acordarse de comprobar nada
   * antes, y quien lea el diff ve todas las comprobaciones en las llamadas.
   */
  exigir(permission: PluginPermission, operation: string): void {
    if (!this.granted.has(permission))
      throw new PluginPermissionError(this.pluginId, permission, operation);
  }

  /** En el orden canónico de `PLUGIN_PERMISSIONS`, no en el del manifiesto. */
  list(): readonly PluginPermission[] {
    return PLUGIN_PERMISSIONS.filter((permission) => this.granted.has(permission));
  }
}

/**
 * Los nombres del manifiesto que no son permisos conocidos.
 *
 * Se devuelven en vez de ignorarse: un manifiesto que pide
 * `"documento:escritur"` no tiene que quedarse sin escritura y descubrirlo en
 * la primera llamada, tiene que ser rechazado al darse de alta diciendo qué
 * escribió mal. Los permisos llegan como `string[]` porque un manifiesto de un
 * tercero es JSON en tiempo de ejecución: el tipo de TypeScript no lo valida
 * nadie del otro lado.
 */
export function unknownPluginPermissions(declared: readonly string[]): readonly string[] {
  return declared.filter((permission) => !isPluginPermission(permission));
}
