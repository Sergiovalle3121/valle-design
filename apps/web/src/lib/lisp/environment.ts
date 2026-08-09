/**
 * Ámbitos: por qué AutoLISP NO tiene cierres léxicos, y por qué imitarlo importa.
 *
 * Un intérprete moderno ataría cada `lambda` a su entorno de definición. Sería
 * más limpio y sería INCOMPATIBLE. AutoLISP es de ámbito DINÁMICO: hay una sola
 * tabla de símbolos, y `(defun dibuja (p1 p2 / ancho alto)` no crea un entorno
 * nuevo — guarda el valor anterior de esos cinco nombres, los reasigna, y los
 * restaura al salir.
 *
 * La diferencia es visible en el código real que traen los veteranos:
 *
 *     (defun ajusta ( / escala) (setq escala 2.0) (aplica))
 *     (defun aplica () (* 10 escala))     ; ← ve `escala` sin recibirla
 *
 * Con ámbito léxico `aplica` no vería nada y devolvería un error. Con ámbito
 * dinámico funciona, y así es como está escrita media biblioteca de rutinas de
 * cajetín que existe. Copiar la semántica no es nostalgia: es el producto.
 *
 * ## Y por qué la restauración va en `finally`
 *
 * Si una rutina falla a mitad, sus locales tienen que volver a su valor previo
 * igualmente. Sin eso, un error dentro de `(defun x ( / pt)` dejaría `pt`
 * contaminado para el resto de la sesión y el siguiente comando dibujaría en el
 * sitio equivocado — un fallo que aparece UNA vez y no se reproduce.
 *
 * ## Un espacio de nombres, no dos
 *
 * En AutoLISP `(setq car 5)` rompe `car` de verdad: funciones y variables
 * comparten tabla. Se reproduce, porque hay rutinas que dependen de reasignar
 * nombres. Lo que NO se reproduce es el alcance del destrozo: cada sesión parte
 * de una tabla nueva sobre los builtins, así que una rutina que se cargue `car`
 * se lo carga PARA ELLA. El editor sigue entero.
 */
import type { LispValue } from "./values";
import { NIL } from "./values";

/** Un valor guardado para restaurar; `undefined` significa «no existía». */
type SavedBinding = readonly [name: string, previous: LispValue | undefined];

export class LispScope {
  private readonly values: Map<string, LispValue>;

  /**
   * `builtins` es la tabla base COMPARTIDA y de sólo lectura. No se copia
   * entrada a entrada: son cientos de símbolos y una sesión LISP puede abrirse
   * en cada pulsación de la línea de comandos. Se consulta como respaldo, y
   * cualquier escritura cae en la tabla propia de la sesión — que es lo que
   * hace que redefinir `car` no salga de aquí.
   */
  constructor(private readonly builtins: ReadonlyMap<string, LispValue>) {
    this.values = new Map();
  }

  /** Valor de un símbolo. Un símbolo sin ligar vale `nil`, como el original. */
  get(name: string): LispValue {
    const own = this.values.get(name);
    if (own !== undefined) return own;
    return this.builtins.get(name) ?? NIL;
  }

  /** Verdadero si el nombre tiene valor propio o de sistema. */
  bound(name: string): boolean {
    return this.values.has(name) || this.builtins.has(name);
  }

  /** Verdadero si el nombre lo redefinió la sesión encima de un builtin. */
  shadowsBuiltin(name: string): boolean {
    return this.values.has(name) && this.builtins.has(name);
  }

  set(name: string, value: LispValue): void {
    this.values.set(name, value);
  }

  /**
   * Liga los argumentos y locales de una llamada, devolviendo lo que hay que
   * restaurar. La lista se devuelve en vez de guardarse en una pila interna
   * para que la restauración sea responsabilidad del `finally` de quien llamó:
   * una pila interna se descuadra en cuanto alguien lanza entre medias.
   */
  bindFrame(names: readonly string[], values: readonly LispValue[]): SavedBinding[] {
    const saved: SavedBinding[] = [];
    for (let index = 0; index < names.length; index += 1) {
      const name = names[index];
      saved.push([name, this.values.get(name)]);
      this.values.set(name, values[index] ?? NIL);
    }
    return saved;
  }

  restoreFrame(saved: readonly SavedBinding[]): void {
    // Al revés: un mismo nombre repetido en la lista de argumentos —que
    // AutoLISP admite— debe acabar con el valor MÁS antiguo, no con el del
    // medio.
    for (let index = saved.length - 1; index >= 0; index -= 1) {
      const [name, previous] = saved[index];
      if (previous === undefined) this.values.delete(name);
      else this.values.set(name, previous);
    }
  }

  /** Nombres definidos por la sesión (no los builtins). Para depuración. */
  ownNames(): string[] {
    return [...this.values.keys()].sort();
  }
}
