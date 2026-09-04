/**
 * LA REVISIÓN DE ENTREGA: lo que AutoCAD no puede hacer por usted.
 *
 * ## Qué falta, medido
 *
 * Sondeados veintidós nombres de revisión contra el registro: `AUDIT`,
 * `RECOVER`, `PURGE`, `CHECKSTANDARDS` y `LAYTRANS` están —son los de AutoCAD y
 * ya se hicieron—, y también están, uno a uno, todos los chequeos de dominio
 * que esta campaña fue construyendo: `AECHECK`, `PIDLIST`, `PIDMTO`,
 * `AETAGLIST`, `PIDEQUIPLIST`, `UPDATEFIELD`. Lo que NO existe es la orden que
 * los corre TODOS y da un veredicto: `REVISA`, `ENTREGA`, `PREFLIGHT` — cero.
 *
 * ## Por qué esto es «mejor que AutoCAD» y no «otro comando»
 *
 * `AUDIT` de AutoCAD revisa el ARCHIVO: geometría degenerada, referencias
 * colgantes, objetos sin usar. `CHECKSTANDARDS` revisa las CAPAS contra un
 * estándar. Ninguno de los dos sabe nada de su PROYECTO: no sabe que el
 * conductor de ese circuito no aguanta su protección, que dos equipos se llaman
 * `P-101`, que una línea de proceso usa dos especificaciones, ni que el área
 * escrita en el plano dejó de ser cierta cuando movieron el muro.
 *
 * Este producto sí lo sabe, porque su geometría lleva encima lo que significa.
 * Y por eso puede hacer lo que un despacho hace a mano la noche antes de
 * entregar: pasar el plano entero por todos sus filtros y decir qué falta.
 *
 * ## Compone, no repite
 *
 * Cada hallazgo sale del MISMO módulo que lo publica en su propia orden:
 * `circuit-check`, `wire-numbering`, `device-tags`, `line-numbers`,
 * `equipment-tags`, `pipe-route`, `drawing-fields`, `reference-edit`. Aquí no
 * se vuelve a implementar ni una regla: si `AECHECK` cambia de criterio, la
 * revisión de entrega cambia con él. Dos implementaciones del mismo criterio se
 * separan el día que alguien toca una.
 *
 * ## Dice lo que MIRÓ, no sólo lo que encontró
 *
 * Un informe sin hallazgos puede significar «está limpio» o «no miré nada», y
 * de lejos parecen lo mismo. Por eso el reporte lleva la lista de áreas
 * revisadas y las que se saltaron por no haber nada de esa disciplina en el
 * dibujo.
 */
import type { CadDocument } from "../cad-document";
import { cadCheckCircuits, CAD_NOM_CHECK_LIMITS } from "../electrical/circuit-check";
import { cadWireClashes, cadWireDefects, cadWiresOf } from "../electrical/wire-numbering";
import {
  cadDeviceTagClashes,
  cadDeviceTagsOf,
  cadIsElectricalInsert,
  cadUntaggedDevices,
} from "../electrical/device-tags";
import { cadPlantFindings, cadPlantLinesOf } from "../plant/line-numbers";
import { cadEquipmentClashes, cadEquipmentTagsOf, cadUntaggedEquipment } from "../plant/equipment-tags";
import { cadPipeRouteFindings, cadPipeRoutesOf } from "../plant/pipe-route";
import { cadFieldEntities, cadUpdateFields } from "../fields/drawing-fields";
import { cadRefeditSession } from "../blocks/reference-edit";

/**
 * `bloquea` es lo que no se entrega; `aviso`, lo que se decide.
 *
 * La diferencia no es de gravedad sentida: es de a quién le toca. Un conductor
 * que no aguanta su protección lo arregla el proyectista antes de firmar; una
 * ruta sin desnivel puede ser correcta y sólo la ingeniería lo sabe.
 */
export type CadReviewSeverity = "bloquea" | "aviso";

export interface CadReviewFinding {
  /** Disciplina o sistema: `Eléctrico`, `Planta`, `Campos`… */
  area: string;
  severity: CadReviewSeverity;
  detail: string;
  entityIds?: string[];
}

export interface CadReviewReport {
  findings: CadReviewFinding[];
  /** Áreas que se revisaron de verdad, con lo que se contó en cada una. */
  checked: string[];
  /** Áreas que no aplican porque el dibujo no tiene nada de eso. */
  skipped: string[];
  blocking: number;
  warnings: number;
  /** Lo que esta revisión NO mira. Va con el informe, siempre. */
  limits: string;
}

export const CAD_REVIEW_LIMITS =
  "Revisa lo que el dibujo declara: circuitos, líneas de proceso, etiquetas, campos y ediciones " +
  "abiertas. NO sustituye la revisión del proyectista ni el memorial de cálculo, no comprueba el " +
  `catálogo de la ingeniería y no mira la integridad del archivo (para eso está AUDIT). ${CAD_NOM_CHECK_LIMITS}`;

export interface CadReviewOptions {
  /** Se inyecta: `new Date()` haría el informe irreproducible. */
  date: string;
  variable?: (name: string) => string | number | boolean | undefined;
}

/**
 * Pasa el dibujo por todos sus filtros.
 *
 * El orden de las áreas es el del plano: primero lo que se construye
 * —eléctrico, planta—, después lo que se rotula, y al final lo que quedó a
 * medias en la sesión de trabajo.
 */
export function cadDeliveryReview(
  document: Pick<CadDocument, "entities" | "meta">,
  options: CadReviewOptions,
): CadReviewReport {
  const findings: CadReviewFinding[] = [];
  const checked: string[] = [];
  const skipped: string[] = [];

  // --- Eléctrico ----------------------------------------------------------
  const wires = cadWiresOf(document);
  // Los componentes se cuentan aparte de los conductores a propósito: un plano
  // de alumbrado puede llevar cien luminarias y ni un tramo dibujado todavía, y
  // saltarse el área entera por no haber conductores diría «limpio» de un plano
  // que nadie miró.
  const sinEtiqueta = cadUntaggedDevices(document, cadIsElectricalInsert);
  const devices = cadDeviceTagsOf(document).length + sinEtiqueta.length;
  if (wires.length === 0 && devices === 0)
    skipped.push("Eléctrico (no hay conductores ni componentes)");
  else {
    const circuits = wires.length > 0 ? cadCheckCircuits(document as CadDocument) : [];
    checked.push(
      `Eléctrico: ${wires.length} conductor(es) en ${circuits.length} circuito(s), ${devices} componente(s)`,
    );
    for (const circuit of circuits) {
      if (circuit.verdict === "ok") continue;
      findings.push({
        area: "Eléctrico",
        // «No cumple» es del proyectista antes de firmar; un aviso o una falta
        // de datos la decide quien conoce la instalación.
        severity: circuit.verdict === "no-cumple" ? "bloquea" : "aviso",
        detail: `Circuito ${circuit.circuit}: ${circuit.findings.join(" ")}`,
      });
    }
    for (const clash of cadWireClashes(document))
      findings.push({
        area: "Eléctrico",
        severity: "bloquea",
        detail: `Número de conductor repetido: ${clash.circuit}-${clash.number} en ${clash.entityIds.length} tramos`,
        entityIds: clash.entityIds,
      });
    for (const defect of cadWireDefects(document))
      findings.push({
        area: "Eléctrico",
        severity: "aviso",
        detail: `Marca eléctrica ilegible en ${defect.entityId}: ${defect.reason}`,
        entityIds: [defect.entityId],
      });
    for (const clash of cadDeviceTagClashes(document))
      findings.push({
        area: "Eléctrico",
        severity: "bloquea",
        detail: `Etiqueta de componente repetida: ${clash.tag} en ${clash.entityIds.join(" y ")}`,
        entityIds: clash.entityIds,
      });
    if (sinEtiqueta.length > 0)
      findings.push({
        area: "Eléctrico",
        severity: "aviso",
        detail: `${sinEtiqueta.length} componente(s) sin etiqueta: no salen en el cuadro de cargas`,
        entityIds: sinEtiqueta,
      });
  }

  // --- Planta -------------------------------------------------------------
  const lines = cadPlantLinesOf(document);
  const routes = cadPipeRoutesOf(document);
  const equipos = cadEquipmentTagsOf(document);
  if (lines.length === 0 && routes.length === 0 && equipos.length === 0)
    skipped.push("Planta (no hay líneas, rutas ni equipos)");
  else {
    checked.push(
      `Planta: ${lines.length} línea(s), ${routes.length} ruta(s) 3D, ${equipos.length} equipo(s)`,
    );
    for (const hallazgo of cadPlantFindings(document))
      findings.push({
        area: "Planta",
        // Un número repetido o ilegible impide comprar; un diámetro no comercial
        // y una especificación partida los decide la ingeniería.
        severity:
          hallazgo.kind === "numero-repetido" || hallazgo.kind === "numero-ilegible"
            ? "bloquea"
            : "aviso",
        detail: hallazgo.detail,
        entityIds: hallazgo.entityIds,
      });
    for (const hallazgo of cadPipeRouteFindings(routes))
      findings.push({
        area: "Planta",
        severity: hallazgo.kind === "especificacion-partida" ? "bloquea" : "aviso",
        detail: hallazgo.detail,
        entityIds: hallazgo.entityIds,
      });
    for (const clash of cadEquipmentClashes(document))
      findings.push({
        area: "Planta",
        severity: "bloquea",
        detail: `Etiqueta de equipo repetida: ${clash.tag} en ${clash.entityIds.join(" y ")}`,
        entityIds: clash.entityIds,
      });
    const pelados = cadUntaggedEquipment(document);
    if (pelados.length > 0)
      findings.push({
        area: "Planta",
        severity: "aviso",
        detail: `${pelados.length} equipo(s) sin etiqueta: no salen en la requisición`,
        entityIds: pelados,
      });
  }

  // --- Campos -------------------------------------------------------------
  const campos = cadFieldEntities(document);
  if (campos.length === 0) skipped.push("Campos (no hay ninguno)");
  else {
    const update = cadUpdateFields({ document, date: options.date, variable: options.variable });
    checked.push(`Campos: ${campos.length} en el dibujo`);
    if (update.updated.length > 0)
      // Un campo desfasado ES un plano que dice un número falso. Se entrega hoy
      // y se discute dentro de un mes.
      findings.push({
        area: "Campos",
        severity: "bloquea",
        detail: `${update.updated.length} campo(s) desfasados: el plano dice un número que ya no es. Ejecute UPDATEFIELD`,
        entityIds: update.updated.map((campo) => campo.entityId),
      });
    for (const huerfano of update.unresolved)
      findings.push({
        area: "Campos",
        severity: "aviso",
        detail: `Campo sin resolver ${huerfano.expression}: conserva su último valor`,
        entityIds: [huerfano.entityId],
      });
  }

  // --- Sesión de trabajo --------------------------------------------------
  // Sólo este producto puede tener este hallazgo, y es de los que más caros
  // salen: una edición de referencia abierta significa que el dibujo lleva ENCIMA
  // una copia de trabajo de un bloque. Entregarlo así duplica esa geometría.
  const { session, conflict } = cadRefeditSession(document);
  if (conflict.length > 0)
    findings.push({
      area: "Sesión",
      severity: "bloquea",
      detail: `Hay ${conflict.length} ediciones de referencia abiertas (${conflict.join(", ")}): el dibujo lleva copias de trabajo encima. Ciérrelas con REFCLOSE`,
    });
  else if (session)
    findings.push({
      area: "Sesión",
      severity: "bloquea",
      detail: `Edición de «${session.blockId}» abierta con ${session.entityIds.length} objeto(s): el dibujo lleva una copia de trabajo encima. Ciérrela con REFCLOSE`,
      entityIds: session.entityIds,
    });
  checked.push("Sesión: ediciones de referencia abiertas");

  return {
    findings,
    checked,
    skipped,
    blocking: findings.filter((f) => f.severity === "bloquea").length,
    warnings: findings.filter((f) => f.severity === "aviso").length,
    limits: CAD_REVIEW_LIMITS,
  };
}

/** El renglón de veredicto, que es lo primero que alguien lee. */
export function cadReviewVerdict(report: CadReviewReport): string {
  if (report.blocking > 0)
    return `NO ENTREGABLE: ${report.blocking} hallazgo(s) que hay que resolver${
      report.warnings > 0 ? ` y ${report.warnings} aviso(s)` : ""
    }.`;
  if (report.warnings > 0)
    return `ENTREGABLE CON ${report.warnings} AVISO(S): nada impide entregar; los avisos los decide la ingeniería.`;
  return "SIN HALLAZGOS en lo que esta revisión mira.";
}
