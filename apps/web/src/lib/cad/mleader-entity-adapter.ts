import type { CadPoint2, CadPoint3 } from './cad-document';
import { buildCadMleaderGeometry, cadMleaderLines, type CadMleaderEntity } from './associative-mleader';
import type { CadEntityAdapter, CadEntityTransform, CadNativeEntity, CadPropertyValue } from './entity-runtime';
// Se importan de `transform2d` y no de `entity-runtime` a propósito:
// `entity-runtime` importa este módulo, así que ir por él cerraría un ciclo.
import { cadTransformAngleBase, cadTransformIsReflecting, cadTransformPoint3, cadTransformScaleFactor } from './transform2d';

type NativeMleader = Extract<CadNativeEntity, { type: 'mleader' }>;
const finite = (value: CadPropertyValue | undefined, fallback: number): number => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const positive = (value: CadPropertyValue | undefined, fallback: number): number => Math.max(1e-9, finite(value, fallback));
/**
 * Delega en la implementación compartida. La copia que había aquí leía SÓLO el
 * vocabulario histórico, así que bajo `{ mirror: … }` devolvía el punto tal
 * cual: las directrices no se movían. Y era además incoherente CONSIGO MISMA,
 * porque `textRotation` sí consultaba `cadTransformAngleBase` — el rótulo
 * giraba mientras la flecha que señala se quedaba quieta.
 */
const transformPoint = (point: CadPoint3, transform: CadEntityTransform): CadPoint3 =>
  cadTransformPoint3(point, transform);
const normalizeAngleDeg = (value: number) => ((value % 360) + 360) % 360;
const distanceToSegment = (point: CadPoint2, a: CadPoint2, b: CadPoint2) => {
  const dx = b.x - a.x; const dy = b.y - a.y; const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 1e-18) return Math.hypot(point.x - a.x, point.y - a.y);
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
  return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
};
const entityBounds = (entity: NativeMleader) => {
  const geometry = buildCadMleaderGeometry(entity);
  const points = geometry?.paths.flatMap((path) => path.points) ?? cadMleaderLines(entity).flat();
  const width = entity.textWidth ?? (entity.textHeight ?? 120) * Math.max(4, Math.min(30, entity.text.length * 0.55));
  const height = (entity.textHeight ?? 120) * Math.max(1, entity.text.split(/\r?\n/).length) * (entity.lineSpacing ?? 1.2);
  points.push(entity.textPosition, { x: entity.textPosition.x + width, y: entity.textPosition.y + height });
  return { minX: Math.min(...points.map((point) => point.x)), minY: Math.min(...points.map((point) => point.y)), maxX: Math.max(...points.map((point) => point.x)), maxY: Math.max(...points.map((point) => point.y)) };
};
const validArrow = (value: CadPropertyValue | undefined): CadMleaderEntity['arrowhead'] | undefined => typeof value === 'string' && ['closed-filled', 'open', 'architectural-tick', 'dot', 'none'].includes(value) ? value as CadMleaderEntity['arrowhead'] : undefined;

export const mleaderAdapter: CadEntityAdapter<NativeMleader> = {
  type: 'mleader',
  renderer: { paths: (entity) => (buildCadMleaderGeometry(entity)?.paths ?? []).map((path) => ({ points: path.points, closed: path.closed })) },
  bounds: { bounds: entityBounds },
  hitTester: {
    hitTest: (entity, point, tolerance) => {
      const bounds = entityBounds(entity);
      if (point.x >= bounds.minX - tolerance && point.x <= bounds.maxX + tolerance && point.y >= bounds.minY - tolerance && point.y <= bounds.maxY + tolerance) {
        if (point.x >= entity.textPosition.x - tolerance && point.y >= entity.textPosition.y - tolerance) return true;
        return (buildCadMleaderGeometry(entity)?.paths ?? []).some((path) => path.points.some((current, index) => index > 0 && distanceToSegment(point, path.points[index - 1], current) <= tolerance));
      }
      return false;
    },
    intersectsWindow: (entity, window, crossing) => {
      const value = entityBounds(entity);
      return crossing ? value.minX <= window.maxX && value.maxX >= window.minX && value.minY <= window.maxY && value.maxY >= window.minY : value.minX >= window.minX && value.maxX <= window.maxX && value.minY >= window.minY && value.maxY <= window.maxY;
    },
  },
  grips: {
    grips: (entity) => [
      ...cadMleaderLines(entity).flatMap((line, lineIndex) => line.map((point, vertexIndex) => ({ id: `line:${lineIndex}:vertex:${vertexIndex}`, kind: vertexIndex === 0 ? 'endpoint' as const : 'control' as const, point, label: vertexIndex === 0 ? `Tip ${lineIndex + 1}` : `Leader ${lineIndex + 1} · ${vertexIndex + 1}` }))),
      { id: 'text', kind: 'endpoint' as const, point: entity.textPosition, label: 'Contenido' },
    ],
    moveGrip: (entity, gripId, point) => {
      if (gripId === 'text') return { ...entity, textPosition: { ...point, z: entity.textPosition.z } };
      const match = /^line:(\d+):vertex:(\d+)$/.exec(gripId);
      if (!match) return entity;
      const lineIndex = Number(match[1]); const vertexIndex = Number(match[2]);
      const lines = cadMleaderLines(entity);
      if (!lines[lineIndex]?.[vertexIndex]) return entity;
      const leaderLines = lines.map((line, currentLine) => line.map((vertex, currentVertex) => ({ ...(currentLine === lineIndex && currentVertex === vertexIndex ? point : vertex), z: 0 })));
      return { ...entity, vertices: leaderLines[0], leaderLines, ...(vertexIndex === 0 ? { associative: false, associationStatus: 'detached' as const } : {}) };
    },
  },
  snaps: { snaps: (entity) => [
    ...cadMleaderLines(entity).flatMap((line, lineIndex) => line.map((point, vertexIndex) => ({ kind: vertexIndex === 0 ? 'endpoint' as const : 'control' as const, point, label: vertexIndex === 0 ? `Tip ${lineIndex + 1}` : `Codo ${lineIndex + 1}` }))),
    { kind: 'endpoint', point: entity.textPosition, label: 'Inserción de contenido' },
  ] },
  properties: {
    read: (entity) => ({
      text: entity.text, contentType: entity.contentType ?? 'mtext', style: entity.style ?? 'Standard',
      leaderLineCount: cadMleaderLines(entity).length, landing: entity.landing !== false, doglegLength: entity.doglegLength ?? 600,
      arrowhead: entity.arrowhead ?? 'closed-filled', arrowSize: entity.arrowSize ?? 180,
      textWidth: entity.textWidth ?? 1800, textHeight: entity.textHeight ?? 120, textRotation: entity.textRotation ?? 0,
      textAlignment: entity.textAlignment ?? 'left', fontFamily: entity.fontFamily ?? 'Arial', lineSpacing: entity.lineSpacing ?? 1.2,
      bold: entity.bold ?? false, italic: entity.italic ?? false, underline: entity.underline ?? false,
      backgroundMask: entity.backgroundMask ?? false, associative: entity.associative ?? false,
      associationStatus: entity.associationStatus ?? (entity.associative ? 'associated' : 'detached'), referenceCount: entity.references?.length ?? 0,
      layer: entity.layer,
    }),
    write: (entity, patch) => ({
      ...entity,
      text: typeof patch.text === 'string' ? patch.text.slice(0, 16_384) : entity.text,
      contentType: patch.contentType === 'text' ? 'text' : patch.contentType === 'mtext' ? 'mtext' : entity.contentType,
      style: typeof patch.style === 'string' ? patch.style.slice(0, 128) : entity.style,
      landing: typeof patch.landing === 'boolean' ? patch.landing : entity.landing,
      doglegLength: positive(patch.doglegLength, entity.doglegLength ?? 600),
      arrowhead: validArrow(patch.arrowhead) ?? entity.arrowhead,
      arrowSize: positive(patch.arrowSize, entity.arrowSize ?? 180),
      textWidth: positive(patch.textWidth, entity.textWidth ?? 1800), textHeight: positive(patch.textHeight, entity.textHeight ?? 120),
      textRotation: finite(patch.textRotation, entity.textRotation ?? 0),
      textAlignment: typeof patch.textAlignment === 'string' && ['left', 'center', 'right', 'justify'].includes(patch.textAlignment) ? patch.textAlignment as NativeMleader['textAlignment'] : entity.textAlignment,
      fontFamily: typeof patch.fontFamily === 'string' ? patch.fontFamily.slice(0, 128) : entity.fontFamily,
      lineSpacing: positive(patch.lineSpacing, entity.lineSpacing ?? 1.2),
      bold: typeof patch.bold === 'boolean' ? patch.bold : entity.bold, italic: typeof patch.italic === 'boolean' ? patch.italic : entity.italic,
      underline: typeof patch.underline === 'boolean' ? patch.underline : entity.underline,
      backgroundMask: typeof patch.backgroundMask === 'boolean' ? patch.backgroundMask : entity.backgroundMask,
      layer: typeof patch.layer === 'string' ? patch.layer : entity.layer,
    }),
  },
  commands: { transform: (entity, transform) => {
    // `cadMleaderLines` devuelve puntos 2D; la elevación de una directriz vive
    // en 0 por contrato, así que se repone al entrar y al salir.
    const leaderLines = cadMleaderLines(entity).map((line) => line.map((point) => ({ ...transformPoint({ ...point, z: 0 }, transform), z: 0 })));
    return {
      ...entity, vertices: leaderLines[0], leaderLines, textPosition: { ...transformPoint(entity.textPosition, transform), z: entity.textPosition.z },
      // Los tamaños AUSENTES se conservan ausentes. Antes se materializaban con
      // su valor por defecto en cualquier transformada, incluida una traslación
      // pura: arrastrar una directriz le fijaba para siempre el tamaño de
      // flecha, la longitud del codo y la caja de texto, y a partir de ahí
      // dejaba de seguir a su estilo. Mismo defecto que tenía MTEXT, encontrado
      // por la misma spec de ida y vuelta.
      ...(entity.arrowSize === undefined ? {} : { arrowSize: entity.arrowSize * cadTransformScaleFactor(transform) }),
      ...(entity.doglegLength === undefined ? {} : { doglegLength: entity.doglegLength * cadTransformScaleFactor(transform) }),
      ...(entity.textWidth === undefined ? {} : { textWidth: entity.textWidth * cadTransformScaleFactor(transform) }),
      ...(entity.textHeight === undefined ? {} : { textHeight: entity.textHeight * cadTransformScaleFactor(transform) }),
      // Igual que MTEXT y que INSERT: bajo reflexión el rótulo se re-orienta
      // restando, no sumando. Sin esto, espejar un ala de la planta dejaría
      // cada directriz con su texto inclinado hacia el lado contrario al de la
      // geometría que señala.
      textRotation: normalizeAngleDeg(
        cadTransformIsReflecting(transform)
          ? cadTransformAngleBase(transform) - (entity.textRotation ?? 0)
          : (entity.textRotation ?? 0) + cadTransformAngleBase(transform),
      ),
      associative: false, associationStatus: 'detached',
      context: entity.context ? structuredClone(entity.context) : undefined,
    };
  } },
};
