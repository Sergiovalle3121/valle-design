/**
 * EL CONDUCTOR NUMERADO: lo que separa un plano eléctrico de un dibujo de rayas.
 *
 * ## Qué se midió antes de escribir esto
 *
 * `docs/competitive/distancia-autocad-completo-20260901.md`, área de los siete
 * toolsets: *«Electrical ~ 1 %. Nada. Ni un comando, ni una entidad de cable o
 * componente, ni numeración de conductores...»*. Lo volví a medir sobre el
 * árbol el 3 de septiembre: catorce nombres de la familia eléctrica sondeados
 * contra `engine/` —AEWIRE, AECOMPONENT, AEPANEL, AELADDER, AEPLC,
 * WIRENUMBER...— y CERO aciertos; `conductor`, `canalización`, `wireNumber` y
 * `voltage` no aparecen en `lib/cad`. Lo único eléctrico que existe son cuatro
 * SÍMBOLOS —luminaria, contacto, apagador y tablero— en `mep-symbols.ts`,
 * colocables con `MEPSYMBOL`. Símbolos sin conductores no son una instalación:
 * son iconos.
 *
 * ## Por qué un conductor no puede ser una entidad nueva, y por qué no hace falta
 *
 * La campaña no añade tipos de entidad ni campos persistidos. Y no hace falta:
 * un conductor ES una polilínea —eso es lo que se dibuja, lo que se traza y lo
 * que viaja al DXF—, y lo que lo convierte en conductor es lo que SABE de sí
 * mismo: a qué circuito pertenece, qué número lleva y de qué calibre es. Eso
 * cabe en `context.metadata`, que existe justamente para las asociatividades
 * sin campo propio, y viaja en el documento guardado como cualquier otra.
 *
 * La ventaja no es sólo de esquema: a una polilínea con metadatos la mueve
 * MOVE, la recorta TRIM, la copia COPY y la traza PLOT sin enseñarle nada a
 * nadie. Un tipo de entidad nuevo habría empezado el primer día sin ninguna de
 * las cuatro.
 *
 * ## De dónde sale el número, y por qué del DIBUJO y no de un contador
 *
 * El siguiente número de un circuito se calcula leyendo los conductores que YA
 * están en el documento. Un contador de sesión daría números distintos según
 * quién abriera el archivo y en qué orden, y dos personas del mismo despacho
 * acabarían con dos conductores «14» en el mismo circuito — que en obra es un
 * empalme equivocado, no una molestia de dibujo.
 *
 * ## Lo que este módulo caza, y que es la mitad de su valor
 *
 * Un número REPETIDO dentro de un mismo circuito. Es el error que no se ve en
 * la pantalla —dos rayas idénticas— y que sí se ve en la obra. Se detecta
 * leyendo el documento, así que también caza el que entró por copiar y pegar,
 * por un DXF ajeno o por una fusión de dos dibujos.
 */
import type { CadDocument, CadEntity } from "../cad-document";

/** Número del conductor dentro de su circuito. */
export const CAD_IE_NUMBER = "ie:numero";
/** Circuito al que pertenece: el identificador que lleva el tablero. */
export const CAD_IE_CIRCUIT = "ie:circuito";
/** Calibre AWG del conductor, como se escribe en el plano: «12», «10», «2/0». */
export const CAD_IE_GAUGE = "ie:calibre";

/** Capa de los conductores. Código `IE` del estándar mexicano ya en el árbol. */
export const CAD_IE_WIRE_LAYER = "IE-CIR";

export interface CadWire {
  entityId: string;
  circuit: string;
  /** Siempre un entero positivo: un número de conductor es un ordinal. */
  number: number;
  gauge: string | null;
}

/** Un número repetido dentro del mismo circuito, con quiénes lo llevan. */
export interface CadWireClash {
  circuit: string;
  number: number;
  entityIds: string[];
}

const readString = (entity: CadEntity, key: string): string | null => {
  const value = entity.context?.metadata?.[key];
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
};

/**
 * Los conductores del dibujo, leídos de sus metadatos.
 *
 * Una entidad marcada con un número que NO es un entero positivo no se
 * devuelve como conductor a medias: se ignora aquí y `cadWireDefects` la
 * cuenta. Devolverla con `number: NaN` la metería en la numeración y en el
 * informe, que es peor que no verla.
 */
export function cadWiresOf(document: Pick<CadDocument, "entities">): CadWire[] {
  const wires: CadWire[] = [];
  for (const entity of document.entities) {
    const circuit = readString(entity, CAD_IE_CIRCUIT);
    const raw = readString(entity, CAD_IE_NUMBER);
    if (!circuit || !raw) continue;
    const number = Number(raw);
    if (!Number.isInteger(number) || number <= 0) continue;
    wires.push({
      entityId: entity.id,
      circuit,
      number,
      gauge: readString(entity, CAD_IE_GAUGE),
    });
  }
  return wires;
}

/**
 * El siguiente número libre del circuito: el mayor que hay, más uno.
 *
 * No se rellenan los huecos. Un conductor borrado deja su número libre, y
 * reutilizarlo es lo peor que se puede hacer en un plano que ya se entregó: el
 * «14» del plano viejo y el «14» del nuevo serían conductores distintos, y el
 * electricista tiene los dos en la mano.
 */
export function cadNextWireNumber(
  document: Pick<CadDocument, "entities">,
  circuit: string,
): number {
  const clave = circuit.trim().toUpperCase();
  let mayor = 0;
  for (const wire of cadWiresOf(document))
    if (wire.circuit.toUpperCase() === clave && wire.number > mayor) mayor = wire.number;
  return mayor + 1;
}

/**
 * Números repetidos dentro de un mismo circuito.
 *
 * Es el error que no se ve en la pantalla —dos rayas iguales— y que sí se ve
 * en la obra. Se ordena por circuito y número para que dos ejecuciones sobre el
 * mismo documento den la misma lista, que es lo que necesita un informe.
 */
export function cadWireClashes(document: Pick<CadDocument, "entities">): CadWireClash[] {
  const porClave = new Map<
    string,
    { circuit: string; number: number; entityIds: string[] }
  >();
  for (const wire of cadWiresOf(document)) {
    const clave = `${wire.circuit.toUpperCase()} ${wire.number}`;
    const entrada = porClave.get(clave);
    if (entrada) entrada.entityIds.push(wire.entityId);
    else
      porClave.set(clave, {
        circuit: wire.circuit,
        number: wire.number,
        entityIds: [wire.entityId],
      });
  }
  return [...porClave.values()]
    .filter((entrada) => entrada.entityIds.length > 1)
    .map((entrada) => ({ ...entrada, entityIds: [...entrada.entityIds].sort() }))
    .sort((a, b) => a.circuit.localeCompare(b.circuit) || a.number - b.number);
}

/** Una marca eléctrica que no se puede leer, con qué entidad y por qué. */
export interface CadWireDefect {
  entityId: string;
  reason: string;
}

/**
 * Lo que lleva marca eléctrica y NO se pudo leer como conductor.
 *
 * Existe por la misma razón que el recuento de lo excluido en un aplanado: una
 * marca a medias que desaparece en silencio deja un plano que parece completo.
 * Aquí se cuenta con su motivo, y quien informe lo dice.
 */
export function cadWireDefects(
  document: Pick<CadDocument, "entities">,
): CadWireDefect[] {
  const fuera: CadWireDefect[] = [];
  for (const entity of document.entities) {
    const circuit = readString(entity, CAD_IE_CIRCUIT);
    const raw = readString(entity, CAD_IE_NUMBER);
    if (!circuit && !raw) continue;
    if (!circuit) {
      fuera.push({
        entityId: entity.id,
        reason: `lleva número «${raw}» y no dice de qué circuito es`,
      });
      continue;
    }
    if (!raw) {
      fuera.push({
        entityId: entity.id,
        reason: `pertenece al circuito «${circuit}» y no lleva número`,
      });
      continue;
    }
    const number = Number(raw);
    if (!Number.isInteger(number) || number <= 0)
      fuera.push({
        entityId: entity.id,
        reason: `su número «${raw}» no es un entero positivo`,
      });
  }
  return fuera;
}

/** Los metadatos que marcan una polilínea como conductor. */
export function cadWireMetadata(input: {
  circuit: string;
  number: number;
  gauge?: string | null;
}): Record<string, string> {
  return {
    [CAD_IE_CIRCUIT]: input.circuit.trim(),
    [CAD_IE_NUMBER]: String(input.number),
    ...(input.gauge && input.gauge.trim() !== ""
      ? { [CAD_IE_GAUGE]: input.gauge.trim() }
      : {}),
  };
}
