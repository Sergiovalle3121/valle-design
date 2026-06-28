export type AxosSheetConnectorType =
  | "inventory_snapshot"
  | "bom_cost_rollup"
  | "work_orders"
  | "oee_by_line"
  | "supplier_scorecard"
  | "ncr_scrap"
  | "purchase_orders"
  | "mrp_shortages";

export type AxosSheetConnectorParamType = "text" | "date" | "select";
export interface AxosSheetConnectorParamDefinition {
  key: string;
  label: string;
  type: AxosSheetConnectorParamType;
  required?: boolean;
  options?: string[];
}

export interface AxosSheetConnectorDefinition {
  type: AxosSheetConnectorType;
  label: string;
  description: string;
  domain:
    | "Inventory"
    | "BOM"
    | "Production"
    | "OEE"
    | "Quality"
    | "Purchasing"
    | "MRP"
    | "Supplier";
  refreshPolicy: "manual" | "scheduled-ready";
  endpoint: string;
  params: AxosSheetConnectorParamDefinition[];
  headers: string[];
  rows: (string | number)[][];
}

export interface AxosSheetConnectorParamValidation {
  ok: boolean;
  params: Record<string, string>;
  errors: string[];
}

export const AXOS_SHEET_CONNECTORS: AxosSheetConnectorDefinition[] = [
  {
    type: "inventory_snapshot",
    label: "Inventory snapshot",
    domain: "Inventory",
    refreshPolicy: "manual",
    endpoint: "/office-documents/sheets/connectors/inventory_snapshot",
    params: [
      { key: "site", label: "Sitio", type: "text", required: true },
      {
        key: "abcClass",
        label: "Clase ABC",
        type: "select",
        options: ["A", "B", "C"],
      },
    ],
    description:
      "Existencias por SKU/ubicación con reservado, tránsito, valor estándar y clase ABC.",
    headers: [
      "SKU",
      "Ubicación",
      "Disponible",
      "Reservado",
      "En tránsito",
      "Valor estándar",
      "Clase ABC",
    ],
    rows: [
      ["AXOS-1000", "MAIN", 184, 32, 48, 12.75, "A"],
      ["PCB-DRV-01", "SMT", 420, 80, 120, 6.46, "A"],
      ["HARNESS-08", "LINE-2", 96, 12, 30, 3.1, "B"],
      ["BRKT-STL", "FAB", 640, 44, 0, 1.18, "C"],
    ],
  },
  {
    type: "bom_cost_rollup",
    label: "BOM cost rollup",
    domain: "BOM",
    refreshPolicy: "manual",
    endpoint: "/office-documents/sheets/connectors/bom_cost_rollup",
    params: [
      { key: "parentSku", label: "SKU padre", type: "text", required: true },
      { key: "revision", label: "Revisión", type: "text" },
    ],
    description:
      "Rollup de costo por componente/commodity con scrap y costo extendido.",
    headers: [
      "Padre",
      "Componente",
      "Commodity",
      "Qty",
      "Costo estándar",
      "Scrap %",
      "Costo extendido",
    ],
    rows: [
      ["AXOS-1000", "PCB-DRV-01", "PCB", 1, 12.75, 0.02, 13.01],
      ["AXOS-1000", "HARNESS-08", "Cableado", 2, 3.1, 0.01, 6.26],
      ["AXOS-1000", "LABOR-ASSY", "Labor", 0.35, 28, 0, 9.8],
      ["AXOS-1000", "OH-SMT", "Overhead", 0.18, 45, 0, 8.1],
    ],
  },
  {
    type: "work_orders",
    label: "Work orders",
    domain: "Production",
    refreshPolicy: "scheduled-ready",
    endpoint: "/office-documents/sheets/connectors/work_orders",
    params: [
      { key: "line", label: "Línea", type: "text" },
      {
        key: "status",
        label: "Estado",
        type: "select",
        options: ["Planeada", "Liberada", "En proceso", "Bloqueada"],
      },
    ],
    description:
      "Órdenes de trabajo por línea/estado para planeación y seguimiento.",
    headers: [
      "WO",
      "SKU",
      "Línea",
      "Estado",
      "Qty plan",
      "Qty buena",
      "Inicio plan",
      "Prioridad",
    ],
    rows: [
      [
        "WO-10420",
        "AXOS-1000",
        "Línea 1",
        "Liberada",
        240,
        96,
        "2026-06-29",
        "Alta",
      ],
      [
        "WO-10421",
        "PCB-DRV-01",
        "SMT",
        "En proceso",
        600,
        420,
        "2026-06-29",
        "Media",
      ],
      [
        "WO-10422",
        "HARNESS-08",
        "Línea 2",
        "Planeada",
        350,
        0,
        "2026-06-30",
        "Media",
      ],
      [
        "WO-10423",
        "AXOS-2000",
        "Línea 3",
        "Bloqueada",
        120,
        0,
        "2026-07-01",
        "Crítica",
      ],
    ],
  },
  {
    type: "oee_by_line",
    label: "OEE by line",
    domain: "OEE",
    refreshPolicy: "manual",
    endpoint: "/office-documents/sheets/connectors/oee_by_line",
    params: [
      { key: "line", label: "Línea", type: "text" },
      { key: "dateFrom", label: "Desde", type: "date" },
      { key: "dateTo", label: "Hasta", type: "date" },
    ],
    description: "Disponibilidad, performance, calidad y OEE por línea/turno.",
    headers: [
      "Línea",
      "Turno",
      "Disponibilidad",
      "Performance",
      "Calidad",
      "OEE",
    ],
    rows: [
      ["Línea 1", "A", 0.92, 0.88, 0.98, 0.793],
      ["Línea 1", "B", 0.86, 0.9, 0.97, 0.751],
      ["Línea 2", "A", 0.94, 0.84, 0.99, 0.782],
      ["Línea 3", "C", 0.81, 0.79, 0.95, 0.608],
    ],
  },
  {
    type: "supplier_scorecard",
    label: "Supplier scorecard",
    domain: "Supplier",
    refreshPolicy: "scheduled-ready",
    endpoint: "/office-documents/sheets/connectors/supplier_scorecard",
    params: [
      { key: "supplier", label: "Proveedor", type: "text" },
      { key: "category", label: "Categoría", type: "text" },
    ],
    description: "Score proveedor con OTD, calidad, costo, respuesta y estado.",
    headers: [
      "Proveedor",
      "OTD",
      "Calidad",
      "Costo",
      "Respuesta",
      "Score",
      "Estado",
    ],
    rows: [
      ["North Metals", 0.96, 0.98, 0.91, 0.9, 0.946, "Aprobado"],
      ["Delta Plastics", 0.88, 0.93, 0.86, 0.84, 0.886, "Monitorear"],
      ["Kyo Electronics", 0.91, 0.99, 0.89, 0.92, 0.936, "Aprobado"],
      ["Rapid Freight", 0.79, 0.9, 0.82, 0.78, 0.824, "Acción"],
    ],
  },
  {
    type: "ncr_scrap",
    label: "NCR / Scrap",
    domain: "Quality",
    refreshPolicy: "manual",
    endpoint: "/office-documents/sheets/connectors/ncr_scrap",
    params: [
      { key: "line", label: "Línea", type: "text" },
      { key: "dateFrom", label: "Desde", type: "date" },
      { key: "dateTo", label: "Hasta", type: "date" },
    ],
    description:
      "No conformidades y scrap por defecto, línea, costo y responsable.",
    headers: [
      "NCR",
      "Fecha",
      "Línea",
      "Defecto",
      "Qty scrap",
      "Costo scrap",
      "Responsable",
    ],
    rows: [
      ["NCR-8801", "2026-06-24", "Línea 1", "Soldadura", 12, 184.2, "Calidad"],
      ["NCR-8802", "2026-06-24", "SMT", "Componente", 8, 96.4, "Proceso"],
      [
        "NCR-8803",
        "2026-06-25",
        "Línea 2",
        "Torque",
        18,
        142.7,
        "Mantenimiento",
      ],
      ["NCR-8804", "2026-06-25", "Línea 3", "Etiqueta", 31, 38.9, "Producción"],
    ],
  },
  {
    type: "purchase_orders",
    label: "Purchase orders",
    domain: "Purchasing",
    refreshPolicy: "scheduled-ready",
    endpoint: "/office-documents/sheets/connectors/purchase_orders",
    params: [
      { key: "supplier", label: "Proveedor", type: "text" },
      {
        key: "risk",
        label: "Riesgo",
        type: "select",
        options: ["Bajo", "Medio", "Alto"],
      },
    ],
    description:
      "Órdenes de compra abiertas con proveedor, ETA, qty, precio y riesgo.",
    headers: [
      "PO",
      "Proveedor",
      "SKU",
      "ETA",
      "Qty abierta",
      "Precio",
      "Riesgo",
    ],
    rows: [
      ["PO-7201", "North Metals", "BRKT-STL", "2026-06-30", 1200, 1.18, "Bajo"],
      [
        "PO-7202",
        "Kyo Electronics",
        "PCB-DRV-01",
        "2026-07-02",
        900,
        6.46,
        "Medio",
      ],
      [
        "PO-7203",
        "Delta Plastics",
        "COVER-ABS",
        "2026-07-05",
        650,
        2.32,
        "Alto",
      ],
      ["PO-7204", "Rapid Freight", "SHIP-EXP", "2026-06-28", 1, 480, "Medio"],
    ],
  },
  {
    type: "mrp_shortages",
    label: "MRP shortages",
    domain: "MRP",
    refreshPolicy: "manual",
    endpoint: "/office-documents/sheets/connectors/mrp_shortages",
    params: [
      { key: "buyer", label: "Comprador", type: "text" },
      { key: "needBy", label: "Necesidad hasta", type: "date" },
    ],
    description:
      "Faltantes MRP por SKU con demanda, disponible, incoming y fecha de necesidad.",
    headers: [
      "SKU",
      "Demanda",
      "Disponible",
      "Incoming",
      "Shortage",
      "Fecha necesidad",
      "Comprador",
    ],
    rows: [
      ["PCB-DRV-01", 720, 420, 120, 180, "2026-07-01", "Ana"],
      ["HARNESS-08", 280, 96, 30, 154, "2026-07-02", "Luis"],
      ["COVER-ABS", 650, 220, 300, 130, "2026-07-05", "Mia"],
      ["SENSOR-T", 160, 75, 40, 45, "2026-07-06", "Noah"],
    ],
  },
];

export const AXOS_SHEET_CONNECTOR_BY_TYPE = AXOS_SHEET_CONNECTORS.reduce(
  (acc, def) => {
    acc[def.type] = def;
    return acc;
  },
  {} as Record<AxosSheetConnectorType, AxosSheetConnectorDefinition>,
);

export function validateAxosSheetConnectorParams(
  type: AxosSheetConnectorType,
  params: Record<string, unknown> = {},
): AxosSheetConnectorParamValidation {
  const def = AXOS_SHEET_CONNECTOR_BY_TYPE[type];
  if (!def)
    return {
      ok: false,
      params: {},
      errors: [`Conector AXOS no soportado: ${type}`],
    };
  const out: Record<string, string> = {};
  const errors: string[] = [];
  for (const spec of def.params) {
    const raw = params[spec.key];
    const value =
      typeof raw === "string" || typeof raw === "number"
        ? String(raw).trim()
        : "";
    if (spec.required && !value) errors.push(`${spec.label} es requerido.`);
    if (value && spec.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(value))
      errors.push(`${spec.label} debe usar formato YYYY-MM-DD.`);
    if (
      value &&
      spec.type === "select" &&
      spec.options?.length &&
      !spec.options.includes(value)
    )
      errors.push(`${spec.label} debe ser uno de: ${spec.options.join(", ")}.`);
    if (value) out[spec.key] = value;
  }
  return { ok: errors.length === 0, params: out, errors };
}
