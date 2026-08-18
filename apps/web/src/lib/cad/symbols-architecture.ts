import type { CadSymbolDefinition } from "./symbols";

/**
 * Los símbolos de ARQUITECTURA y de casa.
 *
 * ## Por qué salen de `symbols.ts`
 *
 * Dos razones, y la segunda es la que manda.
 *
 * La mecánica: `symbols.ts` está en el trinquete de tamaño y sólo puede
 * encoger, así que la tanda que más tiene que crecer —la del mercado real del
 * producto, el despacho que dibuja casas— no cabía dentro. Sacarla deja sitio
 * para que crezca sin empujar el techo del monolito.
 *
 * La de fondo: el catálogo tenía 208 entradas y sabía dibujar un ataúd, un
 * autolavado y una máquina de tortillas, pero de las ventanas sólo conocía una
 * —«Ventana 120 cm»— y de las escaleras sólo la recta. Un arquitecto abre
 * cuatro tipos de ventana en el mismo plano. Aquí viven las que faltaban, junto
 * a las que ya estaban, para que se lean como lo que son: una familia.
 *
 * ## Qué NO se hizo
 *
 * No se borró ni se renombró nada. Cada símbolo que ya existía sigue con su
 * mismo `id`, su misma etiqueta y sus mismas medidas: los ids viajan dentro de
 * documentos guardados, y cambiarlos convertiría un plano ajeno en un plano con
 * huecos. Lo que se ha hecho es MOVER y AÑADIR.
 *
 * ## Medidas
 *
 * En milímetros y a escala real, con el mismo criterio que el sembrado de
 * bloques de la API: lo normativo sale de las Normas Técnicas Complementarias
 * para el Proyecto Arquitectónico del Reglamento de Construcciones de la CDMX
 * (cajón de estacionamiento de 5,00 × 2,40 m, huella mínima de 0,25 m, peralte
 * máximo de 0,18 m, ancho mínimo de escalera de 0,90 m) y lo demás son medidas
 * comerciales dominantes en México, anotadas una por una.
 *
 * La caja de un símbolo es su ENVOLVENTE en planta, no un dibujo: el símbolo
 * coloca un rectángulo con nombre y capa. Los bloques con geometría de verdad
 * —hoja, barrido, quicial— son los de la biblioteca que siembra la migración
 * `ArchitecturalBlockLibrarySeed` y llegan por la API.
 */
export const CAD_ARCHITECTURE_SYMBOLS: CadSymbolDefinition[] = [
  // ── CAD universal (VD-CAD-UNIVERSAL-001): arquitectura y casa ──
  {
    id: "door-90",
    label: "Puerta 90 cm",
    category: "architecture",
    defaultWidth: 900,
    defaultHeight: 150,
    layer: "Architecture",
    tags: ["puerta", "door", "acceso", "casa", "oficina"],
    ports: [],
  },
  {
    id: "double-door-180",
    label: "Puerta doble 180 cm",
    category: "architecture",
    defaultWidth: 1800,
    defaultHeight: 150,
    layer: "Architecture",
    tags: ["puerta", "doble", "double door", "acceso"],
    ports: [],
  },
  {
    id: "window-120",
    label: "Ventana 120 cm",
    category: "architecture",
    defaultWidth: 1200,
    defaultHeight: 150,
    layer: "Architecture",
    tags: ["ventana", "window", "fachada"],
    ports: [],
  },
  {
    id: "stairs-straight",
    label: "Escalera recta",
    category: "architecture",
    defaultWidth: 1000,
    defaultHeight: 3000,
    layer: "Architecture",
    tags: ["escalera", "stairs", "nivel"],
    ports: [],
  },
  {
    id: "wc",
    label: "WC",
    category: "architecture",
    defaultWidth: 400,
    defaultHeight: 700,
    layer: "Architecture",
    tags: ["baño", "wc", "sanitario", "toilet"],
    ports: [],
  },
  {
    id: "sink",
    label: "Lavabo",
    category: "architecture",
    defaultWidth: 600,
    defaultHeight: 450,
    layer: "Architecture",
    tags: ["lavabo", "baño", "sink"],
    ports: [],
  },
  {
    id: "shower",
    label: "Regadera",
    category: "architecture",
    defaultWidth: 900,
    defaultHeight: 900,
    layer: "Architecture",
    tags: ["regadera", "ducha", "shower", "baño"],
    ports: [],
  },
  {
    id: "stove",
    label: "Estufa",
    category: "architecture",
    defaultWidth: 760,
    defaultHeight: 600,
    layer: "Architecture",
    tags: ["estufa", "cocina", "stove", "kitchen"],
    ports: [],
  },
  {
    id: "refrigerator",
    label: "Refrigerador",
    category: "architecture",
    defaultWidth: 700,
    defaultHeight: 700,
    layer: "Architecture",
    tags: ["refrigerador", "refri", "cocina", "fridge"],
    ports: [],
  },

  // ── Mobiliario de casa ──
  {
    id: "bed-single",
    label: "Cama individual",
    category: "furniture",
    defaultWidth: 1000,
    defaultHeight: 2000,
    layer: "Furniture",
    tags: ["cama", "recámara", "bed", "casa"],
    ports: [],
  },
  {
    id: "bed-queen",
    label: "Cama matrimonial",
    category: "furniture",
    defaultWidth: 1400,
    defaultHeight: 2000,
    layer: "Furniture",
    tags: ["cama", "matrimonial", "recámara", "queen bed"],
    ports: [],
  },
  {
    id: "sofa-3",
    label: "Sofá 3 plazas",
    category: "furniture",
    defaultWidth: 2100,
    defaultHeight: 900,
    layer: "Furniture",
    tags: ["sofá", "sala", "sofa", "couch"],
    ports: [],
  },
  {
    id: "dining-table-4",
    label: "Mesa comedor 4",
    category: "furniture",
    defaultWidth: 1200,
    defaultHeight: 800,
    layer: "Furniture",
    tags: ["comedor", "mesa", "dining table"],
    ports: [],
  },
  {
    id: "wardrobe",
    label: "Ropero",
    category: "furniture",
    defaultWidth: 1500,
    defaultHeight: 600,
    layer: "Furniture",
    tags: ["ropero", "clóset", "wardrobe", "recámara"],
    ports: [],
  },

  // ── Lo que faltaba para dibujar una casa (VD-CAD-ARQ-001) ──
  //
  // Del catálogo de 208 entradas salían un ataúd y un autolavado, pero de las
  // ventanas sólo la fija y de las escaleras sólo la recta. Estas son las
  // piezas que un despacho mexicano usa TODOS los días y que no estaban.

  // Puertas. Anchos de las Normas Técnicas Complementarias para el Proyecto
  // Arquitectónico de la CDMX (acceso 0,90 m); el clóset de 2,00 m es medida
  // de carpintería corriente. El alto de la caja es el espesor del muro.
  {
    id: "sliding-door-90",
    label: "Puerta corrediza 90 cm",
    category: "architecture",
    defaultWidth: 900,
    defaultHeight: 150,
    layer: "Architecture",
    tags: ["puerta", "corrediza", "sliding door", "riel", "ahorro de espacio"],
    ports: [],
  },
  {
    id: "closet-door-200",
    label: "Puerta de clóset 2.00 m",
    category: "architecture",
    defaultWidth: 2000,
    defaultHeight: 150,
    layer: "Architecture",
    tags: ["puerta", "clóset", "closet", "corrediza", "recámara"],
    ports: [],
  },

  // Ventanas. Medidas de catálogo de la cancelería de aluminio serie 3", la
  // corriente en vivienda mexicana. La proyectante de 0,60 m es la de baño.
  {
    id: "window-sliding-150",
    label: "Ventana corrediza 150 cm",
    category: "architecture",
    defaultWidth: 1500,
    defaultHeight: 150,
    layer: "Architecture",
    tags: ["ventana", "corrediza", "cancelería", "canceleria", "ventilación"],
    ports: [],
  },
  {
    id: "window-casement-60",
    label: "Ventana abatible 60 cm",
    category: "architecture",
    defaultWidth: 600,
    defaultHeight: 150,
    layer: "Architecture",
    tags: ["ventana", "abatible", "batiente", "cocina", "ventilación"],
    ports: [],
  },
  {
    id: "window-awning-60",
    label: "Ventana proyectante 60 cm",
    category: "architecture",
    defaultWidth: 600,
    defaultHeight: 150,
    layer: "Architecture",
    tags: ["ventana", "proyectante", "baño", "privacidad", "ventilación"],
    ports: [],
  },

  // Baño. La tina de 1,70 × 0,75 m es la medida comercial dominante.
  {
    id: "bathtub-170",
    label: "Tina 1.70 m",
    category: "architecture",
    defaultWidth: 1700,
    defaultHeight: 750,
    layer: "Architecture",
    tags: ["tina", "bañera", "banera", "baño", "jacuzzi"],
    ports: [],
  },

  // Circulación vertical. Peralte máximo 0,18 m, huella mínima 0,25 m y ancho
  // mínimo 0,90 m según las Normas Técnicas Complementarias; la escalera en L
  // sale de 8 + 7 peraltes con descanso cuadrado y la de caracol usa el
  // diámetro de 1,60 m por debajo del cual deja de ser cómoda.
  {
    id: "stairs-l",
    label: "Escalera en L con descanso",
    category: "architecture",
    defaultWidth: 2860,
    defaultHeight: 3140,
    layer: "Architecture",
    tags: ["escalera", "descanso", "en L", "giro", "circulación"],
    ports: [],
  },
  {
    id: "spiral-stairs",
    label: "Escalera de caracol",
    category: "architecture",
    defaultWidth: 1600,
    defaultHeight: 1600,
    layer: "Architecture",
    tags: ["escalera", "caracol", "helicoidal", "circulación", "azotea"],
    ports: [],
  },
  {
    id: "ramp",
    label: "Rampa accesible",
    category: "architecture",
    defaultWidth: 1200,
    defaultHeight: 6000,
    layer: "Architecture",
    tags: ["rampa", "accesibilidad", "silla de ruedas", "pendiente", "acceso"],
    ports: [],
  },
  {
    id: "elevator",
    label: "Elevador",
    category: "architecture",
    defaultWidth: 1600,
    defaultHeight: 1500,
    layer: "Architecture",
    tags: ["elevador", "ascensor", "cubo", "accesibilidad", "circulación"],
    ports: [],
  },

  // Estructura. El castillo de 0,15 m y la columna de 0,30 m son la sección
  // corriente del sistema de muro de carga confinado que se construye en
  // México; la redonda de 0,40 m es la de un pórtico de concreto.
  {
    id: "column-square",
    label: "Columna cuadrada 30 cm",
    category: "architecture",
    defaultWidth: 300,
    defaultHeight: 300,
    layer: "Structure",
    tags: ["columna", "castillo", "estructura", "concreto", "cuadrada"],
    ports: [],
  },
  {
    id: "column-round",
    label: "Columna redonda 40 cm",
    category: "architecture",
    defaultWidth: 400,
    defaultHeight: 400,
    layer: "Structure",
    tags: ["columna", "redonda", "estructura", "concreto", "pórtico"],
    ports: [],
  },

  // Exterior y servicios. El cajón normativo es 5,00 × 2,40 m, así que la
  // cochera de dos autos con holgura de maniobra sale de 5,00 × 5,50 m. La
  // cisterna de 2,00 × 2,00 m es la de ~10 000 L, la que se entierra en una
  // casa cuando el tandeo de agua obliga a almacenar.
  {
    id: "garage-2",
    label: "Cochera 2 autos",
    category: "architecture",
    defaultWidth: 5000,
    defaultHeight: 5500,
    layer: "Architecture",
    tags: ["cochera", "garaje", "portón", "dos autos", "estacionamiento"],
    ports: [],
  },
  {
    id: "cistern",
    label: "Cisterna 10 000 L",
    category: "architecture",
    defaultWidth: 2000,
    defaultHeight: 2000,
    layer: "Architecture",
    tags: ["cisterna", "agua", "almacenamiento", "tandeo", "instalación"],
    ports: [],
  },
  {
    id: "planter",
    label: "Jardinera",
    category: "architecture",
    defaultWidth: 1500,
    defaultHeight: 500,
    layer: "Architecture",
    tags: ["jardinera", "jardín", "patio", "vegetación", "exterior"],
    ports: [],
  },

  // Mobiliario que faltaba. Tallas comerciales mexicanas de colchón (king size
  // 1,98 × 2,00 m), silla de comedor de 0,45 m de asiento, clóset de 0,60 m de
  // fondo —el que exige un gancho de ropa cruzado— y la isla de cocina de
  // 1,80 × 0,90 m, que deja los 0,90 m de paso que pide una cocina de trabajo.
  {
    id: "bed-king",
    label: "Cama king size",
    category: "furniture",
    defaultWidth: 1980,
    defaultHeight: 2000,
    layer: "Furniture",
    tags: ["cama", "king", "king size", "recámara", "matrimonial"],
    ports: [],
  },
  {
    id: "dining-chair",
    label: "Silla",
    category: "furniture",
    defaultWidth: 450,
    defaultHeight: 500,
    layer: "Furniture",
    tags: ["silla", "comedor", "asiento", "mobiliario"],
    ports: [],
  },
  {
    id: "closet-200",
    label: "Clóset 2.00 m",
    category: "furniture",
    defaultWidth: 2000,
    defaultHeight: 600,
    layer: "Furniture",
    tags: ["clóset", "closet", "ropero", "recámara", "guardado"],
    ports: [],
  },
  {
    id: "pantry",
    label: "Alacena",
    category: "furniture",
    defaultWidth: 900,
    defaultHeight: 600,
    layer: "Furniture",
    tags: ["alacena", "despensa", "cocina", "guardado"],
    ports: [],
  },
  {
    id: "kitchen-island",
    label: "Isla de cocina",
    category: "furniture",
    defaultWidth: 1800,
    defaultHeight: 900,
    layer: "Furniture",
    tags: ["isla", "cocina", "barra", "cubierta", "desayunador"],
    ports: [],
  },
];
