import { arc, line, rect, type SeedBlock } from './seed-geometry';

/**
 * VENTANAS.
 *
 * ## Punto de inserción y orientación
 *
 * Origen en la JAMBA IZQUIERDA del vano, sobre el paño INTERIOR del muro. El
 * claro corre hacia +X y el muro ocupa de y = 0 a y = 150; de ahí que el
 * interior del local quede en −Y y el exterior en +Y. Esa convención decide
 * hacia dónde abre cada hoja y hacia dónde proyecta la proyectante, y es la
 * razón de que se pueda insertar una ventana enganchando su origen al vano ya
 * dibujado sin girar nada.
 *
 * ## Las medidas
 *
 * Las Normas Técnicas Complementarias para el Proyecto Arquitectónico del
 * Reglamento de Construcciones de la CDMX no fijan un tamaño de ventana: fijan
 * una PROPORCIÓN —el área de ventana de un local habitable debe ser al menos
 * el 17,5 % de su superficie— y una altura mínima de antepecho por seguridad.
 * Los anchos de 1,20 / 1,50 / 0,60 m que se siembran son las medidas de
 * catálogo de la cancelería de aluminio mexicana (serie 3", la corriente en
 * vivienda), que es lo que de verdad se compra y se instala.
 *
 * Antepecho de 0,90 m en estancias y recámaras y de 1,80 m en la proyectante
 * de baño: práctica constructiva, no norma. Se declara como atributo para que
 * el arquitecto lo cambie cuando su proyecto diga otra cosa, en vez de quedar
 * escondido en la geometría.
 *
 * Muro de 150 mm, el mismo criterio que en las puertas.
 */

const MURO = 150;

/** Los dos paños del vano y sus jambas: el hueco donde entra la cancelería. */
const vano = (claro: number) => [
  line(0, 0, claro, 0),
  line(0, MURO, claro, MURO),
  line(0, 0, 0, MURO),
  line(claro, 0, claro, MURO),
];

export const SEED_WINDOW_BLOCKS: SeedBlock[] = [
  {
    slug: 'ventana-fija-120',
    name: 'Ventana fija 1.20 m',
    description:
      'Ventana fija de 1.20 × 1.20 m con antepecho de 0.90 m. No ventila: sólo ilumina.',
    keywords: ['ventana', 'fija', 'cancelería', 'iluminación', 'fachada'],
    layer: 'architecture',
    basePoint: { x: 0, y: 0, z: 0 },
    extent: { width: 1200, depth: MURO },
    opening: 1200,
    attributes: {
      CLAVE: { defaultValue: 'V-01', prompt: 'Clave en planta' },
      ANCHO: { defaultValue: '1.20', prompt: 'Ancho (m)' },
      ALTO: { defaultValue: '1.20', prompt: 'Alto (m)' },
      ANTEPECHO: { defaultValue: '0.90', prompt: 'Antepecho (m)' },
    },
    shapes: [
      ...vano(1200),
      // El vidrio, con su espesor de cancelería.
      line(0, 70, 1200, 70),
      line(0, 80, 1200, 80),
    ],
  },
  {
    slug: 'ventana-corrediza-150',
    name: 'Ventana corrediza 1.50 m',
    description:
      'Ventana corrediza de dos hojas de 0.75 m; ventila la mitad del claro.',
    keywords: ['ventana', 'corrediza', 'cancelería', 'ventilación', 'recámara'],
    layer: 'architecture',
    basePoint: { x: 0, y: 0, z: 0 },
    extent: { width: 1500, depth: MURO },
    opening: 1500,
    attributes: {
      CLAVE: { defaultValue: 'V-02', prompt: 'Clave en planta' },
      ANCHO: { defaultValue: '1.50', prompt: 'Ancho (m)' },
      ALTO: { defaultValue: '1.20', prompt: 'Alto (m)' },
      ANTEPECHO: { defaultValue: '0.90', prompt: 'Antepecho (m)' },
      VENTILACION: {
        defaultValue: '0.90',
        prompt: 'Área ventilable (m2)',
      },
    },
    shapes: [
      ...vano(1500),
      // Dos hojas a distinta profundidad: se lee cuál corre por delante y,
      // por tanto, qué mitad del claro ventila de verdad.
      rect(0, 50, 750, 25),
      rect(750, 85, 750, 25),
    ],
  },
  {
    slug: 'ventana-abatible-60',
    name: 'Ventana abatible 0.60 m',
    description:
      'Ventana abatible de 0.60 m que gira hacia el interior; el barrido invade el local.',
    keywords: ['ventana', 'abatible', 'batiente', 'cocina', 'ventilación'],
    layer: 'architecture',
    basePoint: { x: 0, y: 0, z: 0 },
    // El barrido baja hasta y = −600 (interior) y el muro sube hasta +150.
    extent: { width: 600, depth: 750 },
    opening: 600,
    attributes: {
      CLAVE: { defaultValue: 'V-03', prompt: 'Clave en planta' },
      ANCHO: { defaultValue: '0.60', prompt: 'Ancho (m)' },
      ALTO: { defaultValue: '1.20', prompt: 'Alto (m)' },
      ANTEPECHO: { defaultValue: '0.90', prompt: 'Antepecho (m)' },
    },
    shapes: [
      ...vano(600),
      // Hoja abierta a 90° hacia el interior y su barrido: 0,60 m que ningún
      // mueble ni fregadero puede ocupar bajo la ventana.
      rect(0, -600, 30, 600),
      arc(0, 0, 600, 270, 360),
    ],
  },
  {
    slug: 'ventana-proyectante-60',
    name: 'Ventana proyectante 0.60 m',
    description:
      'Ventana proyectante de 0.60 × 0.40 m con antepecho alto: la de baño, que ventila sin quitar privacidad.',
    keywords: ['ventana', 'proyectante', 'baño', 'privacidad', 'ventilación'],
    layer: 'architecture',
    basePoint: { x: 0, y: 0, z: 0 },
    // La hoja proyecta 270 mm hacia el exterior por encima del muro.
    extent: { width: 600, depth: 420 },
    opening: 600,
    attributes: {
      CLAVE: { defaultValue: 'V-04', prompt: 'Clave en planta' },
      ANCHO: { defaultValue: '0.60', prompt: 'Ancho (m)' },
      ALTO: { defaultValue: '0.40', prompt: 'Alto (m)' },
      ANTEPECHO: { defaultValue: '1.80', prompt: 'Antepecho (m)' },
    },
    shapes: [
      ...vano(600),
      line(0, 70, 600, 70),
      // La proyección hacia el exterior: la hoja vuela sobre la fachada y hay
      // que saberlo antes de pegarle una reja o el vecino.
      line(0, MURO, 300, 420),
      line(600, MURO, 300, 420),
    ],
  },
];
