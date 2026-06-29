import type { CadLayerId } from "./layers";

export type CadLayoutTemplateId =
  | "ems-mini-factory"
  | "smt-line"
  | "warehouse-racks"
  | "packing-shipping-cell";

export interface CadTemplateAsset {
  ref: string;
  kind: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  layer: CadLayerId;
  tags: string[];
}

export interface CadTemplateAnnotation {
  ref: string;
  type: "text";
  text: string;
  x: number;
  y: number;
  layer: CadLayerId;
}

export interface CadTemplateConnector {
  fromRef: string;
  toRef: string;
  kind: "flow" | "material";
}

export interface CadLayoutTemplate {
  id: CadLayoutTemplateId;
  label: string;
  description: string;
  category: "factory" | "production" | "warehouse" | "shipping";
  baseWidth: number;
  baseHeight: number;
  assets: CadTemplateAsset[];
  annotations: CadTemplateAnnotation[];
  connectors: CadTemplateConnector[];
}

export interface CadTemplateInstantiation {
  template: CadLayoutTemplate;
  scale: number;
  assets: CadTemplateAsset[];
  annotations: CadTemplateAnnotation[];
  connectors: CadTemplateConnector[];
  warnings: string[];
}

const asset = (
  ref: string,
  kind: string,
  label: string,
  x: number,
  y: number,
  w: number,
  h: number,
  layer: CadLayerId,
  tags: string[],
  rotation = 0,
): CadTemplateAsset => ({ ref, kind, label, x, y, w, h, layer, tags, rotation });

const note = (
  ref: string,
  text: string,
  x: number,
  y: number,
  layer: CadLayerId,
): CadTemplateAnnotation => ({ ref, type: "text", text, x, y, layer });

export const CAD_LAYOUT_TEMPLATES: CadLayoutTemplate[] = [
  {
    id: "smt-line",
    label: "SMT line",
    description: "Printer, SPI, pick-and-place, reflow, AOI, inspection, and packing with material flow.",
    category: "production",
    baseWidth: 17000,
    baseHeight: 5600,
    assets: [
      asset("infeed", "conveyor", "Infeed conveyor", 700, 2200, 1300, 500, "flow", ["smt", "flow"]),
      asset("printer", "printer", "Stencil printer", 2300, 2000, 1400, 900, "equipment", ["smt", "printer"]),
      asset("spi", "machine", "SPI", 4200, 2000, 1100, 900, "equipment", ["smt", "inspection"]),
      asset("pnp1", "machine", "Pick and place 1", 5700, 1800, 1700, 1200, "equipment", ["smt", "placement"]),
      asset("pnp2", "machine", "Pick and place 2", 7700, 1800, 1700, 1200, "equipment", ["smt", "placement"]),
      asset("reflow", "oven", "Reflow oven", 9900, 1750, 2800, 1300, "equipment", ["smt", "reflow"]),
      asset("aoi", "aoi", "AOI", 13200, 1900, 1500, 1000, "equipment", ["smt", "aoi"]),
      asset("pack", "workbench", "Packing bench", 15100, 2000, 1300, 850, "equipment", ["packing"]),
      asset("operator", "operator", "Operator", 2450, 3350, 600, 600, "equipment", ["operator"]),
      asset("esd", "zone", "ESD controlled zone", 500, 1300, 16000, 2800, "safety", ["esd", "controlled-area"]),
      asset("front-aisle", "agvpath", "Front material aisle", 500, 4400, 16000, 700, "aisles", ["aisle", "material-flow"]),
    ],
    annotations: [
      note("label", "SMT Line - editable template", 620, 900, "measurements"),
      note("takt", "Flow: infeed -> packing", 11300, 4100, "flow"),
    ],
    connectors: [
      { fromRef: "infeed", toRef: "printer", kind: "flow" },
      { fromRef: "printer", toRef: "spi", kind: "flow" },
      { fromRef: "spi", toRef: "pnp1", kind: "flow" },
      { fromRef: "pnp1", toRef: "pnp2", kind: "flow" },
      { fromRef: "pnp2", toRef: "reflow", kind: "flow" },
      { fromRef: "reflow", toRef: "aoi", kind: "flow" },
      { fromRef: "aoi", toRef: "pack", kind: "flow" },
    ],
  },
  {
    id: "warehouse-racks",
    label: "Warehouse racks",
    description: "Rack rows, forklift aisles, receiving, staging, and supermarket lanes.",
    category: "warehouse",
    baseWidth: 18000,
    baseHeight: 11000,
    assets: [
      asset("receiving", "zone", "Receiving dock", 700, 700, 3500, 1700, "layout", ["receiving", "dock"]),
      asset("shipping", "zone", "Shipping dock", 13800, 700, 3500, 1700, "layout", ["shipping", "dock"]),
      asset("forklift-main", "agvpath", "Forklift main aisle", 800, 4900, 16400, 1000, "aisles", ["forklift", "aisle"]),
      asset("rack-a1", "rack", "Rack A1", 1600, 3200, 4200, 900, "equipment", ["warehouse", "rack"]),
      asset("rack-a2", "rack", "Rack A2", 6300, 3200, 4200, 900, "equipment", ["warehouse", "rack"]),
      asset("rack-a3", "rack", "Rack A3", 11000, 3200, 4200, 900, "equipment", ["warehouse", "rack"]),
      asset("rack-b1", "rack", "Rack B1", 1600, 6500, 4200, 900, "equipment", ["warehouse", "rack"]),
      asset("rack-b2", "rack", "Rack B2", 6300, 6500, 4200, 900, "equipment", ["warehouse", "rack"]),
      asset("rack-b3", "rack", "Rack B3", 11000, 6500, 4200, 900, "equipment", ["warehouse", "rack"]),
      asset("supermarket", "zone", "Line supermarket", 800, 8700, 7600, 1500, "layout", ["supermarket", "kitting"]),
      asset("quarantine", "fence", "Quarantine cage", 9300, 8500, 2600, 1800, "safety", ["quality", "quarantine"]),
      asset("pallets", "pallet", "Pallet staging", 12600, 8400, 3600, 1800, "layout", ["pallet", "staging"]),
    ],
    annotations: [
      note("label", "Warehouse receiving / shipping", 900, 290, "measurements"),
      note("aisle", "Main forklift aisle", 7400, 4650, "aisles"),
    ],
    connectors: [
      { fromRef: "receiving", toRef: "supermarket", kind: "material" },
      { fromRef: "supermarket", toRef: "shipping", kind: "material" },
    ],
  },
  {
    id: "packing-shipping-cell",
    label: "Packing cell",
    description: "Packing benches, label print, carton staging, pallet staging, QA hold, and shipping lane.",
    category: "shipping",
    baseWidth: 12500,
    baseHeight: 7800,
    assets: [
      asset("inbound-wip", "zone", "Inbound WIP lane", 500, 2400, 1800, 1800, "layout", ["wip", "packing"]),
      asset("pack-a", "workbench", "Pack bench A", 3000, 1400, 1600, 900, "equipment", ["packing"]),
      asset("pack-b", "workbench", "Pack bench B", 3000, 2900, 1600, 900, "equipment", ["packing"]),
      asset("label", "desk", "Label print", 5100, 2100, 1300, 900, "equipment", ["label-print"]),
      asset("cartons", "zone", "Carton staging", 7200, 1200, 2100, 1900, "layout", ["carton", "staging"]),
      asset("pallet", "pallet", "Pallet staging", 7200, 3900, 2600, 1700, "layout", ["pallet", "staging"]),
      asset("qa-hold", "fence", "QA hold", 10100, 1400, 1600, 1600, "safety", ["quality", "hold"]),
      asset("ship", "agvpath", "Shipping lane", 10100, 4200, 1600, 2500, "aisles", ["shipping", "aisle"]),
    ],
    annotations: [
      note("label", "Packing / shipping cell", 600, 650, "measurements"),
      note("qa", "QA hold before ship", 9600, 1050, "safety"),
    ],
    connectors: [
      { fromRef: "inbound-wip", toRef: "pack-a", kind: "flow" },
      { fromRef: "pack-a", toRef: "label", kind: "flow" },
      { fromRef: "pack-b", toRef: "label", kind: "flow" },
      { fromRef: "label", toRef: "pallet", kind: "flow" },
      { fromRef: "pallet", toRef: "ship", kind: "flow" },
    ],
  },
  {
    id: "ems-mini-factory",
    label: "EMS mini factory",
    description: "End-to-end EMS starter: receiving, supermarket, SMT, inspection, rework, packing, shipping, and safety zones.",
    category: "factory",
    baseWidth: 22000,
    baseHeight: 14000,
    assets: [
      asset("receiving", "zone", "Receiving", 900, 900, 3200, 1600, "layout", ["receiving"]),
      asset("supermarket", "zone", "Material supermarket", 900, 3500, 4200, 1800, "layout", ["supermarket", "kitting"]),
      asset("smt-printer", "printer", "SMT printer", 6500, 2500, 1300, 850, "equipment", ["smt"]),
      asset("smt-pnp", "machine", "SMT pick and place", 8500, 2300, 2200, 1200, "equipment", ["smt"]),
      asset("reflow", "oven", "Reflow", 11300, 2250, 2600, 1300, "equipment", ["smt", "reflow"]),
      asset("aoi", "aoi", "AOI", 14600, 2450, 1500, 1000, "equipment", ["quality", "aoi"]),
      asset("inspection", "workbench", "Inspection", 16600, 6100, 1600, 900, "equipment", ["inspection"]),
      asset("rework", "workbench", "Rework", 14100, 7300, 1600, 900, "equipment", ["rework"]),
      asset("test", "machine", "Functional test", 11200, 6100, 1700, 1100, "equipment", ["test"]),
      asset("packing", "workbench", "Packing", 17100, 9300, 1700, 900, "equipment", ["packing"]),
      asset("shipping", "zone", "Shipping", 17100, 11300, 3200, 1600, "layout", ["shipping"]),
      asset("main-aisle", "agvpath", "Main material aisle", 5600, 4600, 11500, 900, "aisles", ["aisle", "material-flow"]),
      asset("esd", "zone", "ESD controlled production", 5900, 1500, 11200, 3400, "safety", ["esd", "controlled-area"]),
      asset("no-go", "fence", "Maintenance no-go", 6500, 9400, 3000, 1800, "safety", ["no-go", "maintenance"]),
    ],
    annotations: [
      note("title", "EMS mini factory - editable layout", 900, 500, "measurements"),
      note("flow", "Receiving -> SMT -> test -> pack -> ship", 7300, 5600, "flow"),
      note("safety", "ESD + no-go zones included", 6300, 8800, "safety"),
    ],
    connectors: [
      { fromRef: "receiving", toRef: "supermarket", kind: "material" },
      { fromRef: "supermarket", toRef: "smt-printer", kind: "material" },
      { fromRef: "smt-printer", toRef: "smt-pnp", kind: "flow" },
      { fromRef: "smt-pnp", toRef: "reflow", kind: "flow" },
      { fromRef: "reflow", toRef: "aoi", kind: "flow" },
      { fromRef: "aoi", toRef: "test", kind: "flow" },
      { fromRef: "test", toRef: "inspection", kind: "flow" },
      { fromRef: "inspection", toRef: "rework", kind: "flow" },
      { fromRef: "inspection", toRef: "packing", kind: "flow" },
      { fromRef: "packing", toRef: "shipping", kind: "flow" },
    ],
  },
];

export function getCadLayoutTemplate(
  id: CadLayoutTemplateId,
): CadLayoutTemplate | undefined {
  return CAD_LAYOUT_TEMPLATES.find((template) => template.id === id);
}

function snap(value: number, gridSize: number): number {
  const grid = Math.max(1, Math.abs(gridSize || 1));
  return Math.round(value / grid) * grid;
}

function scaleValue(value: number, scale: number, gridSize: number): number {
  return Math.max(gridSize, snap(value * scale, gridSize));
}

export function instantiateCadLayoutTemplate(
  id: CadLayoutTemplateId,
  footprint: { width: number; height: number; gridSize?: number },
): CadTemplateInstantiation {
  const template = getCadLayoutTemplate(id);
  if (!template) throw new Error(`Unknown CAD layout template: ${id}`);
  const gridSize = Math.max(1, footprint.gridSize ?? 100);
  const width = Math.max(gridSize, footprint.width);
  const height = Math.max(gridSize, footprint.height);
  const fitScale = Math.min(
    1,
    width / template.baseWidth,
    height / template.baseHeight,
  );
  const scale = Math.max(0.35, fitScale);
  const scaledWidth = template.baseWidth * scale;
  const scaledHeight = template.baseHeight * scale;
  const offsetX = Math.max(0, (width - scaledWidth) / 2);
  const offsetY = Math.max(0, (height - scaledHeight) / 2);
  const warnings: string[] = [];
  if (fitScale < 1)
    warnings.push(
      `Template scaled to ${Math.round(scale * 100)}% to fit the footprint.`,
    );

  const assets = template.assets.map((item) => {
    const w = Math.min(width, scaleValue(item.w, scale, gridSize));
    const h = Math.min(height, scaleValue(item.h, scale, gridSize));
    const x = snap(offsetX + item.x * scale, gridSize);
    const y = snap(offsetY + item.y * scale, gridSize);
    const clampedX = Math.max(0, Math.min(width - w, x));
    const clampedY = Math.max(0, Math.min(height - h, y));
    if (clampedX !== x || clampedY !== y)
      warnings.push(`${item.label} was clipped to the footprint.`);
    return {
      ...item,
      x: clampedX,
      y: clampedY,
      w,
      h,
    };
  });

  const annotations = template.annotations.map((item) => ({
    ...item,
    x: Math.max(0, Math.min(width, snap(offsetX + item.x * scale, gridSize))),
    y: Math.max(0, Math.min(height, snap(offsetY + item.y * scale, gridSize))),
  }));

  return {
    template,
    scale,
    assets,
    annotations,
    connectors: template.connectors.map((connector) => ({ ...connector })),
    warnings: [...new Set(warnings)],
  };
}
