/**
 * Lector de bibliotecas de tipos de línea `.lin`.
 *
 * Un `.lin` es el formato con el que AutoCAD lleva desde los ochenta
 * distribuyendo tipos de línea, y todo estudio tiene el suyo con las
 * convenciones de la casa. Poder cargarlo es la diferencia entre «el CAD trae
 * seis tipos de línea» y «el CAD dibuja como dibujamos aquí».
 *
 * ## El formato, que cabe en un párrafo
 *
 * Dos renglones por tipo. El primero empieza por `*` y trae nombre y
 * descripción; el segundo empieza por `A` —la alineación, que es siempre `A`—
 * y sigue con las longitudes: positiva es trazo, negativa es hueco, cero es
 * punto. Un `;` inicia un comentario.
 *
 * ```text
 * *DASHED,Trazos __ __ __ __
 * A,.5,-.25
 * ```
 *
 * ## Qué hace con lo que no entiende
 *
 * Lo cuenta. Un `.lin` de un estudio real trae definiciones complejas —con
 * texto y formas incrustados, `["GAS",STANDARD,S=.1,...]`— que este lector no
 * sabe dibujar. Saltárselas en silencio produciría un tipo de línea que se
 * llama igual y se ve distinto, que es peor que no cargarlo: se descubre al
 * imprimir. Cada una sale en `skipped` con su nombre y su razón.
 */

export interface CadLinetypeDefinition {
  name: string;
  description: string;
  /** Longitudes: >0 trazo, <0 hueco, 0 punto. Vacío en la línea continua. */
  pattern: readonly number[];
}

export interface CadLinetypeLibrary {
  definitions: readonly CadLinetypeDefinition[];
  /** Lo que no se ha podido cargar, con el porqué. Un renglón por definición. */
  skipped: readonly string[];
}

/** Los que trae el producto de fábrica, con los nombres de AutoCAD. */
export const CAD_BUILTIN_LINETYPES: readonly CadLinetypeDefinition[] = [
  { name: "Continuous", description: "Continua ______________________", pattern: [] },
  { name: "Dashed", description: "Trazos __ __ __ __ __ __ __", pattern: [0.5, -0.25] },
  { name: "Hidden", description: "Oculta _ _ _ _ _ _ _ _ _ _", pattern: [0.25, -0.125] },
  { name: "Center", description: "Ejes ____ _ ____ _ ____ _", pattern: [1.25, -0.25, 0.25, -0.25] },
  { name: "Phantom", description: "Ficticia ____ _ _ ____ _ _", pattern: [1.25, -0.25, 0.25, -0.25, 0.25, -0.25] },
  { name: "Dot", description: "Puntos . . . . . . . . . .", pattern: [0, -0.25] },
  { name: "Dashdot", description: "Trazo y punto _ . _ . _ .", pattern: [0.5, -0.25, 0, -0.25] },
  { name: "Divide", description: "División __ . . __ . . __", pattern: [0.5, -0.25, 0, -0.25, 0, -0.25] },
  { name: "Border", description: "Borde __ __ . __ __ . __", pattern: [0.5, -0.25, 0.5, -0.25, 0, -0.25] },
];

/**
 * Analiza el contenido de un `.lin`.
 *
 * Nunca lanza: un archivo corrupto tiene que producir un informe, no tirar el
 * editor de quien lo arrastró por error.
 */
export function parseCadLinetypeLibrary(source: string): CadLinetypeLibrary {
  const definitions: CadLinetypeDefinition[] = [];
  const skipped: string[] = [];
  const lines = source.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line || line.startsWith(";")) continue;
    if (!line.startsWith("*")) {
      // Un renglón de patrón sin su cabecera. No se adivina a quién pertenece.
      if (/^a\s*,/i.test(line)) skipped.push(`Renglón ${index + 1}: patrón sin cabecera "*nombre".`);
      continue;
    }

    const header = line.slice(1);
    const comma = header.indexOf(",");
    const name = (comma < 0 ? header : header.slice(0, comma)).trim();
    const description = comma < 0 ? "" : header.slice(comma + 1).trim();
    if (!name) {
      skipped.push(`Renglón ${index + 1}: definición sin nombre.`);
      continue;
    }

    const next = (lines[index + 1] ?? "").trim();
    if (!/^a\s*,/i.test(next)) {
      skipped.push(`"${name}": no le sigue un renglón de patrón que empiece por "A,".`);
      continue;
    }
    index += 1;

    if (next.includes("[")) {
      skipped.push(
        `"${name}": lleva texto o formas incrustados y este lector sólo entiende trazos y huecos.`,
      );
      continue;
    }

    const fields = next
      .split(",")
      .slice(1)
      .map((field) => field.trim())
      .filter((field) => field.length > 0);
    const pattern: number[] = [];
    let malformed = false;
    for (const field of fields) {
      const value = Number.parseFloat(field);
      if (!Number.isFinite(value)) {
        malformed = true;
        break;
      }
      pattern.push(value);
    }
    if (malformed) {
      skipped.push(`"${name}": el patrón lleva un valor que no es un número.`);
      continue;
    }
    if (pattern.length === 0) {
      skipped.push(`"${name}": el patrón está vacío.`);
      continue;
    }
    // Un patrón que sólo tiene huecos dibuja una línea invisible. Casi siempre
    // es un signo puesto al revés, y cargarlo produce una capa que "no se ve".
    // El CERO no cuenta como hueco: es un PUNTO, y es lo único que tiene el
    // patrón `DOT`, que es perfectamente legítimo.
    if (pattern.every((value) => value < 0)) {
      skipped.push(`"${name}": el patrón no tiene ningún trazo; la línea sería invisible.`);
      continue;
    }
    definitions.push({ name, description, pattern });
  }

  return { definitions, skipped };
}

/**
 * Longitud de un ciclo del patrón. Es lo que `LTSCALE` multiplica, y lo que
 * decide si un tipo de línea se ve a la escala del plano o parece continuo.
 */
export function cadLinetypeCycleLength(definition: CadLinetypeDefinition): number {
  return definition.pattern.reduce((total, value) => total + Math.abs(value), 0);
}

/** Catálogo de tipos de línea del dibujo. Arranca con los de fábrica. */
export class CadLinetypeCatalog {
  private items: CadLinetypeDefinition[] = [...CAD_BUILTIN_LINETYPES];

  list = (): readonly CadLinetypeDefinition[] => this.items;

  get = (name: string): CadLinetypeDefinition | undefined =>
    this.items.find((item) => item.name.toUpperCase() === name.trim().toUpperCase());

  save = (item: CadLinetypeDefinition): void => {
    const key = item.name.trim().toUpperCase();
    const at = this.items.findIndex((entry) => entry.name.toUpperCase() === key);
    if (at >= 0) this.items = this.items.map((entry, index) => (index === at ? item : entry));
    else this.items = [...this.items, item];
  };

  remove = (name: string): boolean => {
    const key = name.trim().toUpperCase();
    // La continua no se borra: es a lo que vuelve todo lo que se queda sin tipo.
    if (key === "CONTINUOUS") return false;
    const next = this.items.filter((entry) => entry.name.toUpperCase() !== key);
    if (next.length === this.items.length) return false;
    this.items = next;
    return true;
  };

  /** Carga una biblioteca entera. Devuelve cuántas entraron y qué se quedó fuera. */
  load = (library: CadLinetypeLibrary): { loaded: number; skipped: readonly string[] } => {
    for (const definition of library.definitions) this.save(definition);
    return { loaded: library.definitions.length, skipped: library.skipped };
  };
}
