import {
  line,
  polyline,
  rect,
  type SeedBlock,
  type SeedShape,
} from './seed-geometry';

/**
 * ESCALERAS Y COCHERAS.
 *
 * ## Escaleras: la geometría ES la norma
 *
 * Las Normas Técnicas Complementarias para el Proyecto Arquitectónico del
 * Reglamento de Construcciones de la CDMX fijan para la escalera de vivienda
 * un ancho mínimo de 0,90 m, una huella mínima de 0,25 m y un peralte máximo
 * de 0,18 m. Aquí se dibuja 0,90 / 0,28 / 0,175, que cumple con holgura y
 * además satisface la fórmula del paso cómodo (2 peraltes + 1 huella = 0,63 m,
 * dentro del intervalo habitual de 0,61 a 0,64 m).
 *
 * De ahí salen los 16 peraltes: 16 × 0,175 = 2,80 m, el entrepiso corriente de
 * la vivienda mexicana. Una escalera dibujada con un número de escalones que no
 * cierra contra el entrepiso es una escalera que no se puede construir, así que
 * el número de peraltes es un atributo del bloque y no un accidente del dibujo.
 *
 * El origen es el ARRANQUE, en la esquina izquierda, y se sube hacia +Y.
 *
 * ## Cocheras: el cajón lo fija la norma
 *
 * Las mismas Normas Técnicas fijan el cajón de estacionamiento en 5,00 × 2,40 m
 * para auto grande y 4,20 × 2,20 m para auto chico. El cajón se siembra ABIERTO
 * por el frente —tres lados— porque eso es lo que es: un espacio delimitado por
 * el que se entra, no una caja. La cochera techada de dos autos sí se cierra,
 * porque tiene muros y portón.
 *
 * Origen en la esquina izquierda de la ENTRADA; el vehículo entra hacia +Y.
 */

/** Huella y peralte del sembrado; ver la nota de arriba. */
const HUELLA = 280;
const PERALTE = 175;
const ANCHO_ESCALERA = 900;
/** 16 × 0,175 m = 2,80 m: el entrepiso corriente de la vivienda mexicana. */
const PERALTES = 16;

/**
 * Los atributos de escalera se DERIVAN de las constantes de arriba.
 *
 * Escritos a mano se desincronizan: alguien ajusta la huella para que el tramo
 * quepa y el atributo sigue diciendo 0,28. Entonces el plano acota una cosa y
 * la tabla de la escalera dice otra, y en obra se construye la que esté mal.
 */
const atributosEscalera = (clave: string) => ({
  CLAVE: { defaultValue: clave, prompt: 'Clave en planta' },
  ANCHO: {
    defaultValue: (ANCHO_ESCALERA / 1000).toFixed(2),
    prompt: 'Ancho (m)',
  },
  HUELLA: { defaultValue: (HUELLA / 1000).toFixed(2), prompt: 'Huella (m)' },
  PERALTE: {
    defaultValue: (PERALTE / 1000).toFixed(3),
    prompt: 'Peralte (m)',
  },
  PERALTES: { defaultValue: String(PERALTES), prompt: 'Número de peraltes' },
  ENTREPISO: {
    defaultValue: ((PERALTE * PERALTES) / 1000).toFixed(2),
    prompt: 'Entrepiso (m)',
  },
});

/**
 * Punta de flecha de la línea de subida. Hay dos porque la línea de subida
 * termina apuntando hacia arriba en el tramo recto y hacia la derecha después
 * del giro: una punta dibujada en la dirección equivocada convierte el símbolo
 * que dice «por aquí se sube» en ruido.
 */
const flechaArriba = (x: number, y: number): SeedShape[] => [
  line(x - 70, y - 120, x, y),
  line(x + 70, y - 120, x, y),
];

const flechaDerecha = (x: number, y: number): SeedShape[] => [
  line(x - 120, y - 70, x, y),
  line(x - 120, y + 70, x, y),
];

const escaleraRecta = (): SeedShape[] => {
  const huellas = 15;
  const largo = huellas * HUELLA;
  const shapes: SeedShape[] = [
    line(0, 0, 0, largo),
    line(ANCHO_ESCALERA, 0, ANCHO_ESCALERA, largo),
  ];
  for (let paso = 0; paso <= huellas; paso += 1)
    shapes.push(line(0, paso * HUELLA, ANCHO_ESCALERA, paso * HUELLA));
  shapes.push(line(ANCHO_ESCALERA / 2, 140, ANCHO_ESCALERA / 2, largo - 140));
  shapes.push(...flechaArriba(ANCHO_ESCALERA / 2, largo - 140));
  return shapes;
};

const escaleraEnL = (): SeedShape[] => {
  const tramoA = 8 * HUELLA; // 2240: ocho peraltes hasta el descanso.
  const descanso = ANCHO_ESCALERA; // El descanso es cuadrado: 0,90 × 0,90 m.
  const tramoB = 7 * HUELLA; // 1960: siete peraltes más tras el giro.
  const largo = tramoA + descanso;
  const ancho = ANCHO_ESCALERA + tramoB;
  const shapes: SeedShape[] = [
    polyline([
      [0, 0],
      [0, largo],
      [ancho, largo],
      [ancho, tramoA],
      [ANCHO_ESCALERA, tramoA],
      [ANCHO_ESCALERA, 0],
    ]),
  ];
  for (let paso = 1; paso <= 8; paso += 1)
    shapes.push(line(0, paso * HUELLA, ANCHO_ESCALERA, paso * HUELLA));
  // El último escalón del tramo B coincide con el contorno: no se repite.
  for (let paso = 1; paso <= 6; paso += 1)
    shapes.push(
      line(
        ANCHO_ESCALERA + paso * HUELLA,
        tramoA,
        ANCHO_ESCALERA + paso * HUELLA,
        largo,
      ),
    );
  const ejeDescanso = tramoA + descanso / 2;
  shapes.push(line(450, 140, 450, ejeDescanso));
  shapes.push(line(450, ejeDescanso, ancho - 140, ejeDescanso));
  shapes.push(...flechaDerecha(ancho - 140, ejeDescanso));
  return shapes;
};

function cajon(
  slug: string,
  nombre: string,
  ancho: number,
  largo: number,
  tipo: string,
): SeedBlock {
  return {
    slug,
    name: nombre,
    description: `Cajón de estacionamiento para ${tipo}: ${(ancho / 1000).toFixed(2)} × ${(largo / 1000).toFixed(2)} m. Abierto por el frente; se inserta en la esquina izquierda de la entrada.`,
    keywords: ['cochera', 'cajón', 'estacionamiento', 'auto', tipo],
    layer: 'architecture',
    basePoint: { x: 0, y: 0, z: 0 },
    extent: { width: ancho, depth: largo },
    attributes: {
      CLAVE: { defaultValue: 'E-01', prompt: 'Clave en planta' },
      ANCHO: { defaultValue: (ancho / 1000).toFixed(2), prompt: 'Ancho (m)' },
      LARGO: { defaultValue: (largo / 1000).toFixed(2), prompt: 'Largo (m)' },
      TIPO: { defaultValue: tipo, prompt: 'Tipo de vehículo' },
    },
    shapes: [
      line(0, 0, 0, largo),
      line(ancho, 0, ancho, largo),
      line(0, largo, ancho, largo),
    ],
  };
}

export const SEED_CIRCULATION_BLOCKS: SeedBlock[] = [
  {
    slug: 'escalera-recta-16',
    name: 'Escalera recta 16 peraltes',
    description:
      'Tramo recto de 0.90 m de ancho: 16 peraltes de 0.175 m y 15 huellas de 0.28 m para un entrepiso de 2.80 m.',
    keywords: ['escalera', 'recta', 'peralte', 'huella', 'circulación'],
    layer: 'architecture',
    basePoint: { x: 0, y: 0, z: 0 },
    extent: { width: ANCHO_ESCALERA, depth: 15 * HUELLA },
    attributes: atributosEscalera('ESC-01'),
    shapes: escaleraRecta(),
  },
  {
    slug: 'escalera-en-l-16',
    name: 'Escalera en L con descanso',
    description:
      'Escalera en L de 0.90 m de ancho con descanso cuadrado: 16 peraltes de 0.175 m para un entrepiso de 2.80 m en la mitad del desarrollo de un tramo recto.',
    keywords: ['escalera', 'descanso', 'en L', 'giro', 'circulación'],
    layer: 'architecture',
    basePoint: { x: 0, y: 0, z: 0 },
    extent: {
      width: ANCHO_ESCALERA + 7 * HUELLA,
      depth: 8 * HUELLA + ANCHO_ESCALERA,
    },
    attributes: atributosEscalera('ESC-02'),
    shapes: escaleraEnL(),
  },
  cajon(
    'cajon-auto-grande',
    'Cajón de estacionamiento (auto grande)',
    2400,
    5000,
    'auto grande',
  ),
  cajon(
    'cajon-auto-chico',
    'Cajón de estacionamiento (auto chico)',
    2200,
    4200,
    'auto chico',
  ),
  {
    slug: 'cochera-doble',
    name: 'Cochera techada 2 autos',
    description:
      'Cochera techada de 5.00 × 5.50 m para dos autos, con portón de 5.00 m al frente.',
    keywords: ['cochera', 'garaje', 'portón', 'dos autos', 'techada'],
    layer: 'architecture',
    basePoint: { x: 0, y: 0, z: 0 },
    extent: { width: 5000, depth: 5500 },
    attributes: {
      CLAVE: { defaultValue: 'COCH-01', prompt: 'Clave en planta' },
      ANCHO: { defaultValue: '5.00', prompt: 'Ancho (m)' },
      LARGO: { defaultValue: '5.50', prompt: 'Largo (m)' },
      CAJONES: { defaultValue: '2', prompt: 'Cajones' },
      PORTON: { defaultValue: '5.00', prompt: 'Claro del portón (m)' },
    },
    shapes: [
      rect(0, 0, 5000, 5500),
      // El portón, como entidad propia: es el claro por el que entra el auto y
      // el arquitecto necesita poder acotarlo sin desarmar el bloque.
      line(0, 0, 5000, 0),
      // División de los dos cajones, con el largo del cajón normativo (5,00 m).
      line(2500, 0, 2500, 5000),
    ],
  },
];
