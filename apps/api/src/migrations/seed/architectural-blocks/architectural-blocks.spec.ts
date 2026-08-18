import { assertEntityInvariants } from '../../../modules/cad-documents/cad-entity-invariants';
import { SYSTEM_CAD_BLOCK_PREFIX } from '../../../modules/cad-documents/system-cad-blocks';
import {
  ARCHITECTURAL_SEED_BLOCKS,
  ARCHITECTURAL_SEED_ROWS,
  seedBlockBounds,
} from './index';

/**
 * El catálogo se prueba ANTES de que toque la base.
 *
 * Un bloque mal dibujado no revienta al sembrarse: revienta cuando el
 * arquitecto lo inserta y descubre que su puerta mide nueve centímetros, o que
 * al colocarla contra el muro la hoja aparece a metro y medio del vano. Eso no
 * lo caza un `INSERT` que devuelve OK. Lo cazan estas comprobaciones, que
 * miden la geometría de verdad.
 *
 * La spec de PostgreSQL (`…-ArchitecturalBlockLibrarySeed.pg.spec.ts`) prueba
 * lo otro: que lo medido aquí es lo que acaba GUARDADO y lo que se lee de
 * vuelta. Son dos preguntas distintas y por eso son dos specs.
 */
describe('catálogo de bloques arquitectónicos', () => {
  /** Capas que el documento canónico declara por defecto; ver seed-geometry. */
  const CAPAS = new Set(['architecture', 'equipment']);

  it('declara bloques únicos con llaves que caben en la tabla', () => {
    expect(ARCHITECTURAL_SEED_BLOCKS.length).toBeGreaterThanOrEqual(30);
    const slugs = new Set(ARCHITECTURAL_SEED_BLOCKS.map((b) => b.slug));
    expect(slugs.size).toBe(ARCHITECTURAL_SEED_BLOCKS.length);
    const nombres = new Set(ARCHITECTURAL_SEED_BLOCKS.map((b) => b.name));
    expect(nombres.size).toBe(ARCHITECTURAL_SEED_BLOCKS.length);
    for (const row of ARCHITECTURAL_SEED_ROWS) {
      // `legacy_source_id` es varchar(64) y `name` varchar(80): pasarse no da
      // un error legible, da una cadena recortada y una llave que ya no es la
      // que el código cree.
      expect(row.legacySourceId.startsWith(SYSTEM_CAD_BLOCK_PREFIX)).toBe(true);
      expect(row.legacySourceId.length).toBeLessThanOrEqual(64);
      expect(row.name.length).toBeLessThanOrEqual(80);
      expect(row.definition.id).toBe(row.legacySourceId);
    }
  });

  it('dibuja a escala real en milímetros', () => {
    for (const block of ARCHITECTURAL_SEED_BLOCKS) {
      const bounds = seedBlockBounds(block.shapes);
      const width = bounds.maxX - bounds.minX;
      const depth = bounds.maxY - bounds.minY;
      // Tolerancia de un décimo de milímetro: los arcos entran por coseno.
      expect(width).toBeCloseTo(block.extent.width, 1);
      expect(depth).toBeCloseTo(block.extent.depth, 1);
      // Un plano de arquitectura en milímetros: nada mide menos de 10 cm ni
      // más de 6 m. Un bloque en centímetros o en metros cae aquí, que es
      // exactamente el error que no se ve leyendo el código.
      expect(width).toBeGreaterThanOrEqual(100);
      expect(depth).toBeGreaterThanOrEqual(100);
      expect(width).toBeLessThanOrEqual(6000);
      expect(depth).toBeLessThanOrEqual(6000);
    }
  });

  it('pone el punto de inserción dentro de la pieza', () => {
    for (const block of ARCHITECTURAL_SEED_BLOCKS) {
      const bounds = seedBlockBounds(block.shapes);
      // Insertar por un punto que no toca el dibujo obliga a mover la pieza a
      // ojo después de colocarla, que es la definición de bloque inservible.
      expect(block.basePoint.x).toBeGreaterThanOrEqual(bounds.minX);
      expect(block.basePoint.x).toBeLessThanOrEqual(bounds.maxX);
      expect(block.basePoint.y).toBeGreaterThanOrEqual(bounds.minY);
      expect(block.basePoint.y).toBeLessThanOrEqual(bounds.maxY);
      expect(block.basePoint.z).toBe(0);
    }
  });

  it('cuelga el barrido de cada puerta abatible de su propio quicial', () => {
    const abatibles = ARCHITECTURAL_SEED_BLOCKS.filter((block) =>
      block.slug.startsWith('puerta-abatible-'),
    );
    expect(abatibles).toHaveLength(3);
    for (const block of abatibles) {
      const arco = block.shapes.find((shape) => shape.type === 'arc');
      expect(arco).toBeDefined();
      if (arco?.type !== 'arc') throw new Error('sin arco de barrido');
      // El arco nace EN el punto de inserción y su radio es el claro: si el
      // centro se moviera, el bloque diría que la hoja barre un espacio que no
      // es el suyo, y sobre esa mentira se decide dónde va el mueble.
      expect(arco.center).toEqual(block.basePoint);
      expect(arco.radius).toBe(block.opening);
    }
  });

  it('declara el claro de puertas y ventanas coherente con su atributo', () => {
    const conClaro = ARCHITECTURAL_SEED_BLOCKS.filter(
      (block) => block.opening !== undefined,
    );
    expect(conClaro.length).toBe(10);
    for (const block of conClaro) {
      expect(Math.round(Number(block.attributes.ANCHO.defaultValue) * 1000))
        // El atributo es lo que el arquitecto lee en el plano y el claro es lo
        // que mide el dibujo: si no coinciden, uno de los dos miente.
        .toBe(block.opening);
    }
  });

  it('etiqueta cada bloque con capa, atributos y palabras de búsqueda', () => {
    for (const block of ARCHITECTURAL_SEED_BLOCKS) {
      expect(CAPAS.has(block.layer)).toBe(true);
      expect(block.keywords.length).toBeGreaterThanOrEqual(3);
      expect(block.description.length).toBeGreaterThan(20);
      const tags = Object.keys(block.attributes);
      expect(tags.length).toBeGreaterThanOrEqual(2);
      for (const tag of tags) {
        // Una etiqueta de atributo es un TAG de ATTDEF: mayúsculas ASCII, sin
        // acentos ni espacios, o el DXF que se abra fuera no la reconoce.
        expect(tag).toMatch(/^[A-Z][A-Z0-9_]*$/);
        expect(block.attributes[tag].defaultValue.trim()).not.toBe('');
        expect(block.attributes[tag].prompt.trim()).not.toBe('');
      }
    }
  });

  it('produce definiciones que el documento canónico acepta', () => {
    for (const row of ARCHITECTURAL_SEED_ROWS) {
      const definition = row.definition;
      // Lo que exige `CadBlocksService.safeDefinition` para aceptar un alta.
      expect(typeof definition.id).toBe('string');
      expect(typeof definition.name).toBe('string');
      expect(definition.entities.length).toBeGreaterThan(0);
      expect(definition.basePoint).toBeDefined();

      const ids = definition.entities.map((entity) => entity.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids)
        expect(id.startsWith(`${definition.id}:`)).toBe(true);

      // Y las invariantes REALES del kernel: radio positivo, extremos
      // distintos, polilínea cerrada con tres vértices, coordenadas finitas.
      // Es el mismo validador que rechazaría el documento al guardarlo.
      expect(() =>
        assertEntityInvariants(
          definition.entities,
          null,
          `el bloque ${definition.id}`,
        ),
      ).not.toThrow();
    }
  });

  it('cubre las familias que dibuja un despacho mexicano', () => {
    const slugs = ARCHITECTURAL_SEED_BLOCKS.map((block) => block.slug);
    for (const esperado of [
      'puerta-abatible-90',
      'puerta-corrediza-90',
      'puerta-doble-160',
      'puerta-closet-200',
      'ventana-fija-120',
      'ventana-corrediza-150',
      'ventana-abatible-60',
      'ventana-proyectante-60',
      'wc-tanque-bajo',
      'lavabo-50',
      'regadera-90',
      'tina-170',
      'fregadero-doble-80',
      'estufa-76',
      'refrigerador-70',
      'cama-individual',
      'cama-matrimonial',
      'cama-king',
      'mesa-comedor-6',
      'silla-comedor',
      'sofa-3-plazas',
      'closet-200',
      'escalera-recta-16',
      'escalera-en-l-16',
      'cajon-auto-grande',
      'cochera-doble',
    ])
      expect(slugs).toContain(esperado);
  });
});
