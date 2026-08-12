/**
 * VSCURRENT y SHADEMODE: el estilo visual del visor, tecleable.
 *
 * `view/visual-styles.ts` define los cuatro estilos con los nombres de
 * AutoCAD; `solid3d-three.ts` sabe construir la malla de cada uno. Lo que
 * faltaba era la ORDEN: sin ella, el estilo era una tabla sin interruptor y
 * los sólidos se miraban siempre igual.
 *
 * El estilo es estado del VISOR, no del documento: el comando emite una
 * petición de anfitrión (`visual-style`) y no toca la historia ni el CAS.
 * Cambiar cómo se mira una pieza no es editarla.
 */
import {
  CAD_VISUAL_STYLES,
  resolveCadVisualStyle,
  type CadVisualStyleId,
} from "../../view/visual-styles";
import {
  CAD_ACCEPT_KEYWORD,
  CAD_ACCEPT_TEXT,
  asCadCommand,
  type CadAnyCommandDescriptor,
  type CadCommandDescriptor,
  type CadCommandStep,
} from "../command-types";

type State = Record<string, never>;

/** Atajo por estilo; letra presente en la etiqueta para que se resalte. */
const STYLE_SHORTCUTS: Record<CadVisualStyleId, string> = {
  wireframe: "A",
  hidden: "O",
  shaded: "S",
  "shaded-edges": "C",
};

const STYLE_KEYWORDS = CAD_VISUAL_STYLES.map((style) => ({
  keyword: style.id,
  shortcut: STYLE_SHORTCUTS[style.id],
  label: style.label,
}));

function prompt(): CadCommandStep<State> {
  return {
    state: {},
    prompt: {
      message: "Nuevo estilo visual",
      options: STYLE_KEYWORDS,
      defaultValue: undefined,
    },
    accepts: CAD_ACCEPT_KEYWORD | CAD_ACCEPT_TEXT,
  };
}

const VSCURRENT: CadCommandDescriptor<State> = {
  name: "VSCURRENT",
  aliases: ["SHADEMODE", "VS"],
  kind: "view",
  transparent: true,
  selection: "none",
  repeatable: false,
  mutates: false,
  begin: () => prompt(),
  step: (state, input): CadCommandStep<State> => {
    if (input.kind === "cancel" || input.kind === "enter")
      return {
        state,
        prompt: { message: "", options: [] },
        accepts: 0,
        result: { kind: "none" },
      };
    if (input.kind === "keyword" || input.kind === "text") {
      const wanted = input.kind === "keyword" ? input.keyword : input.value;
      const style = resolveCadVisualStyle(wanted);
      if (!style)
        return {
          state,
          prompt: {
            message: `«${wanted}» no es un estilo visual. Estilos: ${CAD_VISUAL_STYLES.map((candidate) => candidate.label).join(", ")}.`,
            options: STYLE_KEYWORDS,
          },
          accepts: CAD_ACCEPT_KEYWORD | CAD_ACCEPT_TEXT,
        };
      return {
        state,
        prompt: { message: "", options: [] },
        accepts: 0,
        result: {
          kind: "host",
          request: { kind: "visual-style", styleId: style.id },
          label: `VSCURRENT ${style.label}`,
        },
      };
    }
    return prompt();
  },
};

export const CAD_VIEW_VISUAL_COMMANDS: readonly CadAnyCommandDescriptor[] = [
  asCadCommand(VSCURRENT),
];
