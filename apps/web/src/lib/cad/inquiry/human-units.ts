/**
 * Medidas EN LENGUAJE DE OBRA: metros cuadrados, no unidades de dibujo.
 *
 * ## Por qué hace falta otro formateador
 *
 * `inquiry/reports.ts` ya formatea áreas y longitudes, pero lo hace como la
 * línea de comandos de AutoCAD: en unidades de DIBUJO y con las cifras que
 * pida LUNITS, porque ahí el número se copia a otro comando. Un plano en
 * milímetros contesta entonces «Área = 23600000.0000», que es correcto y no
 * se puede leer.
 *
 * Este módulo es para el otro sitio: la paleta de propiedades y cualquier
 * cartel que vea alguien que acaba de dibujar su primera habitación. Ahí la
 * pregunta no es «¿qué número le paso al siguiente comando?» sino «¿cuánto
 * mide esto?», y la respuesta se dice en m² y en metros.
 *
 * ## Las reglas, y por qué
 *
 * · Se convierte a partir de la unidad del DOCUMENTO (`meta.unit`). Un plano
 *   en milímetros y otro en pies dan el mismo cuarto y el mismo número.
 * · Métrico manda m²; por debajo de 0,01 m² se baja a cm², porque «0.00 m²»
 *   no es una medida, es un fallo disfrazado.
 * · Imperial manda pies cuadrados, y por debajo de medio pie, pulgadas.
 * · Una unidad que no se reconoce NO se inventa: se dice «u²» y se deja el
 *   número tal cual. Mentir sobre la unidad es peor que no traducirla.
 */

/** Cuánto mide, en metros, UNA unidad de dibujo de cada unidad conocida. */
const METROS_POR_UNIDAD: Readonly<Record<string, number>> = {
  mm: 0.001,
  milimetro: 0.001,
  cm: 0.01,
  centimetro: 0.01,
  dm: 0.1,
  m: 1,
  metro: 1,
  km: 1000,
  in: 0.0254,
  pulgada: 0.0254,
  ft: 0.3048,
  pie: 0.3048,
  yd: 0.9144,
  mi: 1609.344,
};

/** Las que se dicen en pies y pulgadas, no en metros. */
const IMPERIALES = new Set(["in", "pulgada", "ft", "pie", "yd", "mi"]);

const PIE_EN_METROS = 0.3048;
const PULGADA_EN_METROS = 0.0254;

function normalizar(unit: string | undefined): string {
  return (unit ?? "").trim().toLowerCase();
}

function cifra(valor: number, decimales: number): string {
  return new Intl.NumberFormat("es-MX", {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(valor);
}

/**
 * Área en lenguaje de obra. Entra en unidades de dibujo al cuadrado —lo que
 * devuelve `cadEntityArea`— y sale con su unidad escrita.
 */
export function formatCadHumanArea(area: number, unit: string | undefined): string {
  if (!Number.isFinite(area)) return "—";
  const clave = normalizar(unit);
  const metros = METROS_POR_UNIDAD[clave];
  if (metros === undefined) return `${cifra(area, 2)} u²`;
  const m2 = area * metros * metros;
  if (IMPERIALES.has(clave)) {
    const pies2 = m2 / (PIE_EN_METROS * PIE_EN_METROS);
    if (Math.abs(pies2) < 0.5) {
      return `${cifra(m2 / (PULGADA_EN_METROS * PULGADA_EN_METROS), 0)} in²`;
    }
    return `${cifra(pies2, 2)} ft²`;
  }
  // Por debajo de un centímetro cuadrado largo, m² sólo sabe decir «0.00».
  if (Math.abs(m2) < 0.01) return `${cifra(m2 * 10_000, 0)} cm²`;
  return `${cifra(m2, 2)} m²`;
}

/** Longitud en lenguaje de obra: metros, o pies en un plano imperial. */
export function formatCadHumanLength(length: number, unit: string | undefined): string {
  if (!Number.isFinite(length)) return "—";
  const clave = normalizar(unit);
  const metros = METROS_POR_UNIDAD[clave];
  if (metros === undefined) return `${cifra(length, 2)} u`;
  const m = length * metros;
  if (IMPERIALES.has(clave)) {
    const pies = m / PIE_EN_METROS;
    if (Math.abs(pies) < 1) return `${cifra(m / PULGADA_EN_METROS, 1)} in`;
    return `${cifra(pies, 2)} ft`;
  }
  if (Math.abs(m) < 0.1) return `${cifra(m * 100, 1)} cm`;
  return `${cifra(m, 2)} m`;
}
