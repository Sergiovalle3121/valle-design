import { circle, line, rect, type SeedBlock } from './seed-geometry';

/**
 * COCINA.
 *
 * ## Punto de inserción
 *
 * Las tres piezas se colocan contra el muro, sobre —o dentro de— una cubierta
 * de 0,60 m de fondo. Su origen es el centro de su borde posterior y crecen
 * hacia +Y. Así, colocar la estufa es engancharla al paño del muro; y como el
 * fondo de las tres es el mismo que el de la cubierta corriente, alinearse
 * unas con otras es gratis.
 *
 * ## Las medidas
 *
 * Producto, no norma. Son las medidas de catálogo dominantes en México:
 *
 * - Estufa de 30 pulgadas: 0,762 m de frente. Es LA medida de la estufa
 *   mexicana de piso y empotrable; el hueco de carpintería se hace para ella.
 * - Refrigerador de ~18 pies³: 0,70 × 0,70 m, el tamaño corriente en vivienda.
 * - Fregadero (tarja) doble de acero inoxidable: 0,80 × 0,50 m, que es lo que
 *   cabe en una cubierta de 0,60 m dejando el pretil de fondo.
 *
 * El fondo de 0,60 m de la cubierta es carpintería estándar y también la razón
 * de que el refrigerador de 0,70 sobresalga: sobresale de verdad, y el plano
 * tiene que decirlo.
 */

export const SEED_KITCHEN_BLOCKS: SeedBlock[] = [
  {
    slug: 'fregadero-doble-80',
    name: 'Fregadero doble 0.80 m',
    description:
      'Tarja doble de 0.80 × 0.50 m sobre cubierta de 0.60 m. Se inserta contra el muro, por el centro.',
    keywords: ['fregadero', 'tarja', 'cocina', 'lavatrastes', 'doble'],
    layer: 'equipment',
    basePoint: { x: 0, y: 0, z: 0 },
    extent: { width: 800, depth: 500 },
    attributes: {
      CLAVE: { defaultValue: 'FR-01', prompt: 'Clave en planta' },
      ANCHO: { defaultValue: '0.80', prompt: 'Ancho (m)' },
      FONDO: { defaultValue: '0.50', prompt: 'Fondo (m)' },
      TARJAS: { defaultValue: '2', prompt: 'Número de tarjas' },
    },
    shapes: [
      rect(-400, 0, 800, 500),
      // La llave va del lado del muro; las dos tarjas, hacia el usuario.
      circle(0, 40, 30),
      rect(-370, 70, 340, 380),
      rect(30, 70, 340, 380),
    ],
  },
  {
    slug: 'estufa-76',
    name: 'Estufa 0.76 m (30")',
    description:
      'Estufa de 30 pulgadas, 0.762 × 0.60 m, con cuatro quemadores. Se inserta contra el muro, por el centro.',
    keywords: ['estufa', 'cocina', 'parrilla', 'quemadores', 'gas'],
    layer: 'equipment',
    basePoint: { x: 0, y: 0, z: 0 },
    extent: { width: 762, depth: 600 },
    attributes: {
      CLAVE: { defaultValue: 'ES-01', prompt: 'Clave en planta' },
      ANCHO: { defaultValue: '0.76', prompt: 'Ancho (m)' },
      FONDO: { defaultValue: '0.60', prompt: 'Fondo (m)' },
      QUEMADORES: { defaultValue: '4', prompt: 'Número de quemadores' },
    },
    shapes: [
      rect(-381, 0, 762, 600),
      circle(-170, 190, 90),
      circle(170, 190, 90),
      circle(-170, 430, 90),
      circle(170, 430, 90),
    ],
  },
  {
    slug: 'refrigerador-70',
    name: 'Refrigerador 0.70 m',
    description:
      'Refrigerador de ~18 pies³, 0.70 × 0.70 m: sobresale 0.10 m de una cubierta de 0.60 m.',
    keywords: ['refrigerador', 'refri', 'cocina', 'frigorífico'],
    layer: 'equipment',
    basePoint: { x: 0, y: 0, z: 0 },
    extent: { width: 700, depth: 700 },
    attributes: {
      CLAVE: { defaultValue: 'RF-01', prompt: 'Clave en planta' },
      ANCHO: { defaultValue: '0.70', prompt: 'Ancho (m)' },
      FONDO: { defaultValue: '0.70', prompt: 'Fondo (m)' },
    },
    shapes: [
      rect(-350, 0, 700, 700),
      // Cara de la puerta y su tirador: dicen por dónde abre y cuánto vuela.
      line(-350, 620, 350, 620),
      line(280, 640, 280, 690),
    ],
  },
];
