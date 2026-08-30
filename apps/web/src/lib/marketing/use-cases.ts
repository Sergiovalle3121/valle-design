/**
 * CASOS DE USO POR PROFESIÓN — sin humo, por contrato.
 *
 * Cada perfil cuenta: el dolor real de esa persona, el flujo EN VALLE con los
 * comandos/pantallas que existen hoy, los giros de plantilla que le tocan y su
 * FAQ propia. La regla es la de toda la superficie pública: aquí no se afirma
 * nada que el producto no haga — cada paso del flujo nombra una capacidad con
 * módulo y spec en el repositorio (línea de comandos, cotas asociativas,
 * espacio papel, DXF, plantillas, modo demostración). Si mañana una capacidad
 * cambia, este archivo es UNA lista que corregir, no cinco páginas.
 */
import type { TemplateGiro } from "./template-giros";

export interface UseCaseFaq {
  pregunta: string;
  respuesta: string;
}

export interface UseCaseProfile {
  slug: string;
  /** Nombre del perfil, como se busca («CAD para arquitectos»). */
  nombre: string;
  titulo: string;
  /** El dolor, en el idioma de esa persona. */
  dolor: string;
  /** El flujo en Valle: pasos con la capacidad real que los respalda. */
  flujo: ReadonlyArray<{ paso: string; detalle: string }>;
  /** Giros de plantilla que le tocan (alimentan los enlaces a /plantillas). */
  giros: readonly TemplateGiro[];
  faq: readonly UseCaseFaq[];
}

export const USE_CASE_PROFILES: readonly UseCaseProfile[] = [
  {
    slug: "arquitectos",
    nombre: "Arquitectura",
    titulo: "CAD en línea para arquitectos",
    dolor:
      "La licencia de escritorio vive en UNA computadora, y tu semana no: el " +
      "plano que necesitas corregir está en la máquina del despacho mientras " +
      "tú estás en la obra o con el cliente. Cada revisión de última hora es " +
      "un traslado o una espera.",
    flujo: [
      {
        paso: "Empieza con la planta puesta",
        detalle:
          "La plantilla de casa habitación (o la del giro de tu encargo) abre " +
          "con capas de la norma mexicana, estilo de cota anotativo y cajetín " +
          "con responsiva del D.R.O. — la media hora de configuración ya está " +
          "pagada.",
      },
      {
        paso: "Dibuja con la línea de comandos de siempre",
        detalle:
          "L, C, TR, MI: los alias que ya sabes responden igual. Referencias " +
          "a objetos, rastreo polar, orto y entrada por coordenadas.",
      },
      {
        paso: "Acota una vez, corrige sin miedo",
        detalle:
          "Las cotas son asociativas: mueves el muro y la cota se actualiza " +
          "con el valor verdadero. La escala de anotación mantiene el rótulo " +
          "legible en la lámina.",
      },
      {
        paso: "Publica la lámina a escala",
        detalle:
          "Espacio papel con ventanas a escala bloqueada y PDF que imprime a " +
          "la medida exacta: lo que acotaste es lo que mide en el papel.",
      },
      {
        paso: "Entrega en el formato que te pidan",
        detalle:
          "DXF de ida y vuelta para intercambiar con cualquier despacho, y " +
          "PDF para la entrega. Tus proyectos viven en la nube con respaldo.",
      },
    ],
    giros: ["vivienda", "comercio", "hospitalidad"],
    faq: [
      {
        pregunta: "¿Puedo entregarle a un despacho que usa otro CAD?",
        respuesta:
          "Sí, por DXF — el formato estándar de intercambio que cualquier " +
          "programa de dibujo abre. Importas y exportas con las capas y las " +
          "cotas en su lugar; lo que se pierde en un intercambio, el producto " +
          "te lo declara en vez de callárselo.",
      },
      {
        pregunta: "¿El cajetín cumple para trámites en México?",
        respuesta:
          "La lámina trae cajetín con proyecto, ubicación, propietario, " +
          "escala, clave de lámina y el espacio de la responsiva del Director " +
          "Responsable de Obra con su número de registro.",
      },
    ],
  },
  {
    slug: "ingenieria-civil",
    nombre: "Ingeniería civil",
    titulo: "CAD en línea para ingeniería civil",
    dolor:
      "Los planos de conjunto y las plantas de instalaciones cruzan varias " +
      "manos: el que dibuja, el que revisa, el que firma. Con archivos " +
      "sueltos, la versión buena es la del último correo — hasta que no lo es.",
    flujo: [
      {
        paso: "Planta de conjunto o estructural de arranque",
        detalle:
          "Las plantillas técnicas abren con capas de disciplina (ejes, " +
          "estructura, instalaciones) y escala elegida para la lámina A1.",
      },
      {
        paso: "Precisión de coordenadas de verdad",
        detalle:
          "Entrada por coordenadas absolutas y relativas, y una precisión " +
          "verificada contra oráculo: 761 casos numéricos en cada corrida de " +
          "integración continua, cero desviaciones toleradas.",
      },
      {
        paso: "Una sola fuente del documento",
        detalle:
          "El proyecto vive en la nube con guardado con control de versión " +
          "optimista: dos personas no se pisan un guardado sin enterarse.",
      },
      {
        paso: "Publica el juego de láminas",
        detalle:
          "Cada presentación sale a PDF a escala con su cajetín; el juego " +
          "completo se numera lámina a lámina.",
      },
    ],
    giros: ["tecnico", "industria-taller"],
    faq: [
      {
        pregunta: "¿Qué pasa con un dibujo de cientos de miles de entidades?",
        respuesta:
          "El render está medido con presupuestos de 100 000 entidades en la " +
          "integración continua. Los límites de documento están publicados y " +
          "el producto avisa antes de tocarlos, en vez de degradarse en " +
          "silencio.",
      },
      {
        pregunta: "¿Trabajan con levantamientos?",
        respuesta:
          "Se importa Shapefile (con sus .shx, .dbf y .prj) y DXF. Nubes de " +
          "puntos LAS y ráster georreferenciado hoy NO — está dicho en la " +
          "portada, no en letra pequeña.",
      },
    ],
  },
  {
    slug: "interioristas",
    nombre: "Interiorismo",
    titulo: "CAD en línea para interioristas",
    dolor:
      "Tu entregable es claridad: que el cliente entienda el espacio y que el " +
      "carpintero corte a la medida. Un CAD de escritorio completo cuesta " +
      "como un mes de tu trabajo y te usa el 15 %.",
    flujo: [
      {
        paso: "Arranca del giro del encargo",
        detalle:
          "Consultorio, boutique, cafetería, spa: la planta del local con sus " +
          "zonas ya trazadas para vestir, no un lienzo en blanco.",
      },
      {
        paso: "Mobiliario como bloques",
        detalle:
          "La biblioteca de bloques arquitectónicos coloca puertas, muebles y " +
          "equipo en su capa; los tuyos se guardan y reutilizan entre " +
          "proyectos.",
      },
      {
        paso: "Capas que se apagan por entrega",
        detalle:
          "Mobiliario, acabados y cotas en capas separadas: el mismo dibujo " +
          "entrega la planta amueblada al cliente y la planta cotada al " +
          "carpintero.",
      },
      {
        paso: "PDF a escala para cotizar",
        detalle:
          "El proveedor mide sobre el plano impreso y las medidas son las " +
          "verdaderas — la lámina sale a escala exacta.",
      },
    ],
    giros: ["comercio", "alimentos", "salud"],
    faq: [
      {
        pregunta: "¿Necesito saber comandos para usarlo?",
        respuesta:
          "Ayuda pero no es requisito: todas las herramientas están también " +
          "en la barra y las paletas. La línea de comandos está para cuando " +
          "la velocidad te importe.",
      },
    ],
  },
  {
    slug: "constructores",
    nombre: "Construcción",
    titulo: "CAD en línea para constructores",
    dolor:
      "En obra nadie tiene la licencia: el plano llega por mensajería, en " +
      "fotos de pantalla o en un PDF que ya nadie sabe de qué versión es. " +
      "Corregir un detalle exige volver a la oficina.",
    flujo: [
      {
        paso: "Abre el proyecto donde estés",
        detalle:
          "El estudio corre en el navegador — la laptop de la obra o la " +
          "tableta sirven. El soporte táctil está medido y probado en la " +
          "integración continua.",
      },
      {
        paso: "Consulta con las capas a tu favor",
        detalle:
          "Apaga acabados y deja obra negra; congela lo que estorba. La " +
          "planta que ves es la del trabajo del día.",
      },
      {
        paso: "Corrige y guarda una sola verdad",
        detalle:
          "El cambio de última hora se dibuja ahí mismo; el guardado en la " +
          "nube hace que oficina y obra vean el mismo documento.",
      },
      {
        paso: "Imprime a escala en cualquier papel",
        detalle:
          "El PDF sale a la medida: A1 para el juego, carta para el detalle " +
          "que va a la bolsa del residente. La escala es exacta en ambos.",
      },
    ],
    giros: ["industria-taller", "vivienda", "tecnico"],
    faq: [
      {
        pregunta: "¿Y si en la obra no hay internet?",
        respuesta:
          "El editor conserva un diario local de recuperación: si la red se " +
          "cae a media edición, el trabajo no se pierde y se reconcilia al " +
          "volver la conexión. Para consulta pura, lleva el PDF descargado.",
      },
    ],
  },
  {
    slug: "estudiantes",
    nombre: "Estudiantes",
    titulo: "CAD en línea para estudiantes",
    dolor:
      "La licencia educativa vence, la computadora del laboratorio está " +
      "ocupada y tu laptop no puede con el programa completo. El plano se " +
      "entrega igual el viernes.",
    flujo: [
      {
        paso: "Cero instalación, cero requisitos",
        detalle:
          "Corre en el navegador de la máquina que tengas: la del " +
          "laboratorio, la tuya, la del ciber. Entras y tu proyecto está.",
      },
      {
        paso: "Prueba sin registrarte",
        detalle:
          "La demostración abre el editor real con una casa habitación para " +
          "practicar comandos — sin cuenta, sin correo, sin tarjeta.",
      },
      {
        paso: "Aprende el oficio, no un menú",
        detalle:
          "Línea de comandos con los alias estándar, capas, cotas " +
          "asociativas y espacio papel: lo que se usa en despacho, en la " +
          "convención mexicana.",
      },
      {
        paso: "Entrega en PDF o DXF",
        detalle:
          "La lámina sale con cajetín y escala para imprimir; el DXF abre en " +
          "el programa que pida tu facultad.",
      },
    ],
    giros: ["vivienda", "educacion", "deporte-cultura"],
    faq: [
      {
        pregunta: "¿Hay plan para escuelas?",
        respuesta:
          "El programa educativo está en construcción y la página de " +
          "educación recoge el interés de escuelas y docentes. El producto " +
          "hoy es gratuito durante el lanzamiento — sin tarjeta.",
      },
    ],
  },
];

/**
 * Búsqueda de perfil por slug. El nombre lleva `find` a propósito: la primera
 * versión se llamó `useCaseProfile` y el linter de hooks la trató como Hook
 * («use» + mayúscula) — dos errores bloqueantes en `generateMetadata`, que ni
 * es componente ni puede ser Hook. Es una función pura de módulo, no un Hook.
 */
export function findUseCaseProfile(slug: string): UseCaseProfile | undefined {
  return USE_CASE_PROFILES.find((profile) => profile.slug === slug);
}
