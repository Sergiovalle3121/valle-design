/**
 * Controlador del arrastre de grips nativos — extraído del monolito con
 * PARIDAD en el camino por defecto, y AMPLIADO con lo que `grip-actions.ts`
 * tenía escrito y probado sin un solo consumidor: el ciclo con Espacio y el
 * menú por pinzamiento (hot grip).
 *
 * ## Qué conserva exactamente igual
 *
 * Un arrastre normal (pinchar un grip, mover, soltar) produce lo mismo que
 * producía el bloque del monolito: preview por mutación directa del documento
 * cargado, y al soltar UN `recordHistory(checkpoint)` + regeneración de
 * sombreados asociativos + UN `commitChange` con la etiqueta
 * `grip:{entityId}:{gripId}`.
 *
 * ## Qué añade
 *
 * - **Espacio cicla** la acción del grip sin soltar el ratón (estirar →
 *   añadir vértice → quitar vértice → arco/recto…), con insignia junto al
 *   cursor. Las acciones no-default se aplican SIEMPRE desde el checkpoint
 *   (aplicar «añadir vértice» sobre la preview anterior añadiría un vértice
 *   por fotograma) y salen por el embudo canónico (`commitCommands`) con la
 *   clave de agrupación de `cadGripDragGroupKey`.
 * - **Clic sin arrastre abre el menú** con las acciones del grip. Elegir una
 *   que no necesita punto (quitar vértice, convertir en recto) commitea al
 *   instante; una que sí lo necesita deja el arrastre PENDIENTE: mover
 *   previsualiza, el siguiente clic confirma, Escape cancela.
 *
 * El estado vive fuera de React (patrón de `pointer-router.ts`): el
 * controlador nace y muere con el lienzo THREE y no aporta ni un `useState`.
 */
import type { CadDocument, CadPoint2 } from "@/lib/cad/cad-document";
import { commitChange } from "@/lib/cad/cad-document";
import {
  CAD_ENTITY_REGISTRY,
  cadEntityBoundaryPaths,
  type CadNativeEntity,
  type CadScenePatch,
} from "@/lib/cad/entity-runtime";
import { regenerateAssociativeHatches } from "@/lib/cad/hatch-associativity";
import type { CadEntityCommand } from "@/lib/cad/entity-commands";
import {
  activeCadGripAction,
  applyCadGripSession,
  beginCadGripSession,
  cadGripDragGroupKey,
  cycleCadGripSession,
  type CadGripAction,
  type CadGripActionKind,
  type CadGripSession,
} from "@/lib/cad/grip-actions";

/** Evento estructural: en Node (spec) no hay PointerEvent. */
export interface CadGripPointerEventLike {
  pointerId: number;
  clientX: number;
  clientY: number;
}

/** Lo que implementa `grip-menu-host.tsx`; en Node se falsea. */
export interface CadGripMenuSurface {
  open(x: number, y: number, actions: readonly CadGripAction[]): void;
  close(): void;
  readonly isOpen: boolean;
  showBadge(x: number, y: number, action: CadGripAction): void;
  hideBadge(): void;
}

export interface CadNativeGripDeps {
  document(): CadDocument | null;
  setDocument(document: CadDocument): void;
  snapshotDocument(): CadDocument;
  readOnly(): boolean;
  worldPoint(event: CadGripPointerEventLike): { wx: number; wy: number } | null;
  snapPoint(wx: number, wy: number): { wx: number; wy: number };
  localPoint(event: CadGripPointerEventLike): { x: number; y: number };
  selectNative(ids: string[]): void;
  setNativeEntities(entities: CadNativeEntity[]): void;
  bumpDocumentRevision(): void;
  syncScene(document?: CadDocument, patch?: CadScenePatch): void;
  recordHistory(document: CadDocument, groupKey?: string): void;
  markDirty(): void;
  commitCommands(commands: CadEntityCommand[], groupKey?: string): boolean;
  setOrbitEnabled(enabled: boolean): void;
  capturePointer(pointerId: number): void;
  releasePointer(pointerId: number): void;
  notify(message: string): void;
  menu: CadGripMenuSurface;
}

type GripPhase = "drag" | "menu" | "pending";

interface GripState {
  phase: GripPhase;
  session: CadGripSession;
  checkpoint: CadDocument;
  moved: boolean;
  /** Desde que se cicla, la preview se recalcula SIEMPRE desde el checkpoint. */
  cycled: boolean;
  pointerId: number;
  lastPoint: CadPoint2 | null;
}

export class CadNativeGripController {
  private state: GripState | null = null;

  constructor(private readonly deps: CadNativeGripDeps) {}

  get active(): boolean {
    return this.state !== null;
  }

  /** pointerdown sobre un marcador con `userData.nativeGripId`. */
  start(entityId: string, gripId: string, event: CadGripPointerEventLike): boolean {
    if (this.deps.readOnly()) return false;
    const document = this.deps.document();
    const entity = document?.entities.find((candidate) => candidate.id === entityId);
    if (!document || !entity || !CAD_ENTITY_REGISTRY.supports(entity)) return false;
    this.deps.selectNative([entityId]);
    // Un gripId que `cadGripActions` no conoce sigue arrastrando: la sesión de
    // reserva sólo estira, que es exactamente lo que hacía el monolito.
    const session: CadGripSession = beginCadGripSession(entity, gripId) ?? {
      entityId,
      gripId,
      actions: [{ kind: "stretch", label: "Estirar", needsPoint: true }],
      index: 0,
    };
    this.state = {
      phase: "drag",
      session,
      checkpoint: this.deps.snapshotDocument(),
      moved: false,
      cycled: false,
      pointerId: event.pointerId,
      lastPoint: null,
    };
    this.deps.setOrbitEnabled(false);
    this.deps.capturePointer(event.pointerId);
    return true;
  }

  /** pointerdown en el lienzo: cierra el menú o CONFIRMA el modo pendiente. */
  handlePointerDown(event: CadGripPointerEventLike): boolean {
    const state = this.state;
    if (!state) return false;
    if (state.phase === "menu") {
      this.dismissMenu();
      return true;
    }
    if (state.phase === "pending") {
      const world = this.deps.worldPoint(event);
      if (world) {
        const snapped = this.deps.snapPoint(world.wx, world.wy);
        state.lastPoint = { x: snapped.wx, y: snapped.wy };
      }
      this.commitAction(state);
      this.finish(state);
      return true;
    }
    return false;
  }

  handlePointerMove(event: CadGripPointerEventLike): boolean {
    const state = this.state;
    if (!state || state.phase === "menu") return false;
    this.lastLocalPoint = this.deps.localPoint(event);
    const world = this.deps.worldPoint(event);
    if (!world) return true;
    const snapped = this.deps.snapPoint(world.wx, world.wy);
    state.lastPoint = { x: snapped.wx, y: snapped.wy };
    const action = activeCadGripAction(state.session);
    if ((action.kind === "stretch" || action.kind === "move") && !state.cycled) {
      // Camino por defecto: mutación directa del documento ACTUAL, como el
      // bloque original del monolito.
      const document = this.deps.document();
      const entity = document?.entities.find(
        (candidate) => candidate.id === state.session.entityId,
      );
      if (!document || !entity || !CAD_ENTITY_REGISTRY.supports(entity)) return true;
      const next = CAD_ENTITY_REGISTRY.adapter(entity).grips.moveGrip(
        entity,
        state.session.gripId,
        state.lastPoint,
      );
      this.publishPreview(document, next);
      state.moved = true;
    } else {
      // Acción ciclada: SIEMPRE desde el checkpoint, nunca acumulativa.
      const base = this.checkpointEntity(state);
      if (!base) return true;
      const outcome = applyCadGripSession(state.session, base, state.lastPoint);
      if (!("error" in outcome)) {
        const next = this.previewEntity(base, outcome.commands[0]);
        if (next) {
          this.publishPreview(state.checkpoint, next);
          state.moved = true;
        }
      }
      const local = this.deps.localPoint(event);
      this.deps.menu.showBadge(local.x, local.y, action);
    }
    return true;
  }

  handlePointerUp(event: CadGripPointerEventLike): boolean {
    const state = this.state;
    if (!state || state.phase !== "drag") return false;
    this.lastLocalPoint = this.deps.localPoint(event);
    const action = activeCadGripAction(state.session);
    if (!state.moved) {
      // Clic sin arrastre = grip caliente: menú con las acciones del grip.
      // Con una sola acción no hay nada que elegir y el gesto no hace nada,
      // exactamente como antes.
      this.deps.releasePointer(state.pointerId);
      if (state.session.actions.length > 1) {
        state.phase = "menu";
        const anchor = this.lastLocalPoint;
        this.deps.menu.open(anchor.x, anchor.y, state.session.actions);
        return true;
      }
      this.finish(state);
      return true;
    }
    if ((action.kind === "stretch" || action.kind === "move") && !state.cycled) {
      this.commitDefault(state);
    } else {
      this.commitAction(state);
    }
    this.finish(state);
    return true;
  }

  /** Espacio cicla; Escape cierra el menú o cancela el modo pendiente. */
  keyDown(event: { key: string; preventDefault(): void }): boolean {
    const state = this.state;
    if (!state) return false;
    if (state.phase === "menu") {
      if (event.key === "Escape") {
        this.dismissMenu();
        return true;
      }
      return false;
    }
    if (event.key === " ") {
      if (state.session.actions.length < 2) return false;
      state.session = cycleCadGripSession(state.session);
      state.cycled = true;
      // Re-previsualizar en el último punto conocido, desde el checkpoint.
      if (state.lastPoint) {
        const base = this.checkpointEntity(state);
        if (base) {
          const outcome = applyCadGripSession(state.session, base, state.lastPoint);
          if (!("error" in outcome)) {
            const next = this.previewEntity(base, outcome.commands[0]);
            if (next) this.publishPreview(state.checkpoint, next);
          } else {
            this.restorePreview(state.checkpoint);
          }
        }
      }
      if (this.lastLocalPoint)
        this.deps.menu.showBadge(
          this.lastLocalPoint.x,
          this.lastLocalPoint.y,
          activeCadGripAction(state.session),
        );
      event.preventDefault();
      return true;
    }
    if (event.key === "Escape" && state.phase === "pending") {
      this.restorePreview(state.checkpoint);
      this.finish(state);
      return true;
    }
    return false;
  }

  chooseMenuAction(kind: CadGripActionKind): void {
    const state = this.state;
    if (!state || state.phase !== "menu") return;
    const index = state.session.actions.findIndex((action) => action.kind === kind);
    if (index < 0) return;
    state.session = { ...state.session, index };
    state.cycled = index !== 0;
    this.deps.menu.close();
    const action = activeCadGripAction(state.session);
    if (!action.needsPoint) {
      state.lastPoint = null;
      this.commitAction(state);
      this.finish(state);
      return;
    }
    // Necesita punto: el arrastre queda PENDIENTE — mover previsualiza, el
    // siguiente clic confirma, Escape cancela.
    state.phase = "pending";
    state.moved = false;
  }

  dismissMenu(): void {
    const state = this.state;
    if (!state) return;
    this.deps.menu.close();
    this.restorePreview(state.checkpoint);
    this.finish(state);
  }

  dispose(): void {
    const state = this.state;
    if (state) {
      this.deps.menu.close();
      this.deps.menu.hideBadge();
      this.state = null;
    }
  }

  // -------------------------------------------------------------------------

  /** Última posición local del puntero, para colocar menú e insignia. */
  private lastLocalPoint: { x: number; y: number } = { x: 0, y: 0 };

  private checkpointEntity(state: GripState): CadNativeEntity | null {
    const entity = state.checkpoint.entities.find(
      (candidate) => candidate.id === state.session.entityId,
    );
    return entity && CAD_ENTITY_REGISTRY.supports(entity) ? entity : null;
  }

  private previewEntity(
    base: CadNativeEntity,
    command: CadEntityCommand,
  ): CadNativeEntity | null {
    if (command.type === "replace") return command.entity;
    if (command.type === "grip")
      return CAD_ENTITY_REGISTRY.adapter(base).grips.moveGrip(
        base,
        command.gripId,
        command.point,
      );
    if (command.type === "properties")
      return CAD_ENTITY_REGISTRY.adapter(base).properties.write(base, command.patch);
    return null;
  }

  private publishPreview(baseDocument: CadDocument, next: CadNativeEntity): void {
    const nextDocument = {
      ...baseDocument,
      entities: baseDocument.entities.map((candidate) =>
        candidate.id === next.id ? next : candidate,
      ),
    };
    this.deps.setDocument(nextDocument);
    this.deps.setNativeEntities(
      nextDocument.entities.filter((candidate): candidate is CadNativeEntity =>
        CAD_ENTITY_REGISTRY.supports(candidate),
      ),
    );
    this.deps.bumpDocumentRevision();
    this.deps.syncScene(nextDocument, { upsert: [next], remove: [] });
  }

  private restorePreview(checkpoint: CadDocument): void {
    this.deps.setDocument(checkpoint);
    this.deps.setNativeEntities(
      checkpoint.entities.filter((candidate): candidate is CadNativeEntity =>
        CAD_ENTITY_REGISTRY.supports(candidate),
      ),
    );
    this.deps.bumpDocumentRevision();
    this.deps.syncScene(checkpoint);
  }

  /** Copia exacta del commit del monolito: historia, asociativos, commitChange. */
  private commitDefault(state: GripState): void {
    const document = this.deps.document();
    if (!document) return;
    this.deps.recordHistory(state.checkpoint);
    const regenerated = regenerateAssociativeHatches(
      document.entities,
      [state.session.entityId],
      (entity) => cadEntityBoundaryPaths(entity),
    );
    const committed = commitChange(
      { ...document, entities: regenerated.entities },
      `grip:${state.session.entityId}:${state.session.gripId}`,
    );
    this.deps.setDocument(committed);
    this.deps.setNativeEntities(
      committed.entities.filter((candidate): candidate is CadNativeEntity =>
        CAD_ENTITY_REGISTRY.supports(candidate),
      ),
    );
    this.deps.bumpDocumentRevision();
    this.deps.markDirty();
    this.deps.syncScene(committed);
  }

  /** Acción no-default: por el embudo canónico, desde el checkpoint. */
  private commitAction(state: GripState): void {
    this.deps.setDocument(state.checkpoint);
    const base = this.checkpointEntity(state);
    if (!base) {
      this.restorePreview(state.checkpoint);
      return;
    }
    const outcome = applyCadGripSession(
      state.session,
      base,
      state.lastPoint ?? undefined,
    );
    if ("error" in outcome) {
      this.restorePreview(state.checkpoint);
      this.deps.notify(outcome.error);
      return;
    }
    if (!this.deps.commitCommands(outcome.commands, cadGripDragGroupKey(state.session)))
      this.restorePreview(state.checkpoint);
  }

  private finish(state: GripState): void {
    this.deps.menu.hideBadge();
    this.deps.setOrbitEnabled(true);
    this.deps.releasePointer(state.pointerId);
    this.state = null;
  }
}
