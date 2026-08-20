/** Pure CAD command contract for the Valle Design CAD Copilot.
 * No React, three.js, API, or OpenAI dependency belongs in this layer.
 */
export type CadCommandId =
  | "create_clearance_aisle"
  | "align_selection"
  | "distribute_selection"
  | "connect_flow"
  | "arrange_line"
  | "arrange_flow_line"
  | "arrange_rack_rows"
  | "analyze_line_balance"
  | "trace_material_route"
  | "measure_distance"
  | "find_collisions"
  | "validate_layout"
  | "fit_to_view"
  | "array_rectangular"
  | "array_polar"
  | "array_along_flow"
  | "offset_object"
  | "mirror_selection"
  | "place_symbol"
  | "rotate_selection"
  | "scale_selection"
  | "delete_selection"
  | "duplicate_selection"
  | "move_selection"
  | "count_objects"
  | "object_info"
  | "rename_object"
  | "select_objects"
  | "resize_object"
  | "swap_objects"
  | "audit_plan"
  | "help_commands"
  | "clear_annotations"
  | "history_step"
  | "studio_export"
  | "studio_view"
  | "studio_save"
  | "add_label"
  | "extend_wall"
  | "trim_wall"
  | "chamfer_walls"
  | "measure_area"
  | "create_zone_around"
  | "draw_wall_segment"
  | "draw_rect_zone"
  | "auto_dimension"
  | "cleanup_geometry";

export type CadCommandCategory = "layout" | "flow" | "analysis" | "viewport";
export type CadIssueLevel = "info" | "warning" | "error";
export type CadCommandStatus =
  "parsed" | "previewed" | "applied" | "undone" | "failed";
export type CadObjectType = "station" | "asset";
export type CadUnit = "mm" | "m" | "in" | "ft";

export interface CadBox {
  id: string;
  type: CadObjectType;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  sequence?: number;
  /** Kind del asset (wall/zone/rack/…) — lo aporta el editor; opcional para
   * no romper contextos previos. Los comandos de muros filtran por esto. */
  kind?: string;
}

export interface CadConnectorInput {
  from: string;
  to: string;
  kind?: string;
}

export interface CadCommandContext {
  unit: CadUnit | string;
  footprintW: number;
  footprintH: number;
  objects: CadBox[];
  selectedIds: string[];
  connectors?: CadConnectorInput[];
}

export interface CadValidationIssue {
  level: CadIssueLevel;
  code: string;
  message: string;
  objectIds?: string[];
}

/** Objeto nuevo propuesto por un comando. Con `sourceId` resoluble el editor
 * copia kind/etiqueta/capa del asset origen (duplicación); sin sourceId, `kind`
 * permite crear un asset fresco (zona/muro) — sin ninguno de los dos la
 * operación se ignora (las estaciones son del routing y no se crean). */
export interface CadDraftObject {
  sourceId?: string;
  kind?: string;
  type: CadObjectType;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
}

export type CadOperation =
  | { type: "move"; objectId: string; before: CadBox; after: CadBox }
  | { type: "create"; object: CadDraftObject }
  | { type: "delete"; objectId: string }
  | { type: "clear_annotations"; kind: "dims" | "notes" | "all" }
  | { type: "history"; action: "undo" | "redo" }
  | {
      type: "studio_export";
      format: "pdf" | "dxf" | "png" | "glb";
      /** Papel para el PDF (A0-A4, letter, tabloid); default el del selector. */
      paper?: string;
    }
  | { type: "studio_view"; mode: "2d" | "3d" }
  | { type: "studio_save" }
  | { type: "rename"; objectId: string; label: string }
  | {
      type: "annotate";
      annotation:
        | {
            kind: "dim";
            x: number;
            y: number;
            x2: number;
            y2: number;
            text: string;
          }
        | { kind: "text"; x: number; y: number; text: string };
    }
  | { type: "connect"; from: string; to: string; kind: string }
  | {
      type: "measure";
      from: string;
      to: string;
      distance: number;
      unit: string;
    }
  | { type: "focus"; objectIds: string[]; zoom?: boolean }
  | { type: "report"; title: string; rows: { label: string; value: string }[] };

export interface CadCommandPreview {
  summary: string;
  affectedObjectIds: string[];
  operations: CadOperation[];
  issues: CadValidationIssue[];
}

export interface CadCommandResult extends CadCommandPreview {
  applied: boolean;
  historyLabel: string;
}

export type CadCommandInput =
  | {
      id: "create_clearance_aisle";
      targetA?: string;
      targetB?: string;
      distance: number;
      unit?: CadUnit | string;
      axis?: "x" | "y";
    }
  | {
      id: "align_selection";
      mode: "left" | "center" | "right" | "top" | "middle" | "bottom";
      objectIds?: string[];
      /** Objetivo por nombre: 'alinea las mesas al centro'. */
      target?: string;
      /** Referencia por nombre: 'alinea las sillas con la mesa'. */
      anchor?: string;
    }
  | {
      id: "distribute_selection";
      axis: "horizontal" | "vertical";
      objectIds?: string[];
      /** Objetivo por nombre: 'distribuye las sillas'. */
      target?: string;
      /** Separación fija en mm: 'distribuye las mesas cada 800' (min 2 objetos). */
      gap?: number;
    }
  | { id: "connect_flow"; from?: string; to?: string; objectIds?: string[] }
  | {
      id: "arrange_line";
      direction?: "left_to_right" | "top_to_bottom";
      objectIds?: string[];
    }
  | {
      id: "arrange_flow_line";
      direction?: "left_to_right" | "top_to_bottom";
      objectIds?: string[];
      gap?: number;
      margin?: number;
    }
  | {
      id: "arrange_rack_rows";
      orientation?: "horizontal" | "vertical";
      objectIds?: string[];
      rows?: number;
      baysPerRow?: number;
      bayGap?: number;
      aisleWidth?: number;
      margin?: number;
    }
  | {
      id: "analyze_line_balance";
      objectIds?: string[];
      taktTimeSec?: number;
      cycleTimes?: Record<string, number>;
    }
  | {
      id: "trace_material_route";
      objectIds?: string[];
    }
  | { id: "measure_distance"; targetA?: string; targetB?: string }
  | { id: "find_collisions"; objectIds?: string[] }
  | { id: "validate_layout"; objectIds?: string[]; requiredClearance?: number }
  | {
      id: "fit_to_view";
      objectIds?: string[];
      /** 'enfoca la cocina': selecciona por nombre y hace zoom. */
      target?: string;
    }
  | {
      id: "array_rectangular";
      objectIds?: string[];
      /** Objetivo por nombre: 'repite la silla 4 veces'. */
      target?: string;
      cols: number;
      rows: number;
      gapX?: number;
      gapY?: number;
      /** Sentido del paso; -1 repite hacia la izquierda/arriba. */
      dirX?: 1 | -1;
      dirY?: 1 | -1;
    }
  | {
      id: "array_polar";
      objectIds?: string[];
      count: number;
      angleSpanDeg?: number;
      rotateItems?: boolean;
      centerLabel?: string;
    }
  | { id: "array_along_flow"; objectIds?: string[]; count: number }
  | {
      id: "offset_object";
      objectIds?: string[];
      distance: number;
      side?: "left" | "right" | "up" | "down";
      copies?: number;
    }
  | {
      id: "mirror_selection";
      objectIds?: string[];
      /** Objetivo por nombre: 'espejo de la puerta' (label o kind). */
      target?: string;
      axis?: "vertical" | "horizontal";
      /** Coordenada del eje; default: centro del bounding box de la selección. */
      at?: number;
      /** Default true: conserva originales y crea copias "(espejo)". */
      copy?: boolean;
    }
  | {
      id: "place_symbol";
      /** Qué colocar: busca en la biblioteca ('puerta', 'cama', 'aoi'…). */
      query: string;
      x?: number;
      y?: number;
      /** Grados; 'pon una puerta girada 90'. */
      rotation?: number;
      /** 'pon 3 sillas': coloca N en fila horizontal (default 1). */
      count?: number;
      /** Separación entre piezas de la fila en mm (default 100). */
      gap?: number;
      /** 'pon una silla junto a la mesa': ancla por nombre (label o tipo). */
      anchor?: string;
      /** Lado del ancla; 'a la izquierda de', 'arriba de' (default right). */
      anchorSide?: "left" | "right" | "above" | "below";
      /** 'junto a cada mesa': una pieza por cada coincidencia del ancla. */
      anchorEach?: boolean;
      /** 'pon una silla en la cocina': la pieza (o la fila) aterriza
       * centrada dentro del contenedor nombrado. */
      into?: string;
      /** 'pon una planta en cada esquina': 4 piezas en las esquinas del
       * footprint con margen de 200 mm. */
      corners?: boolean;
      /** 'pon una silla en cada cuarto': una pieza centrada en cada
       * cuarto hoja (el muro perimetral no duplica). */
      perRoom?: boolean;
    }
  | {
      id: "rotate_selection";
      objectIds?: string[];
      /** Objetivo por nombre: 'rota la puerta 90' (label o kind). */
      target?: string;
      /** Grados, positivo antihorario; gira alrededor del centro del conjunto. */
      angle: number;
    }
  | {
      id: "scale_selection";
      objectIds?: string[];
      /** Objetivo por nombre: 'escala la mesa al 150%' (label o kind). */
      target?: string;
      /** Factor > 0 y ≠ 1; escala tamaños y posiciones desde el centro. */
      factor: number;
    }
  | {
      id: "delete_selection";
      /** Default: la selección actual. */
      objectIds?: string[];
      /** Objetivo por nombre: 'borra la puerta' (label o kind). */
      target?: string;
    }
  | {
      id: "duplicate_selection";
      objectIds?: string[];
      /** Objetivo por nombre: 'duplica el escritorio' (label o kind). */
      target?: string;
      /** Desplazamiento de la copia en mm; default +500,+500. */
      dx?: number;
      dy?: number;
      /** 'duplica la mesa en la bodega': la copia aterriza centrada
       * dentro del contenedor nombrado (sin offset explícito). */
      into?: string;
    }
  | {
      id: "move_selection";
      objectIds?: string[];
      /** Objetivo por nombre: 'mueve la puerta a 2000,650'. */
      target?: string;
      /** Destino absoluto (esquina sup-izq del conjunto, como place_symbol). */
      x?: number;
      y?: number;
      /** Desplazamiento relativo en mm ('500 a la derecha'). */
      dx?: number;
      dy?: number;
      /** 'centra la mesa': centra el conjunto en el footprint. */
      center?: boolean;
      /** 'mueve la silla junto a la mesa': destino relacional por nombre. */
      anchor?: string;
      /** Lado del ancla al mover (default right). */
      anchorSide?: "left" | "right" | "above" | "below";
      /** 'mete la mesa en la cocina': el conjunto aterriza centrado dentro
       * del contenedor nombrado (cuarto o zona). */
      into?: string;
      /** 'reparte las sillas entre los cuartos': cada objeto viaja al
       * centro de un cuarto hoja en round-robin (el conjunto NO viaja
       * rígido); los que exceden se escalonan para no apilarse. */
      perRoom?: boolean;
      /** 'pega la mesa a la pared (del fondo)': el conjunto se recarga
       * contra el muro del contenedor más chico que lo contiene (cuarto o
       * zona) o, si no hay, contra la orilla del plano. */
      wall?: "left" | "right" | "top" | "bottom" | "nearest";
      /** 'acomoda las sillas en 2 filas': matriz anclada en la esquina del
       * conjunto, celdas del objeto más grande + separación fija. */
      rows?: number;
      /** 'acomoda las sillas en 3 columnas': fija columnas y calcula filas. */
      cols?: number;
      /** 'aleja la silla de la mesa (800)': el conjunto se mueve en línea
       * recta ALEJÁNDOSE del ancla nombrada, awayDist mm (default 500). */
      awayFrom?: string;
      /** Distancia del alejamiento en mm (default 500). */
      awayDist?: number;
    }
  | {
      id: "count_objects";
      /** Qué contar ('mesas', 'sillas'); vacío = todo el plano. */
      query?: string;
      /** '¿cuántas mesas hay en cada cuarto?': desglosa el conteo por el
       * cuarto/zona que contiene cada coincidencia. */
      byRoom?: boolean;
    }
  | {
      id: "select_objects";
      /** Qué seleccionar ('mesas', 'barra', 'todo'). */
      query: string;
      /** 'todo menos las mesas': término a excluir de las coincidencias. */
      exclude?: string;
    }
  | {
      id: "object_info";
      /** De qué objeto: '¿cuánto mide la mesa?'. */
      query: string;
    }
  | {
      id: "resize_object";
      objectIds?: string[];
      /** Objetivo por nombre: 'cambia el tamaño de la mesa a 1500x900'. */
      target?: string;
      /** Ancho nuevo en mm; omitido conserva el actual. */
      w?: number;
      /** Alto nuevo en mm; omitido conserva el actual. */
      h?: number;
      /** Referencia por nombre: 'haz la mesa del tamaño del escritorio' —
       * copia el ancho×alto del primer objeto que coincida (excluyendo a los
       * objetivos). Los números explícitos w/h tienen prioridad. */
      like?: string;
      /** Ajuste relativo en mm: 'haz la mesa 500 más ancha' — se suma al
       * ancho actual de cada objeto (negativo angosta). Solo aplica sin w/h. */
      dw?: number;
      /** Ajuste relativo en mm sobre el alto actual (negativo reduce). */
      dh?: number;
    }
  | {
      /** Revisión de protección civil (VD-CAD-AUDIT-001): '¿qué le falta
       * al plano?' — checklist de extintor, botiquín, salida y puerta. */
      id: "audit_plan";
    }
  | {
      id: "swap_objects";
      /** Primer objeto por nombre ('intercambia la mesa y el escritorio'). */
      a?: string;
      /** Segundo objeto por nombre. */
      b?: string;
      /** Alternativa: exactamente 2 objetos seleccionados. */
      objectIds?: string[];
    }
  | {
      id: "rename_object";
      /** Qué renombrar (primera coincidencia). */
      target: string;
      /** El nombre nuevo. */
      name: string;
    }
  | { id: "help_commands" }
  | {
      id: "clear_annotations";
      /** Qué limpiar: cotas (dims), notas (notes) o todo; default dims. */
      kind?: "dims" | "notes" | "all";
    }
  | {
      id: "history_step";
      /** 'deshaz' / 'rehaz' del historial del estudio. */
      action: "undo" | "redo";
    }
  | {
      id: "studio_export";
      /** 'imprime en a3', 'exporta el dxf', 'exporta png', 'exporta 3d'. */
      format?: "pdf" | "dxf" | "png" | "glb";
      paper?: string;
    }
  | {
      id: "studio_view";
      /** 'vista 2d' = planta cenital tipo CAD; 'vista 3d' = orbital. */
      mode: "2d" | "3d";
    }
  | { id: "studio_save" }
  | {
      id: "add_label";
      /** El texto de la nota; 'escribe "Recepción" en 2000,1000'. */
      text: string;
      x?: number;
      y?: number;
    }
  | {
      id: "extend_wall";
      target?: string;
      boundary?: string;
      objectIds?: string[];
    }
  | {
      id: "trim_wall";
      target?: string;
      cutter?: string;
      keep?: "start" | "end";
      objectIds?: string[];
    }
  | {
      id: "chamfer_walls";
      wallA?: string;
      wallB?: string;
      distance: number;
      objectIds?: string[];
    }
  | { id: "measure_area"; objectIds?: string[]; targetLabel?: string }
  | {
      id: "create_zone_around";
      objectIds?: string[];
      margin?: number;
      label?: string;
    }
  | {
      id: "draw_wall_segment";
      from: { x: number; y: number };
      to: { x: number; y: number };
      thickness?: number;
      label?: string;
    }
  | {
      id: "draw_rect_zone";
      from: { x: number; y: number };
      to: { x: number; y: number };
      kind?: "zone" | "room";
      label?: string;
    }
  | {
      id: "auto_dimension";
      objectIds?: string[];
      mode?: "size" | "gaps" | "both";
      /** Objetivo por nombre: 'acota las mesas'. */
      target?: string;
    }
  | {
      id: "cleanup_geometry";
      objectIds?: string[];
      tolerance?: number;
      angleToleranceDeg?: number;
      minLength?: number;
      removeTiny?: boolean;
    };

export interface CadCommandSchemaField {
  type: "string" | "number" | "boolean" | "enum" | "string[]" | "object";
  required?: boolean;
  description: string;
  enum?: string[];
}

export interface CadCommandDefinition<
  TInput extends CadCommandInput = CadCommandInput,
> {
  id: TInput["id"];
  label: string;
  description: string;
  category: CadCommandCategory;
  inputSchema: Record<string, CadCommandSchemaField>;
  examples: string[];
  validate(input: TInput, context: CadCommandContext): CadValidationIssue[];
  preview(input: TInput, context: CadCommandContext): CadCommandPreview;
  execute(input: TInput, context: CadCommandContext): CadCommandResult;
}

export interface CadCommandHistoryItem {
  id: string;
  commandId: CadCommandId;
  input: CadCommandInput;
  label: string;
  status: CadCommandStatus;
  createdAt: string;
  /** Exact deterministic command text used for history navigation/repeat. */
  rawInput?: string;
  /** Wall-clock execution time for the audited command step. */
  durationMs?: number;
  /** Canonical object identifiers reported by preview/execute. */
  affectedObjectIds?: string[];
  completedAt?: string;
  preview?: CadCommandPreview;
  result?: CadCommandResult;
}

export interface CadParseResult {
  ok: boolean;
  input?: CadCommandInput;
  confidence: number;
  clarification?: string;
  error?: string;
  /**
   * Código del rechazo, legible por máquina.
   *
   * POR QUÉ NO BASTA `clarification`. La regla de la casa es «fallo cerrado:
   * ante lo ambiguo, error tipado y explícito», y hasta que el banco de calidad
   * NL→CAD lo midió (`nl-quality/`) el parser cumplía sólo la mitad:
   * rechazaba, sí, pero con prosa. Una frase en español no se puede ramificar,
   * ni traducir, ni convertir en una sugerencia de la UI, ni contar en una
   * métrica: obliga a comparar cadenas, que es la forma más frágil de
   * programar contra un contrato. El texto sigue siendo para el humano; el
   * código es para el producto.
   */
  code?: string;
}
