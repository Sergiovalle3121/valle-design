/**
 * ETRANSMIT: empaqueta el dibujo abierto para entregarlo en otra máquina.
 *
 * El comando compone el ZIP ENTERO en el motor —es aritmética sobre bytes,
 * igual que `DXFOUT` compone su texto entero— y el anfitrión sólo entrega el
 * archivo. Así se prueba en Node comparando bytes reales, y el paquete no
 * depende de qué tan cargado esté el anfitrión que lo sirva.
 *
 * ## La puerta de entrega (Ola 9)
 *
 * MEDIDO: hasta esta ola, ETRANSMIT no consultaba NADA. Empaquetaba igual de
 * contento un plano correcto y uno con dos equipos llamados `P-101`, un
 * conductor que no aguanta su protección y un área que dejó de ser cierta. El
 * eTransmit de AutoCAD hace lo mismo, y no puede hacer otra cosa: su informe
 * sabe de FICHEROS, no del proyecto.
 *
 * Ahora el paquete pasa por `REVISA` antes de armarse, y **falla cerrado**: con
 * hallazgos que bloquean, no se empaqueta. No es un veto —hay entregas
 * parciales, y quien firma decide—: hay una palabra clave para armarlo igual,
 * y entonces **el paquete lo dice por dentro**, en el manifiesto y en un
 * `REVISION.txt` que se lee sin abrir un `.json`. Lo caro no es mandar un plano
 * con defectos: es que quien lo recibe no lo sepa.
 *
 * El informe viaja SIEMPRE, con hallazgos o sin ellos. Un paquete que sólo
 * lleva informe cuando hay algo malo enseña a no leerlo.
 */
import {
  buildCadTransmittalPackage,
  describeCadTransmittalManifest,
  type CadTransmittalReview,
} from "../../etransmit/etransmit";
import { cadDeliveryReview, cadReviewVerdict } from "../../review/delivery-review";
import {
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_TEXT,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandContext,
  type CadCommandDescriptor,
  type CadCommandStep,
  type CadKeyword,
} from "../command-types";
import { cadCommandCancelled, cadCommandRefused } from "./annotate-support";

const NO_DOCUMENT_VIEW =
  "Este espacio de trabajo no expone el documento entero: ETRANSMIT no puede empaquetarlo aquí.";

interface EtransmitState {
  askingName: boolean;
  /** El nombre ya tecleado, mientras se pregunta si se empaqueta con bloqueos. */
  pendingName?: string;
}

/**
 * La palabra que arma el paquete a pesar de los bloqueos.
 *
 * El freno no es lo que cuesta teclearla —el motor resuelve las palabras clave
 * por prefijo, así que una letra basta, como en cualquier otra orden—: es que
 * la decisión queda ESCRITA dentro del paquete, donde la lee quien lo recibe.
 */
const PACK_ANYWAY: CadKeyword = { keyword: "Empaquetar", shortcut: "E" };

/**
 * Pasa el dibujo por `REVISA` y lo deja en la forma que viaja en el paquete.
 *
 * Ni un criterio se decide aquí: `cadDeliveryReview` compone los módulos de
 * dominio, y este comando sólo mira cuántos bloquean.
 */
function reviewOf(
  context: CadCommandContext,
  packedDespiteBlocking: boolean,
): { review: CadTransmittalReview; blocking: number } | null {
  const view = context.document?.();
  if (!view) return null;
  const report = cadDeliveryReview(view, {
    date: new Date().toISOString().slice(0, 10),
    variable: context.variables?.get,
  });
  return {
    blocking: report.blocking,
    review: {
      verdict: cadReviewVerdict(report),
      checked: report.checked,
      skipped: report.skipped,
      findings: report.findings.map((hallazgo) => ({
        severity: hallazgo.severity,
        area: hallazgo.area,
        detail: hallazgo.detail,
      })),
      limits: report.limits,
      packedDespiteBlocking,
    },
  };
}

function ask(): CadCommandStep<EtransmitState> {
  return {
    state: { askingName: true },
    prompt: {
      message: "Indique el nombre del paquete, sin extensión",
      options: [],
      defaultValue: "el nombre del documento",
    },
    accepts: CAD_ACCEPT_TEXT,
  };
}

/**
 * `context.document()` sólo expone `CadCommandDocumentView` — las secciones
 * que un comando puede LEER (ni historial ni registro de publicaciones están
 * ahí, a propósito: no son asunto de un comando de dibujo). Para empaquetar
 * un documento que se abra igual en otra máquina hacen falta además las
 * presentaciones, las restricciones y los parámetros — capacidades PROPIAS
 * del contexto (`paperSpaces`, `constraints`, `parameters`), no de la vista
 * de documento. Lo que ninguna de las dos trae —historial, manifiesto de
 * pérdidas, publicaciones— se declara vacío y se NOMBRA en el manifiesto:
 * `omittedSections` es justamente para no fingir que viajó.
 */
const OMITTED_SECTIONS = ["el historial de cambios", "el registro de publicaciones"] as const;

function pack(
  name: string,
  context: CadCommandContext,
  review: CadTransmittalReview,
): CadCommandStep<EtransmitState> {
  const view = context.document?.();
  if (!view) return cadCommandRefused({ askingName: false }, NO_DOCUMENT_VIEW);
  const fullDocument: Parameters<typeof buildCadTransmittalPackage>[0]["document"] = {
    ...view,
    paperSpaces: context.paperSpaces?.() ? [...context.paperSpaces()] : [],
    constraints: context.constraints ? [...context.constraints] : [],
    ...(context.parameters ? { parameters: [...context.parameters] } : {}),
    history: [],
    lossManifest: [],
    publications: [],
  };
  const built = buildCadTransmittalPackage({
    document: fullDocument,
    documentName: name,
    generatedAt: new Date().toISOString().slice(0, 10),
    omittedSections: OMITTED_SECTIONS,
    review,
  });
  return {
    state: { askingName: false },
    prompt: { message: "", options: [] },
    accepts: 0,
    result: {
      kind: "host",
      request: {
        kind: "etransmit",
        fileName: `${name}.zip`,
        bytes: built.zip,
        included: built.manifest.entries.filter((entry) => entry.included).map((entry) => entry.name),
        missing: built.manifest.entries.filter((entry) => !entry.included).map((entry) => entry.name),
      },
      label: describeCadTransmittalManifest(built.manifest),
    },
  };
}

const etransmitCommand: CadCommandDescriptor<EtransmitState> = {
  name: "ETRANSMIT",
  aliases: ["ETRANS"],
  kind: "manage",
  transparent: false,
  selection: "none",
  repeatable: false,
  // No muta el documento: empaqueta una copia. Como PLOT.
  mutates: false,
  cursor: "none",
  begin: () => ask(),
  step: (state, input, context) => {
    if (input.kind === "cancel") return cadCommandCancelled(state);

    // Segunda vuelta: ya se dijo qué bloquea y se preguntó si aun así se arma.
    if (state.pendingName !== undefined) {
      if (input.kind !== "keyword" || input.keyword !== PACK_ANYWAY.keyword)
        return cadCommandRefused(
          { askingName: false },
          "ETRANSMIT: no se armó el paquete. Corrija lo que bloquea y vuelva a intentarlo, o ejecute REVISA para verlo con detalle.",
        );
      const packed = reviewOf(context, true);
      if (!packed) return cadCommandRefused({ askingName: false }, NO_DOCUMENT_VIEW);
      return pack(state.pendingName, context, packed.review);
    }

    if (input.kind !== "enter" && input.kind !== "text") return ask();
    const name = input.kind === "text" ? input.value.trim() || "dibujo" : "dibujo";

    const revisado = reviewOf(context, false);
    if (!revisado) return cadCommandRefused({ askingName: false }, NO_DOCUMENT_VIEW);
    if (revisado.blocking === 0) return pack(name, context, revisado.review);

    // Falla cerrado: con bloqueos no se empaqueta sin decirlo en voz alta.
    const bloqueos = revisado.review.findings
      .filter((hallazgo) => hallazgo.severity === "bloquea")
      .map((hallazgo) => `${hallazgo.area}: ${hallazgo.detail}`);
    return {
      state: { askingName: false, pendingName: name },
      prompt: {
        message: `ETRANSMIT — ${revisado.review.verdict} ${bloqueos.join(" · ")}. ¿Empaquetar de todos modos? El paquete lo dirá por dentro`,
        options: [PACK_ANYWAY],
      },
      accepts: CAD_ACCEPT_KEYWORD,
    };
  },
};

export const CAD_ETRANSMIT_COMMANDS: readonly CadAnyCommandDescriptor[] = [asCadCommand(etransmitCommand)];
