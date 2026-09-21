import type { CadEntity, CadPoint2 } from './cad-document';
import { alignedDimension, DEFAULT_DIMENSION_STYLE, linearDimension, type DimensionStyle } from './dimension';
import { cadDimensionToleranceOf, cadDimensionToleranceText } from './dimension-tolerance';
import { cadLengthLabel } from './units-label';
import { CAD_DRAWING_UNIT_TO_MM as UNIT_TO_MM } from './units-imperial';

export type CadDimensionEntity = Extract<CadEntity, { type: 'dimension' }>;
export type CadDimensionPathRole = 'dimension' | 'extension' | 'arrow';

export interface CadDimensionPath {
  points: CadPoint2[];
  closed: boolean;
  role: CadDimensionPathRole;
}

export interface CadDimensionGeometry {
  measurement: number;
  label: string;
  textAnchor: CadPoint2;
  textAngle: number;
  paths: CadDimensionPath[];
}

const add = (a: CadPoint2, b: CadPoint2): CadPoint2 => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a: CadPoint2, b: CadPoint2): CadPoint2 => ({ x: a.x - b.x, y: a.y - b.y });
const scale = (a: CadPoint2, factor: number): CadPoint2 => ({ x: a.x * factor, y: a.y * factor });
const length = (a: CadPoint2): number => Math.hypot(a.x, a.y);
const normalize = (a: CadPoint2): CadPoint2 | null => {
  const value = length(a);
  return value > 1e-9 ? scale(a, 1 / value) : null;
};
const midpoint = (a: CadPoint2, b: CadPoint2): CadPoint2 => scale(add(a, b), 0.5);

function dimensionStyle(entity: CadDimensionEntity): DimensionStyle {
  return {
    extensionGap: Math.max(0, entity.extensionGap ?? DEFAULT_DIMENSION_STYLE.extensionGap),
    extensionOvershoot: Math.max(0, entity.extensionOvershoot ?? DEFAULT_DIMENSION_STYLE.extensionOvershoot),
    arrowSize: Math.max(1e-6, entity.arrowSize ?? DEFAULT_DIMENSION_STYLE.arrowSize),
    textGap: Math.max(0, entity.textGap ?? DEFAULT_DIMENSION_STYLE.textGap),
  };
}

function normalizeDegrees(value: number): number {
  let normalized = value % 360;
  if (normalized < 0) normalized += 360;
  return normalized;
}

function readableAngle(direction: CadPoint2): number {
  let degrees = (Math.atan2(direction.y, direction.x) * 180) / Math.PI;
  while (degrees > 90) degrees -= 180;
  while (degrees <= -90) degrees += 180;
  return degrees;
}

function arrowPaths(entity: CadDimensionEntity, tip: CadPoint2, direction: CadPoint2): CadDimensionPath[] {
  const unit = normalize(direction);
  if (!unit) return [];
  const size = dimensionStyle(entity).arrowSize;
  const perpendicular = { x: -unit.y, y: unit.x };
  const base = add(tip, scale(unit, size));
  const left = add(base, scale(perpendicular, size * 0.35));
  const right = add(base, scale(perpendicular, -size * 0.35));
  if (entity.arrowhead === 'open') return [{ points: [left, tip, right], closed: false, role: 'arrow' }];
  if (entity.arrowhead === 'architectural-tick')
    return [{ points: [add(tip, scale(add(unit, perpendicular), -size * 0.45)), add(tip, scale(add(unit, perpendicular), size * 0.45))], closed: false, role: 'arrow' }];
  if (entity.arrowhead === 'dot')
    return [{
      points: Array.from({ length: 12 }, (_, index) => {
        const angle = (index / 12) * Math.PI * 2;
        return add(tip, { x: Math.cos(angle) * size * 0.3, y: Math.sin(angle) * size * 0.3 });
      }),
      closed: true,
      role: 'arrow',
    }];
  return [{ points: [tip, left, right], closed: true, role: 'arrow' }];
}

export function formatCadDimensionMeasurement(entity: CadDimensionEntity, measurement: number): string {
  if (entity.text?.trim()) return entity.text;
  const precision = Math.max(0, Math.min(8, Math.floor(entity.precision ?? 2)));
  const kind = entity.dimensionKind ?? 'aligned';
  // Ola I: la tolerancia de fabricación vive en `context.metadata` (mm o
  // grados) y rotula entre la medida y la unidad, en visor, lámina y DXF.
  const tolerance = cadDimensionToleranceOf(entity);
  if (kind === 'angular') {
    const body = tolerance ? cadDimensionToleranceText(measurement, precision, tolerance) : measurement.toFixed(precision);
    return `${entity.prefix ?? ''}${body}°${entity.suffix ?? ''}`;
  }
  const sourceUnit = entity.sourceUnit ?? 'mm';
  const unit = entity.units ?? sourceUnit;
  const converted = (measurement * UNIT_TO_MM[sourceUnit]) / UNIT_TO_MM[unit];
  // Una cota en PIES es una cota arquitectónica: en un plano nadie escribe
  // «10.5000 ft», se escribe «10'-6"». Es la única unidad del enum que
  // cambia de comportamiento, y cambia porque su nombre ya lo pedía; `in`
  // sigue en decimal, que es lo que un plano mecánico quiere leer.
  //
  // La tolerancia se queda en el camino decimal a propósito: «10'-6" ± 1/8"»
  // no es una forma que ISO 129-1 ni la práctica americana usen sobre una
  // cota arquitectónica, y hornear una aquí sería inventarse una norma.
  if (unit === 'ft' && !tolerance) {
    const label = cadLengthLabel(measurement, {
      drawingUnit: sourceUnit,
      // `precision` de la cota es el exponente del denominador, igual que
      // LUPREC: 4 → 1/16, que es la precisión con la que se dibuja en pies.
      lunits: 4,
      luprec: precision,
    });
    return `${entity.prefix ?? ''}${label}${entity.suffix ?? ''}`;
  }
  const body = tolerance ? cadDimensionToleranceText(converted, precision, tolerance, 1 / UNIT_TO_MM[unit]) : converted.toFixed(precision);
  let label = `${entity.prefix ?? ''}${body}${entity.suffix ?? ''}`;
  if (entity.alternateUnits) {
    const alternate = (measurement * UNIT_TO_MM[sourceUnit]) / UNIT_TO_MM[entity.alternateUnits];
    // DIMALTD (Ola 7): la unidad alterna rotula con SUS PROPIOS decimales, no
    // con los de la principal — mm en 2 decimales y pulgadas en 3 son
    // precisiones distintas, y antes de este campo la alterna se quedaba
    // pegada a `precision` sin forma de pedir otra cosa.
    const alternatePrecision = Math.max(0, Math.min(8, Math.floor(entity.alternatePrecision ?? precision)));
    label += ` [${alternate.toFixed(alternatePrecision)} ${entity.alternateUnits}]`;
  }
  return label;
}

/**
 * Línea de extensión a un ángulo ABSOLUTO (grados CCW desde +X) en vez de la
 * perpendicular por defecto — DIMEDIT «Oblicuo». Se dispara desde el punto
 * medido y se corta contra la RECTA que forma la línea de cota, no contra el
 * segmento: un ángulo que no sea el de fábrica puede cruzarla fuera de los
 * dos extremos.
 *
 * Devuelve `null` si ese ángulo no cruza la recta del lado del dibujo —
 * paralelo a ella, o cruzando hacia atrás—, y quien llama conserva la
 * extensión perpendicular en vez de dibujar un disparate.
 */
function obliqueExtensionSegment(
  witness: CadPoint2,
  dimLineOrigin: CadPoint2,
  dimDir: CadPoint2,
  angleDeg: number,
  style: DimensionStyle,
): { a: CadPoint2; b: CadPoint2 } | null {
  const angle = (angleDeg * Math.PI) / 180;
  const dir = { x: Math.cos(angle), y: Math.sin(angle) };
  const denom = dir.x * dimDir.y - dir.y * dimDir.x;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((dimLineOrigin.x - witness.x) * dimDir.y - (dimLineOrigin.y - witness.y) * dimDir.x) / denom;
  if (!(t > 0)) return null;
  const hit = add(witness, scale(dir, t));
  return { a: add(witness, scale(dir, style.extensionGap)), b: add(hit, scale(dir, style.extensionOvershoot)) };
}

/**
 * La línea de cota, partida en los huecos de DIMBREAK.
 *
 * Los huecos son fracciones [0,1] de `a` a `b`: se recortan a ese rango, se
 * fusionan si se solapan y lo que queda entre ellos sale como un tramo
 * `'dimension'` por hueco. Sin huecos —el caso de siempre— es exactamente el
 * único tramo de antes.
 */
function dimensionLinePathsWithBreaks(
  a: CadPoint2,
  b: CadPoint2,
  breaks: CadDimensionEntity['breaks'],
): CadDimensionPath[] {
  const whole: CadDimensionPath[] = [{ points: [a, b], closed: false, role: 'dimension' }];
  if (!breaks || breaks.length === 0) return whole;
  const clipped = breaks
    .map((gap): [number, number] => [Math.max(0, Math.min(gap.start, gap.end)), Math.min(1, Math.max(gap.start, gap.end))])
    .filter(([start, end]) => end > start)
    .sort((x, y) => x[0] - y[0]);
  if (clipped.length === 0) return whole;
  const merged: [number, number][] = [];
  for (const [start, end] of clipped) {
    const last = merged.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  const at = (t: number): CadPoint2 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const paths: CadDimensionPath[] = [];
  let cursor = 0;
  for (const [start, end] of merged) {
    if (start > cursor) paths.push({ points: [at(cursor), at(start)], closed: false, role: 'dimension' });
    cursor = end;
  }
  if (cursor < 1) paths.push({ points: [at(cursor), at(1)], closed: false, role: 'dimension' });
  // Un hueco que tapara la línea entera es un caso que DIMBREAK no produce
  // (su hueco por defecto es mucho más corto que la cota); si pasara, se
  // prefiere la línea entera a no dibujar nada, que haría creer que la cota
  // desapareció.
  return paths.length > 0 ? paths : whole;
}

function fromLinearGeometry(entity: CadDimensionEntity, geometry: NonNullable<ReturnType<typeof alignedDimension>>): CadDimensionGeometry {
  const paths: CadDimensionPath[] = [
    ...dimensionLinePathsWithBreaks(geometry.dimLine.a, geometry.dimLine.b, entity.breaks),
  ];
  if (entity.extensionLines !== false) {
    const oblique = entity.extensionObliqueAngle;
    let extA = geometry.extensionA;
    let extB = geometry.extensionB;
    if (oblique !== undefined) {
      const style = dimensionStyle(entity);
      const dimDir = sub(geometry.dimLine.b, geometry.dimLine.a);
      extA = obliqueExtensionSegment(entity.a, geometry.dimLine.a, dimDir, oblique, style) ?? extA;
      extB = obliqueExtensionSegment(entity.b, geometry.dimLine.a, dimDir, oblique, style) ?? extB;
    }
    paths.push(
      { points: [extA.a, extA.b], closed: false, role: 'extension' },
      { points: [extB.a, extB.b], closed: false, role: 'extension' },
    );
  }
  paths.push(
    ...arrowPaths(entity, geometry.dimLine.a, sub(geometry.dimLine.b, geometry.dimLine.a)),
    ...arrowPaths(entity, geometry.dimLine.b, sub(geometry.dimLine.a, geometry.dimLine.b)),
  );
  return {
    measurement: geometry.measurement,
    label: formatCadDimensionMeasurement(entity, geometry.measurement),
    textAnchor: entity.textPosition ?? justifiedTextAnchor(entity, geometry),
    textAngle: geometry.textAngle,
    paths,
  };
}

/**
 * DIMJUST (`entity.textJustification`) — dónde a lo largo de la línea de cota
 * cae el rótulo, cuando nadie lo arrastró a mano (`textPosition` manda
 * siempre que exista, igual que antes de esta ola). `'first'`/`'second'` lo
 * sacan fuera de las flechas, junto a la línea de extensión que le da nombre
 * — «pegado a la primera» es DIMTEDIT «Izquierda» en AutoCAD, dicho con el
 * vocabulario de DIMSTYLE en vez del de la orden—; ausente o `'centered'` es
 * el centrado de siempre.
 *
 * El desfase PERPENDICULAR (qué tan lejos de la línea de cota) es el mismo
 * en los tres casos: se reutiliza el que ya calculó el centrado por defecto
 * en vez de repetir la cuenta de `extDirA`, que es interna de `dimension.ts`.
 */
function justifiedTextAnchor(
  entity: CadDimensionEntity,
  geometry: NonNullable<ReturnType<typeof alignedDimension>>,
): CadPoint2 {
  const justification = entity.textJustification;
  if (justification !== 'first' && justification !== 'second') return geometry.textAnchor;
  const dimDir = normalize(sub(geometry.dimLine.b, geometry.dimLine.a));
  if (!dimDir) return geometry.textAnchor;
  const perpendicularOffset = sub(geometry.textAnchor, midpoint(geometry.dimLine.a, geometry.dimLine.b));
  const margin = dimensionStyle(entity).arrowSize;
  const along = justification === 'first'
    ? add(geometry.dimLine.a, scale(dimDir, -margin))
    : add(geometry.dimLine.b, scale(dimDir, margin));
  return add(along, perpendicularOffset);
}

function arcPoints(center: CadPoint2, radius: number, start: number, sweep: number, count = 48): CadPoint2[] {
  return Array.from({ length: count + 1 }, (_, index) => {
    const angle = start + (sweep * index) / count;
    return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
  });
}

/**
 * DIMJOGGED: cota de radio con quiebre, para un arco cuyo centro real cae
 * fuera del plano. La MEDIDA sigue siendo el radio real (`a` a `b`/`radius`);
 * lo único que cambia es hasta dónde llega la línea de referencia — hasta
 * `jogCenterOverride`, un punto cerca del arco, en vez de hasta el centro de
 * verdad.
 *
 * El quiebre se dibuja en el punto de la línea entre el borde del arco y
 * `jogCenterOverride` más cercano a `jogPosition` — el usuario marca POR
 * DÓNDE, no una coordenada libre fuera de esa línea— y es un único zigzag de
 * dos tramos a `jogAngle` grados de esa línea, que es lo mínimo que hace
 * reconocible un quiebre sin inventar una convención de cuatro tramos que
 * ISO no fija en un número.
 *
 * `null` si el override coincide con el borde del arco (no hay línea que
 * partir) o si el quiebre no cabe en ella; quien llama cae al radio recto.
 */
function joggedRadiusGeometry(entity: CadDimensionEntity, style: DimensionStyle): CadDimensionGeometry | null {
  const override = entity.jogCenterOverride!;
  const radial = sub(entity.b, entity.a);
  const radius = entity.radius ?? length(radial);
  const direction = normalize(radial);
  if (!direction || !(radius > 0)) return null;
  const edge = add(entity.a, scale(direction, radius));
  const leaderDir = normalize(sub(override, edge));
  if (!leaderDir) return null;
  const totalLength = length(sub(override, edge));
  const along = Math.min(style.arrowSize, totalLength / 2 - 1e-6);
  if (!(along > 0)) return null;
  const angleDeg = entity.jogAngle ?? 45;
  const off = along * Math.tan((angleDeg * Math.PI) / 180);
  const perpendicular = { x: -leaderDir.y, y: leaderDir.x };
  const pick = entity.jogPosition ?? add(edge, scale(leaderDir, totalLength / 2));
  const rawProjection = (pick.x - edge.x) * leaderDir.x + (pick.y - edge.y) * leaderDir.y;
  const t = Math.min(Math.max(rawProjection, along), totalLength - along);
  const jogCenterPoint = add(edge, scale(leaderDir, t));
  const jogStart = add(jogCenterPoint, scale(leaderDir, -along));
  const jogEnd = add(jogCenterPoint, scale(leaderDir, along));
  const jogPeak = add(jogCenterPoint, scale(perpendicular, off));
  const paths: CadDimensionPath[] = [
    { points: [edge, jogStart, jogPeak, jogEnd, override], closed: false, role: 'dimension' },
    ...arrowPaths(entity, edge, scale(direction, -1)),
  ];
  return {
    measurement: radius,
    label: formatCadDimensionMeasurement({ ...entity, prefix: entity.prefix ?? 'R' }, radius),
    textAnchor: entity.textPosition ?? add(override, scale(perpendicular, style.textGap)),
    textAngle: readableAngle(leaderDir),
    paths,
  };
}

function computeCadDimensionGeometry(entity: CadDimensionEntity): CadDimensionGeometry | null {
  const kind = entity.dimensionKind ?? 'aligned';
  const style = dimensionStyle(entity);
  if (kind === 'aligned' || kind === 'linear') {
    const geometry = kind === 'aligned'
      ? alignedDimension(entity.a, entity.b, entity.offset ?? style.arrowSize * 1.5, style)
      : linearDimension(entity.a, entity.b, entity.offset ?? style.arrowSize * 1.5, entity.axis ?? 'x', style);
    return geometry ? fromLinearGeometry(entity, geometry) : null;
  }
  if (kind === 'angular' || kind === 'arc-length') {
    if (!entity.c) return null;
    const first = normalize(sub(entity.b, entity.a));
    const second = normalize(sub(entity.c, entity.a));
    if (!first || !second) return null;
    const radius = Math.max(1e-6, Math.abs(entity.radius ?? entity.offset ?? Math.min(length(sub(entity.b, entity.a)), length(sub(entity.c, entity.a)))));
    const start = Math.atan2(first.y, first.x);
    let sweep = normalizeDegrees(((Math.atan2(second.y, second.x) - start) * 180) / Math.PI) * Math.PI / 180;
    if (sweep > Math.PI * 2 - 1e-9) sweep = 0;
    if (sweep <= 1e-9) return null;
    const arc = arcPoints(entity.a, radius, start, sweep);
    const measurement = kind === 'angular' ? (sweep * 180) / Math.PI : radius * sweep;
    const middleAngle = start + sweep / 2;
    const textAnchor = entity.textPosition ?? add(entity.a, {
      x: Math.cos(middleAngle) * (radius + style.textGap),
      y: Math.sin(middleAngle) * (radius + style.textGap),
    });
    const paths: CadDimensionPath[] = [{ points: arc, closed: false, role: 'dimension' }];
    if (entity.extensionLines !== false)
      paths.push(
        { points: [entity.a, arc[0]], closed: false, role: 'extension' },
        { points: [entity.a, arc.at(-1)!], closed: false, role: 'extension' },
      );
    const startTangent = { x: -Math.sin(start), y: Math.cos(start) };
    const endAngle = start + sweep;
    const endTangent = { x: Math.sin(endAngle), y: -Math.cos(endAngle) };
    paths.push(...arrowPaths(entity, arc[0], startTangent), ...arrowPaths(entity, arc.at(-1)!, endTangent));
    return {
      measurement,
      label: formatCadDimensionMeasurement(entity, measurement),
      textAnchor,
      textAngle: readableAngle({ x: -Math.sin(middleAngle), y: Math.cos(middleAngle) }),
      paths,
    };
  }
  if (kind === 'radius' && entity.jogCenterOverride) {
    const jogged = joggedRadiusGeometry(entity, style);
    // Degenerado (el override coincide con el borde, o no cabe el quiebre):
    // se cae al radio recto de siempre en vez de devolver null, igual que el
    // resto de "fallback" de este módulo.
    if (jogged) return jogged;
  }
  if (kind === 'radius' || kind === 'diameter') {
    const radial = sub(entity.b, entity.a);
    const radius = entity.radius ?? length(radial);
    const direction = normalize(radial);
    if (!direction || !(radius > 0)) return null;
    const edge = add(entity.a, scale(direction, radius));
    const other = add(entity.a, scale(direction, -radius));
    const measurement = kind === 'diameter' ? radius * 2 : radius;
    const start = kind === 'diameter' ? other : entity.a;
    const paths: CadDimensionPath[] = [{ points: [start, edge], closed: false, role: 'dimension' }];
    paths.push(...arrowPaths(entity, edge, scale(direction, -1)));
    if (kind === 'diameter') paths.push(...arrowPaths(entity, other, direction));
    return {
      measurement,
      label: formatCadDimensionMeasurement({ ...entity, prefix: entity.prefix ?? (kind === 'diameter' ? 'Ø' : 'R') }, measurement),
      textAnchor: entity.textPosition ?? add(midpoint(start, edge), scale({ x: -direction.y, y: direction.x }, style.textGap)),
      textAngle: readableAngle(direction),
      paths,
    };
  }
  if (kind === 'ordinate') {
    const axis = entity.axis ?? 'x';
    const measurement = axis === 'x' ? entity.b.x - entity.a.x : entity.b.y - entity.a.y;
    const elbow = entity.c ?? (axis === 'x'
      ? { x: entity.b.x, y: entity.b.y + (entity.offset ?? style.arrowSize) }
      : { x: entity.b.x + (entity.offset ?? style.arrowSize), y: entity.b.y });
    const tail = axis === 'x'
      ? { x: elbow.x + style.arrowSize * 2, y: elbow.y }
      : { x: elbow.x, y: elbow.y + style.arrowSize * 2 };
    return {
      measurement,
      label: formatCadDimensionMeasurement(entity, measurement),
      textAnchor: entity.textPosition ?? tail,
      textAngle: axis === 'x' ? 0 : 90,
      paths: [
        { points: [entity.b, elbow, tail], closed: false, role: 'dimension' },
        ...arrowPaths(entity, entity.b, sub(elbow, entity.b)),
      ],
    };
  }
  return null;
}

/**
 * La geometría de una cota, lista para render y exportación DXF.
 *
 * Envuelve `computeCadDimensionGeometry` para aplicar `textRotationOverride`
 * (DIMEDIT «Girar» / DIMTEDIT «Ángulo») en UN solo sitio en vez de en las
 * cinco ramas de tipo de cota que devuelven un ángulo: presente, sustituye al
 * ángulo derivado — que es justo lo que «Girar» promete.
 */
export function buildCadDimensionGeometry(entity: CadDimensionEntity): CadDimensionGeometry | null {
  const geometry = computeCadDimensionGeometry(entity);
  if (!geometry) return null;
  return entity.textRotationOverride === undefined
    ? geometry
    : { ...geometry, textAngle: entity.textRotationOverride };
}

/**
 * Los dos extremos de la línea de cota, ignorando cualquier hueco de DIMBREAK
 * ya cortado. Es lo que DIMBREAK necesita para medir POR DÓNDE cruza el
 * objeto designado: el hueco es un RESULTADO de esa medida, no un dato de
 * partida, así que no puede leerse de `paths` —que ya vendría partido—.
 *
 * `null` en cualquier cota que no tenga una línea de cota RECTA que partir
 * (angular, radial, de coordenada): DIMBREAK sólo corta lineales y alineadas.
 */
export function cadDimensionLineEnds(entity: CadDimensionEntity): { a: CadPoint2; b: CadPoint2 } | null {
  const kind = entity.dimensionKind ?? 'aligned';
  if (kind !== 'aligned' && kind !== 'linear') return null;
  const style = dimensionStyle(entity);
  const geometry = kind === 'aligned'
    ? alignedDimension(entity.a, entity.b, entity.offset ?? style.arrowSize * 1.5, style)
    : linearDimension(entity.a, entity.b, entity.offset ?? style.arrowSize * 1.5, entity.axis ?? 'x', style);
  return geometry ? { a: geometry.dimLine.a, b: geometry.dimLine.b } : null;
}

/**
 * DIMBREAK cuelga cada hueco del objeto que lo abrió. Si ese objeto ya no
 * está en el documento, el hueco no significa nada — la línea de cota vuelve
 * a estar entera SOLA, sin que nadie la retoque a mano. Es la mitad
 * «restituye al quitarlo» del encargo, y por eso vive junto a
 * `regenerateAssociativeDimensions`: es la misma familia de regla —una
 * referencia que ya no señala a nada deja de tener efecto—, sólo que aquí lo
 * que cae es el hueco y no la cota entera.
 *
 * Deliberadamente NO recalcula el hueco si el objeto se movió sin
 * desaparecer — repetir aquí la intersección segmento-segmento que ya hace
 * `annotate-dimension-break.ts` es trabajo de otra ola; el encargo de ésta es
 * que DESAPARECER restituya, no que seguir cruzando persiga. Queda anotado.
 */
export function restoreCadDimensionBreaks(
  entities: readonly CadEntity[],
): { entities: CadEntity[]; restoredIds: string[] } {
  const present = new Set(entities.map((entity) => entity.id));
  const restoredIds: string[] = [];
  const next = entities.map((entity): CadEntity => {
    if (entity.type !== 'dimension' || !entity.breaks || entity.breaks.length === 0) return entity;
    const kept = entity.breaks.filter((gap) => present.has(gap.entityId));
    if (kept.length === entity.breaks.length) return entity;
    restoredIds.push(entity.id);
    if (kept.length > 0) return { ...entity, breaks: kept };
    const { breaks: _dropped, ...rest } = entity;
    return rest as CadEntity;
  });
  return { entities: next, restoredIds };
}

export function cadEntityAssociationAnchor(
  entity: CadEntity,
  reference: NonNullable<CadDimensionEntity['references']>[number],
): CadPoint2 | null {
  if (reference.anchor === 'insertion' && entity.type === 'mtext') return entity.insertion;
  if (reference.anchor === 'start') {
    if (entity.type === 'line') return entity.start;
    if (entity.type === 'wall') return entity.start;
    if (entity.type === 'polyline') return entity.vertices[0] ?? null;
    if (entity.type === 'spline') return entity.controlPoints[0] ?? null;
  }
  if (reference.anchor === 'end') {
    if (entity.type === 'line') return entity.end;
    if (entity.type === 'wall') return entity.end;
    if (entity.type === 'polyline') return entity.vertices.at(-1) ?? null;
    if (entity.type === 'spline') return entity.controlPoints.at(-1) ?? null;
  }
  if (reference.anchor === 'center') {
    if (entity.type === 'circle' || entity.type === 'arc' || entity.type === 'ellipse') return entity.center;
  }
  if ((reference.anchor === 'arc-start' || reference.anchor === 'arc-end') && (entity.type === 'arc' || entity.type === 'circle')) {
    const angle = entity.type === 'circle' ? (reference.anchor === 'arc-start' ? 0 : 180) : reference.anchor === 'arc-start' ? entity.startAngle : entity.endAngle;
    return { x: entity.center.x + Math.cos((angle * Math.PI) / 180) * entity.radius, y: entity.center.y + Math.sin((angle * Math.PI) / 180) * entity.radius };
  }
  if ((reference.anchor === 'major-start' || reference.anchor === 'major-end') && entity.type === 'ellipse') {
    const sign = reference.anchor === 'major-start' ? 1 : -1;
    return { x: entity.center.x + entity.majorAxis.x * sign, y: entity.center.y + entity.majorAxis.y * sign };
  }
  if (reference.anchor === 'control' && entity.type === 'spline') return entity.controlPoints[reference.index ?? 0] ?? null;
  return null;
}

function requiredReferenceCount(kind: CadDimensionEntity['dimensionKind']): number {
  return kind === 'angular' || kind === 'arc-length' ? 3 : 2;
}

export function regenerateAssociativeDimensions(
  entities: readonly CadEntity[],
  changedEntityIds: readonly string[],
): { entities: CadEntity[]; regeneratedIds: string[]; brokenIds: string[] } {
  const changed = new Set(changedEntityIds);
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  const regeneratedIds: string[] = [];
  const brokenIds: string[] = [];
  const next = entities.map((entity): CadEntity => {
    if (entity.type !== 'dimension' || !entity.dimensionKind || !entity.associative || !entity.references?.some((reference) => changed.has(reference.entityId))) return entity;
    const points = entity.references.map((reference) => {
      const source = byId.get(reference.entityId);
      return source ? cadEntityAssociationAnchor(source, reference) : null;
    });
    if (points.length < requiredReferenceCount(entity.dimensionKind) || points.some((point) => !point)) {
      brokenIds.push(entity.id);
      return { ...entity, associationStatus: 'broken' };
    }
    regeneratedIds.push(entity.id);
    // Los puntos de definición de una cota son 2D en el esquema canónico. Los
    // anclajes salen de la geometría de origen, que SÍ es 3D (`line.start` lleva
    // `z`), así que copiarlos tal cual le añadía una `z` a la cota en la primera
    // regeneración: el documento cambiaba de forma —y de hash— sin que nadie
    // hubiera editado nada, y la misma cota se serializaba distinto según si
    // había pasado por aquí. El adaptador ya descartaba la `z` al transformar;
    // esto es la otra mitad de la misma regla.
    const flat = (point: CadPoint2): CadPoint2 => ({ x: point.x, y: point.y });
    return {
      ...entity,
      a: flat(points[0]!),
      b: flat(points[1]!),
      ...(points[2] ? { c: flat(points[2]) } : {}),
      // El radio se REDERIVA de los dos primeros puntos de definición. En
      // `radius` y `diameter` son centro y borde; en `arc-length` son el centro
      // y el arranque del arco, así que la distancia entre ambos vuelve a ser el
      // radio — y sin recalcularlo, alargar el arco cambiaba el barrido pero
      // conservaba el radio viejo, de modo que la longitud de arco quedaba mal
      // sin que nada avisara.
      ...(entity.dimensionKind === 'radius' || entity.dimensionKind === 'diameter' || entity.dimensionKind === 'arc-length'
        ? { radius: length(sub(points[1]!, points[0]!)) }
        : {}),
      associationStatus: 'associated',
    };
  });
  return { entities: next, regeneratedIds, brokenIds };
}
