/**
 * REVISA: la revisión de entrega, que es lo que AutoCAD no puede hacer.
 *
 * ## Lo medido antes de escribir nada
 *
 * Veintiséis nombres de revisión sondeados contra el registro COMPUESTO que usa
 * el estudio —el nativo más los `.lsp` y la consola, no sólo el nativo—: 13
 * existen y son de dos clases. Los de AutoCAD miran el ARCHIVO o las CAPAS
 * (`AUDIT`, `RECOVER`, `PURGE`, `CHECKSTANDARDS`, `LAYTRANS`); los de esta
 * campaña miran UNA disciplina cada uno (`AECHECK`, `PIDLIST`, `PIDMTO`,
 * `AETAGLIST`, `PIDEQUIPLIST`, `UPDATEFIELD`, `BLOQUEDINLIST`). Los otros 13
 * —`REVISA`, `ENTREGA`, `PREFLIGHT`, `QAQC`, `VALIDATE`…— no existen en ningún
 * registro: nadie pasa el plano ENTERO por todos sus filtros de una vez.
 *
 * ## Por qué esto supera a AutoCAD y no sólo lo iguala
 *
 * `AUDIT` sabe de ARCHIVOS: geometría degenerada, referencias colgantes. No
 * sabe que el conductor de ese circuito no aguanta su protección, que dos
 * equipos se llaman `P-101`, ni que el área escrita en el plano dejó de ser
 * cierta cuando movieron el muro. Un despacho hace esa revisión A MANO la noche
 * antes de entregar, y la hace mal porque es tarde. Aquí la hace el dibujo,
 * porque su geometría lleva encima lo que significa.
 *
 * ## Sin reglas nuevas
 *
 * Ni un criterio se implementa en este archivo. Todo sale de `delivery-review`,
 * que a su vez compone los módulos que ya publican cada orden de dominio. Si
 * `AECHECK` cambia de criterio, `REVISA` cambia con él el mismo día.
 *
 * ## Por qué no escribe en el dibujo
 *
 * Una revisión que modifica lo que revisa no se puede repetir para comprobar
 * que se arregló. `mutates: false` y `transparent: true`: se puede lanzar en
 * mitad de otro comando, como se mira el reloj sin soltar el lápiz.
 */
import type { CadEntity } from "../../cad-document";
import type { CadCommandContext, CadCommandDescriptor, CadCommandStep } from "../command-types";
import {
  cadDeliveryReview,
  cadReviewVerdict,
  type CadReviewFinding,
} from "../../review/delivery-review";

const say = (text: string): CadCommandStep<never> => ({
  state: undefined as never,
  prompt: { message: "", options: [] },
  accepts: 0,
  result: { kind: "message", text },
});

/** Las entidades del dibujo que el anfitrión expone. `null` si no expone. */
function entitiesOf(context: CadCommandContext): CadEntity[] | null {
  if (!context.entity) return null;
  return context.entityIds
    .map((id) => context.entity!(id))
    .filter((entity): entity is CadEntity => !!entity);
}

/**
 * Un hallazgo en una línea.
 *
 * Los ids van al final y como mucho tres: quien lee el informe quiere saber QUÉ
 * pasa antes que DÓNDE, y una lista de cuarenta ids empuja el motivo fuera de
 * la pantalla. El total se dice siempre, para que nadie crea que son tres.
 */
function lineOf(finding: CadReviewFinding): string {
  const marca = finding.severity === "bloquea" ? "BLOQUEA" : "aviso";
  const ids = finding.entityIds ?? [];
  const donde =
    ids.length === 0
      ? ""
      : ids.length <= 3
        ? ` [${ids.join(", ")}]`
        : ` [${ids.slice(0, 3).join(", ")} y ${ids.length - 3} más]`;
  return `${marca} · ${finding.area}: ${finding.detail}${donde}`;
}

const reviewCommand: CadCommandDescriptor<never> = {
  name: "REVISA",
  aliases: ["ENTREGA", "PREFLIGHT"],
  kind: "inquiry",
  transparent: true,
  selection: "none",
  repeatable: true,
  mutates: false,
  cursor: "none",
  begin: (context) => {
    const entities = entitiesOf(context);
    if (!entities)
      return say("REVISA necesita leer el dibujo: este anfitrión no lo expone.");

    const report = cadDeliveryReview(
      { entities, meta: { unit: context.unit } as never },
      {
        date: new Date().toISOString().slice(0, 10),
        variable: context.variables?.get,
      },
    );

    // El veredicto primero: es el único renglón que alguien lee con prisa.
    const partes = [`REVISA — ${cadReviewVerdict(report)}`];
    // Lo REVISADO antes que lo encontrado. Un informe sin hallazgos y un
    // informe de un dibujo que nadie miró se parecen demasiado de lejos.
    partes.push(`Revisado: ${report.checked.join("; ")}`);
    if (report.skipped.length > 0)
      partes.push(`No aplica: ${report.skipped.join("; ")}`);
    if (report.findings.length > 0)
      partes.push(
        report.findings
          .slice()
          // Lo que bloquea, arriba: es lo que hay que arreglar hoy.
          .sort((a, b) =>
            a.severity === b.severity ? 0 : a.severity === "bloquea" ? -1 : 1,
          )
          .map(lineOf)
          .join(" · "),
      );
    partes.push(report.limits);
    return say(partes.join(". "));
  },
  step: (state) => ({
    state,
    prompt: { message: "", options: [] },
    accepts: 0,
    result: { kind: "none" },
  }),
};

export const CAD_DELIVERY_REVIEW_COMMANDS: readonly CadCommandDescriptor<never>[] = [
  reviewCommand,
];
