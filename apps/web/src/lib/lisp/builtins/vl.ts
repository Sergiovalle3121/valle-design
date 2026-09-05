/**
 * `vl-load-com`, los símbolos y los nombres de fichero.
 *
 * ## `vl-load-com` es un no-op, y ES lo correcto
 *
 * Casi toda rutina descargada empieza con `(vl-load-com)`. En AutoCAD de los
 * noventa cargaba la extensión de ActiveX; en AutoCAD moderno esa extensión ya
 * está cargada y la llamada no hace nada, devuelve nil y sigue. Aquí hace
 * exactamente lo mismo, y por eso no es un engaño: no promete COM —quien llame
 * después a `vlax-*` recibe la negativa escrita en `unavailable.ts`, con su
 * motivo—, promete no morir en la primera línea.
 *
 * La alternativa —que `vl-load-com` lanzara «no disponible»— habría matado en
 * su renglón 1 a rutinas que después NO usan ActiveX para nada, que son la
 * mayoría: la línea se copia por costumbre.
 *
 * ## Los nombres de fichero se parten sin sistema de ficheros
 *
 * `vl-filename-base`, `-directory` y `-extension` son manipulación de CADENAS:
 * no abren nada, no comprueban que exista nada, y por eso sí están —mientras
 * que `open` y `getfiled`, que sí necesitarían un disco, se declaran fuera de
 * alcance—. Una rutina las usa para derivar el nombre de una tabla del nombre
 * del dibujo, y eso funciona igual con una ruta que no existe.
 *
 * Se aceptan las dos barras, `\` y `/`, porque una rutina traída de un despacho
 * llega con rutas de Windows escritas a mano y no hay ninguna razón para que
 * `(vl-filename-base "c:\\planos\\casa.dwg")` conteste otra cosa que «casa».
 */
import { LispError } from "../errors";
import { NIL, str } from "../values";
import { chargedString, defsubr, wantString, type BuiltinTable } from "./define";

/** Última barra de cualquiera de los dos estilos, o -1. */
function lastSeparator(path: string): number {
  return Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
}

/** Nombre con extensión: lo que va después de la última barra. */
function fileName(path: string): string {
  return path.slice(lastSeparator(path) + 1);
}

/**
 * Posición del punto de la extensión DENTRO del nombre, o -1. Un punto inicial
 * (`.perfil`) no abre extensión, y un punto en una carpeta (`c:\v1.2\plano`)
 * tampoco: por eso se busca en el nombre y no en la ruta entera.
 */
function extensionDot(name: string): number {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? dot : -1;
}

export function installVl(table: BuiltinTable): void {
  /**
   * Devuelve nil, que es lo que devuelve el AutoCAD de hoy. No imprime aviso:
   * una rutina que la llama en su primera línea no ha hecho nada malo.
   */
  defsubr(table, "vl-load-com", 0, 0, () => NIL);

  defsubr(table, "vl-symbol-name", 1, 1, (args, ctx) => {
    const value = args[0];
    if (value.t !== "sym")
      throw new LispError(`bad argument type: vl-symbol-name: se esperaba un símbolo`);
    return str(chargedString(ctx, value.name));
  });

  /**
   * `vl-symbol-value` lee el valor GLOBAL del símbolo, no el local de la
   * función en curso: es lo que hace el original —consulta la tabla de
   * símbolos— y lo que hace útil el gesto habitual,
   * `(if (vl-symbol-value 'vd:escala) …)`, con el que una rutina comprueba si
   * otra ya dejó configurada una variable de sesión.
   *
   * Un símbolo sin valor da nil, no un error: es la comprobación misma.
   */
  defsubr(table, "vl-symbol-value", 1, 1, (args, ctx) => {
    const value = args[0];
    if (value.t !== "sym")
      throw new LispError(`bad argument type: vl-symbol-value: se esperaba un símbolo`);
    return ctx.lookup(value.name);
  });

  /** `"c:\\planos\\casa.dwg"` → `"casa"`. Sin carpeta y sin extensión. */
  defsubr(table, "vl-filename-base", 1, 1, (args, ctx) => {
    const name = fileName(wantString(args[0]).v);
    const dot = extensionDot(name);
    return str(chargedString(ctx, dot < 0 ? name : name.slice(0, dot)));
  });

  /**
   * `"c:\\planos\\casa.dwg"` → `"c:\\planos"`, SIN la barra final. Una ruta sin
   * carpeta devuelve nil, y no la cadena vacía: es lo que distingue «está en el
   * directorio actual» de «está en la raíz», y las rutinas lo comprueban con
   * `(if (vl-filename-directory ruta) …)`.
   */
  defsubr(table, "vl-filename-directory", 1, 1, (args, ctx) => {
    const path = wantString(args[0]).v;
    const separator = lastSeparator(path);
    if (separator < 0) return NIL;
    return str(chargedString(ctx, path.slice(0, separator)));
  });

  /** `"casa.dwg"` → `".dwg"`, CON el punto. Sin extensión, nil. */
  defsubr(table, "vl-filename-extension", 1, 1, (args, ctx) => {
    const name = fileName(wantString(args[0]).v);
    const dot = extensionDot(name);
    if (dot < 0) return NIL;
    return str(chargedString(ctx, name.slice(dot)));
  });
}
