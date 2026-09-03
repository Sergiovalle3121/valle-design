/**
 * Esquema 8: la LÁMINA y su VENTANA GRÁFICA, y la dirección desde la que mira.
 *
 * Estos dos tipos vivían dentro de `cad-document.ts`. Salen por las mismas dos
 * razones de siempre —el trinquete de tamaño y que este módulo sólo hace
 * `import type`, así que es una HOJA del grafo de carga y no puede cerrar un
 * ciclo— y por una tercera que es la que estrena esta ola: la ventana gráfica
 * deja de ser un recorte plano y pasa a tener CÁMARA, y eso ya no cabe en dos
 * líneas dentro del archivo que define el documento entero.
 *
 * ## El agujero que esto tapa
 *
 * Hasta el esquema 7 una `CadPaperViewport` era `{paperBounds, modelBounds,
 * scale, …}`: dos rectángulos y un número. Un rectángulo en el modelo sólo
 * puede significar UNA cosa —el trozo del plano XY que se ve—, así que TODA
 * ventana miraba en planta y no había forma de decir lo contrario. Con eso, un
 * alzado y un corte se dibujan a mano; y un corte que hay que redibujar a mano
 * no ahorra nada, que es justamente lo único que justifica que este producto
 * tenga 3D.
 *
 * ## Por qué NO se reutiliza `namedView`
 *
 * El esquema ya traía `namedView?: string` como gancho, y era el candidato
 * natural. No sirve, por dos razones que se ven en cuanto se intenta:
 *
 *  1. **Es una referencia sin destinatario.** `CadDocument` no tiene tabla de
 *     vistas con nombre: las vistas con nombre viven en los catálogos de
 *     SESIÓN (`CadSessionCatalogs`), que no viajan con el documento a
 *     propósito. Una lámina cuyo alzado depende de un catálogo de sesión abre
 *     en otro ordenador sin saber hacia dónde mira. Guardar la cámara POR
 *     VALOR es lo único que sobrevive al viaje por disco.
 *  2. **Un nombre no es un contrato.** Nada impide renombrar o redefinir la
 *     vista «ALZADO-SUR»; el día que alguien lo haga, la lámina trazada cambia
 *     sin que el documento haya cambiado. Eso es exactamente la vista
 *     silenciosamente mentirosa que el resto de esta ola existe para impedir.
 *
 * `namedView` se queda donde está y significa lo que siempre significó: de qué
 * vista con nombre salió el encuadre. `view` es la cámara, y manda.
 *
 * ## Qué NO cambia, y por eso un documento antiguo abre
 *
 * `modelBounds` sigue siendo el mismo rectángulo en el mismo sitio: el trozo
 * del plano XY del MODELO que la ventana enseña. La cámara no lo reinterpreta.
 * Una ventana de planta con `view` explícito enseña exactamente lo mismo que
 * enseñaba sin él — eso es lo que hace que la migración 7→8 no mueva un solo
 * píxel de ninguna lámina existente, y es lo que su spec mide.
 *
 * ## Y por qué la migración lo escribe SIEMPRE, incluso en las de planta
 *
 * Podría dejarse ausente en las plantas y ahorrarse unos bytes. No se hace:
 * con el campo opcional, «sin `view`» y «vista de planta» son la misma cosa en
 * el disco, y entonces cualquier código que lea la ventana tiene que ADIVINAR
 * —y adivinará «planta», que es lo que hace hoy—. Escribirlo siempre convierte
 * «esta ventana no declara desde dónde mira» en un estado imposible después de
 * abrir. Es fallo cerrado aplicado al esquema: el default deja de ser
 * implícito y pasa a estar escrito.
 */
import type { CadPoint3 } from "./cad-document";

/**
 * De qué clase es la vista. No es decoración: decide qué dibuja SOLDRAW.
 *
 * - `plan`: mirada perpendicular al plano de trabajo. Es lo que había.
 * - `elevation`: mirada horizontal. Perfil visible y oculto, sin sombreado.
 * - `section`: además hay un PLANO DE CORTE, y lo que queda por delante no se
 *   dibuja. La huella del corte se sombrea: es lo que la hace acotable.
 * - `detail`: ampliación de un trozo de otra vista. Misma cámara que su padre
 *   y otra escala; no es una proyección nueva, y por eso lleva `parentId`.
 */
export type CadViewportViewKind = "plan" | "elevation" | "section" | "detail";

export const CAD_VIEWPORT_VIEW_KINDS = [
  "plan",
  "elevation",
  "section",
  "detail",
] as const satisfies readonly CadViewportViewKind[];

/**
 * Plano de corte de una vista de sección: un punto y su normal, en el MUNDO.
 *
 * Tiene la misma forma que `CadSolidPlane` del esquema 5 —y es asignable a él—
 * pero se declara aquí para que este módulo siga sin importar nada en tiempo
 * de ejecución. La normal apunta hacia lo que se DESCARTA: lo que queda del
 * lado positivo del plano está delante del observador y estorba.
 */
export interface CadViewportSectionPlane {
  origin: CadPoint3;
  normal: CadPoint3;
}

/**
 * La CÁMARA de una ventana gráfica: desde dónde mira y con qué vertical.
 *
 * Sólo se admite proyección PARALELA, y está declarado en vez de asumido. Una
 * ventana en perspectiva no se puede acotar —dos cotas iguales miden distinto
 * según dónde caigan— y una lámina de obra existe para acotarse. El día que
 * haga falta una perspectiva de presentación, `projection` es donde entra, y
 * hasta entonces el campo dice la verdad sobre lo que hay.
 *
 * `direction` va del OJO hacia la escena, igual que `CadHiddenLineView` del
 * módulo de visibilidad de aristas, para que una se pueda pasar a la otra sin
 * cambiarle el signo por el camino — que es de donde salen los dibujos con
 * todas las aristas al revés.
 */
export interface CadViewportView {
  projection: "parallel";
  kind: CadViewportViewKind;
  /** Punto del mundo al que apunta la cámara. Ancla la vista en el modelo. */
  target: CadPoint3;
  /** Dirección de mirada, del ojo a la escena. No hace falta que sea unitaria. */
  direction: CadPoint3;
  /** Vertical del papel. No hace falta que sea perpendicular a `direction`. */
  up: CadPoint3;
  /** Sólo en `section`: por dónde corta. Sin esto, una sección no es una sección. */
  sectionPlane?: CadViewportSectionPlane;
}

/**
 * La vista de PLANTA: lo que toda ventana del esquema 7 significaba.
 *
 * Mirar hacia −Z con la Y del mundo hacia arriba proyecta `(x, y, z)` en
 * `(x, y)` — la identidad sobre el plano de dibujo. Ésa es la propiedad que
 * convierte la migración en algo demostrable en vez de plausible, y su spec la
 * mide punto a punto en vez de creérsela.
 */
export const CAD_VIEWPORT_PLAN_VIEW: CadViewportView = {
  projection: "parallel",
  kind: "plan",
  target: { x: 0, y: 0, z: 0 },
  direction: { x: 0, y: 0, z: -1 },
  up: { x: 0, y: 1, z: 0 },
};

/**
 * Estado de frescura de una vista derivada.
 *
 * `stale` NO significa «rota»: significa «lo que se ve se dibujó con un modelo
 * que ya no es el de ahora». Es información que el usuario necesita antes de
 * trazar, y por eso se declara en vez de resolverse en silencio.
 */
export type CadViewportDerivationStatus = "never-drawn" | "fresh" | "stale";

/** Sufijos de capa que SOLVIEW crea, en el orden en que se dibujan. */
/**
 * Las capas de una vista derivada.
 *
 * `ROT` —rótulos— entra con el defecto (d): el título de la vista con su
 * escala, la marca de corte y el globo de detalle. Va en su propia capa y no
 * en `-VIS` por la razón de siempre: para poder apagarla. Un juego de trabajo
 * se imprime sin rótulos y el definitivo con ellos, y es la misma lámina.
 */
export const CAD_SOLVIEW_LAYER_SUFFIXES = ["VIS", "HID", "HAT", "DIM", "ROT"] as const;

export type CadSolviewLayerSuffix = (typeof CAD_SOLVIEW_LAYER_SUFFIXES)[number];

/**
 * Lo que una vista derivada recuerda de la vez que se dibujó.
 *
 * ## Por qué `sourceDigest` y no una marca de tiempo ni un `dirty`
 *
 * Un `dirty: boolean` que alguien pone a `true` al editar falla ABIERTO: basta
 * con que una ruta de edición se olvide de ponerlo —y hay decenas: MOVE,
 * ROTATE, grips, deshacer, una fusión de documentos, un DXFIN— para que la
 * vista siga diciendo «fresca» mientras miente. El error no se ve: el corte
 * simplemente enseña el muro donde estaba.
 *
 * Una huella del modelo falla CERRADA. No hay nada que acordarse de llamar: se
 * vuelve a calcular la huella de lo que la vista ve AHORA y se compara con la
 * que se guardó. Si alguien editó por una ruta que nadie previó, la huella
 * cambia igual. Y si nadie editó nada relevante, no cambia — que es la otra
 * mitad del contrato, y la que impide que mover una silla del sótano ensucie
 * el alzado sur.
 *
 * La huella se calcula sobre las entidades que CONTRIBUYEN a esta vista, no
 * sobre el documento entero ni sobre una lista congelada de ids. Sobre el
 * documento entero, cualquier cambio ensuciaría todas las vistas. Sobre una
 * lista congelada, una entidad NUEVA dentro del encuadre no la ensuciaría
 * ninguna — que es fallar abierto por la puerta de atrás.
 */
export interface CadViewportDerivation {
  /** Prefijo de las capas generadas: `<base>-VIS`, `-HID`, `-HAT`, `-DIM`. */
  layerBase: string;
  /**
   * Encuadre de la vista, en coordenadas de la CÁMARA y relativo a su
   * objetivo.
   *
   * No es lo mismo que `modelBounds`, y confundirlos es el error que hay que
   * evitar: `modelBounds` dice DÓNDE se deja el dibujo derivado dentro del
   * modelo —una placa plana, que es lo único que el trazado 2D sabe leer— y
   * esto dice QUÉ TROZO del edificio entra en la vista. Del par sale la
   * traslación que lleva un punto proyectado a su sitio en la placa, y también
   * la respuesta a «¿esto que se ha movido sale en esta vista?».
   */
  window?: { x: number; y: number; width: number; height: number };
  /** Ventana de la que se deriva un `detail`, o la que orientó un `elevation`. */
  parentViewportId?: string;
  /** Huella del modelo contribuyente en el último SOLDRAW. */
  sourceDigest?: string;
  /**
   * Lo que SOLDRAW escribió, con la huella de cada trazo tal como lo dejó.
   *
   * La huella por entidad es lo que permite distinguir «esto lo generé yo y
   * nadie lo tocó» de «esto lo generé yo y el usuario lo ha editado». Lo
   * primero se puede rehacer sin preguntar; lo segundo NO, porque rehacerlo
   * borra trabajo humano sin avisar.
   */
  generated?: Array<{ id: string; digest: string }>;
  /**
   * `false` cuando la clasificación de aristas ocultas no es demostrablemente
   * exacta —cuerpo cóncavo—. Se declara en vez de callarse: un dibujo
   * aproximado que se presenta como exacto es peor que uno que avisa.
   */
  exactHiddenLines?: boolean;
  status?: CadViewportDerivationStatus;
}

/**
 * VENTANA GRÁFICA: un trozo del modelo sobre el papel, a una escala, con su
 * propia visibilidad de capas y —desde el esquema 8— su propia cámara.
 */
export interface CadPaperViewport {
  id: string;
  name?: string;
  paperBounds: { x: number; y: number; width: number; height: number };
  modelBounds: { x: number; y: number; width: number; height: number };
  scale: number;
  locked: boolean;
  /** Independent annotation scale for annotative content in this viewport. */
  annotationScale?: number;
  /** Optional named model view used to restore this viewport deterministically. */
  namedView?: string;
  /**
   * Desde dónde mira. Opcional en el TIPO porque un objeto recién construido a
   * mano puede no traerlo; después de `migrateCadDocument` no falta en
   * ninguna, y eso lo comprueba el censo del esquema 8.
   */
  view?: CadViewportView;
  /** Sólo en las ventanas que fabricó SOLVIEW. Ver `CadViewportDerivation`. */
  derivation?: CadViewportDerivation;
  layerVisibility?: Record<string, boolean>;
  layerOverrides?: Record<string, { color?: string; linetype?: string; lineweight?: number }>;
}

/**
 * La ventana de PLANTA que estrena toda lámina nueva.
 *
 * Es una fábrica de una línea, y existe por dos razones que apuntan al mismo
 * sitio. La primera es que `paper-space.ts` está en el trinquete de tamaño y
 * sólo puede encoger, así que el literal de diez líneas que tenía dentro se
 * viene aquí. La segunda es la que importa: la cámara se escribe YA, al crear
 * la lámina, y no al reabrir el documento. La migración 7→8 la pone en lo que
 * llega del disco, pero una lámina recién creada no pasa por esa puerta — sin
 * esto habría ventanas sin declarar hacia dónde miran durante toda la sesión
 * que las creó, que es justo el estado que el esquema 8 hace imposible.
 */
export function cadPlanViewport(
  id: string,
  paperBounds: CadPaperViewport["paperBounds"],
  modelBounds: CadPaperViewport["modelBounds"],
  scale: number,
): CadPaperViewport {
  return {
    id,
    name: "Model",
    paperBounds,
    modelBounds: { ...modelBounds },
    scale,
    locked: true,
    view: { ...CAD_VIEWPORT_PLAN_VIEW },
  };
}

export interface CadPaperSpace {
  id: string;
  name: string;
  entityIds: string[];
  order?: number;
  includeInPublish?: boolean;
  page: {
    width: number;
    height: number;
    unit: "mm" | "in";
    orientation: "portrait" | "landscape";
  };
  pageSetup?: {
    paper: "A4" | "A3" | "A2" | "A1" | "A0" | "letter" | "tabloid" | "custom";
    margins: { top: number; right: number; bottom: number; left: number };
    colorMode: "color" | "monochrome";
    lineweightScale: number;
  };
  viewports?: CadPaperViewport[];
  titleBlock?: {
    block?: string;
    attributes: Record<string, string>;
  };
}
