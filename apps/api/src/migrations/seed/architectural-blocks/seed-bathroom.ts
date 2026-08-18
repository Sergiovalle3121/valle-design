import { arc, circle, line, rect, type SeedBlock } from './seed-geometry';

/**
 * MUEBLES DE BAÑO.
 *
 * ## Punto de inserción: donde la pieza toca la obra
 *
 * Un WC y un lavabo se colocan CONTRA UN MURO, así que su origen está en el
 * centro de su borde posterior y la pieza crece hacia +Y, hacia el interior
 * del baño. Una regadera y una tina se colocan EN UNA ESQUINA, así que su
 * origen es esa esquina y crecen hacia +X e +Y. Insertar cualquiera de ellas
 * por el centro de su caja obligaría a estimar la mitad de su fondo a ojo en
 * cada colocación; con estos orígenes, se engancha al muro y se acabó.
 *
 * ## Las medidas
 *
 * Las Normas Técnicas Complementarias para el Proyecto Arquitectónico de la
 * CDMX regulan el LOCAL —la superficie y el lado mínimo del baño, y que el
 * área de regadera tenga al menos 0,70 m por lado—, no la pieza. Las piezas
 * son producto: lo que se dibuja aquí son las medidas de catálogo de la
 * cerámica sanitaria que se vende en México.
 *
 * - WC de tanque bajo: 0,38 m de frente × 0,70 m de fondo.
 * - Lavabo de sobreponer / pedestal: 0,50 × 0,42 m.
 * - Regadera: 0,90 × 0,90 m, la que se construye en vivienda (el mínimo
 *   normativo de 0,70 m es más chico de lo que nadie dibuja).
 * - Tina: 1,70 × 0,75 m.
 *
 * Van a la capa `equipment` por la misma razón técnica que explica
 * `seed-geometry.ts`: es una capa que el documento ya declara. Una capa de
 * muebles propia queda anotada como pendiente.
 */

export const SEED_BATHROOM_BLOCKS: SeedBlock[] = [
  {
    slug: 'wc-tanque-bajo',
    name: 'WC de tanque bajo',
    description:
      'Inodoro de tanque bajo, 0.38 × 0.70 m. Se inserta contra el muro, por el centro del tanque.',
    keywords: ['wc', 'inodoro', 'baño', 'sanitario', 'taza', 'excusado'],
    layer: 'equipment',
    basePoint: { x: 0, y: 0, z: 0 },
    extent: { width: 380, depth: 700 },
    attributes: {
      CLAVE: { defaultValue: 'WC-01', prompt: 'Clave en planta' },
      ANCHO: { defaultValue: '0.38', prompt: 'Ancho (m)' },
      FONDO: { defaultValue: '0.70', prompt: 'Fondo (m)' },
    },
    shapes: [
      // Tanque contra el muro.
      rect(-190, 0, 380, 180),
      // Taza: dos costados rectos y el frente redondeado.
      line(-165, 180, 165, 180),
      line(-165, 180, -165, 535),
      line(165, 180, 165, 535),
      arc(0, 535, 165, 0, 180),
    ],
  },
  {
    slug: 'lavabo-50',
    name: 'Lavabo 0.50 m',
    description:
      'Lavabo de 0.50 × 0.42 m con tazón y llave. Se inserta contra el muro, por el centro.',
    keywords: ['lavabo', 'baño', 'tarja', 'ovalín', 'sanitario'],
    layer: 'equipment',
    basePoint: { x: 0, y: 0, z: 0 },
    extent: { width: 500, depth: 420 },
    attributes: {
      CLAVE: { defaultValue: 'LV-01', prompt: 'Clave en planta' },
      ANCHO: { defaultValue: '0.50', prompt: 'Ancho (m)' },
      FONDO: { defaultValue: '0.42', prompt: 'Fondo (m)' },
    },
    shapes: [
      rect(-250, 0, 500, 420),
      // La llave va del lado del muro; el tazón, hacia el usuario.
      circle(0, 60, 30),
      circle(0, 230, 165),
    ],
  },
  {
    slug: 'regadera-90',
    name: 'Regadera 0.90 × 0.90 m',
    description:
      'Plato de regadera de 0.90 × 0.90 m con coladera al centro. Se inserta en la esquina del baño.',
    keywords: ['regadera', 'ducha', 'baño', 'plato', 'coladera'],
    layer: 'equipment',
    basePoint: { x: 0, y: 0, z: 0 },
    extent: { width: 900, depth: 900 },
    attributes: {
      CLAVE: { defaultValue: 'RG-01', prompt: 'Clave en planta' },
      ANCHO: { defaultValue: '0.90', prompt: 'Ancho (m)' },
      FONDO: { defaultValue: '0.90', prompt: 'Fondo (m)' },
    },
    shapes: [
      rect(0, 0, 900, 900),
      // Las cuatro pendientes hacia la coladera: el símbolo de planta que
      // distingue una regadera de un cuadro cualquiera.
      line(0, 0, 450, 450),
      line(900, 0, 450, 450),
      line(900, 900, 450, 450),
      line(0, 900, 450, 450),
      circle(450, 450, 50),
    ],
  },
  {
    slug: 'tina-170',
    name: 'Tina 1.70 m',
    description:
      'Tina de 1.70 × 0.75 m con desagüe en la cabecera. Se inserta en la esquina, entre muros.',
    keywords: ['tina', 'bañera', 'baño', 'jacuzzi'],
    layer: 'equipment',
    basePoint: { x: 0, y: 0, z: 0 },
    extent: { width: 1700, depth: 750 },
    attributes: {
      CLAVE: { defaultValue: 'TN-01', prompt: 'Clave en planta' },
      ANCHO: { defaultValue: '1.70', prompt: 'Largo (m)' },
      FONDO: { defaultValue: '0.75', prompt: 'Ancho (m)' },
    },
    shapes: [
      rect(0, 0, 1700, 750),
      // Vaso interior: el faldón perimetral de 70 mm es lo que se azulejea.
      rect(70, 70, 1560, 610),
      circle(180, 375, 45),
    ],
  },
];
