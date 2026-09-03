/**
 * LO QUE CONVIERTE UN JUEGO DE PROYECCIONES EN UN JUEGO DE PLANOS.
 *
 * ## El defecto que cierra, medido
 *
 * `docs/competitive/distancia-autocad-completo-20260901.md`, defecto (d) del
 * área «de 3D a documentación»:
 *
 *     no hay marca de corte, ni rótulo de vista con escala, ni corte
 *     quebrado, ni globo de detalle (el detalle es un ×2 fijo)
 *
 * Sin rótulo, una lámina con cuatro ventanas es un acertijo: cuál es la planta
 * baja, cuál el alzado norte y a qué escala está cada una. Sin marca de corte,
 * el corte A-A existe pero NADIE puede saber por dónde pasa — que es la única
 * información que un corte no puede llevar dentro de sí mismo. Y sin globo de
 * detalle, un detalle es un dibujo sin sitio: enseña una esquina de algo que no
 * dice de dónde sale.
 *
 * Nada de esto es decoración. Es lo que hace que una lámina se pueda LEER, y es
 * lo que separa «el programa sabe proyectar» de «el programa entrega planos».
 *
 * ## Dónde cae cada cosa, y por qué la marca va en la capa del PADRE
 *
 * El rótulo va bajo la placa de SU vista, en `<base>-ROT`. La marca de corte y
 * el globo de detalle van sobre la placa de la vista PADRE —la planta— porque
 * ahí es donde tienen sentido: dicen por dónde se cortó ese plano.
 *
 * Y por eso van en la capa `-ROT` DEL PADRE aunque las genere el hijo: cada
 * ventana congela las capas de las demás vistas (`solview.ts`), así que una
 * marca en la capa del corte sería invisible justo en la ventana donde tiene
 * que verse. La PROPIEDAD es del hijo —lleva su marca de metadatos y se rehace
 * cuando el corte se redibuja, que es lo que hace que la marca siga al corte—;
 * la CAPA es del padre, que es donde se mira. Son dos cosas distintas y aquí se
 * distinguen a propósito.
 *
 * ## Los tamaños son de PAPEL, no de modelo
 *
 * Un rótulo de 5 mm es 5 mm en la hoja impresa, mida el edificio lo que mida.
 * Como el dibujo derivado vive en una placa del espacio modelo, la altura en
 * unidades de dibujo es `5 × escala`: a 1:50 son 250 unidades. Fijar la altura
 * en unidades de modelo daría un rótulo microscópico en una nave y gigante en
 * una pieza — y ninguno de los dos se imprime bien.
 */
import type { CadPaperViewport, CadPoint2 } from "../cad-document";
import type { CadNativeEntity } from "../entity-runtime";
import { cadSolviewLayerName } from "./solview";
import { cadViewportProjectPoint, cadViewportViewFrame } from "./viewport-view";

/** Altura del título de la vista sobre el PAPEL, en milímetros. */
export const CAD_SOLVIEW_TITLE_MM = 5;
/** Altura del renglón de escala sobre el PAPEL, en milímetros. */
export const CAD_SOLVIEW_SCALE_MM = 3;
/** Separación entre la placa y su rótulo, sobre el PAPEL. */
export const CAD_SOLVIEW_LABEL_GAP_MM = 6;
/** Radio del globo de detalle sobre el PAPEL. */
export const CAD_SOLVIEW_BUBBLE_MM = 6;
/** Longitud del rabillo y de la flecha de una marca de corte, sobre el PAPEL. */
export const CAD_SOLVIEW_MARK_MM = 8;

/** Cómo se llama cada clase de vista en el rótulo. En español, como el plano. */
const KIND_WORD: Record<string, string> = {
  plan: "PLANTA",
  elevation: "ALZADO",
  section: "CORTE",
  detail: "DETALLE",
};

/**
 * La escala escrita como se escribe en un plano.
 *
 * `viewport.scale` son unidades de modelo por unidad de papel: 50 es 1:50. Una
 * ampliación —un detalle a 2 unidades de papel por unidad de modelo— es 0,5, y
 * se escribe 2:1, que es como se lee. Se redondea a entero cuando cae en uno
 * porque «1:50,0000001» en un cajetín es un error de imprenta.
 */
export function cadSolviewScaleText(scale: number): string {
  if (!(scale > 0) || !Number.isFinite(scale)) return "ESC. INDETERMINADA";
  const round = (value: number) => {
    const entero = Math.round(value);
    return Math.abs(value - entero) < 1e-6 ? `${entero}` : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  };
  return scale >= 1 ? `ESC. 1:${round(scale)}` : `ESC. ${round(1 / scale)}:1`;
}

/**
 * El título de la vista: «CORTE A-A», «ALZADO NORTE», «PLANTA BAJA».
 *
 * Un corte se rotula con su letra REPETIDA —A-A— porque una marca de corte
 * tiene dos extremos y cada uno lleva la misma letra: el rótulo del corte es la
 * pareja. Sólo se duplica cuando el nombre es corto (una o dos letras), que es
 * cuando de verdad es una letra de corte; «CORTE POR LA ESCALERA-POR LA
 * ESCALERA» sería absurdo.
 */
export function cadSolviewViewTitle(kind: string, name: string): string {
  const word = KIND_WORD[kind] ?? "VISTA";
  const limpio = name.trim().toUpperCase();
  if (!limpio) return word;
  if (kind === "section" && limpio.length <= 2) return `${word} ${limpio}-${limpio}`;
  return `${word} ${limpio}`;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Marca de metadatos que ata lo generado a la ventana que lo produjo. */
type Mark = { metadata: Record<string, string> };

interface LabelInput {
  viewport: CadPaperViewport;
  /** Placa donde vive el dibujo derivado de ESTA vista. */
  plate: Rect;
  layerBase: string;
  mark: Mark;
  newEntityId: () => string;
}

/**
 * El rótulo bajo la vista: título, subrayado y escala.
 *
 * Se centra sobre la placa y se cuelga por debajo. Va como MTEXT con
 * `alignment: "top-center"` en vez de dos TEXT colocados a ojo: un TEXT no
 * tiene punto de alineación en este esquema, así que centrarlo obligaría a
 * ESTIMAR el ancho del texto — y una estimación de ancho es un rótulo
 * descentrado en cuanto alguien cambia la fuente.
 */
export function cadSolviewLabelEntities(input: LabelInput): CadNativeEntity[] {
  const { viewport, plate, layerBase, mark, newEntityId } = input;
  const escala = viewport.scale > 0 ? viewport.scale : 1;
  const alturaTitulo = CAD_SOLVIEW_TITLE_MM * escala;
  const alturaEscala = CAD_SOLVIEW_SCALE_MM * escala;
  const hueco = CAD_SOLVIEW_LABEL_GAP_MM * escala;
  const centro = plate.x + plate.width / 2;
  const arriba = plate.y - hueco;
  const layer = cadSolviewLayerName(layerBase, "ROT");
  const titulo = cadSolviewViewTitle(viewport.view?.kind ?? "", viewport.name ?? layerBase);

  const subrayadoY = arriba - alturaTitulo * 1.25;
  // El subrayado se dimensiona con el TÍTULO y no con el texto medido: no hay
  // métrica de fuente aquí, y un subrayado que se pasa un poco se lee como el
  // subrayado de un plano. Uno que se queda corto se lee como un error.
  const medio = Math.max(titulo.length * alturaTitulo * 0.32, plate.width * 0.2);

  return [
    {
      id: newEntityId(),
      type: "mtext",
      insertion: { x: centro, y: arriba, z: 0 },
      text: titulo,
      height: alturaTitulo,
      alignment: "top-center",
      paragraphAlignment: "center",
      layer,
      context: mark,
    },
    {
      id: newEntityId(),
      type: "line",
      start: { x: centro - medio, y: subrayadoY, z: 0 },
      end: { x: centro + medio, y: subrayadoY, z: 0 },
      layer,
      context: mark,
    },
    {
      id: newEntityId(),
      type: "mtext",
      insertion: { x: centro, y: subrayadoY - alturaEscala * 0.5, z: 0 },
      text: cadSolviewScaleText(escala),
      height: alturaEscala,
      alignment: "top-center",
      paragraphAlignment: "center",
      layer,
      context: mark,
    },
  ] as CadNativeEntity[];
}

interface ParentInput {
  /** La ventana PADRE: la planta sobre la que se marca. */
  parent: CadPaperViewport;
  /** La ventana HIJA que genera la marca —el corte o el detalle—. */
  child: CadPaperViewport;
  mark: Mark;
  newEntityId: () => string;
}

/** Lleva un punto del MUNDO a su sitio dentro de la placa de la ventana padre. */
function ontoParent(point: { x: number; y: number; z: number }, parent: CadPaperViewport): CadPoint2 | null {
  const view = parent.view;
  const window = parent.derivation?.window;
  if (!view || !window) return null;
  const outcome = cadViewportViewFrame(view);
  if (!outcome.ok) return null;
  const projected = cadViewportProjectPoint(point, outcome.frame);
  return {
    x: parent.modelBounds.x + (projected.x - window.x),
    y: parent.modelBounds.y + (projected.y - window.y),
  };
}

/**
 * LA MARCA DE CORTE sobre la planta: por dónde pasa el plano y hacia dónde se
 * mira.
 *
 * El segmento no sale de los dos puntos que se picaron —que no se guardan— sino
 * del propio plano de corte y del ANCHO de lo que el corte enseña: origen del
 * plano, dirección perpendicular a su normal, y la longitud de la ventana del
 * corte. Es más fiel que recordar el clic: si el corte se reencuadra, la marca
 * se reencuadra con él, porque describe lo que el plano REALMENTE muestra.
 *
 * Se dibuja como lo dibuja un delineante: la línea de corte, un rabillo
 * perpendicular en cada extremo apuntando hacia donde se mira, la punta de
 * flecha, y la letra. Sin la flecha, la marca no dice de qué lado se mira, y un
 * corte visto del revés es un plano equivocado que parece correcto.
 */
export function cadSolviewSectionMark(input: ParentInput): CadNativeEntity[] {
  const { parent, child, mark, newEntityId } = input;
  const view = child.view;
  const plane = view?.kind === "section" ? view.sectionPlane : undefined;
  const window = child.derivation?.window;
  if (!plane || !window) return [];

  // La normal apunta HACIA el observador. La línea de corte es perpendicular a
  // ella dentro del plano horizontal; se toma el producto con la Z del mundo,
  // que es la vertical del edificio.
  const largo = Math.hypot(plane.normal.x, plane.normal.y);
  if (!(largo > 1e-9)) return [];
  const nx = plane.normal.x / largo;
  const ny = plane.normal.y / largo;
  const dx = -ny;
  const dy = nx;
  const mitad = window.width / 2;
  const a = { x: plane.origin.x - dx * mitad, y: plane.origin.y - dy * mitad, z: plane.origin.z };
  const b = { x: plane.origin.x + dx * mitad, y: plane.origin.y + dy * mitad, z: plane.origin.z };

  const pa = ontoParent(a, parent);
  const pb = ontoParent(b, parent);
  // Un punto de la normal, para saber hacia dónde cae «delante» YA en el papel
  // del padre: la dirección de mirada no se puede transportar como vector
  // porque la cámara del padre puede girarla.
  const pn = ontoParent({ x: a.x + nx, y: a.y + ny, z: a.z }, parent);
  if (!pa || !pb || !pn) return [];
  const hacia = { x: pn.x - pa.x, y: pn.y - pa.y };
  const modulo = Math.hypot(hacia.x, hacia.y);
  if (!(modulo > 1e-9)) return [];
  const escala = parent.scale > 0 ? parent.scale : 1;
  const rabillo = CAD_SOLVIEW_MARK_MM * escala;
  const ux = (hacia.x / modulo) * rabillo;
  const uy = (hacia.y / modulo) * rabillo;
  const layer = cadSolviewLayerName(parent.derivation?.layerBase ?? "", "ROT");
  const letra = (child.name ?? "").trim().toUpperCase() || "A";

  const linea = (from: CadPoint2, to: CadPoint2): CadNativeEntity => ({
    id: newEntityId(),
    type: "line",
    start: { x: from.x, y: from.y, z: 0 },
    end: { x: to.x, y: to.y, z: 0 },
    layer,
    context: mark,
  }) as CadNativeEntity;

  const entities: CadNativeEntity[] = [linea(pa, pb)];
  for (const extremo of [pa, pb]) {
    const punta = { x: extremo.x + ux, y: extremo.y + uy };
    entities.push(linea(extremo, punta));
    // La punta de flecha: dos alas a 30° del rabillo, del cuarto de su largo.
    for (const signo of [1, -1]) {
      const angulo = Math.atan2(uy, ux) + Math.PI + (signo * Math.PI) / 6;
      entities.push(
        linea(punta, {
          x: punta.x + Math.cos(angulo) * rabillo * 0.35,
          y: punta.y + Math.sin(angulo) * rabillo * 0.35,
        }),
      );
    }
    entities.push({
      id: newEntityId(),
      type: "mtext",
      insertion: { x: punta.x + ux * 0.6, y: punta.y + uy * 0.6, z: 0 },
      text: letra,
      height: CAD_SOLVIEW_TITLE_MM * escala,
      alignment: "middle-center",
      paragraphAlignment: "center",
      layer,
      context: mark,
    } as CadNativeEntity);
  }
  return entities;
}

/**
 * EL GLOBO DE DETALLE sobre la vista padre: qué trozo se amplía y con qué
 * nombre.
 *
 * El círculo encierra la ventana del detalle —no un radio fijo—, así que quien
 * mira la planta ve EXACTAMENTE el trozo que el detalle enseña. Un globo de
 * tamaño fijo que no coincide con lo ampliado es peor que ninguno: manda a
 * buscar una esquina que no está.
 */
export function cadSolviewDetailBubble(input: ParentInput): CadNativeEntity[] {
  const { parent, child, mark, newEntityId } = input;
  const window = child.derivation?.window;
  const parentWindow = parent.derivation?.window;
  if (!window || !parentWindow) return [];

  // La ventana del detalle está en coordenadas de la CÁMARA, la misma que la
  // del padre —un detalle no cambia de cámara, sólo se acerca—, así que su
  // centro se lleva a la placa del padre por la misma traslación.
  const centro = {
    x: parent.modelBounds.x + (window.x + window.width / 2 - parentWindow.x),
    y: parent.modelBounds.y + (window.y + window.height / 2 - parentWindow.y),
  };
  const radio = Math.max(window.width, window.height) / 2;
  if (!(radio > 0)) return [];
  const escala = parent.scale > 0 ? parent.scale : 1;
  const layer = cadSolviewLayerName(parent.derivation?.layerBase ?? "", "ROT");
  const nombre = (child.name ?? "").trim().toUpperCase() || "1";

  return [
    {
      id: newEntityId(),
      type: "circle",
      center: { x: centro.x, y: centro.y, z: 0 },
      radius: radio,
      layer,
      context: mark,
    },
    {
      id: newEntityId(),
      type: "mtext",
      insertion: { x: centro.x, y: centro.y + radio + CAD_SOLVIEW_BUBBLE_MM * escala, z: 0 },
      text: nombre,
      height: CAD_SOLVIEW_TITLE_MM * escala,
      alignment: "middle-center",
      paragraphAlignment: "center",
      layer,
      context: mark,
    },
  ] as CadNativeEntity[];
}
