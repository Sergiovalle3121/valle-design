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
