/**
 * LA propiedad del producto que esta ola vende: un comentario vive en un PUNTO
 * del dibujo y se queda ahí al panear y al hacer zoom. Aquí se comprueba
 * contra la proyección real del editor (`cadViewWorldToScreen`), no contra una
 * aritmética paralela que podría divergir de la cámara sin que nadie lo viera.
 */
import assert from "node:assert/strict";
import {
  cadViewFromViewport,
  cadViewPanByPixels,
  cadViewScreenToWorld,
  cadViewWorldToScreen,
  cadViewZoomAtCursor,
  type CadView,
} from "../view/cad-view";
import {
  CAD_COLLAB_EDGE_MARGIN_PX,
  cadViewportWorldBounds,
  placeCadCommentPins,
  placeCadPeerCursors,
  type CadCommentPin,
} from "./overlay-model";
import { cadPeerColor, type CadPresencePeer } from "./presence";

let checks = 0;
const ok = (condition: boolean, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

const size = { widthPx: 1_200, heightPx: 800 };
const projector = (view: CadView) => (point: { x: number; y: number }) =>
  cadViewWorldToScreen(view, point);

const base = cadViewFromViewport(size.widthPx, size.heightPx, 5_000, 4_000, 0.05);

const pins: CadCommentPin[] = [
  { id: "c1", world: { x: 5_000, y: 4_000 }, resolved: false, ordinal: 1 },
  { id: "c2", world: { x: 8_000, y: 6_000 }, resolved: true, ordinal: 2 },
];

// ── El centro del encuadre cae en el centro del lienzo ──────────────────────
const centred = placeCadCommentPins(projector(base), size, pins);
ok(centred.length === 2, "las dos chinchetas se colocan");
ok(
  Math.abs(centred[0].x - size.widthPx / 2) < 1e-9 &&
    Math.abs(centred[0].y - size.heightPx / 2) < 1e-9,
  "el punto centrado cae en el centro del lienzo",
);
ok(!centred[0].offscreen, "lo que está dentro no se marca como fuera");

// ── LA propiedad: la chincheta se queda pegada a su coordenada ──────────────
// El dibujo se arrastra 137 px a la derecha y 61 hacia abajo: la chincheta
// tiene que recorrer EXACTAMENTE eso, no «aproximadamente». Un desfase de dos
// píxeles por gesto es invisible en un paneo y deja la nota sobre el tabique
// de al lado después de diez.
const panned = cadViewPanByPixels(base, 137, 61);
const afterPan = placeCadCommentPins(projector(panned), size, pins);
ok(
  Math.abs(afterPan[0].x - (centred[0].x + 137)) < 1e-6 &&
    Math.abs(afterPan[0].y - (centred[0].y + 61)) < 1e-6,
  "al panear, la chincheta acompaña al dibujo píxel a píxel",
);

// Zoom con el cursor sobre la propia chincheta: el punto bajo el cursor no se
// mueve, que es la definición de «zoom en el cursor». Si la chincheta se
// desplazara aquí, dejaría de señalar lo que señalaba.
const zoomAnchor = centred[0];
const zoomed = cadViewZoomAtCursor(base, zoomAnchor.x, zoomAnchor.y, 4);
const afterZoom = placeCadCommentPins(projector(zoomed), size, pins);
ok(
  Math.abs(afterZoom[0].x - zoomAnchor.x) < 1e-6 &&
    Math.abs(afterZoom[0].y - zoomAnchor.y) < 1e-6,
  "al hacer zoom sobre la chincheta, la chincheta no se mueve",
);
// Y la OTRA se aleja: si las dos se quedasen quietas, la proyección estaría
// ignorando el zoom y este spec pasaría vacío.
ok(
  Math.hypot(afterZoom[1].x - centred[1].x, afterZoom[1].y - centred[1].y) > 100,
  "el zoom sí mueve lo que no está bajo el cursor",
);

// ── Fuera de pantalla: se pega al borde, marcada ────────────────────────────
const far: CadCommentPin[] = [
  { id: "lejos", world: { x: 500_000, y: 4_000 }, resolved: false, ordinal: 9 },
];
const edge = placeCadCommentPins(projector(base), size, far);
ok(edge.length === 1, "una chincheta fuera del encuadre NO desaparece");
ok(edge[0].offscreen, "y se declara como fuera de pantalla");
ok(
  edge[0].x === size.widthPx - CAD_COLLAB_EDGE_MARGIN_PX,
  "pegada al borde por el que se salió",
);
ok(
  edge[0].y > 0 && edge[0].y < size.heightPx,
  "el marcador de borde queda dentro del lienzo",
);

// ── Lo que no se puede colocar, no se coloca ────────────────────────────────
const nanProjector = () => ({ x: Number.NaN, y: 0 });
ok(
  placeCadCommentPins(nanProjector, size, pins).length === 0,
  "una proyección no finita descarta la chincheta en vez de mandarla al (0,0)",
);
ok(
  placeCadCommentPins(projector(base), { widthPx: 0, heightPx: 0 }, pins).length === 0,
  "sin lienzo medido no se coloca nada",
);

// ── Cursores ajenos ─────────────────────────────────────────────────────────
const peers: CadPresencePeer[] = [
  {
    peerId: "p1",
    documentId: "d",
    name: "Ana",
    at: 1,
    cursor: { x: 5_000, y: 4_000 },
    viewport: null,
    guest: false,
    color: cadPeerColor("p1"),
    receivedAt: 1,
  },
  {
    peerId: "p2",
    documentId: "d",
    name: "Sin cursor",
    at: 1,
    cursor: null,
    viewport: null,
    guest: true,
    color: cadPeerColor("p2"),
    receivedAt: 1,
  },
];
const cursors = placeCadPeerCursors(projector(base), size, peers);
ok(cursors.length === 1, "sólo se pinta el cursor de quien tiene cursor");
ok(cursors[0].peerId === "p1" && cursors[0].color === cadPeerColor("p1"), "lleva su color");

// ── Qué estoy mirando ───────────────────────────────────────────────────────
const bounds = cadViewportWorldBounds(
  (x, y) => cadViewScreenToWorld(base, x, y),
  size,
);
ok(!!bounds, "el encuadre visible se deriva de las cuatro esquinas");
ok(
  !!bounds &&
    bounds.minX < 5_000 &&
    bounds.maxX > 5_000 &&
    bounds.minY < 4_000 &&
    bounds.maxY > 4_000,
  "y contiene el centro de la vista",
);
ok(
  cadViewportWorldBounds(() => null, size) === null,
  "sin esquinas proyectables no se afirma un encuadre",
);

console.log(`ok collab overlay-model: ${checks} comprobaciones`);
