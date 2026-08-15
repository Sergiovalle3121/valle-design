/**
 * Carril de DEPENDIENTES del pipeline de render: a quién más hay que
 * rederivarle la geometría cuando una entidad cambia.
 *
 * ## El agujero que tapa
 *
 * La invalidación del pipeline entra por `affectedEntityIds`, que es lo que el
 * ejecutor de comandos declara tocado. Mientras la geometría de cada entidad
 * salía sólo de sus propios campos, esa lista era exacta. Con las uniones de
 * muro dejó de serlo: el contorno de A —su inglete, su testero absorbido— se
 * deriva mirando a B, así que mover, editar o borrar B deja el teselado
 * CACHEADO de A describiendo una esquina que ya no existe. No hay error ni
 * hueco: hay un plano mal dibujado que sólo se corrige si el tile de A sale de
 * la vista y vuelve a entrar.
 *
 * ## Antes y después, las dos veces
 *
 * Quien invalida pregunta DOS veces por cada edición: con el estado de antes y
 * con el de después. Un muro que DEJA de tocar a su vecino ya no lo nombra
 * después de moverse, y el vecino se quedaría con el inglete de un muro que se
 * fue; un muro que LLEGA a tocar a otro no lo nombraba antes. Ninguna de las
 * dos consultas sobra.
 *
 * ## Coste acotado: un índice de los que se derivan del documento
 *
 * El índice espacial de este carril NO contiene el dibujo: contiene sólo las
 * entidades cuyo adaptador declara `renderer.needsDocument`, que son
 * exactamente las que pueden quedar obsoletas por culpa de un vecino. Un plano
 * de 100.000 líneas y 200 muros indexa 200 entradas, y una edición que no toca
 * ningún tipo con `dependents` no consulta nada en absoluto.
 *
 * Lo que se paga por edición es, por cada entidad tocada que declara
 * dependientes, una consulta por CAJA a `CadSpatialIndex` —una rejilla
 * uniforme con desbordamiento acotado, el mismo índice que sirve a la
 * selección— más el examen de lo que devuelve. Nunca un barrido de
 * `document.entities`: eso convertiría cada tirón del ratón en O(n) sobre el
 * dibujo entero, que es justo el coste que el pipeline por tiles existe para
 * no pagar.
 */
import {
  CAD_ENTITY_REGISTRY,
  CadSpatialIndex,
  type CadBounds,
  type CadNativeEntity,
} from "../entity-runtime";

export class CadRenderDependencyLane {
  /**
   * @param resolve  Cómo se llega de un id a su entidad vigente. Lo aporta el
   *                 pipeline: el carril no duplica el contenido, sólo su caja.
   * @param index    Inyectable para poder MEDIR el coste desde un spec —una
   *                 subclase que cuente `search` demuestra que una edición en
   *                 un plano de miles de entidades visita un puñado.
   */
  constructor(
    private readonly resolve: (entityId: string) => CadNativeEntity | undefined,
    private readonly index: CadSpatialIndex = new CadSpatialIndex(),
  ) {}

  /** Entradas indexadas. Es el número que dice que el índice NO es el dibujo. */
  get size(): number {
    return this.index.size;
  }

  /**
   * Da de alta (o de baja) una entidad según DECLARE derivarse del documento.
   * Se llama con la caja que el pipeline ya calculó para su índice de tiles:
   * derivarla otra vez aquí sería pagar dos veces por el mismo número.
   */
  track(entity: CadNativeEntity, bounds: CadBounds): void {
    if (CAD_ENTITY_REGISTRY.adapter(entity).renderer.needsDocument === true)
      this.index.upsert(entity.id, bounds);
    else this.index.remove(entity.id);
  }

  untrack(entityId: string): void {
    this.index.remove(entityId);
  }

  clear(): void {
    this.index.clear();
  }

  /**
   * Añade a `into` los dependientes de los ids dados SEGÚN EL ESTADO VIGENTE.
   * Es la consulta de ANTES de aplicar una edición; los ids desconocidos —un
   * alta— no aportan nada, que es lo correcto: nadie dependía de ellos.
   */
  expandIds(entityIds: Iterable<string>, into: Set<string>): void {
    for (const entityId of entityIds) {
      const entity = this.resolve(entityId);
      if (entity) this.expandOne(entity, into);
    }
  }

  /** La misma consulta con entidades ya en la mano: la de DESPUÉS. */
  expandEntities(entities: Iterable<CadNativeEntity>, into: Set<string>): void {
    for (const entity of entities)
      if (CAD_ENTITY_REGISTRY.supports(entity)) this.expandOne(entity, into);
  }

  private expandOne(entity: CadNativeEntity, into: Set<string>): void {
    const dependents = CAD_ENTITY_REGISTRY.adapter(entity).renderer.dependents;
    // El caso común: un tipo sin derivación por vecindad no consulta el índice
    // ni una vez, así que un MOVE de 10.000 líneas no paga nada por existir
    // esta máquina.
    if (!dependents) return;
    for (const id of dependents(entity, (bounds) => this.neighbors(bounds)))
      if (id !== entity.id) into.add(id);
  }

  private neighbors(bounds: CadBounds): readonly CadNativeEntity[] {
    const found: CadNativeEntity[] = [];
    for (const id of this.index.search(bounds)) {
      const entity = this.resolve(id);
      if (entity) found.push(entity);
    }
    return found;
  }
}
