/**
 * La cara COMERCIAL del catálogo de plantillas.
 *
 * El motor sabe instanciar 149 plantillas; esta capa sabe VENDERLAS: el giro
 * con el que un visitante las busca («plano de taquería», no «plantilla
 * category taller»), el texto de título/descripción de cada ficha y las
 * destacadas de la portada. Separado de `lib/cad` a propósito: el catálogo es
 * ingeniería y no debe saber de SEO; esta capa es marketing y no toca
 * geometría.
 *
 * ## El giro se DERIVA, no se copia a mano 149 veces
 *
 * La clasificación es una función determinista sobre el id y la categoría del
 * catálogo (reglas por palabra clave + una tabla corta de excepciones). Una
 * plantilla nueva cae automáticamente en su giro o —si ninguna regla la
 * reconoce— en «otros giros», y el spec lo señala para decidir su regla. Así
 * el catálogo puede crecer sin que nadie recuerde tocar este archivo.
 */
import {
  CAD_LAYOUT_TEMPLATES,
  type CadLayoutTemplate,
  type CadLayoutTemplateId,
} from "../cad/templates";
import {
  TEMPLATE_GIROS,
  type GalleryTemplate,
  type TemplateGiro,
} from "./template-giros";

export { TEMPLATE_GIROS } from "./template-giros";
export type { GalleryTemplate, TemplateGiro } from "./template-giros";

const GIRO_LABEL = new Map(TEMPLATE_GIROS.map((giro) => [giro.id, giro.label]));

/** Reglas por palabra clave sobre el id. La primera que reconoce, gana. */
const GIRO_RULES: ReadonlyArray<[TemplateGiro, RegExp]> = [
  [
    "vivienda",
    /casa|departamento|habitacion-hotel|residencial|duplex|cabana|loft/,
  ],
  [
    "salud",
    /consultorio|clinica|farmacia|laboratorio|fisioterapia|veterinaria|optica|hospital|dental|psicologia|herbolaria|estancia-adultos/,
  ],
  [
    "alimentos",
    /taqueria|restaurante|cafeteria|fondita|marisqueria|hamburgues|panaderia|pasteleria|tortilleria|polleria|rosticeria|neveria|jugueria|cremeria|carniceria|fruteria|pescaderia|vinateria|minisuper|mercado|cocina-fantasma|bar$|cantina|cerveceria|pizzeria|sushi|cocina/,
  ],
  [
    "comercio",
    /boutique|zapateria|joyeria|muebleria|ferreteria|papeleria|refaccionaria|floreria|tienda|local-comercial|casa-empeno|banco|vivero|jugueteria|libreria|dulceria/,
  ],
  [
    "educacion",
    /aula|escolar|guarderia|biblioteca|academia|centro-idiomas|escuela|universidad|kinder/,
  ],
  [
    "deporte-cultura",
    /gimnasio|cancha|iglesia|cine|estudio-yoga|estudio-baile|museo|teatro|parque|salon-fiestas|jardin-eventos|estudio-grabacion|estudio-fotografico|box$/,
  ],
  ["hospitalidad", /hotel|hostal|terraza|salon-eventos/],
  [
    "industria-taller",
    /taller|bodega|nave|imprenta|autolavado|llantera|purificadora|lavanderia|carpinteria|herreria|maquila/,
  ],
  [
    "servicios",
    /notaria|despacho|inmobiliaria|funeraria|barberia|estetica|salon-belleza|salon-unas|spa$|cibercafe|oficina|coworking|agencia|torre-corporativa|estacionamiento|estacion-tren|tatuajes|bicicletas|celulares/,
  ],
];

/** Excepciones que las reglas generales clasificarían mal. */
const GIRO_OVERRIDES: Partial<Record<CadLayoutTemplateId, TemplateGiro>> = {
  "gimnasio-box": "deporte-cultura",
  "estetica-canina": "servicios",
  "salon-fiestas-infantil": "deporte-cultura",
  "clinica-oftalmologica": "salud",
};

export function templateGiro(template: CadLayoutTemplate): TemplateGiro {
  const override = GIRO_OVERRIDES[template.id];
  if (override) return override;
  // Las categorías de disciplina son planos técnicos, no giros de negocio.
  if (
    template.category === "civil" ||
    template.category === "estructura" ||
    template.category === "instalaciones"
  ) {
    return "tecnico";
  }
  for (const [giro, pattern] of GIRO_RULES) {
    if (pattern.test(template.id)) return giro;
  }
  if (template.category === "taller" || template.category === "bodega") {
    return "industria-taller";
  }
  // Arquitectura genérica sin palabra clave: plano técnico de arquitectura.
  return "tecnico";
}

export function galleryTemplates(): GalleryTemplate[] {
  return CAD_LAYOUT_TEMPLATES.map((template) => {
    const giro = templateGiro(template);
    return {
      id: template.id,
      label: template.label,
      description: template.description,
      giro,
      giroLabel: GIRO_LABEL.get(giro) ?? giro,
      widthM: template.baseWidth / 1000,
      heightM: template.baseHeight / 1000,
      objects: template.assets.length,
    };
  });
}

export function galleryTemplate(id: string): GalleryTemplate | undefined {
  return galleryTemplates().find((template) => template.id === id);
}

/**
 * Las destacadas de la portada: una por giro, elegidas por reconocibles (la
 * taquería vende más portada que la nave industrial). Es curaduría de
 * marketing y se declara como tal; el spec solo exige que existan en el
 * catálogo y que no haya dos del mismo giro.
 */
export const FEATURED_TEMPLATE_IDS: readonly CadLayoutTemplateId[] = [
  "casa-habitacion",
  "consultorio-dental",
  "taqueria",
  "boutique",
  "notaria",
  "aula-escolar",
  "gimnasio",
  "taller-mecanico",
];

/** Título SEO de la ficha: cómo se busca, no cómo se llama la entidad. */
export function templateSeoTitle(template: GalleryTemplate): string {
  return `Plano de ${template.label.toLowerCase()} — plantilla CAD gratuita en el navegador`;
}

export function templateSeoDescription(template: GalleryTemplate): string {
  return (
    `${template.description} Ábrela en Valle Design con capas de norma mexicana, ` +
    `cotas y cajetín listos: ${template.widthM} × ${template.heightM} m, ` +
    `${template.objects} objetos editables. Sin instalar nada.`
  );
}
