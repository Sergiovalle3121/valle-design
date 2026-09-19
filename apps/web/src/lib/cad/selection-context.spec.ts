/**
 * selection-context.ts — pruebas del contexto de selección publicado.
 *
 * Usa el arnés de `lib/brep/spec-support` para contar aserciones e imprimir
 * al final (el runner `scripts/run-specs.mjs` trata un spec silencioso como
 * fallido).
 */
import { check, report } from "../brep/spec-support";
import {
  EMPTY_SELECTION_CONTEXT,
  deriveSelectionContext,
} from "./selection-context";

/* ── 1. Selección vacía ──────────────────────────────────────────────── */
{
  const ctx = deriveSelectionContext([], new Map(), "Model", false);
  check("vacía: count=0", ctx.count === 0);
  check("vacía: kinds vacío", ctx.kinds.size === 0);
  check("vacía: dominantKind null", ctx.dominantKind === null);
  check("vacía: activeLayout=Model", ctx.activeLayout === "Model");
  check("vacía: readOnly=false", ctx.readOnly === false);
  check("vacía: constante EMPTY_SELECTION_CONTEXT coincide", EMPTY_SELECTION_CONTEXT.count === 0 && EMPTY_SELECTION_CONTEXT.dominantKind === null);
}

/* ── 2. Una sola pared ──────────────────────────────────────────────── */
{
  const map = new Map([["w-1", "wall"]]);
  const ctx = deriveSelectionContext(["w-1"], map, "Model", false);
  check("1 pared: count=1", ctx.count === 1);
  check("1 pared: kinds={wall}", ctx.kinds.size === 1 && ctx.kinds.has("wall"));
  check("1 pared: dominantKind=wall", ctx.dominantKind === "wall");
}

/* ── 3. Dos paredes ─────────────────────────────────────────────────── */
{
  const map = new Map([["w-1", "wall"], ["w-2", "wall"]]);
  const ctx = deriveSelectionContext(["w-1", "w-2"], map, "Model", false);
  check("2 paredes: count=2", ctx.count === 2);
  check("2 paredes: kinds={wall}", ctx.kinds.size === 1 && ctx.kinds.has("wall"));
  check("2 paredes: dominantKind=wall", ctx.dominantKind === "wall");
}

/* ── 4. Pared + dimensión (mezcla → dominantKind null) ──────────────── */
{
  const map = new Map([["w-1", "wall"], ["d-1", "dimension"]]);
  const ctx = deriveSelectionContext(["w-1", "d-1"], map, "Model", false);
  check("mezcla: count=2", ctx.count === 2);
  check("mezcla: kinds={wall,dimension}", ctx.kinds.size === 2 && ctx.kinds.has("wall") && ctx.kinds.has("dimension"));
  check("mezcla: dominantKind=null", ctx.dominantKind === null);
}

/* ── 5. readOnly ────────────────────────────────────────────────────── */
{
  const map = new Map([["l-1", "line"]]);
  const ctx = deriveSelectionContext(["l-1"], map, "Model", true);
  check("readOnly: readOnly=true", ctx.readOnly === true);
  check("readOnly: dominantKind=line", ctx.dominantKind === "line");
}

/* ── 6. Layout distinto ─────────────────────────────────────────────── */
{
  const map = new Map([["c-1", "circle"]]);
  const ctx = deriveSelectionContext(["c-1"], map, "layout:planta", false);
  check("layout: activeLayout=layout:planta", ctx.activeLayout === "layout:planta");
  check("layout: dominantKind=circle", ctx.dominantKind === "circle");
}

/* ── 7. ID sin entrada en kindById se ignora ────────────────────────── */
{
  const map = new Map<string, string>();
  const ctx = deriveSelectionContext(["ghost-1", "ghost-2"], map, "Model", false);
  check("fantasma: count=2 (por IDs)", ctx.count === 2);
  check("fantasma: kinds vacío (sin resolución)", ctx.kinds.size === 0);
  check("fantasma: dominantKind=null", ctx.dominantKind === null);
}

/* ── Cierre ──────────────────────────────────────────────────────────── */
report("selection-context", 18);
