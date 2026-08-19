/**
 * EL ARTEFACTO DE EVIDENCIA: qué se aplica, de dónde sale y qué no se afirma.
 *
 * ## Por qué lo construye código y no una persona
 *
 * Porque una tabla escrita a mano en un documento envejece el día siguiente. Lo
 * que se publica en `docs/cad/evidence/mexican-drafting-standards.json` se
 * DERIVA de los mismos módulos que usa el producto: si mañana una capa cambia de
 * grosor o una convención pierde su cita, el artefacto cambia con ella o la
 * spec falla. No hay tercera posibilidad, y ésa es toda la gracia.
 *
 * ## Por qué no lleva fecha
 *
 * Para que se pueda comprobar por igualdad. Un `generatedAt` haría que el
 * archivo cambiara en cada corrida y el gate tendría que comparar «parecido»,
 * que es como no comparar. Lo que fecha este artefacto es el commit que lo trae.
 *
 * ## Por qué hay una sección de lo que NO se afirma
 *
 * Porque la ventaja de venir de fábrica con lo que se usa en México se pierde
 * entera el día que alguien detecta una norma inventada. Decir en el mismo
 * archivo dónde termina lo que sabemos es lo que hace creíble el resto.
 */
import {
  CAD_MEXICAN_DRAFTING_SOURCES,
  cadStandardsPendingVerification,
  type CadStandardSource,
} from "./mexican-drafting-sources";
import {
  CAD_MEXICAN_LAYERS,
  cadMexicanLayerCollisions,
  cadMexicanLayerSourceProblems,
} from "./mexican-layers";
import {
  CAD_MEXICAN_DIMENSION_RULES,
  CAD_MEXICAN_SCALES,
  CAD_MEXICAN_TEXT_MM,
  CAD_MEXICAN_TICK_MM,
  cadMexicanAnnotationSourceProblems,
  cadMexicanDimensionStyleName,
} from "./mexican-annotation";
import {
  CAD_A4_PANEL_MM,
  CAD_ISO_SHEET_MARGINS_MM,
  cadA4PanelDeviation,
  cadMexicanPaperFacts,
  cadMexicanSheetSourceProblems,
} from "./mexican-sheets";
import { CAD_STARTER_TEMPLATES } from "../starter-templates";

export interface CadMexicanDraftingEvidence {
  schema: 1;
  artefacto: string;
  generadoPor: string;
  resumen: Record<string, number>;
  fuentes: readonly CadStandardSource[];
  porVerificar: ReadonlyArray<{ id: string; documento: string; queConfirmar: string }>;
  capas: ReadonlyArray<Record<string, unknown>>;
  colisionesDeAspecto: ReadonlyArray<{ a: string; b: string; motivo: string }>;
  acotacion: Record<string, unknown>;
  laminas: Record<string, unknown>;
  plantillas: ReadonlyArray<Record<string, unknown>>;
  integridad: { problemas: readonly string[] };
  noSeAfirma: readonly string[];
}

/** Redondeo estable: el JSON no puede depender del binario a binario del float. */
const round = (value: number, digits = 6): number => Number(value.toFixed(digits));

/**
 * Motivo por el que dos capas comparten aspecto.
 *
 * Se escribe una frase por par en vez de una lista muda: la lista sola parece
 * un defecto, y lo que hay es una reutilización deliberada entre disciplinas que
 * nunca comparten lámina.
 */
function collisionReason(a: string, b: string): string {
  const groupOf = (id: string) => CAD_MEXICAN_LAYERS.find((item) => item.id === id)?.group ?? "?";
  return (
    `Mismo color, tipo de línea y grosor. Reutilización deliberada entre «${groupOf(a)}» y ` +
    `«${groupOf(b)}»: ninguna plantilla las pone en la misma lámina, y se comprueba por plantilla.`
  );
}

export function buildCadMexicanDraftingEvidence(): CadMexicanDraftingEvidence {
  const normas = CAD_MEXICAN_DRAFTING_SOURCES.filter((item) => item.kind === "norma");
  const costumbres = CAD_MEXICAN_DRAFTING_SOURCES.filter((item) => item.kind === "costumbre");
  const papeles = cadMexicanPaperFacts();
  const collisions = cadMexicanLayerCollisions(CAD_MEXICAN_LAYERS.map((item) => item.id));

  return {
    schema: 1,
    artefacto: "normas-de-dibujo-mexicano",
    generadoPor: "scripts/cad/mexican-drafting-standards-evidence.mjs",
    resumen: {
      fuentes: CAD_MEXICAN_DRAFTING_SOURCES.length,
      normasCitadas: normas.length,
      costumbresDeclaradas: costumbres.length,
      porVerificar: cadStandardsPendingVerification().length,
      capas: CAD_MEXICAN_LAYERS.length,
      escalas: CAD_MEXICAN_SCALES.length,
      escalasFueraDeIso5455: CAD_MEXICAN_SCALES.filter((item) => !item.isoRecommended).length,
      papeles: papeles.length,
      plantillas: CAD_STARTER_TEMPLATES.length,
    },
    fuentes: CAD_MEXICAN_DRAFTING_SOURCES,
    porVerificar: cadStandardsPendingVerification().map((source) => ({
      id: source.id,
      documento: source.kind === "norma" ? source.document : "(costumbre)",
      queConfirmar: source.verify ?? "",
    })),
    capas: CAD_MEXICAN_LAYERS.map((item) => ({
      id: item.id,
      nombre: item.name,
      grupo: item.group,
      color: item.color,
      tipoDeLinea: item.linetype,
      grosorMm: item.lineweight,
      seTraza: item.plot,
      paraQue: item.purpose,
      fuentes: item.sources,
      ...(item.note ? { advertencia: item.note } : {}),
    })),
    colisionesDeAspecto: collisions.map(([a, b]) => ({ a, b, motivo: collisionReason(a, b) })),
    acotacion: {
      alturasDeTextoMm: CAD_MEXICAN_TEXT_MM,
      garrapataMm: CAD_MEXICAN_TICK_MM,
      reglas: CAD_MEXICAN_DIMENSION_RULES,
      escalas: CAD_MEXICAN_SCALES.map((scale) => ({
        escala: `1:${scale.denominator}`,
        estilo: cadMexicanDimensionStyleName(scale),
        uso: scale.use,
        recomendadaPorIso5455: scale.isoRecommended,
        paraQue: scale.purpose,
        fuentes: scale.sources,
      })),
    },
    laminas: {
      margenesMm: CAD_ISO_SHEET_MARGINS_MM,
      panelDeArchivoMm: CAD_A4_PANEL_MM,
      papeles: papeles.map((fact) => ({
        papel: fact.paper,
        anchoMm: fact.width,
        altoMm: fact.height,
        panelesA4: fact.a4Panels,
        desviacionDeDoblado: round(cadA4PanelDeviation(fact.paper)),
        paraQue: fact.purpose,
        fuentes: fact.sources,
      })),
      cajetines: [
        {
          id: "iso",
          anchoMm: 180,
          altoMm: 30,
          campos: "Los de ISO 7200.",
          fuentes: ["iso-7200-campos"],
        },
        {
          id: "mexicano",
          anchoMm: 180,
          altoMm: 50,
          campos:
            "Los de ISO 7200 más ubicación de la obra, propietario y la responsiva del Director " +
            "Responsable de Obra: nombre, número de registro y hueco de firma.",
          fuentes: ["iso-7200-campos", "rcdf-dro", "rcdf-corresponsables", "cajetin-banda-derecha"],
        },
      ],
    },
    plantillas: CAD_STARTER_TEMPLATES.map((template) => ({
      id: template.id,
      lamina: template.label,
      claveDeLamina: template.sheetNumber,
      escala: `1:${template.scale}`,
      papel: template.paper,
      capas: template.layerIds,
    })),
    integridad: {
      problemas: [
        ...cadMexicanLayerSourceProblems(),
        ...cadMexicanAnnotationSourceProblems(),
        ...cadMexicanSheetSourceProblems(),
      ],
    },
    noSeAfirma: [
      "No existe una norma mexicana de nomenclatura de capas CAD. ISO 13567 existe y no se sigue, " +
        "porque en México no se usa: los nombres de capa de esta tabla son COSTUMBRE.",
      "México no tiene reglamento de construcción federal. Lo que se cita del RCDF vale en la " +
        "Ciudad de México; cada estado y cada municipio tiene el suyo, y la figura del Director " +
        "Responsable de Obra puede llamarse y funcionar distinto fuera de la capital.",
      "No se citan números de artículo del RCDF: se cita el título. El artículo exacto y el texto " +
        "de la leyenda de responsiva los tiene que confirmar un D.R.O. en activo.",
      "Los 180 mm de ancho del cajetín vienen de la edición de 1984 de ISO 7200, que la edición " +
        "vigente ya no impone. Se conservan por costumbre consolidada, no por requisito.",
      "No se modela el PATRÓN de pliegues de una lámina. ISO 5457 pide que el resultado sea A4 con " +
        "el cajetín visible; la secuencia de dobleces la detalla DIN 824 y aquí no se dibuja.",
      "El cajetín en BANDA VERTICAL sobre el borde derecho, que muchos despachos mexicanos usan, " +
        "no está implementado: sólo la caja inferior derecha, en sus dos disposiciones.",
      "NOM-001-SEDE y la normatividad de gas L.P. regulan las INSTALACIONES, no el dibujo. Que la " +
        "capa se llame INST-ELE o salga en amarillo no lo dice ninguna norma.",
      "Ninguna tabla de aquí ha sido revisada por un arquitecto mexicano en ejercicio ni por un " +
        "D.R.O. Es la primera revisión que el producto necesita antes de enseñársela a un cliente.",
    ],
  };
}
