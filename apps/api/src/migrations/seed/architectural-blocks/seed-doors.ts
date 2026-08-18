import {
  arc,
  line,
  rect,
  type SeedBlock,
  type SeedShape,
} from './seed-geometry';

/**
 * PUERTAS.
 *
 * ## El punto de inserción es el quicial, y por eso son usables
 *
 * Todas se insertan en la JAMBA IZQUIERDA del claro, que en la abatible es el
 * quicial —el eje de giro de la hoja—. El claro corre hacia +X, el muro queda
 * hacia −Y y el barrido de la hoja hacia +Y. Con eso, colocar una puerta es
 * enganchar su origen al extremo del vano que el arquitecto ya dibujó: un
 * `snap` y ya está. Un bloque insertado por el centro de su caja obligaría a
 * moverlo a ojo después de cada colocación, y a ojo no se dibuja un plano.
 *
 * Las puertas que giran al otro lado NO se siembran por duplicado: se insertan
 * con escala −1 en X, que es como se ha hecho siempre en CAD y como el editor
 * ya resuelve el INSERT reflejado.
 *
 * ## Las medidas
 *
 * Anchos de 0,90 / 0,80 / 0,70 m y altura de 2,10 m: son los mínimos que
 * exigen las Normas Técnicas Complementarias para el Proyecto Arquitectónico
 * del Reglamento de Construcciones de la Ciudad de México para el acceso a la
 * vivienda, los cuartos habitables y los baños respectivamente, y en la
 * práctica mexicana el mínimo ES la medida que se dibuja: la carpintería y las
 * puertas prefabricadas de tablarroca se venden en esos anchos.
 *
 * Hoja de 45 mm: espesor comercial dominante de la puerta tambor de madera en
 * México (la económica de interiores baja a 35 mm; el acceso sube a 45).
 *
 * Muro de 150 mm: block de concreto de 12 cm con aplanado de ~1,5 cm por cara,
 * el muro divisorio corriente de la vivienda mexicana. Sólo se dibujan los
 * batientes del vano; el muro lo dibuja el arquitecto, no el bloque.
 */

/** Espesor de hoja de puerta tambor de madera, medida comercial mexicana. */
const HOJA = 45;

/** Muro divisorio de block de 12 cm con aplanados: el batiente del vano. */
const MURO = 150;

/**
 * Puerta abatible: hoja abierta a 90° + arco de barrido + batientes del vano.
 *
 * El arco tiene el radio del CLARO y su centro en el quicial, no en el centro
 * del vano: es el espacio que la hoja barre y que ningún mueble puede ocupar.
 * Dibujarlo con otro centro es dibujar una mentira que el arquitecto usará
 * para decidir dónde va el buró.
 */
function puertaAbatible(claro: number): SeedShape[] {
  return [
    // Hoja abierta a 90°, con su espesor real.
    rect(0, 0, HOJA, claro),
    // Barrido: del canto de la hoja abierta (0, claro) al vano cerrado (claro, 0).
    arc(0, 0, claro, 0, 90),
    // Batientes: el espesor del muro en cada jamba.
    line(0, 0, 0, -MURO),
    line(claro, 0, claro, -MURO),
  ];
}

function abatible(
  slug: string,
  claro: number,
  nombre: string,
  uso: string,
  clave: string,
): SeedBlock {
  return {
    slug,
    name: nombre,
    description: `Puerta abatible de ${(claro / 1000).toFixed(2)} m para ${uso}. Se inserta en el quicial; para el giro contrario, escala −1 en X.`,
    keywords: ['puerta', 'abatible', 'acceso', uso, 'arquitectura'],
    layer: 'architecture',
    basePoint: { x: 0, y: 0, z: 0 },
    // La envolvente incluye el barrido (+claro en Y) y el batiente (−150 en Y).
    extent: { width: claro, depth: claro + MURO },
    opening: claro,
    attributes: {
      CLAVE: { defaultValue: clave, prompt: 'Clave en planta' },
      ANCHO: { defaultValue: (claro / 1000).toFixed(2), prompt: 'Ancho (m)' },
      ALTO: { defaultValue: '2.10', prompt: 'Alto (m)' },
      SENTIDO: { defaultValue: 'izquierda', prompt: 'Sentido de giro' },
    },
    shapes: puertaAbatible(claro),
  };
}

export const SEED_DOOR_BLOCKS: SeedBlock[] = [
  abatible(
    'puerta-abatible-90',
    900,
    'Puerta abatible 0.90 m',
    'acceso a la vivienda',
    'P-01',
  ),
  abatible(
    'puerta-abatible-80',
    800,
    'Puerta abatible 0.80 m',
    'recámara y estancia',
    'P-02',
  ),
  abatible('puerta-abatible-70', 700, 'Puerta abatible 0.70 m', 'baño', 'P-03'),
  {
    slug: 'puerta-corrediza-90',
    name: 'Puerta corrediza 0.90 m',
    description:
      'Puerta corrediza de 0.90 m con su recorrido dibujado: la hoja necesita 0.90 m de muro libre a la izquierda para abrir.',
    keywords: ['puerta', 'corrediza', 'riel', 'ahorro de espacio'],
    layer: 'architecture',
    basePoint: { x: 0, y: 0, z: 0 },
    // Del recorrido (−900) al canto derecho (900): 1800 de ancho envolvente.
    extent: { width: 1800, depth: 245 },
    opening: 900,
    attributes: {
      CLAVE: { defaultValue: 'P-04', prompt: 'Clave en planta' },
      ANCHO: { defaultValue: '0.90', prompt: 'Ancho (m)' },
      ALTO: { defaultValue: '2.10', prompt: 'Alto (m)' },
      RECORRIDO: {
        defaultValue: '0.90',
        prompt: 'Muro libre necesario (m)',
      },
    },
    shapes: [
      // Hoja cerrada, corrida por delante del paño del muro.
      rect(0, 25, 900, HOJA),
      // Recorrido de la hoja: lo que NO puede ocuparse con muebles ni
      // interruptores. Sin esta línea el bloque se coloca en muros donde la
      // puerta no abre, que es el error clásico de la corrediza.
      line(-900, 95, 900, 95),
      line(0, 0, 0, -MURO),
      line(900, 0, 900, -MURO),
    ],
  },
  {
    slug: 'puerta-doble-160',
    name: 'Puerta doble 1.60 m',
    description:
      'Puerta doble de dos hojas de 0.80 m: claro de 1.60 m. Se inserta en la jamba izquierda.',
    keywords: ['puerta', 'doble', 'sala', 'acceso', 'dos hojas'],
    layer: 'architecture',
    basePoint: { x: 0, y: 0, z: 0 },
    extent: { width: 1600, depth: 800 + MURO },
    opening: 1600,
    attributes: {
      CLAVE: { defaultValue: 'P-05', prompt: 'Clave en planta' },
      ANCHO: { defaultValue: '1.60', prompt: 'Ancho total (m)' },
      ALTO: { defaultValue: '2.10', prompt: 'Alto (m)' },
      HOJAS: { defaultValue: '2', prompt: 'Número de hojas' },
    },
    shapes: [
      // Hoja izquierda: quicial en el origen, barre de 0° a 90°.
      rect(0, 0, HOJA, 800),
      arc(0, 0, 800, 0, 90),
      // Hoja derecha: quicial en (1600, 0), barre de 90° a 180°.
      rect(1600 - HOJA, 0, HOJA, 800),
      arc(1600, 0, 800, 90, 180),
      line(0, 0, 0, -MURO),
      line(1600, 0, 1600, -MURO),
    ],
  },
  {
    slug: 'puerta-closet-200',
    name: 'Puerta de clóset 2.00 m',
    description:
      'Frente de clóset con dos hojas corredizas de 1.00 m traslapadas; claro de 2.00 m.',
    keywords: ['puerta', 'clóset', 'closet', 'corrediza', 'recámara'],
    layer: 'architecture',
    basePoint: { x: 0, y: 0, z: 0 },
    // 100 de marco hacia el muro + 65 de las dos hojas traslapadas.
    extent: { width: 2000, depth: 165 },
    opening: 2000,
    attributes: {
      CLAVE: { defaultValue: 'P-06', prompt: 'Clave en planta' },
      ANCHO: { defaultValue: '2.00', prompt: 'Ancho total (m)' },
      ALTO: { defaultValue: '2.40', prompt: 'Alto (m)' },
      HOJAS: { defaultValue: '2', prompt: 'Número de hojas' },
    },
    shapes: [
      // Dos hojas a distinta profundidad: así se lee cuál corre por delante.
      rect(0, 0, 1000, 30),
      rect(1000, 35, 1000, 30),
      // Marco del clóset contra el muro.
      line(0, 0, 0, -100),
      line(2000, 0, 2000, -100),
    ],
  },
];
