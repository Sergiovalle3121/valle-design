export type CadSymbolCategory =
  | "equipment"
  | "flow"
  | "safety"
  | "storage"
  | "operator";
export interface CadSymbolPort {
  id: string;
  label: string;
  x: number;
  y: number;
}
export interface CadSymbolDefinition {
  id: string;
  label: string;
  category: CadSymbolCategory;
  defaultWidth: number;
  defaultHeight: number;
  layer: string;
  tags: string[];
  ports: CadSymbolPort[];
}
export interface CadSymbolPlacement {
  id: string;
  symbolId: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  layer: string;
  tags: string[];
}

export const CAD_SYMBOL_LIBRARY: CadSymbolDefinition[] = [
  {
    id: "smt-line",
    label: "SMT line",
    category: "equipment",
    defaultWidth: 12000,
    defaultHeight: 2400,
    layer: "Equipment",
    tags: ["smt", "line"],
    ports: [
      { id: "in", label: "In", x: -0.5, y: 0 },
      { id: "out", label: "Out", x: 0.5, y: 0 },
    ],
  },
  {
    id: "solder-paste-printer",
    label: "Solder paste printer",
    category: "equipment",
    defaultWidth: 2500,
    defaultHeight: 1700,
    layer: "Equipment",
    tags: ["smt", "printer", "paste", "front-end"],
    ports: [
      { id: "in", label: "In", x: -0.5, y: 0 },
      { id: "out", label: "Out", x: 0.5, y: 0 },
    ],
  },
  {
    id: "spi",
    label: "SPI",
    category: "equipment",
    defaultWidth: 1800,
    defaultHeight: 1500,
    layer: "Equipment",
    tags: ["smt", "inspection", "quality", "paste"],
    ports: [
      { id: "in", label: "In", x: -0.5, y: 0 },
      { id: "out", label: "Out", x: 0.5, y: 0 },
    ],
  },
  {
    id: "pick-and-place",
    label: "Pick-and-place",
    category: "equipment",
    defaultWidth: 3600,
    defaultHeight: 2000,
    layer: "Equipment",
    tags: ["smt", "placement", "machine", "line"],
    ports: [
      { id: "in", label: "In", x: -0.5, y: 0 },
      { id: "out", label: "Out", x: 0.5, y: 0 },
    ],
  },
  {
    id: "reflow-oven",
    label: "Reflow oven",
    category: "equipment",
    defaultWidth: 6200,
    defaultHeight: 1800,
    layer: "Equipment",
    tags: ["smt", "thermal", "oven", "line"],
    ports: [
      { id: "in", label: "In", x: -0.5, y: 0 },
      { id: "out", label: "Out", x: 0.5, y: 0 },
    ],
  },
  {
    id: "xray-inspection",
    label: "X-ray inspection",
    category: "equipment",
    defaultWidth: 2200,
    defaultHeight: 1800,
    layer: "Equipment",
    tags: ["quality", "xray", "inspection", "npi"],
    ports: [
      { id: "in", label: "In", x: -0.5, y: 0 },
      { id: "out", label: "Out", x: 0.5, y: 0 },
      { id: "reject", label: "Reject", x: 0, y: 0.5 },
    ],
  },
  {
    id: "ict-tester",
    label: "ICT tester",
    category: "equipment",
    defaultWidth: 2600,
    defaultHeight: 1800,
    layer: "Equipment",
    tags: ["test", "ict", "quality", "electronics"],
    ports: [
      { id: "in", label: "In", x: -0.5, y: 0 },
      { id: "out", label: "Out", x: 0.5, y: 0 },
      { id: "fail", label: "Fail", x: 0, y: 0.5 },
    ],
  },
  {
    id: "functional-test-bench",
    label: "Functional test bench",
    category: "equipment",
    defaultWidth: 3000,
    defaultHeight: 1800,
    layer: "Equipment",
    tags: ["test", "functional", "bench", "quality"],
    ports: [
      { id: "in", label: "In", x: -0.5, y: 0 },
      { id: "out", label: "Out", x: 0.5, y: 0 },
      { id: "fail", label: "Fail", x: 0, y: 0.5 },
    ],
  },
  {
    id: "conformal-coating",
    label: "Conformal coating",
    category: "equipment",
    defaultWidth: 3200,
    defaultHeight: 1800,
    layer: "Equipment",
    tags: ["coating", "protection", "smt", "process"],
    ports: [
      { id: "in", label: "In", x: -0.5, y: 0 },
      { id: "out", label: "Out", x: 0.5, y: 0 },
    ],
  },
  {
    id: "depaneling-router",
    label: "Depaneling router",
    category: "equipment",
    defaultWidth: 2400,
    defaultHeight: 1800,
    layer: "Equipment",
    tags: ["depaneling", "router", "post-smt", "process"],
    ports: [
      { id: "in", label: "In", x: -0.5, y: 0 },
      { id: "out", label: "Out", x: 0.5, y: 0 },
    ],
  },
  {
    id: "manual-assembly-cell",
    label: "Manual assembly cell",
    category: "equipment",
    defaultWidth: 3600,
    defaultHeight: 2400,
    layer: "Equipment",
    tags: ["assembly", "manual", "cell", "operator"],
    ports: [
      { id: "in", label: "In", x: -0.5, y: 0 },
      { id: "out", label: "Out", x: 0.5, y: 0 },
    ],
  },
  {
    id: "quality-gate",
    label: "Quality gate",
    category: "equipment",
    defaultWidth: 2400,
    defaultHeight: 1600,
    layer: "Equipment",
    tags: ["quality", "gate", "inspection", "release"],
    ports: [
      { id: "in", label: "In", x: -0.5, y: 0 },
      { id: "out", label: "Out", x: 0.5, y: 0 },
      { id: "hold", label: "Hold", x: 0, y: 0.5 },
    ],
  },
  {
    id: "label-print-station",
    label: "Label print station",
    category: "equipment",
    defaultWidth: 1600,
    defaultHeight: 1200,
    layer: "Equipment",
    tags: ["packing", "label", "printer", "traceability"],
    ports: [
      { id: "in", label: "In", x: -0.5, y: 0 },
      { id: "out", label: "Out", x: 0.5, y: 0 },
    ],
  },
  {
    id: "calibration-station",
    label: "Calibration station",
    category: "equipment",
    defaultWidth: 2200,
    defaultHeight: 1600,
    layer: "Equipment",
    tags: ["calibration", "quality", "metrology", "tooling"],
    ports: [
      { id: "in", label: "In", x: -0.5, y: 0 },
      { id: "out", label: "Out", x: 0.5, y: 0 },
    ],
  },
  {
    id: "inspection",
    label: "Inspection",
    category: "equipment",
    defaultWidth: 2500,
    defaultHeight: 1800,
    layer: "Equipment",
    tags: ["quality"],
    ports: [
      { id: "in", label: "In", x: -0.5, y: 0 },
      { id: "out", label: "Out", x: 0.5, y: 0 },
    ],
  },
  {
    id: "aoi",
    label: "AOI",
    category: "equipment",
    defaultWidth: 1800,
    defaultHeight: 1600,
    layer: "Equipment",
    tags: ["inspection", "aoi"],
    ports: [
      { id: "in", label: "In", x: -0.5, y: 0 },
      { id: "out", label: "Out", x: 0.5, y: 0 },
    ],
  },
  {
    id: "warehouse-rack",
    label: "Warehouse rack",
    category: "storage",
    defaultWidth: 4200,
    defaultHeight: 1100,
    layer: "Layout",
    tags: ["warehouse", "storage"],
    ports: [],
  },
  {
    id: "packing",
    label: "Packing",
    category: "equipment",
    defaultWidth: 3200,
    defaultHeight: 2200,
    layer: "Equipment",
    tags: ["packing"],
    ports: [
      { id: "in", label: "In", x: -0.5, y: 0 },
      { id: "out", label: "Out", x: 0.5, y: 0 },
    ],
  },
  {
    id: "forklift-path",
    label: "Forklift path",
    category: "flow",
    defaultWidth: 10000,
    defaultHeight: 2500,
    layer: "Flow",
    tags: ["forklift", "aisle"],
    ports: [],
  },
  {
    id: "operator-station",
    label: "Operator station",
    category: "operator",
    defaultWidth: 1200,
    defaultHeight: 900,
    layer: "Equipment",
    tags: ["operator"],
    ports: [{ id: "work", label: "Work", x: 0, y: 0 }],
  },
  {
    id: "esd-area",
    label: "ESD area",
    category: "safety",
    defaultWidth: 5000,
    defaultHeight: 3500,
    layer: "Safety",
    tags: ["esd", "controlled"],
    ports: [],
  },
  {
    id: "safety-zone",
    label: "Safety zone",
    category: "safety",
    defaultWidth: 4000,
    defaultHeight: 3000,
    layer: "Safety",
    tags: ["safety"],
    ports: [],
  },
  {
    id: "conveyor",
    label: "Conveyor",
    category: "flow",
    defaultWidth: 6000,
    defaultHeight: 900,
    layer: "Flow",
    tags: ["conveyor"],
    ports: [
      { id: "in", label: "In", x: -0.5, y: 0 },
      { id: "out", label: "Out", x: 0.5, y: 0 },
    ],
  },
  {
    id: "test-station",
    label: "Test station",
    category: "equipment",
    defaultWidth: 2200,
    defaultHeight: 1800,
    layer: "Equipment",
    tags: ["test"],
    ports: [
      { id: "in", label: "In", x: -0.5, y: 0 },
      { id: "out", label: "Out", x: 0.5, y: 0 },
    ],
  },
  {
    id: "rework-station",
    label: "Rework station",
    category: "equipment",
    defaultWidth: 2400,
    defaultHeight: 1900,
    layer: "Equipment",
    tags: ["rework"],
    ports: [
      { id: "in", label: "In", x: -0.5, y: 0 },
      { id: "out", label: "Out", x: 0.5, y: 0 },
    ],
  },
] as const;

export function getCadSymbol(id: string): CadSymbolDefinition | undefined {
  return CAD_SYMBOL_LIBRARY.find((symbol) => symbol.id === id);
}
export function searchCadSymbols(query: string): CadSymbolDefinition[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...CAD_SYMBOL_LIBRARY];
  return CAD_SYMBOL_LIBRARY.filter((symbol) =>
    [symbol.id, symbol.label, symbol.category, ...symbol.tags].some((value) =>
      value.toLowerCase().includes(q),
    ),
  );
}
export function createCadSymbolPlacement(
  symbolId: string,
  x: number,
  y: number,
  id = `${symbolId}-${Date.now()}`,
): CadSymbolPlacement | null {
  const symbol = getCadSymbol(symbolId);
  if (!symbol) return null;
  return {
    id,
    symbolId: symbol.id,
    label: symbol.label,
    x,
    y,
    width: symbol.defaultWidth,
    height: symbol.defaultHeight,
    layer: symbol.layer,
    tags: [...symbol.tags],
  };
}
