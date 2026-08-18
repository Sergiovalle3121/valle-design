import { line, rect, type SeedBlock, type SeedShape } from './seed-geometry';

/**
 * MOBILIARIO.
 *
 * ## Punto de inserción
 *
 * Lo que se recarga en un muro se inserta por su contacto con el muro: la cama
 * por el centro de su cabecera y el sofá por el centro de su respaldo, ambos
 * creciendo hacia +Y; el clóset por su esquina trasera izquierda. Lo que se
 * coloca suelto en el local se inserta por su centro: la mesa y la silla. La
 * regla no es estética — es la que decide si colocar un mueble es un `snap` o
 * es arrastrarlo a ojo hasta que «se ve bien».
 *
 * ## Las medidas
 *
 * Son medidas COMERCIALES mexicanas, no normativas. El colchón en México se
 * vende en cuatro tallas y esas son las que hay que dibujar, porque son las
 * que el cliente va a comprar:
 *
 * - Individual: 0,99 × 1,90 m.
 * - Matrimonial: 1,35 × 1,90 m.
 * - Queen size: 1,52 × 1,98 m.
 * - King size: 1,98 × 2,00 m.
 *
 * Mesa de comedor para seis: 1,60 × 0,90 m, que sale de dar 0,60 m de frente
 * por comensal en los lados largos. Silla: 0,45 m de asiento y 0,50 m con
 * respaldo. Sofá de tres plazas: 2,10 × 0,90 m. Clóset: 0,60 m de fondo —el
 * que exige un gancho de ropa cruzado— por 2,00 m de frente.
 */

/** Holgura entre almohadas y contra el canto del colchón. */
const HOLGURA_ALMOHADA = 30;

/** Ancho máximo de almohada: la almohada estándar mexicana mide 0,70 m. */
const ALMOHADA_MAX = 700;

function almohadas(ancho: number, cantidad: number): SeedShape[] {
  const disponible = (ancho - HOLGURA_ALMOHADA * (cantidad + 1)) / cantidad;
  const w = Math.min(ALMOHADA_MAX, disponible);
  const total = cantidad * w + (cantidad - 1) * HOLGURA_ALMOHADA;
  return Array.from({ length: cantidad }, (_, index) =>
    rect(-total / 2 + index * (w + HOLGURA_ALMOHADA), 80, w, 450),
  );
}

function cama(
  slug: string,
  nombre: string,
  ancho: number,
  largo: number,
  cantidadAlmohadas: number,
  clave: string,
): SeedBlock {
  return {
    slug,
    name: nombre,
    description: `Cama ${nombre.toLocaleLowerCase('es-MX')} de ${(ancho / 1000).toFixed(2)} × ${(largo / 1000).toFixed(2)} m. Se inserta por el centro de la cabecera, contra el muro.`,
    keywords: ['cama', 'recámara', 'colchón', 'mobiliario', 'dormitorio'],
    layer: 'equipment',
    basePoint: { x: 0, y: 0, z: 0 },
    extent: { width: ancho, depth: largo },
    attributes: {
      CLAVE: { defaultValue: clave, prompt: 'Clave en planta' },
      ANCHO: { defaultValue: (ancho / 1000).toFixed(2), prompt: 'Ancho (m)' },
      LARGO: { defaultValue: (largo / 1000).toFixed(2), prompt: 'Largo (m)' },
    },
    shapes: [
      rect(-ancho / 2, 0, ancho, largo),
      ...almohadas(ancho, cantidadAlmohadas),
      // Doblez de la sábana: distingue de un vistazo la cabecera de los pies.
      line(-ancho / 2, 650, ancho / 2, 650),
    ],
  };
}

export const SEED_FURNITURE_BLOCKS: SeedBlock[] = [
  cama('cama-individual', 'Cama individual', 990, 1900, 1, 'CM-01'),
  cama('cama-matrimonial', 'Cama matrimonial', 1350, 1900, 2, 'CM-02'),
  cama('cama-queen', 'Cama queen size', 1520, 1980, 2, 'CM-03'),
  cama('cama-king', 'Cama king size', 1980, 2000, 2, 'CM-04'),
  {
    slug: 'mesa-comedor-6',
    name: 'Mesa de comedor 6 personas',
    description:
      'Mesa rectangular de 1.60 × 0.90 m para seis. Se inserta por su centro.',
    keywords: ['mesa', 'comedor', 'mobiliario', 'seis personas'],
    layer: 'equipment',
    basePoint: { x: 0, y: 0, z: 0 },
    extent: { width: 1600, depth: 900 },
    attributes: {
      CLAVE: { defaultValue: 'MS-01', prompt: 'Clave en planta' },
      ANCHO: { defaultValue: '1.60', prompt: 'Largo (m)' },
      FONDO: { defaultValue: '0.90', prompt: 'Ancho (m)' },
      LUGARES: { defaultValue: '6', prompt: 'Comensales' },
    },
    shapes: [rect(-800, -450, 1600, 900)],
  },
  {
    slug: 'silla-comedor',
    name: 'Silla',
    description:
      'Silla de 0.45 m de asiento y 0.50 m con respaldo. Se inserta por el centro del asiento.',
    keywords: ['silla', 'comedor', 'mobiliario', 'asiento'],
    layer: 'equipment',
    basePoint: { x: 0, y: 0, z: 0 },
    extent: { width: 450, depth: 500 },
    attributes: {
      CLAVE: { defaultValue: 'SL-01', prompt: 'Clave en planta' },
      ANCHO: { defaultValue: '0.45', prompt: 'Ancho (m)' },
      FONDO: { defaultValue: '0.50', prompt: 'Fondo (m)' },
    },
    shapes: [
      // Asiento centrado en el origen; el respaldo queda hacia +Y, así que la
      // silla «mira» hacia −Y y girarla es girar el INSERT.
      rect(-225, -225, 450, 450),
      rect(-225, 225, 450, 50),
    ],
  },
  {
    slug: 'sofa-3-plazas',
    name: 'Sofá 3 plazas',
    description:
      'Sofá de tres plazas, 2.10 × 0.90 m. Se inserta por el centro del respaldo, contra el muro.',
    keywords: ['sofá', 'sala', 'sillón', 'mobiliario', 'estancia'],
    layer: 'equipment',
    basePoint: { x: 0, y: 0, z: 0 },
    extent: { width: 2100, depth: 900 },
    attributes: {
      CLAVE: { defaultValue: 'SF-01', prompt: 'Clave en planta' },
      ANCHO: { defaultValue: '2.10', prompt: 'Ancho (m)' },
      FONDO: { defaultValue: '0.90', prompt: 'Fondo (m)' },
      PLAZAS: { defaultValue: '3', prompt: 'Plazas' },
    },
    shapes: [
      rect(-1050, 0, 2100, 180),
      rect(-1050, 180, 180, 720),
      rect(870, 180, 180, 720),
      rect(-870, 180, 1740, 640),
      line(-290, 180, -290, 820),
      line(290, 180, 290, 820),
    ],
  },
  {
    slug: 'closet-200',
    name: 'Clóset 2.00 m',
    description:
      'Clóset de 2.00 m de frente y 0.60 m de fondo con tubo de colgar y hojas corredizas. Se inserta en la esquina trasera izquierda.',
    keywords: ['clóset', 'closet', 'ropero', 'recámara', 'guardado'],
    layer: 'equipment',
    basePoint: { x: 0, y: 0, z: 0 },
    extent: { width: 2000, depth: 600 },
    attributes: {
      CLAVE: { defaultValue: 'CL-01', prompt: 'Clave en planta' },
      ANCHO: { defaultValue: '2.00', prompt: 'Ancho (m)' },
      FONDO: { defaultValue: '0.60', prompt: 'Fondo (m)' },
    },
    shapes: [
      rect(0, 0, 2000, 600),
      // Tubo de colgar a 0,15 m del fondo: el gancho necesita los 0,60 m.
      line(0, 150, 2000, 150),
      rect(0, 540, 1000, 60),
      rect(1000, 540, 1000, 60),
    ],
  },
];
