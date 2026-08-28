/**
 * NOVEDADES — el archivo simple que alimenta `/novedades`.
 *
 * ── POR QUÉ EXISTE ESTA PÁGINA ──────────────────────────────────────────────
 * Un producto en beta tiene un problema de confianza que no se resuelve con
 * copy: el visitante no sabe si esto está vivo o si lleva ocho meses parado con
 * una portada bonita. Una lista fechada de lo que ha cambiado responde a eso sin
 * prometer nada, y para un producto joven es argumento de venta, no relleno.
 *
 * ── POR QUÉ UN MÓDULO Y NO UN CMS ───────────────────────────────────────────
 * Porque el coste de publicar tiene que ser CERO o la página se queda vieja, que
 * es peor que no tenerla: un «último cambio: hace siete meses» dice justo lo
 * contrario de lo que la página venía a decir. Añadir una entrada es añadir un
 * objeto aquí en el mismo commit que hace el cambio. Sin panel, sin base de
 * datos, sin build aparte.
 *
 * ── LA REGLA DE CONTENIDO ───────────────────────────────────────────────────
 * Cada entrada describe algo que YA está en producción y que un usuario puede
 * tocar. No hay «próximamente», no hay hoja de ruta y no hay cifras de precio.
 * Lo que está tras flag se dice que está tras flag. El tono es el mismo del
 * resto de la superficie: lo que falta se declara, no se insinúa.
 */

export type ChangeKind = "novedad" | "mejora" | "arreglo";

export interface ChangeEntry {
  /** ISO corto: se ordena solo y no depende de la configuración regional. */
  fecha: string;
  tipo: ChangeKind;
  titulo: string;
  detalle: string;
}

/** Etiqueta y color de cada tipo. Los tres tokens, ningún color suelto. */
export const CHANGE_KINDS: Record<
  ChangeKind,
  { label: string; className: string }
> = {
  novedad: { label: "Novedad", className: "bg-success/15 text-success-ink" },
  mejora: { label: "Mejora", className: "bg-primary/15 text-primary-ink" },
  arreglo: { label: "Arreglo", className: "bg-warning/15 text-warning-ink" },
};

/**
 * Las entradas, de la más reciente a la más antigua. El orden se respeta tal
 * cual está escrito: ordenar por fecha en tiempo de render escondería el día
 * que alguien escribiera una fecha mal, y prefiero que se vea.
 */
export const CHANGELOG: readonly ChangeEntry[] = [
  {
    fecha: "2026-08-28",
    tipo: "novedad",
    titulo: "Identidad visual propia y modo oscuro por defecto",
    detalle:
      "El producto estrena su paleta: sustrato de grafito cálido, acento violeta eléctrico y una tipografía de titulares que comparte esqueleto con la monoespaciada de las cotas. El modo oscuro pasa a ser el que abre por defecto —es la convención de una mesa de dibujo— y el claro sigue completo para quien dibuja de día. Todo el contraste está medido: 70 pares en los dos temas contra el umbral AA.",
  },
  {
    fecha: "2026-08-28",
    tipo: "mejora",
    titulo: "Centro de preguntas con buscador",
    detalle:
      "Las siete preguntas frecuentes de la portada pasan a ser un centro de preguntas de seis categorías con buscador, que mira también dentro de las respuestas y no se atasca con los acentos. Cada respuesta enlaza a la guía que lo cuenta largo.",
  },
  {
    fecha: "2026-08-27",
    tipo: "novedad",
    titulo: "Lanzamiento gratuito sin tarjeta",
    detalle:
      "Se abre el acceso con un periodo gratuito cuya duración anuncia el propio producto leyendo su configuración, para que lo prometido y lo concedido no puedan discrepar. Al terminar no se cobra nada y la cuenta conserva el permiso de ver y exportar: los planos siguen siendo tuyos.",
  },
  {
    fecha: "2026-08-27",
    tipo: "mejora",
    titulo: "La matemática del dibujo, verificada contra un oráculo aparte",
    detalle:
      "Las operaciones geométricas del editor se comprueban contra resultados calculados de forma independiente, no contra la corrida anterior de sí mismas. Es la diferencia entre «no ha cambiado» y «está bien».",
  },
  {
    fecha: "2026-08-26",
    tipo: "novedad",
    titulo: "Espacio papel, tablas de plumas y PDF a escala exacta",
    detalle:
      "Presentaciones con varias ventanas, cada una a su escala y con capas congeladas por ventana; papeles de A4 a A0, carta y tabloide; tablas de plumas CTB y STB. La lámina sale a PDF con el tamaño de página exacto, su cajetín y su escala gráfica.",
  },
  {
    fecha: "2026-08-25",
    tipo: "mejora",
    titulo: "Muros que resuelven su unión al dibujarlos",
    detalle:
      "Esquina, T y continuación colineal se limpian solas mientras dibujas, en 2D y en la vista tridimensional de comprobación. Lo que todavía no hace el muro es alojar el hueco de una puerta o una ventana: eso se coloca como bloque encima.",
  },
  {
    fecha: "2026-08-24",
    tipo: "arreglo",
    titulo: "La portada dejó de desplazarse en horizontal en el teléfono",
    detalle:
      "El halo del marco del producto medía 32 puntos más que la figura por cada lado y nadie lo recortaba: en una pantalla de 390 la página entera se movía de lado. Medido, corregido y con la comprobación que lo habría cazado arreglada también.",
  },
  {
    fecha: "2026-08-22",
    tipo: "novedad",
    titulo: "Tipografías autohospedadas y sistema de diseño consumido",
    detalle:
      "Las fuentes dejan de descargarse de un tercero en tiempo de compilación y viven en el repositorio. El sistema de diseño —escala tipográfica, tres elevaciones, tres radios— pasa de estar escrito a estar realmente en uso, con un gate que lo comprueba.",
  },
] as const;
