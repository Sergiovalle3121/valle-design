/**
 * SCRIPT: ejecutar un `.scr`.
 *
 * ## Por qué sale casi gratis y por qué vale tanto
 *
 * Un `.scr` es una lista de comandos separados por saltos de línea. Nada más.
 * Como el motor ya acepta entrada TECLEADA —y una línea de un script es
 * exactamente eso—, ejecutar un script es leer el archivo y meter sus renglones
 * por la misma puerta por la que entra lo que escribe el usuario. No hay
 * segundo intérprete, así que no hay dos comportamientos que puedan divergir.
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
 * lo AVISA cuando detecta un comando con diálogo, en vez de dejar que el script
 * se pare sin explicación.
 */

/** Un renglón del script, ya limpio. */
export interface CadScriptLine {
  /** Lo que hay que entregar al motor. Cadena vacía = Enter. */
  token: string;
  /** Renglón del archivo original, para poder señalar el que falla. */
  line: number;
}

/**
 * Comandos que abren un cuadro y dejarían el script colgado. Su variante con
 * guion hace lo mismo por la línea de comandos.
 */
export const CAD_DIALOG_COMMANDS: readonly string[] = [
  "LAYER",
  "LINETYPE",
  "OSNAP",
  "DSETTINGS",
  "OPTIONS",
  "PROPERTIES",
  "TOOLPALETTES",
  "UCSMAN",
  "INSERT",
  "PLOT",
  "STYLE",
];

export function parseCadScript(source: string): CadScriptLine[] {
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
  // El salto final que todo editor añade no es un Enter que el autor quisiera.
  while (lines.length > 0 && lines[lines.length - 1].token === "") lines.pop();
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
}

/**
 * Ejecuta un script contra un anfitrión del motor.
 *
 * Nunca lanza: un renglón que hace saltar un comando produce un aviso con su
 * número de línea y el script continúa. Un script de doscientas líneas que se
 * detiene en la tercera sin decir cuál era es peor que uno que termina
 * contando lo que no pudo hacer.
 */
export function runCadScript(source: string, sink: CadScriptSink): CadScriptRunReport {
  const warnings: string[] = [];
  const lines = parseCadScript(source);
  let executed = 0;

  for (const entry of lines) {
    const head = entry.token.split(/\s+/)[0]?.toUpperCase() ?? "";
    if (CAD_DIALOG_COMMANDS.includes(head))
      warnings.push(
        `Línea ${entry.line}: "${head}" abre un cuadro de diálogo y un script no puede pulsarlo. ` +
          `Use -${head}.`,
      );
    try {
      if (entry.token === "" && sink.accept) sink.accept();
      else sink.submit(entry.token);
      executed += 1;
    } catch (cause) {
      warnings.push(
        `Línea ${entry.line} ("${entry.token}"): ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    }
  }

  const unfinished = sink.busy === true;
  if (unfinished)
    warnings.push(
      "El script ha terminado con un comando a medias: le falta un Enter o un renglón en blanco al final.",
    );
  return { executed, warnings, unfinished };
}
