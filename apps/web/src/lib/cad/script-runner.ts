/**
 * SCRIPT: ejecutar un `.scr`.
 *
 * ## Por qué sale casi gratis y por qué vale tanto
 *
 * Un `.scr` es una lista de comandos separados por saltos de línea. Nada más.
 * Como el motor ya acepta entrada TECLEADA —y una línea de un script es
 * exactamente eso—, ejecutar un script es leer el archivo y meter sus renglones
 * por la misma puerta por la que entra lo que escribe el usuario.
 *
 * El FORMATO se lee en un solo sitio —`parseCadScript`, aquí abajo— y de ahí
 * beben los dos ejecutores que existen: éste, que empuja renglones al editor
 * vivo, y `engine/script-runner.ts`, que ejecuta el mismo guión sin anfitrión
 * ninguno. Un solo analizador es lo que impide que las reglas del `.scr`
 * puedan divergir según por dónde entre el archivo.
 *
 * Es la automatización más vieja de AutoCAD y sigue siendo la más usada:
 * plantillas de estudio, purgas nocturnas, lotes de trazado, configuración de
 * un dibujo recién abierto.
 *
 * ## Las tres reglas del formato, que no son obvias
 *
 * 1. **Un salto de línea es un ESPACIO**, no un separador inerte. En un script,
 *    el fin de renglón acepta el prompt igual que la barra espaciadora, que es
 *    como se encadenan `LINE`, tres puntos y el cierre.
 * 2. **Una línea EN BLANCO es un Enter**. Es como un script termina un comando
 *    que sigue pidiendo puntos. Descartarla —el impulso natural al leer un
 *    archivo— deja el script colgado en el comando anterior.
 * 3. **`;` inicia un comentario** hasta el fin de renglón.
 *
 * ## Lo que no hace
 *
 * No abre cuadros de diálogo, y por eso existen las variantes con guion. Un
 * `LAYER` dentro de un script abriría el gestor y el script se quedaría
 * esperando un clic; `-LAYER` hace el mismo trabajo por la línea. El ejecutor
 * se PARA al detectarlo, con un error tipado que nombra el renglón y la orden
 * que sí funciona, en vez de dejar que el guión se cuelgue sin explicación.
 */

/** Un renglón del script, ya limpio. */
export interface CadScriptLine {
  /** Lo que hay que entregar al motor. Cadena vacía = Enter. */
  token: string;
  /** Renglón del archivo original, para poder señalar el que falla. */
  line: number;
}

/**
 * Comandos que ABREN UN CUADRO nada más invocarse y por qué escribir en su
 * lugar dentro de un `.scr`.
 *
 * La lista anterior incluía `INSERT`, `PLOT` y `STYLE` por parecido con
 * AutoCAD, y en este producto los tres preguntan por la línea de comandos: el
 * ejecutor avisaba de un cuelgue que no podía ocurrir y mandaba al usuario a
 * una variante que no hacía falta. Un aviso falso se aprende a ignorar, y el
 * día que uno sea verdad también se ignora.
 *
 * El valor no siempre es «lo mismo con guion delante»: ni AutoCAD ni este
 * producto tienen `-OPTIONS` ni `-PROPERTIES`, y decir que los tienen sería
 * mandar al autor del guión a teclear un comando inexistente. Lo que se nombra
 * es lo que SÍ hace el trabajo desde la línea.
 *
 * `engine/script-runner.spec.ts` comprueba esta tabla contra el registro de
 * verdad —qué comandos piden interfaz en su primer paso—, así que no puede
 * quedarse desfasada en silencio.
 */
export const CAD_SCRIPT_LINE_ALTERNATIVE: Readonly<Record<string, readonly string[]>> = {
  LAYER: ["-LAYER"],
  LINETYPE: ["-LINETYPE"],
  OSNAP: ["-OSNAP"],
  // `-DSETTINGS` cubre forzado, rejilla y orto; las referencias a objetos son
  // de `-OSNAP`, que ya sabe leer los catorce modos.
  DSETTINGS: ["-DSETTINGS", "-OSNAP"],
  TOOLPALETTES: ["-TOOLPALETTES"],
  UCSMAN: ["-UCSMAN"],
  // Lo que el cuadro de opciones contiene son variables de sistema; desde un
  // guión se escriben con SETVAR, que es exactamente lo mismo sin el cuadro.
  OPTIONS: ["SETVAR"],
  // Leer las propiedades de lo designado desde un guión es LIST. Cambiarlas va
  // por los comandos que las cambian, no por la paleta.
  PROPERTIES: ["LIST"],
  // Un guión que llama a SCRIPT pediría OTRO archivo, y elegirlo es un clic.
  // No hay alternativa por la línea y decirlo es más honesto que inventarla.
  SCRIPT: [],
  RSCRIPT: [],
};

/**
 * Comandos que abren un cuadro y dejarían el script colgado. Su variante con
 * guion hace lo mismo por la línea de comandos.
 */
export const CAD_DIALOG_COMMANDS: readonly string[] =
  Object.keys(CAD_SCRIPT_LINE_ALTERNATIVE).sort();

/**
 * Qué escribir en su lugar, en una frase. Vive aquí y no en cada mensaje para
 * que el consejo sea el mismo lo diga quien lo diga.
 */
export function cadScriptLineAdvice(command: string): string {
  const key = command.trim().toUpperCase();
  // `Object.hasOwn` y no `in`: la segunda forma encuentra también lo que hereda
  // el prototipo, así que un comando llamado CONSTRUCTOR o TOSTRING recibiría un
  // consejo que nadie escribió.
  const alternatives = Object.hasOwn(CAD_SCRIPT_LINE_ALTERNATIVE, key)
    ? CAD_SCRIPT_LINE_ALTERNATIVE[key]
    : [];
  if (alternatives.length === 0)
    return "No hay forma de hacer ese trabajo por la línea de comandos desde un guión.";
  return `Use ${alternatives.join(" o ")}, que hace el mismo trabajo por la línea de comandos.`;
}

/**
 * Por qué se detuvo un guión. Un código por modo de fallo, porque el arreglo
 * es distinto en cada uno y «el script falló» no le dice a nadie qué tocar.
 */
export type CadScriptFailureCode =
  /** El renglón no nombra ningún comando conocido. */
  | "unknown-command"
  /** El comando abriría un cuadro o pediría un archivo: nadie va a pulsarlo. */
  | "needs-interface"
  /** El comando en curso rechazó lo que traía el renglón. */
  | "rejected"
  /** El renglón no hizo avanzar al comando: el guión se quedó dando vueltas. */
  | "stalled"
  /** El archivo terminó con un comando a medias. */
  | "unfinished"
  /** El comando lanzó una excepción. */
  | "threw";

/**
 * Fallo de un guión, con el RENGLÓN señalado.
 *
 * Es un error tipado y no una cadena porque quien lo recibe tiene que poder
 * decidir: la interfaz enseña `line` en el diálogo, un lote de servidor lo
 * escribe en su informe, y una prueba afirma el código sin depender de cómo
 * esté redactado el mensaje. Un `Error` genérico obliga a leer el texto con
 * expresiones regulares, y entonces cambiar una coma rompe a quien lo lea.
 */
export class CadScriptError extends Error {
  constructor(
    readonly code: CadScriptFailureCode,
    /** Renglón del `.scr`, empezando en 1. Es lo primero que se mira. */
    readonly line: number,
    /** Lo que había escrito en ese renglón. Vacío significa Enter. */
    readonly token: string,
    message: string,
    /** Comando en curso cuando se rompió, si lo había. */
    readonly command: string | null = null,
  ) {
    super(`Línea ${line}${token ? ` ("${token}")` : " (Enter)"}: ${message}`);
    this.name = "CadScriptError";
  }
}

export function parseCadScript(source: string): CadScriptLine[] {
  // Un archivo vacío no es «un Enter»: es un archivo vacío. `"".split("\n")`
  // devuelve un trozo, y sin este guardia un `.scr` en blanco aceptaría el
  // prompt del comando que estuviera en curso.
  if (source === "") return [];
  const lines: CadScriptLine[] = [];
  const rows = source.split(/\r?\n/);
  for (let index = 0; index < rows.length; index += 1) {
    const comment = rows[index].indexOf(";");
    const body = (comment >= 0 ? rows[index].slice(0, comment) : rows[index]).trim();
    // Un renglón que era SÓLO comentario no es un Enter: no estaba ahí para el
    // motor. Uno vacío de verdad sí, y por eso se distingue antes de recortar.
    if (comment >= 0 && body === "" && rows[index].trim().startsWith(";")) continue;
    lines.push({ token: body, line: index + 1 });
  }
  // Exactamente UNO. El salto de línea con el que todo editor termina un
  // archivo produce un último trozo vacío al partir, y ése no es un Enter que
  // el autor escribiera. Los demás SÍ lo son: `LINE\n0,0\n10,0\n\n` termina la
  // línea a propósito, y descartar todos los vacíos —el impulso natural— dejaba
  // el comando a medias y el script sin dibujar nada.
  if (source.endsWith("\n") && lines.length > 0 && lines[lines.length - 1].token === "") lines.pop();
  return lines;
}

/**
 * Lo que el ejecutor necesita del anfitrión: entregar un renglón. Es
 * exactamente `CadCommandEngineHost.submit`, escrito como interfaz mínima para
 * que `lib` no dependa de `components`.
 */
export interface CadScriptSink {
  submit(token: string): void;
  /** Si el anfitrión lo expone, se usa para avisar de un script que se colgó. */
  readonly busy?: boolean;
  /** Enter explícito. Sin él, un renglón vacío se entrega como token vacío. */
  accept?(): void;
}

export interface CadScriptRunReport {
  executed: number;
  warnings: readonly string[];
  /** `true` si al terminar quedaba un comando a medias esperando entrada. */
  unfinished: boolean;
  /** Los mismos fallos que `warnings`, tipados y con su renglón. */
  failures: readonly CadScriptError[];
  /** Renglón en el que se paró el guión; `null` si llegó al final. */
  stoppedAtLine: number | null;
}

export interface CadScriptRunOptions {
  /**
   * Seguir tras un renglón que falla. Por defecto NO.
   *
   * Un guión que se atasca a mitad y sigue empujando renglones mete la entrada
   * del comando siguiente en el comando anterior: lo que sale no es «el guión
   * menos una línea», es un dibujo que nadie escribió. Pararse y decir en qué
   * renglón es la única salida que deja el documento en un estado explicable.
   * Quien de verdad quiera un lote tolerante —una purga nocturna sobre cien
   * archivos— lo pide, y entonces sabe lo que está aceptando.
   */
  continueOnError?: boolean;
}

/**
 * Ejecuta un script contra un anfitrión VIVO del motor.
 *
 * ## Lo que este ejecutor puede ver y lo que no
 *
 * Empuja renglones por la misma puerta por la que entra lo tecleado, así que ve
 * lo que ve quien teclea: si el anfitrión lanza, si al final queda un comando a
 * medias, y si el renglón nombra un comando que abriría un cuadro. Lo que NO ve
 * es el rechazo INTERNO del motor —un comando inexistente produce un mensaje de
 * error, no una excepción— porque el mensaje va al diálogo del anfitrión y no
 * vuelve por aquí.
 *
 * Ese hueco es justamente el que cubre `engine/script-runner.ts`, que ejecuta
 * el mismo guión sin anfitrión, ve TODOS los efectos y falla cerrado ante
 * cualquiera de ellos. Los dos comparten `parseCadScript`, así que el formato
 * del `.scr` se lee en un solo sitio y no puede divergir.
 */
export function runCadScript(
  source: string,
  sink: CadScriptSink,
  options: CadScriptRunOptions = {},
): CadScriptRunReport {
  const failures: CadScriptError[] = [];
  const lines = parseCadScript(source);
  let executed = 0;
  let stoppedAtLine: number | null = null;

  for (const entry of lines) {
    const head = entry.token.split(/\s+/)[0]?.toUpperCase() ?? "";
    if (Object.hasOwn(CAD_SCRIPT_LINE_ALTERNATIVE, head)) {
      failures.push(
        new CadScriptError(
          "needs-interface",
          entry.line,
          entry.token,
          `"${head}" abre un cuadro y un guión no puede pulsarlo. ` +
            cadScriptLineAdvice(head),
          head,
        ),
      );
      if (!options.continueOnError) {
        stoppedAtLine = entry.line;
        break;
      }
    }
    try {
      if (entry.token === "" && sink.accept) sink.accept();
      else sink.submit(entry.token);
      executed += 1;
    } catch (cause) {
      failures.push(
        new CadScriptError(
          "threw",
          entry.line,
          entry.token,
          cause instanceof Error ? cause.message : String(cause),
        ),
      );
      if (!options.continueOnError) {
        stoppedAtLine = entry.line;
        break;
      }
    }
  }

  const unfinished = sink.busy === true;
  if (unfinished)
    failures.push(
      new CadScriptError(
        "unfinished",
        lines.length > 0 ? lines[lines.length - 1].line : 1,
        "",
        "el guión ha terminado con un comando a medias: le falta un Enter —un renglón en " +
          "blanco— al final.",
      ),
    );
  return {
    executed,
    warnings: failures.map((failure) => failure.message),
    unfinished,
    failures,
    stoppedAtLine,
  };
}
