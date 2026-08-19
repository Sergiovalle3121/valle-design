/**
 * El arnés de los corpus con CRITERIO PUBLICADO.
 *
 * ## Qué problema resuelve
 *
 * Un corpus de geometría ajena no vale por la cantidad de casos: vale porque
 * cada caso dice ANTES de ejecutarse qué desenlace admite. Sin esa declaración,
 * una suite de robustez degenera en «lo que salga hoy es lo correcto»: alguien
 * cambia el motor, la aserción se ajusta al valor nuevo y la prueba deja de
 * proteger nada. El criterio escrito convierte cada caso en un contrato que hay
 * que renegociar a mano y por escrito para poder romperlo.
 *
 * ## Los tres desenlaces, y el cuarto que está prohibido
 *
 *   · `corrige` — el motor repara la entrada y el resultado es utilizable.
 *   · `rechaza` — se niega de forma explícita: error tipado, lista de contornos
 *     abiertos con nombre, o `null`. Fallo cerrado.
 *   · `degrada` — acepta y el corpus PUBLICA qué se pierde, con la cifra
 *     exacta. Una degradación sin número es una excusa.
 *
 * El cuarto desenlace —un resultado plausible y falso: un área que sale cero,
 * un contorno que cierra por donde no era, una entidad archivada en el origen—
 * no tiene casilla a propósito. Es el que no se ve mirando el plano y el que se
 * descubre en obra.
 *
 * ## Por qué NO se corta en el primer fallo
 *
 * `correr` ejecuta TODOS los casos y sólo entonces lanza. Un corpus que aborta
 * en el primero obliga a descubrir los defectos de uno en uno, con una corrida
 * completa por defecto; y estos casos son justamente los que aparecen a
 * racimos, porque una misma flaqueza numérica se manifiesta en cinco familias
 * distintas. La cuenta por criterio va en el resumen para que se vea de un
 * vistazo cuánto del corpus se apoya en degradaciones declaradas: si esa cifra
 * crece y las otras dos no, el motor no está mejorando, está prometiendo menos.
 *
 * Vive fuera de las specs porque los DOS corpus lo usan —el de geometría
 * degenerada y el de islas de sombreado— y porque un arnés duplicado se separa
 * en dos semanas.
 */

export type CorpusCriterio = "corrige" | "rechaza" | "degrada";

export interface CorpusCaso {
  /** `familia/nombre`. La familia agrupa el resumen y la publica la rúbrica. */
  id: string;
  /** Qué se le entrega al motor, dicho en la lengua del dibujante. */
  entrada: string;
  criterio: CorpusCriterio;
  /** Qué DEBE pasar. Es el contrato; las aserciones sólo lo comprueban. */
  publicado: string;
  comprobar: () => void;
}

export interface Corpus {
  caso: (item: CorpusCaso) => void;
  /** Ejecuta todos, imprime el resumen y lanza si alguno incumple. */
  correr: (nombre: string) => void;
}

/** Mensaje del error, o `null` si la llamada NO se negó. Para el fallo cerrado. */
export function seNiega(accion: () => unknown): string | null {
  try {
    accion();
    return null;
  } catch (error) {
    return (error as Error).message;
  }
}

export function crearCorpus(): Corpus {
  const casos: CorpusCaso[] = [];
  return {
    caso: (item) => casos.push(item),
    correr: (nombre) => {
      const fallos: string[] = [];
      const porCriterio: Record<CorpusCriterio, number> = { corrige: 0, rechaza: 0, degrada: 0 };
      const vistos = new Set<string>();
      for (const item of casos) {
        if (vistos.has(item.id)) throw new Error(`${nombre}: caso duplicado ${item.id}`);
        vistos.add(item.id);
        // Un criterio de tres palabras no es un criterio: es una etiqueta. El
        // mínimo obliga a escribir QUÉ pasa y no sólo que algo pasa.
        if (item.publicado.length <= 40)
          throw new Error(`${nombre}: el criterio publicado de ${item.id} es demasiado corto.`);
        porCriterio[item.criterio] += 1;
        try {
          item.comprobar();
        } catch (error) {
          fallos.push(`${item.id} [${item.criterio}] — ${item.publicado}\n    ${(error as Error).message}`);
        }
      }
      if (fallos.length) {
        for (const fallo of fallos) console.error(`❌ ${fallo}`);
        throw new Error(`${nombre}: ${fallos.length} de ${casos.length} casos incumplen su criterio.`);
      }
      const familias = [...new Set(casos.map((item) => item.id.split("/")[0]))];
      console.log(
        `${nombre}: ${casos.length} casos en ${familias.length} familias (${familias.join(", ")}) · ` +
          `${porCriterio.corrige} corrigen, ${porCriterio.rechaza} rechazan con error explícito, ` +
          `${porCriterio.degrada} degradan declarando la pérdida`,
      );
    },
  };
}
