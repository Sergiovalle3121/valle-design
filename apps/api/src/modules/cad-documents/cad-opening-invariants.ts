import { BadRequestException } from '@nestjs/common';
import { objectValue, stringValue } from './cad-entity-invariants';

/**
 * Invariantes del HUECO alojado (esquema 7), fail-closed.
 *
 * Vive aparte de `cad-entity-invariants.ts` por la misma razón que las de los
 * sólidos: son una responsabilidad distinta. Aquéllas comprueban que la
 * GEOMETRÍA de una entidad es dibujable mirándola a ella sola; un `opening` no
 * tiene geometría propia que mirar. Todo lo que hace que un hueco sea válido
 * —dónde cae, si cabe, si pisa a otro— es una afirmación sobre OTRA entidad: su
 * muro anfitrión.
 *
 * ## Por qué esto no es celo
 *
 * El editor deriva la puerta del eje de su muro. Un hueco que no cabe en su
 * anfitrión no se dibuja «un poco mal»: parte la cara del muro en dos trozos
 * que no se tocan, y ese contorno roto viaja al hit-test, al índice espacial y
 * a la exportación. Dos huecos superpuestos hacen lo mismo. Y un `hostId` que
 * no resuelve deja una entidad que ningún cliente puede situar: no se ve, no se
 * puede seleccionar, ocupa sitio en cada guardado y reaparece en la tabla de
 * cantidades como una puerta que no está en ninguna parte.
 *
 * Ninguno de los tres se puede producir desde el editor —el ejecutor de
 * comandos retira los huecos cuando muere su anfitrión, en el mismo lote—, así
 * que todo lo que llegue aquí roto llegó por la API. Que es exactamente para lo
 * que existe una frontera.
 */

/** Tolerancia de encaje. Absorbe deriva de coma flotante y nada más. */
const FIT_EPSILON = 1e-6;

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Forma de UN hueco, sin mirar a su anfitrión. Lo que se puede afirmar de la
 * entidad aislada: que declara qué es, a quién pertenece y con qué medidas.
 */
export function assertOpeningInvariants(
  entity: Record<string, unknown>,
  id: string,
): void {
  const kind = entity.kind;
  if (kind !== 'door' && kind !== 'window') {
    throw new BadRequestException(
      `CadDocument: el hueco ${id} debe declararse "door" o "window".`,
    );
  }
  const hostId = stringValue(entity.hostId).trim();
  if (!hostId) {
    throw new BadRequestException(
      `CadDocument: el hueco ${id} no declara el muro que lo aloja.`,
    );
  }
  if (numberValue(entity.position) === null) {
    throw new BadRequestException(
      `CadDocument: el hueco ${id} necesita una posición finita sobre el eje del muro.`,
    );
  }
  for (const field of ['width', 'height'] as const) {
    const value = numberValue(entity[field]);
    if (value === null || !(value > 0)) {
      throw new BadRequestException(
        `CadDocument: el hueco ${id} requiere ${field === 'width' ? 'una anchura' : 'una altura'} positiva.`,
      );
    }
  }
  const sill = numberValue(entity.sill);
  if (sill === null || sill < 0) {
    throw new BadRequestException(
      `CadDocument: el hueco ${id} requiere un antepecho de cero o más.`,
    );
  }
  if (entity.swing !== 'left' && entity.swing !== 'right') {
    throw new BadRequestException(
      `CadDocument: el hueco ${id} debe declarar hacia qué lado barre ("left" o "right").`,
    );
  }
  if (entity.hinge !== 'start' && entity.hinge !== 'end') {
    throw new BadRequestException(
      `CadDocument: el hueco ${id} debe declarar de qué jamba cuelga ("start" o "end").`,
    );
  }
  if (
    entity.symbolBlock !== undefined &&
    !stringValue(entity.symbolBlock).trim()
  ) {
    throw new BadRequestException(
      `CadDocument: el hueco ${id} declara un bloque de símbolo vacío. Quita el campo o nombra el bloque.`,
    );
  }
}

interface HostAxis {
  length: number;
}

/**
 * ALOJAMIENTO: que cada hueco tenga un muro real, quepa en él y no pise a otro.
 *
 * Se resuelve en una sola pasada sobre las entidades de primer nivel porque las
 * tres comprobaciones necesitan el mismo índice: qué muros hay y cuánto miden.
 * Los huecos ANIDADOS en una definición de bloque se rechazan sin más: su
 * `hostId` apuntaría a un muro fuera del bloque, así que el bloque insertado dos
 * veces tendría dos puertas colgando del mismo muro y en el mismo punto — un
 * alojamiento que sólo puede significar una cosa no cabe dentro de algo que se
 * repite.
 */
export function assertOpeningHosts(entities: unknown[]): void {
  const walls = new Map<string, HostAxis>();
  const openings: { id: string; entity: Record<string, unknown> }[] = [];

  for (const raw of entities) {
    const entity = objectValue(raw);
    if (!entity) continue;
    const id = stringValue(entity.id) || '(sin id)';
    if (entity.type === 'wall') {
      const start = objectValue(entity.start);
      const end = objectValue(entity.end);
      const dx = (numberValue(end?.x) ?? 0) - (numberValue(start?.x) ?? 0);
      const dy = (numberValue(end?.y) ?? 0) - (numberValue(start?.y) ?? 0);
      walls.set(id, { length: Math.hypot(dx, dy) });
    } else if (entity.type === 'opening') {
      openings.push({ id, entity });
    }
  }
  if (openings.length === 0) return;

  /** Vanos ya aceptados por muro, para detectar solapes entre huecos. */
  const taken = new Map<string, { from: number; to: number; id: string }[]>();

  for (const { id, entity } of openings) {
    const hostId = stringValue(entity.hostId).trim();
    const host = walls.get(hostId);
    if (!host) {
      throw new BadRequestException(
        `CadDocument: el hueco ${id} se aloja en el muro inexistente ${hostId || '(vacío)'}.`,
      );
    }
    const position = numberValue(entity.position) ?? 0;
    const width = numberValue(entity.width) ?? 0;
    const from = position - width / 2;
    const to = position + width / 2;
    if (from < -FIT_EPSILON || to > host.length + FIT_EPSILON) {
      throw new BadRequestException(
        `CadDocument: el hueco ${id} ocupa de ${from} a ${to} sobre un muro de ${host.length}: no cabe en su anfitrión.`,
      );
    }
    const siblings = taken.get(hostId) ?? [];
    const clash = siblings.find(
      (span) => to > span.from + FIT_EPSILON && from < span.to - FIT_EPSILON,
    );
    if (clash) {
      throw new BadRequestException(
        `CadDocument: los huecos ${clash.id} y ${id} se solapan en el muro ${hostId}.`,
      );
    }
    siblings.push({ from, to, id });
    taken.set(hostId, siblings);
  }
}

/** Un hueco dentro de una definición de bloque no tiene alojamiento posible. */
export function assertNoNestedOpenings(
  entities: unknown[],
  where: string,
): void {
  for (const raw of entities) {
    const entity = objectValue(raw);
    if (entity?.type !== 'opening') continue;
    throw new BadRequestException(
      `CadDocument: ${where} contiene el hueco ${stringValue(entity.id) || '(sin id)'}, y un hueco sólo puede alojarse en un muro del dibujo, no dentro de un bloque.`,
    );
  }
}
