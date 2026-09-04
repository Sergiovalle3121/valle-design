/**
 * LA REVISIÓN DE ENTREGA, MEDIDA CONTRA LO QUE PASA LA NOCHE ANTES.
 *
 * ## Lo que aquí se comprueba, y por qué eso y no otra cosa
 *
 * Un informe de revisión sólo sirve si se puede confiar en él, y sólo se puede
 * confiar en él si falla CERRADO: el modo de fallo caro no es un hallazgo de
 * más —eso se lee y se descarta en un minuto—, es un dibujo sucio que sale
 * «limpio» porque el área ni se miró. Por eso lo primero que se mide no son los
 * hallazgos: es que el informe diga QUÉ MIRÓ.
 *
 * Se comprueba, en este orden:
 *
 * 1. que un dibujo vacío no diga «sin hallazgos» a secas, sino que declare que
 *    no había nada de ninguna disciplina que mirar;
 * 2. que un plano eléctrico con componentes y SIN conductores se revise igual
 *    —cien luminarias y ningún tramo dibujado todavía es un plano de alumbrado
 *    normal, no un plano vacío—;
 * 3. que un conductor que no aguanta su protección BLOQUEE, y que una ruta sin
 *    desnivel sólo AVISE: la diferencia no es de gravedad sentida, es de a
 *    quién le toca decidir;
 * 4. que una etiqueta repetida bloquee en las dos disciplinas, porque es el
 *    error que no se ve en pantalla y sí en la obra;
 * 5. que un campo desfasado bloquee: un plano que dice un número que ya no es
 *    se entrega hoy y se discute dentro de un mes;
 * 6. que una edición de referencia abierta bloquee —el hallazgo que sólo este
 *    producto puede tener— y que un dibujo sin ella lo diga como área revisada,
 *    no como área saltada;
 * 7. que el veredicto de una línea no se contradiga nunca con las cuentas;
 * 8. y el negativo de control que da valor a todo lo anterior: un dibujo
 *    CORRECTO de las dos disciplinas, con campos al día, no inventa ni un
 *    hallazgo. Sin este caso, un módulo que devolviera «todo mal» pasaría los
 *    otros siete.
 */
import { strict as assert } from "node:assert";
import type { CadDocument, CadEntity } from "../cad-document";
import { CAD_IE_TAG } from "../electrical/device-tags";
import { cadWireMetadata } from "../electrical/wire-numbering";
import { CAD_IE_BREAKER, CAD_IE_PHASES, CAD_IE_VOLTS } from "../electrical/circuit-check";
import { CAD_PL_LINE, CAD_PL_SERVICE, CAD_PL_SPEC } from "../plant/line-numbers";
import { CAD_PL_ROUTE, CAD_PL_ROUTE_MARK } from "../plant/pipe-route";
import { CAD_FIELD_METADATA } from "../fields/drawing-fields";
import { CAD_REFEDIT_BLOCK, CAD_REFEDIT_REF } from "../blocks/reference-edit";
import { cadDeliveryReview, cadReviewVerdict, CAD_REVIEW_LIMITS } from "./delivery-review";

let verdes = 0;
const ok = (condicion: unknown, mensaje: string) => {
  assert.ok(condicion, mensaje);
  verdes += 1;
};
const eq = (actual: unknown, esperado: unknown, mensaje: string) => {
  assert.equal(actual, esperado, mensaje);
  verdes += 1;
};

const HOY = "2026-09-04";

const doc = (entities: CadEntity[]): Pick<CadDocument, "entities" | "meta"> => ({
  entities,
  meta: { version: 1, schema: 8, unit: "mm" } as never,
});

const revisa = (entities: CadEntity[]) => cadDeliveryReview(doc(entities), { date: HOY });

/** Un conductor recto de `metros`, con su circuito y su calibre. */
const tramo = (
  id: string,
  metros: number,
  metadata: Record<string, string>,
): CadEntity =>
  ({
    id,
    type: "polyline",
    vertices: [
      { x: 0, y: 0, z: 0 },
      { x: metros * 1_000, y: 0, z: 0 },
    ],
    closed: false,
    layer: "IE-CIR",
    context: { metadata },
  }) as unknown as CadEntity;

/** Una luminaria del catálogo, con etiqueta o sin ella. */
const luminaria = (id: string, tag?: string): CadEntity =>
  ({
    id,
    type: "insert",
    block: "MEP-LUMINARIA",
    position: { x: 0, y: 0, z: 0 },
    rotation: 0,
    scale: { x: 1, y: 1, z: 1 },
    layer: "IE-ALU",
    attributes: tag ? { [CAD_IE_TAG]: tag } : {},
  }) as unknown as CadEntity;

/** Un equipo de planta. */
const equipo = (id: string, tag: string): CadEntity =>
  ({
    id,
    type: "insert",
    block: "PID-BOMBA",
    position: { x: 0, y: 0, z: 0 },
    rotation: 0,
    scale: { x: 1, y: 1, z: 1 },
    layer: "TU-EQ",
    attributes: { TAG: tag },
  }) as unknown as CadEntity;

/** Una ruta 3D de tubería por sus vértices en milímetros. */
const ruta = (
  id: string,
  linea: string,
  puntos: [number, number, number][],
  spec = "150#",
): CadEntity =>
  ({
    id,
    type: "polyline",
    vertices: puntos.map(([x, y, z]) => ({ x, y, z })),
    closed: false,
    layer: "TU-RUTA",
    context: {
      metadata: {
        [CAD_PL_LINE]: linea,
        [CAD_PL_SERVICE]: "P",
        [CAD_PL_SPEC]: spec,
        [CAD_PL_ROUTE]: CAD_PL_ROUTE_MARK,
      },
    },
  }) as unknown as CadEntity;

/** Un texto con campo: `text` es lo que el plano ENSEÑA hoy. */
const campo = (id: string, expresion: string, text: string): CadEntity =>
  ({
    id,
    type: "mtext",
    text,
    position: { x: 0, y: 0, z: 0 },
    height: 250,
    rotation: 0,
    width: 0,
    layer: "0",
    context: { metadata: { [CAD_FIELD_METADATA]: expresion } },
  }) as unknown as CadEntity;

// --- 1 · un dibujo vacío dice qué NO miró, no «limpio» ----------------------
{
  const informe = revisa([]);
  eq(informe.findings.length, 0, "un dibujo vacío no tiene hallazgos");
  ok(
    informe.skipped.some((area) => area.startsWith("Eléctrico")),
    "pero declara que se saltó el eléctrico por no haber nada de eso",
  );
  ok(
    informe.skipped.some((area) => area.startsWith("Planta")),
    "y que se saltó planta por lo mismo",
  );
  ok(
    informe.skipped.some((area) => area.startsWith("Campos")),
    "y campos",
  );
  ok(
    informe.checked.some((area) => area.startsWith("Sesión")),
    "la sesión de trabajo SÍ se mira siempre: existe aunque el dibujo esté vacío",
  );
  eq(informe.limits, CAD_REVIEW_LIMITS, "y el informe lleva sus límites encima, siempre");
}

// --- 2 · componentes sin conductores es un plano, no un vacío ---------------
{
  const informe = revisa([luminaria("L1", "-LT1"), luminaria("L2")]);
  ok(
    informe.checked.some((area) => area.startsWith("Eléctrico")),
    "cien luminarias y ningún tramo todavía es un plano de alumbrado: se revisa",
  );
  ok(
    !informe.skipped.some((area) => area.startsWith("Eléctrico")),
    "y por lo tanto NO se salta",
  );
  eq(informe.blocking, 0, "una luminaria sin etiqueta no impide entregar");
  eq(informe.warnings, 1, "pero avisa: sin etiqueta no sale en el cuadro de cargas");
  ok(
    informe.findings[0].entityIds?.includes("L2"),
    "y señala CUÁL, que es lo que convierte un aviso en una tarea",
  );
}

// --- 3 · quién decide: bloquea el proyectista, avisa la ingeniería ----------
{
  // 14 AWG con protección de 30 A: la norma no lo permite (Art. 240-4(D)).
  const informe = revisa([
    tramo("W1", 20, {
      ...cadWireMetadata({ circuit: "C1", number: 1, gauge: "14" }),
      [CAD_IE_BREAKER]: "30",
      [CAD_IE_VOLTS]: "127",
    }),
  ]);
  ok(informe.blocking >= 1, "un conductor que no aguanta su protección BLOQUEA la entrega");
  ok(
    informe.findings.some((f) => f.area === "Eléctrico" && f.severity === "bloquea"),
    "y el hallazgo se atribuye al eléctrico, no a un «general» que nadie lee",
  );
}
{
  // Ruta con dos tramos, toda a la misma cota: puede ser correcta, y sólo la
  // ingeniería lo sabe.
  const informe = revisa([
    ruta("R1", '6"-P-1001-A1', [
      [0, 0, 0],
      [10_000, 0, 0],
      [10_000, 8_000, 0],
    ]),
  ]);
  eq(informe.blocking, 0, "una ruta sin desnivel NO impide entregar");
  ok(
    informe.findings.some((f) => f.area === "Planta" && f.severity === "aviso"),
    "pero avisa: la decide la ingeniería, no el revisor",
  );
}

// --- 4 · la etiqueta repetida bloquea en las dos disciplinas ----------------
{
  const informe = revisa([luminaria("L1", "-LT1"), luminaria("L2", "-LT1")]);
  ok(
    informe.findings.some(
      (f) => f.severity === "bloquea" && f.detail.includes("-LT1"),
    ),
    "dos componentes con la misma etiqueta bloquean, y el hallazgo NOMBRA la etiqueta",
  );
  const ids = informe.findings.find((f) => f.detail.includes("-LT1"))?.entityIds ?? [];
  ok(ids.includes("L1") && ids.includes("L2"), "y señala las DOS, no una");
}
{
  const informe = revisa([equipo("E1", "P-101"), equipo("E2", "P-101")]);
  ok(
    informe.findings.some(
      (f) => f.area === "Planta" && f.severity === "bloquea" && f.detail.includes("P-101"),
    ),
    "y dos equipos llamados P-101 bloquean igual: en la obra sólo hay una bomba",
  );
}

// --- 5 · un campo desfasado es un plano que miente --------------------------
{
  const informe = revisa([
    ruta("R1", '6"-P-1001-A1', [
      [0, 0, 0],
      [10_000, 0, 0],
      [10_000, 0, 3_000],
    ]),
    campo("T1", "%<Longitud:R1>%", "7.00 m"),
  ]);
  ok(
    informe.findings.some(
      (f) => f.area === "Campos" && f.severity === "bloquea" && f.detail.includes("UPDATEFIELD"),
    ),
    "el plano enseña 7.00 m de una ruta que mide 13: bloquea, y dice cómo arreglarlo",
  );
}
{
  const informe = revisa([campo("T1", "%<Area:NO-EXISTE>%", "12.00 m²")]);
  ok(
    informe.findings.some((f) => f.area === "Campos" && f.severity === "aviso"),
    "un campo que apunta a algo que ya no está avisa: conserva su último valor",
  );
  eq(informe.blocking, 0, "y no bloquea: no se sabe que el número sea falso");
}

// --- 6 · la copia de trabajo encima, que sólo este producto detecta ---------
{
  const abierta = {
    id: "X1",
    type: "line",
    start: { x: 0, y: 0, z: 0 },
    end: { x: 1_000, y: 0, z: 0 },
    layer: "0",
    context: {
      metadata: {
        [CAD_REFEDIT_BLOCK]: "PUERTA",
        [CAD_REFEDIT_REF]: "I1",
      },
    },
  } as unknown as CadEntity;
  const informe = revisa([abierta]);
  ok(
    informe.findings.some(
      (f) => f.area === "Sesión" && f.severity === "bloquea" && f.detail.includes("REFCLOSE"),
    ),
    "una edición de referencia abierta bloquea: entregarla duplica esa geometría",
  );
}

// --- 7 · el veredicto no se contradice con las cuentas ----------------------
{
  const conBloqueo = revisa([luminaria("L1", "-LT1"), luminaria("L2", "-LT1")]);
  ok(
    cadReviewVerdict(conBloqueo).startsWith("NO ENTREGABLE"),
    "con un bloqueo, el renglón que se lee primero dice NO ENTREGABLE",
  );
  const soloAviso = revisa([luminaria("L1")]);
  eq(soloAviso.blocking, 0, "sólo hay un aviso");
  ok(
    cadReviewVerdict(soloAviso).includes("ENTREGABLE CON"),
    "y entonces el veredicto deja entregar, diciendo cuántos avisos van",
  );
  eq(
    cadReviewVerdict(revisa([])),
    "SIN HALLAZGOS en lo que esta revisión mira.",
    "y sin nada, el veredicto acota su alcance en la misma frase: «en lo que esta revisión mira»",
  );
}

// --- 8 · negativo de control: lo correcto no inventa hallazgos --------------
{
  const informe = revisa([
    // 10 AWG con protección de 20 A, 127 V y 20 m: la protección cabe en el
    // conductor y la caída queda por debajo del 3 % que recomienda la NOM.
    tramo("W1", 20, {
      ...cadWireMetadata({ circuit: "C1", number: 1, gauge: "10" }),
      [CAD_IE_BREAKER]: "20",
      [CAD_IE_VOLTS]: "127",
      [CAD_IE_PHASES]: "1",
    }),
    luminaria("L1", "-LT1"),
    luminaria("L2", "-LT2"),
    equipo("E1", "P-101"),
    equipo("E2", "P-102"),
    ruta("R1", '6"-P-1001-A1', [
      [0, 0, 0],
      [10_000, 0, 0],
      [10_000, 0, 3_000],
    ]),
    campo("T1", "%<Longitud:R1>%", "13.00 m"),
    campo("T2", "%<Fecha>%", HOY),
  ]);
  eq(
    informe.findings.length,
    0,
    `un dibujo correcto de las dos disciplinas no inventa hallazgos — salieron: ${informe.findings
      .map((f) => `${f.area}/${f.severity}: ${f.detail}`)
      .join(" | ")}`,
  );
  ok(informe.checked.length >= 4, "y aun así declara las cuatro áreas que sí miró");
  eq(informe.skipped.length, 0, "sin saltarse ninguna: había material de todas");
}

console.log(
  `Revisión de entrega: ${verdes} comprobaciones verdes — el informe dice qué miró antes que qué encontró, bloquea lo que no se entrega y avisa lo que se decide, y un dibujo correcto no inventa ni un hallazgo`,
);
