/**
 * LA REVISIÓN DEL CIRCUITO CONTRA LA NOM, SOBRE EL PLANO Y NO EN UNA HOJA APARTE.
 *
 * ## La diferencia con AutoCAD Electrical, dicha con precisión
 *
 * AutoCAD Electrical numera conductores y saca listas. No comprueba si el
 * calibre aguanta la protección ni cuánto cae la tensión, y no puede: sus
 * conductores son ESQUEMÁTICOS, no están a escala, así que el dibujo no sabe
 * cuánto mide un recorrido. El ingeniero mexicano acaba midiendo el plano a
 * mano y llevándose los metros a una hoja de cálculo.
 *
 * Aquí el conductor es una polilínea a escala: **el dibujo ya sabe su
 * longitud**. Con el calibre y los datos del circuito —protección, tensión y
 * fases, que viajan en los metadatos— la comprobación sale del propio plano.
 * Es exactamente la clase de cosa que un CAD de navegador puede hacer y un CAD
 * de esquemas no.
 *
 * ## Cómo se mide la longitud, y por qué así
 *
 * Sumando los tramos de la polilínea en unidades de dibujo y convirtiendo a
 * metros con la unidad del documento. No se usa la distancia en línea recta
 * entre extremos: un conductor que sube por un muro y baja por otro mide lo
 * que recorre, no lo que separa sus puntas, y ésa es justamente la diferencia
 * que hace que la caída de tensión se salga.
 *
 * ## Con qué CORRIENTE se calcula la caída, y por qué con ésa
 *
 * Con la PROTECCIÓN del circuito, no con la carga conectada. El dibujo no sabe
 * cuánta corriente va a pasar de verdad —eso es el cuadro de cargas, que es
 * otro documento— y suponerla menor sería aprobar de más: un circuito que
 * cumple «porque hoy sólo tiene dos contactos» deja de cumplir el día que se
 * usan. La protección es el máximo que ese circuito puede llevar sin disparar,
 * así que calcular con ella es el lado seguro, y es el criterio con el que se
 * dimensiona un ramal.
 *
 * ## Fallo cerrado
 *
 * Un circuito al que le falta un dato NO se aprueba en silencio ni se rechaza
 * a bulto: se devuelve con el veredicto `sin-datos` y con QUÉ falta. Un plano
 * en el que la mitad de los circuitos «pasaron» porque nadie les puso la
 * protección es peor que uno sin revisar: el segundo se revisa.
 */
import type { CadDocument, CadEntity, CadPoint3 } from "../cad-document";
import { cadUnitsPerMetre } from "../georeference";
import {
  CAD_NOM_BRANCH_DROP_PERCENT,
  cadNomConductor,
  cadNomMaxBreaker,
  cadNomSuggestGauge,
  cadNomVoltageDrop,
} from "./nom-conductors";
import { cadWiresOf } from "./wire-numbering";

/** Protección del circuito, en amperes. */
export const CAD_IE_BREAKER = "ie:proteccion";
/** Tensión del circuito, en volts. */
export const CAD_IE_VOLTS = "ie:tension";
/** Fases: `1` o `3`. */
export const CAD_IE_PHASES = "ie:fases";

export type CadCircuitVerdict = "ok" | "aviso" | "no-cumple" | "sin-datos";

export interface CadCircuitCheck {
  circuit: string;
  /** Conductores del circuito que se midieron. */
  wires: number;
  /** Longitud TOTAL del recorrido, en metros. */
  lengthM: number;
  gauge: string | null;
  breakerAmps: number | null;
  volts: number | null;
  phases: 1 | 3 | null;
  /** Caída de tensión en volts, o `null` si faltan datos. */
  dropVolts: number | null;
  /** Caída en porcentaje de la tensión del circuito. */
  dropPercent: number | null;
  verdict: CadCircuitVerdict;
  /** Qué se encontró, en la lengua del plano. Nunca vacío. */
  findings: string[];
}

const readNumber = (entity: CadEntity, key: string): number | null => {
  const value = entity.context?.metadata?.[key];
  const parsed =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

/** Longitud recorrida por una entidad, en unidades de dibujo. */
export function cadEntityRunLength(entity: CadEntity): number {
  const puntos: CadPoint3[] =
    entity.type === "polyline"
      ? entity.vertices
      : entity.type === "line"
        ? [entity.start, entity.end]
        : [];
  let total = 0;
  for (let i = 1; i < puntos.length; i += 1)
    total += Math.hypot(
      puntos[i].x - puntos[i - 1].x,
      puntos[i].y - puntos[i - 1].y,
      (puntos[i].z ?? 0) - (puntos[i - 1].z ?? 0),
    );
  return total;
}

/**
 * Los datos eléctricos de un circuito, tomados de sus conductores.
 *
 * Se toma el PRIMERO que los declare y se avisa si otro declara algo distinto:
 * dos conductores del mismo circuito con protecciones distintas es un dato
 * contradictorio, y elegir uno en silencio sería inventar el proyecto.
 */
function circuitData(entities: readonly CadEntity[]): {
  breakerAmps: number | null;
  volts: number | null;
  phases: 1 | 3 | null;
  conflicts: string[];
} {
  let breakerAmps: number | null = null;
  let volts: number | null = null;
  let phases: 1 | 3 | null = null;
  const conflicts: string[] = [];
  for (const entity of entities) {
    const a = readNumber(entity, CAD_IE_BREAKER);
    const v = readNumber(entity, CAD_IE_VOLTS);
    const f = readNumber(entity, CAD_IE_PHASES);
    if (a !== null && a > 0) {
      if (breakerAmps === null) breakerAmps = a;
      else if (breakerAmps !== a)
        conflicts.push(`dos protecciones distintas en el mismo circuito: ${breakerAmps} A y ${a} A`);
    }
    if (v !== null && v > 0) {
      if (volts === null) volts = v;
      else if (volts !== v)
        conflicts.push(`dos tensiones distintas en el mismo circuito: ${volts} V y ${v} V`);
    }
    if (f === 1 || f === 3) {
      if (phases === null) phases = f;
      else if (phases !== f)
        conflicts.push(`el circuito se declara a la vez de ${phases} y de ${f} fases`);
    }
  }
  return { breakerAmps, volts, phases, conflicts };
}

/**
 * Revisa todos los circuitos del dibujo contra la NOM.
 *
 * Devuelve una fila por circuito, ordenada por nombre para que dos ejecuciones
 * sobre el mismo documento den la misma lista — que es lo que necesita un
 * informe que alguien va a firmar.
 */
export function cadCheckCircuits(
  document: Pick<CadDocument, "entities" | "meta">,
): CadCircuitCheck[] {
  const porUnidad = cadUnitsPerMetre(document.meta?.unit);
  const unidadesPorMetro = porUnidad > 0 ? porUnidad : 1;
  const porId = new Map(document.entities.map((entity) => [entity.id, entity]));

  const porCircuito = new Map<string, { gauges: Set<string>; entities: CadEntity[]; lengthM: number }>();
  for (const wire of cadWiresOf(document)) {
    const entity = porId.get(wire.entityId);
    if (!entity) continue;
    const entrada = porCircuito.get(wire.circuit) ?? {
      gauges: new Set<string>(),
      entities: [],
      lengthM: 0,
    };
    if (wire.gauge) entrada.gauges.add(wire.gauge);
    entrada.entities.push(entity);
    entrada.lengthM += cadEntityRunLength(entity) / unidadesPorMetro;
    porCircuito.set(wire.circuit, entrada);
  }

  const filas: CadCircuitCheck[] = [];
  for (const [circuit, entrada] of porCircuito) {
    const { breakerAmps, volts, phases, conflicts } = circuitData(entrada.entities);
    const gauge = entrada.gauges.size === 1 ? [...entrada.gauges][0] : null;
    const conductor = gauge ? cadNomConductor(gauge) : null;
    const findings: string[] = [...conflicts];
    let verdict: CadCircuitVerdict = "ok";
    const peor = (nuevo: CadCircuitVerdict) => {
      const orden: CadCircuitVerdict[] = ["ok", "aviso", "sin-datos", "no-cumple"];
      if (orden.indexOf(nuevo) > orden.indexOf(verdict)) verdict = nuevo;
    };
    if (conflicts.length > 0) peor("no-cumple");

    if (entrada.gauges.size > 1) {
      findings.push(`el circuito mezcla calibres (${[...entrada.gauges].sort().join(", ")}): se revisa cuando sea uno solo`);
      peor("sin-datos");
    } else if (!gauge) {
      findings.push("sus conductores no declaran calibre");
      peor("sin-datos");
    } else if (!conductor) {
      findings.push(`el calibre «${gauge}» no está en la tabla de la NOM para cobre`);
      peor("sin-datos");
    }
    if (breakerAmps === null) {
      findings.push("no se declaró la protección (A): use AECIRCUIT");
      peor("sin-datos");
    }
    if (volts === null) {
      findings.push("no se declaró la tensión (V): use AECIRCUIT");
      peor("sin-datos");
    }

    let dropVolts: number | null = null;
    let dropPercent: number | null = null;
    if (conductor && breakerAmps !== null) {
      const maxima = cadNomMaxBreaker(conductor);
      if (maxima < breakerAmps) {
        findings.push(
          `el calibre ${conductor.gauge} AWG admite hasta ${maxima} A y la protección es de ${breakerAmps} A${
            conductor.breakerCap !== null && conductor.breakerCap < conductor.ampacity
              ? ` (tope del conductor pequeño, Art. 240-4(D); su ampacidad de tabla es ${conductor.ampacity} A)`
              : ""
          }`,
        );
        peor("no-cumple");
      }
      if (volts !== null && phases !== null) {
        dropVolts = cadNomVoltageDrop({
          conductor,
          lengthM: entrada.lengthM,
          amps: breakerAmps,
          phases,
        });
        dropPercent = (dropVolts / volts) * 100;
        if (dropPercent > CAD_NOM_BRANCH_DROP_PERCENT) {
          const sugerido = cadNomSuggestGauge({
            breakerAmps,
            lengthM: entrada.lengthM,
            volts,
            phases,
          });
          findings.push(
            `la caída es del ${dropPercent.toFixed(1)} % en ${entrada.lengthM.toFixed(1)} m y la NOM recomienda ${CAD_NOM_BRANCH_DROP_PERCENT} %${
              sugerido ? `; con ${sugerido.gauge} AWG bajaría del tope` : "; ningún calibre de la tabla lo resuelve"
            }`,
          );
          peor("aviso");
        }
      } else if (phases === null) {
        findings.push("no se declararon las fases (1 o 3): sin ellas no se calcula la caída");
        peor("sin-datos");
      }
    }

    if (findings.length === 0)
      findings.push(
        `${conductor!.gauge} AWG con ${breakerAmps} A y ${entrada.lengthM.toFixed(1)} m: caída del ${dropPercent!.toFixed(1)} %`,
      );

    filas.push({
      circuit,
      wires: entrada.entities.length,
      lengthM: entrada.lengthM,
      gauge,
      breakerAmps,
      volts,
      phases,
      dropVolts,
      dropPercent,
      verdict,
      findings,
    });
  }
  return filas.sort((a, b) => a.circuit.localeCompare(b.circuit));
}

/** Los metadatos que declaran los datos eléctricos de un circuito. */
export function cadCircuitMetadata(input: {
  breakerAmps: number;
  volts: number;
  phases: 1 | 3;
}): Record<string, string> {
  return {
    [CAD_IE_BREAKER]: String(input.breakerAmps),
    [CAD_IE_VOLTS]: String(input.volts),
    [CAD_IE_PHASES]: String(input.phases),
  };
}

/**
 * Una línea de informe por circuito, para el renglón de la orden.
 *
 * El límite va SIEMPRE, aprobado o no: una revisión que no dice lo que no mira
 * se lee como un certificado, y esto no lo es.
 */
export const CAD_NOM_CHECK_LIMITS =
  "No es memorial de cálculo: sin corrección por temperatura ni agrupamiento, sin el 125 % de carga continua, sin tierra ni llenado de tubo, y la caída es resistiva (sin reactancia).";
