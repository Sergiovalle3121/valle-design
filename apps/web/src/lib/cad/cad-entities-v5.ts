/**
 * Entidades del esquema 5 del documento canónico: SOLID3D y REGION.
 *
 * Se declaran aquí y no en `cad-document.ts` por las mismas dos razones que las
 * del esquema 4, y la segunda sigue siendo la que importa:
 *
 *  1. `cad-document.ts` está en el trinquete de tamaño.
 *  2. Su único import es `import type`, que se borra al compilar, así que este
 *     módulo es una HOJA del grafo de carga. `tsc --noEmit` no ve los ciclos y
 *     el producto revienta al cargar con «Cannot access X before initialization»;
 *     una hoja no puede cerrar ninguno.
 *
 * ## Un SOLID3D guarda su ÁRBOL, no su malla
 *
 * Ésta es LA decisión del esquema 5 y conviene entender qué se compra y qué se
 * paga con ella.
 *
 * Un sólido teselado a tolerancia de cuerda fina son decenas de miles de
 * triángulos: en un documento con cien piezas, cientos de megabytes de JSON que
 * además viajan por la ruta CAS en cada guardado. Y lo peor no es el tamaño: una
 * malla no se puede REEDITAR. Cambiar la altura de una extrusión sobre una malla
 * es imposible; sobre el árbol es cambiar un número.
 *
 * Así que se persiste la RECETA —qué perfil, qué altura, qué se restó a qué— y
 * la malla se deriva al abrir. El coste es que abrir un documento cuesta
 * evaluar el árbol, y ese coste es real: por eso `solid3d-build.ts` memoriza por
 * huella del árbol y el evaluador está acotado por `maxNodes`.
 *
 * ## Por qué la lista de nodos es PLANA y se referencia por id
 *
 * Un árbol anidado no puede compartir un subárbol: restar la misma pieza a dos
 * cuerpos distintos la duplicaría, y editarla exigiría acordarse de editar las
 * dos copias. Con nodos direccionables, una operación apunta a sus operandos y
 * un subárbol compartido se escribe una vez.
 *
 * La contrapartida es que una referencia puede COLGAR: un `union` que nombra un
 * nodo que ya no existe. Eso no es un documento «raro» que se pueda arreglar
 * adivinando — no hay nada que adivinar — así que la validación del servidor lo
 * rechaza en la frontera y `validateSolidTree` lo detecta en el cliente.
 *
 * ## Coordenadas: dónde vive cada cosa
 *
 * Los nodos describen el sólido en su ESPACIO DE CONSTRUCCIÓN. La colocación en
 * el dibujo va aparte, en `placement`, que es la MISMA afín 2×3 que gobierna
 * todo lo demás del documento (ver `transform2d.ts`). Separarlas es lo que
 * permite mover, girar y espejar un sólido sin volver a evaluar el árbol y sin
 * que una traslación ensucie el diff de la receta.
 *
 * Un `placement` con determinante NEGATIVO es un espejo, y un espejo invierte la
 * orientación de las caras: sin darle la vuelta al cuerpo, las normales apuntan
 * hacia dentro y el sólido se ve del revés —negro, o iluminado por el lado
 * equivocado— con un volumen que sale negativo. `solid3d-build.ts` lo trata; la
 * regla se deriva del signo del determinante en vez de guardarse en un campo
 * aparte, porque un campo se puede desincronizar de la matriz que lo justifica.
 */
import type { CadEntityContext, CadPoint2, CadPoint3 } from "./cad-document";

/**
 * Perfil cerrado en coordenadas del PLANO de construcción de su nodo.
 *
 * `outer` va en sentido antihorario y `inners` en el contrario; si llegan al
 * revés, `normalizeProfile` del kernel los corrige, así que no es una trampa
 * para quien escriba uno a mano.
 */
export interface CadSolidProfile {
  outer: CadPoint2[];
  inners?: CadPoint2[][];
}

/**
 * Marco de un nodo: origen, eje Z (la normal del plano de trabajo) y una
 * referencia para el eje X.
 *
 * `xAxis` es opcional porque el kernel sabe elegir uno cualquiera perpendicular
 * a `zAxis`; se puede fijar cuando la orientación del perfil dentro de su plano
 * importa, que es siempre que el perfil no sea simétrico.
 */
export interface CadSolidFrame {
  origin: CadPoint3;
  zAxis: CadPoint3;
  xAxis?: CadPoint3;
}

/** Plano de corte: un punto y su normal. */
export interface CadSolidPlane {
  origin: CadPoint3;
  normal: CadPoint3;
}

/**
 * Cómo se NOMBRA una cara de un sólido para que siga siendo la misma mañana.
 *
 * El kernel B-rep no tiene identificadores: caras, aristas y medias-aristas son
 * arrays, y todo son índices. Es la decisión correcta para el kernel —un B-rep
 * con punteros no se serializa— y es un problema en cuanto esos índices se
 * PERSISTEN, que es justo lo que ya hacen `fillet` y `chamfer` unas líneas más
 * abajo con su `edges: number[]`. Basta con que alguien edite el operando para
 * que esos números apunten a otra arista: no falla, redondea la equivocada, y
 * nadie se entera hasta medir la pieza.
 *
 * Una `CadSolidFaceRef` lleva el índice —porque el 99 % de las veces es
 * correcto y comprobarlo cuesta O(1)— y además una HUELLA de lo que esa cara es
 * geométricamente. El índice nunca se cree sin comprobar la huella, y cuando la
 * huella no basta se falla con motivo en vez de elegir la cara 0.
 *
 * ## Por qué el tipo vive AQUÍ y no junto a su algoritmo
 *
 * Porque esto es forma PERSISTIDA: viaja en el documento del cliente y lo lee
 * el validador del servidor. Su sitio es el módulo del esquema, que además es
 * una HOJA del grafo de carga (ver la cabecera del archivo). El algoritmo que
 * la resuelve vive en `lib/cad/pick3d/solid-face-ref.ts` e importa este tipo,
 * nunca al revés.
 *
 * Todos los números van CUANTIZADOS: dos evaluaciones del mismo árbol no
 * producen bit a bit los mismos flotantes, y una cara tiene que reconocerse a
 * sí misma entre una y otra.
 */
export interface CadSolidFaceRef {
  /** Vía rápida. Se COMPRUEBA contra la huella antes de creerse. */
  index: number;
  /** Plano de la cara: normal unitaria canónica y distancia con signo al origen. */
  plane: { nx: number; ny: number; nz: number; d: number };
  /** Centroide de la cara. */
  centroid: CadPoint3;
  /** Medias-aristas del lazo exterior. */
  loopSize: number;
  /** Cuántos lazos interiores (agujeros) tiene la cara. */
  innerLoops: number;
  /** Área. Desempata dos caras coplanares del mismo tamaño de lazo. */
  area: number;
}

/**
 * Un nodo del árbol de construcción.
 *
 * Los `op` sin `operand`/`operands` son HOJAS —fabrican geometría de la nada— y
 * los que sí lo tienen son operaciones sobre nodos anteriores. `brep` es la hoja
 * especial: lleva la geometría explícita, y es cómo entra un sólido importado de
 * STEP o IGES en un árbol que por lo demás es paramétrico.
 */
export type CadSolidNode = { id: string } & (
  | {
      op: "box";
      min: CadPoint3;
      max: CadPoint3;
    }
  | {
      op: "extrude";
      profile: CadSolidProfile;
      height: number;
      frame?: CadSolidFrame;
      /** Ángulo de desmoldeo en radianes. Positivo ⇒ la pieza se ensancha al subir. */
      draftAngleRad?: number;
      steps?: number;
    }
  | {
      op: "revolve";
      /** Perfil en el plano (radial, axial): `x` es distancia al eje, nunca negativa. */
      profile: CadSolidProfile;
      angleRad?: number;
      segments?: number;
      frame?: CadSolidFrame;
    }
  | {
      op: "sweep";
      profile: CadSolidProfile;
      path: CadPoint3[];
      closed?: boolean;
      upHint?: CadPoint3;
    }
  | {
      op: "loft";
      sections: { profile: CadSolidProfile; frame: CadSolidFrame }[];
      closed?: boolean;
      steps?: number;
    }
  | {
      /**
       * Geometría EXPLÍCITA: vértices y caras por índice. Es la hoja de lo
       * importado, y también la salida de `SLICE`, que produce un cuerpo que no
       * se puede describir como receta de nada.
       */
      op: "brep";
      points: CadPoint3[];
      faces: { outer: number[]; inners?: number[][] }[];
      /** De dónde salió, para que un sólido importado sepa decirlo. */
      source?: { format: "step" | "iges"; name?: string };
    }
  | { op: "union"; operands: string[] }
  /** `operands[0]` menos todos los demás, en orden. */
  | { op: "subtract"; operands: string[] }
  | { op: "intersect"; operands: string[] }
  | {
      op: "fillet";
      operand: string;
      /** Índices de arista del cuerpo del operando. Vacío = todas. */
      edges: number[];
      radius: number;
      segments?: number;
    }
  | {
      op: "chamfer";
      operand: string;
      edges: number[];
      distance: number;
    }
  | {
      /** Corta por un plano y se queda con UN lado. */
      op: "slice";
      operand: string;
      plane: CadSolidPlane;
      keep: "positive" | "negative";
    }
  | {
      /**
       * EMPUJAR una cara a lo largo de su normal — el gesto del modelado
       * directo. Positivo saca material, negativo lo hunde.
       *
       * Es un NODO y no un horneado a propósito: hornear el sólido a geometría
       * explícita mandaría todos sus vértices en CADA guardado CAS (el servidor
       * admite hasta 200 000) y tiraría la reeditabilidad, que es LA decisión
       * de este esquema. Como nodo, cambiar el 30 por un 35 en el panel
       * reconstruye la pieza — algo que un modelador directo puro no puede
       * hacer.
       */
      op: "push";
      operand: string;
      face: CadSolidFaceRef;
      distance: number;
    }
);

export type CadSolidNodeOp = CadSolidNode["op"];

/** Los `op` que fabrican geometría sin depender de otro nodo. */
export const CAD_SOLID_LEAF_OPS = [
  "box",
  "extrude",
  "revolve",
  "sweep",
  "loft",
  "brep",
] as const;

/** Los `op` que consumen uno o varios nodos anteriores. */
export const CAD_SOLID_OPERATION_OPS = [
  "union",
  "subtract",
  "intersect",
  "fillet",
  "chamfer",
  "slice",
  "push",
] as const;

export const CAD_SOLID_NODE_OPS = [
  ...CAD_SOLID_LEAF_OPS,
  ...CAD_SOLID_OPERATION_OPS,
] as const satisfies readonly CadSolidNodeOp[];

/**
 * Colocación del sólido en el dibujo: la misma afín 2×3 del resto del documento.
 *
 * Se declara con sus seis números y no reutilizando `CadAffine2` para que este
 * módulo siga sin importar nada del CAD en tiempo de ejecución. Son la misma
 * forma, así que uno es asignable al otro sin conversión.
 */
export interface CadSolidPlacement {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
  /** Desplazamiento en Z. La afín 2×3 no lo expresa y un sólido sí lo necesita. */
  dz?: number;
}

/**
 * SOLID3D — un sólido B-rep descrito por su historia de construcción.
 *
 * `root` es el nodo cuyo cuerpo ES el sólido. Los demás nodos pueden ser
 * antepasados suyos o quedar huérfanos tras una edición; los huérfanos no se
 * borran automáticamente porque son el material del que vive «rehacer el árbol
 * de otra manera», y `solid3d-build.ts` sólo evalúa lo que `root` alcanza.
 */
export interface CadSolid3dEntity {
  id: string;
  type: "solid3d";
  nodes: CadSolidNode[];
  root: string;
  placement?: CadSolidPlacement;
  /** Nombre legible: «Base», «Tapa». Se muestra en propiedades. */
  name?: string;
  layer: string;
  context?: CadEntityContext;
}

/**
 * REGION — una región 2D cerrada, con agujeros.
 *
 * Es lo que AutoCAD crea con REGION y lo que consumen EXTRUDE y REVOLVE. Sus
 * contornos van en coordenadas del MUNDO —no de un marco propio— porque una
 * región vive en el plano del dibujo y su sitio es el que el usuario ve; la
 * elevación viaja en la `z` de sus puntos.
 *
 * Bajo una transformada que refleje, los contornos se INVIERTEN además de
 * transformarse. No es cosmético: el sentido de recorrido es lo que distingue el
 * exterior de un agujero, y una región espejada sin invertir extruye un sólido
 * con las normales hacia dentro.
 */
export interface CadRegionEntity {
  id: string;
  type: "region";
  outer: CadPoint3[];
  inners?: CadPoint3[][];
  layer: string;
  context?: CadEntityContext;
}

/** Unión de los tipos que estrena el esquema 5. */
export type CadSchema5Entity = CadSolid3dEntity | CadRegionEntity;

/** Nombres de los tipos nuevos, para inventarios y validación. */
export const CAD_SCHEMA_5_ENTITY_TYPES = [
  "solid3d",
  "region",
] as const satisfies readonly CadSchema5Entity["type"][];
