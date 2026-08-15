/**
 * INVALIDACIÓN DE DEPENDIENTES: mover un muro limpia el teselado cacheado de
 * los muros con los que se unía.
 *
 * La invalidación del pipeline entraba por `affectedEntityIds` —lo que el
 * ejecutor de comandos declara tocado— y eso era exacto mientras la geometría
 * de cada entidad saliera de sus propios campos. Con las uniones de muro dejó
 * de serlo: el contorno de A lleva dentro el inglete que le impone B. Mover B
 * dejaba en pantalla el inglete de donde B ya no está, y no había forma de
 * notarlo salvo mirando el plano — ni error, ni hueco, ni tile que se
 * reconstruya solo hasta que la vista lo saque y lo vuelva a meter.
 *
 * Aquí se fija que:
 *
 *   · mover B tira el teselado de A y lo reconstruye con el inglete NUEVO;
 *   · borrar B le devuelve a A su testero;
 *   · una edición lejos de todo no invalida de más;
 *   · y el coste está ACOTADO — con miles de entidades, una edición hace dos
 *     consultas al índice y examina un puñado de candidatos, medido con un
 *     índice instrumentado inyectado en el pipeline.
 */
import { strict as assert } from "node:assert";
import { migrateCadDocument, type CadDocument } from "../cad-document";
import {
  CadSpatialIndex,
  type CadBounds,
  type CadNativeEntity,
} from "../entity-runtime";
import { CadRenderPipeline } from "./pipeline";
import {
  CadTessellationCache,
  cadRenderSegmentBudget,
  tessellateCadEntity,
  type CadRenderLodTier,
  type CadTessellation,
} from "./tessellation-cache";

let checks = 0;
function ok(condition: boolean, message: string): void {
  assert.ok(condition, message);
  checks += 1;
}

const layer = "0";
const TIERS: CadRenderLodTier[] = [0, 1, 2];
const p = (x: number, y: number) => ({ x, y, z: 0 });

const wall = (
  id: string,
  start: { x: number; y: number },
  end: { x: number; y: number },
): CadNativeEntity => ({
  id,
  type: "wall",
  start: { ...start, z: 0 },
  end: { ...end, z: 0 },
  thickness: 250,
  height: 2_400,
  layer,
});

function documentOf(entities: readonly CadNativeEntity[]): CadDocument {
  return migrateCadDocument({
    meta: { version: 1, schema: 6, unit: "mm" },
    layers: [{ id: layer, name: "Cero", color: "#ffffff", visible: true, locked: false }],
    entities: [...entities],
    modelSpace: { entityIds: entities.map((entity) => entity.id) },
  }) as CadDocument;
}

function sameGeometry(left: CadTessellation, right: CadTessellation): boolean {
  if (left.paths.length !== right.paths.length || left.pointCount !== right.pointCount)
    return false;
  return left.paths.every((path, index) => {
    const other = right.paths[index];
    if (path.closed !== other.closed || path.xy.length !== other.xy.length) return false;
    return path.xy.every((value, position) => value === other.xy[position]);
  });
}

/** El teselado cacheado de una entidad, en el escalón que sea, o `null`. */
function cachedOf(
  cache: CadTessellationCache,
  entityId: string,
): { tier: CadRenderLodTier; tessellation: CadTessellation } | null {
  for (const tier of TIERS) {
    const tessellation = cache.peek(entityId, tier);
    if (tessellation) return { tier, tessellation };
  }
  return null;
}

const VIEW = {
  bounds: { minX: -1_000, minY: -1_000, maxX: 60_000, maxY: 10_000 },
  pixelsPerUnit: 0.05,
};

// ---------------------------------------------------------------------------
// MOVER B INVALIDA A, Y A VUELVE CON EL INGLETE NUEVO.
//
// A y B comparten el origen y forman una L recta. Se gira B sin soltar la
// esquina: la unión SIGUE existiendo y el inglete cambia — el caso que un
// invalidador por ids tocados deja peor que si no hiciera nada, porque el
// contorno viejo es plausible y nadie lo mira dos veces.
// ---------------------------------------------------------------------------
{
  const a = wall("a", { x: 0, y: 0 }, { x: 3_000, y: 0 });
  const b = wall("b", { x: 0, y: 0 }, { x: 0, y: 3_000 });
  const before = documentOf([a, b]);
  const cache = new CadTessellationCache();
  const pipeline = new CadRenderPipeline({ cache, offThread: null });
  pipeline.replace([a, b], ["a", "b"], before);
  pipeline.setView(VIEW);
  pipeline.settle();

  const first = cachedOf(cache, "a");
  assert.ok(first, "A tiene teselado cacheado tras el primer dibujo");
  const budget = cadRenderSegmentBudget(first.tier);
  assert.ok(
    sameGeometry(first.tessellation, tessellateCadEntity(a, budget, before)),
    "y es el que le corresponde con la L en pie",
  );
  assert.ok(
    !sameGeometry(first.tessellation, tessellateCadEntity(a, budget)),
    "que NO es el del muro suelto: el inglete está dentro",
  );

  // B gira 45°, sin soltar la esquina. A no se toca.
  const turned = wall("b", { x: 0, y: 0 }, { x: 3_000, y: 3_000 });
  const after = documentOf([a, turned]);
  pipeline.invalidate(["b"], [turned], after);

  assert.equal(
    cachedOf(cache, "a"),
    null,
    "el teselado de A sale de la caché aunque A no esté entre los ids afectados: " +
      "su contorno se derivó mirando a B",
  );
  pipeline.settle();
  const rebuilt = cachedOf(cache, "a");
  assert.ok(rebuilt, "A se reconstruye");
  const rebuiltBudget = cadRenderSegmentBudget(rebuilt.tier);
  assert.ok(
    sameGeometry(rebuilt.tessellation, tessellateCadEntity(a, rebuiltBudget, after)),
    "y trae el inglete NUEVO, el de la L a 45°",
  );
  assert.ok(
    !sameGeometry(rebuilt.tessellation, tessellateCadEntity(a, rebuiltBudget, before)),
    "no el de antes de girar B, que es exactamente lo que se quedaba en pantalla",
  );
  ok(true, "mover B invalida el teselado de A y A vuelve con el inglete nuevo");

  // -------------------------------------------------------------------------
  // BORRAR B DEVUELVE EL TESTERO. Una baja es la misma llamada que una edición
  // y tiene que limpiar igual al vecino que se queda solo.
  // -------------------------------------------------------------------------
  const alone = documentOf([a]);
  pipeline.invalidate(["b"], [], alone);
  assert.equal(cachedOf(cache, "a"), null, "borrar B también tira el teselado de A");
  pipeline.settle();
  const solitary = cachedOf(cache, "a");
  assert.ok(solitary, "A sigue dibujándose sin su vecino");
  const soloBudget = cadRenderSegmentBudget(solitary.tier);
  assert.ok(
    sameGeometry(solitary.tessellation, tessellateCadEntity(a, soloBudget)),
    "y es el contorno cerrado del muro suelto: el testero volvió",
  );
  assert.equal(pipeline.stats().totalEntities, 1, "y B desapareció del dibujo");
  ok(true, "borrar B devuelve a A su testero, no lo deja con el inglete de un muro que ya no está");
  pipeline.dispose();
}

// ---------------------------------------------------------------------------
// UNA EDICIÓN QUE NO TOCA VECINOS NO INVALIDA DE MÁS.
//
// Invalidar de más no se ve en pantalla, y por eso se cuela: cada id de sobra
// es un tile liberado y reconstruido por nada, y a ese precio la invalidación
// por dependientes acabaría costando más que el fallo que arregla.
// ---------------------------------------------------------------------------
{
  const a = wall("a", { x: 0, y: 0 }, { x: 3_000, y: 0 });
  const b = wall("b", { x: 0, y: 0 }, { x: 0, y: 3_000 });
  const lejos = wall("lejos", { x: 40_000, y: 0 }, { x: 43_000, y: 0 });
  const linea: CadNativeEntity = {
    id: "linea", type: "line", start: p(20_000, 0), end: p(21_000, 0), layer,
  };
  const entities = [a, b, lejos, linea];
  const cache = new CadTessellationCache();
  const pipeline = new CadRenderPipeline({ cache, offThread: null });
  pipeline.replace(entities, entities.map((entity) => entity.id), documentOf(entities));
  pipeline.setView(VIEW);
  pipeline.settle();
  assert.ok(cachedOf(cache, "a") && cachedOf(cache, "b"), "la L está dibujada");

  const movido = wall("lejos", { x: 40_000, y: 500 }, { x: 43_000, y: 500 });
  const next = [a, b, movido, linea];
  pipeline.invalidate(["lejos"], [movido], documentOf(next));
  assert.ok(cachedOf(cache, "a"), "mover un muro a 40 m no toca el teselado de A");
  assert.ok(cachedOf(cache, "b"), "ni el de B");

  // Y una LÍNEA movida no invalida nada más que a sí misma: su adaptador no
  // declara dependientes, así que ni siquiera pregunta.
  const linea2: CadNativeEntity = {
    id: "linea", type: "line", start: p(20_000, 900), end: p(21_000, 900), layer,
  };
  pipeline.invalidate(["linea"], [linea2], documentOf([a, b, movido, linea2]));
  assert.ok(cachedOf(cache, "a") && cachedOf(cache, "b"), "mover una línea no toca a los muros");
  assert.equal(cachedOf(cache, "linea"), null, "pero sí a sí misma");
  ok(true, "una edición lejos de la L no invalida a la L, y una línea no invalida a nadie");
  pipeline.dispose();
}

// ---------------------------------------------------------------------------
// COSTE ACOTADO, MEDIDO.
//
// El índice del carril se inyecta instrumentado: cuenta cuántas veces se le
// pregunta y cuántos candidatos devuelve. Con miles de entidades en el dibujo,
// una edición de muro hace DOS consultas —el estado de antes y el de después—
// y examina un puñado; una edición de línea no hace ninguna.
// ---------------------------------------------------------------------------
{
  class CountingSpatialIndex extends CadSpatialIndex {
    searches = 0;
    visited = 0;
    search(bounds: CadBounds): string[] {
      this.searches += 1;
      const found = super.search(bounds);
      this.visited += found.length;
      return found;
    }
  }

  // 120 esquinas en L repartidas cada 5.000 unidades, más 4.000 líneas de
  // relleno: 4.240 entidades, de las que sólo los muros se derivan del
  // documento.
  const PAIRS = 120;
  const FILL = 4_000;
  const entities: CadNativeEntity[] = [];
  for (let index = 0; index < PAIRS; index += 1) {
    const x = index * 5_000;
    entities.push(wall(`a${index}`, { x, y: 0 }, { x: x + 3_000, y: 0 }));
    entities.push(wall(`b${index}`, { x, y: 0 }, { x, y: 3_000 }));
  }
  for (let index = 0; index < FILL; index += 1) {
    const x = (index % 400) * 1_500;
    const y = 20_000 + Math.floor(index / 400) * 1_000;
    entities.push({
      id: `l${index}`, type: "line", start: p(x, y), end: p(x + 900, y + 400), layer,
    } as CadNativeEntity);
  }
  const ids = entities.map((entity) => entity.id);
  const neighborhood = new CountingSpatialIndex();
  const cache = new CadTessellationCache();
  const pipeline = new CadRenderPipeline({ cache, neighborhood, offThread: null });
  pipeline.replace(entities, ids, documentOf(entities));
  assert.equal(
    neighborhood.size,
    PAIRS * 2,
    `el índice del carril contiene los muros, no el dibujo: ${neighborhood.size} de ${entities.length}`,
  );
  pipeline.setView({
    bounds: { minX: -5_000, minY: -5_000, maxX: 620_000, maxY: 40_000 },
    pixelsPerUnit: 0.01,
  });
  pipeline.settle();
  assert.equal(neighborhood.searches, 0, "cargar y dibujar no consulta el carril ni una vez");

  const moved = wall("b7", { x: 35_000, y: 0 }, { x: 37_000, y: 3_000 });
  const next = entities.map((entity) => (entity.id === "b7" ? moved : entity));
  pipeline.invalidate(["b7"], [moved], documentOf(next));
  assert.equal(
    neighborhood.searches,
    2,
    `una edición pregunta DOS veces —antes y después—, no una por entidad: ${neighborhood.searches}`,
  );
  assert.ok(
    neighborhood.visited <= 8,
    `y examina un puñado de candidatos, no las ${entities.length} del dibujo: ${neighborhood.visited}`,
  );
  assert.equal(cachedOf(cache, "a7"), null, "aun así, el vecino de verdad queda invalidado");
  assert.ok(cachedOf(cache, "a8"), "y el de la esquina siguiente, intacto");

  const searchesAfterWall = neighborhood.searches;
  const line: CadNativeEntity = {
    id: "l0", type: "line", start: p(0, 25_000), end: p(900, 25_400), layer,
  };
  pipeline.invalidate(["l0"], [line], documentOf(next.map((e) => (e.id === "l0" ? line : e))));
  assert.equal(
    neighborhood.searches,
    searchesAfterWall,
    "mover una línea no consulta el carril: su adaptador no declara dependientes",
  );
  ok(
    true,
    `con ${entities.length} entidades, mover un muro cuesta ${neighborhood.searches} consultas al ` +
      `índice y ${neighborhood.visited} candidatos examinados; mover una línea, cero`,
  );
  pipeline.dispose();
}

console.log(
  `pipeline-dependents: ${checks} comprobaciones verdes — mover un muro rederiva el inglete de su ` +
    `vecino, borrarlo le devuelve el testero, una edición lejana no invalida de más y el coste se ` +
    `mantiene en dos consultas al índice con miles de entidades en el dibujo.`,
);
