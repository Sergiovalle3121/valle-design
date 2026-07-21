import type { CadLayerId } from "./layers";

export type CadLayoutTemplateId =
  | "ems-mini-factory"
  | "smt-line"
  | "supermarket-kitting"
  | "warehouse-racks"
  | "packing-shipping-cell"
  | "architecture-floor-core"
  | "civil-site-utilities"
  | "structural-grid-core"
  | "mep-plantroom"
  // CAD universal (AXOS-CAD-UNIVERSAL-002): arranques para cualquiera.
  | "casa-habitacion"
  | "local-comercial"
  | "consultorio"
  | "restaurante"
  | "aula-escolar"
  | "gimnasio"
  | "oficina-coworking"
  | "bodega-pyme"
  | "taller-mecanico"
  | "cafeteria";

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
  category: "factory" | "production" | "warehouse" | "shipping" | "architecture" | "civil" | "structure" | "mep";
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
    id: "architecture-floor-core",
    label: "Architecture floor core",
    description: "Architectural starter with exterior walls, rooms, doors, columns, stairs, service core, dimensions, and egress zones.",
    category: "architecture",
    baseWidth: 24000,
    baseHeight: 16000,
    assets: [
      asset("shell", "room", "Building shell", 700, 700, 22600, 14600, "architecture", ["architecture", "shell", "gross-area"]),
      asset("lobby", "room", "Lobby / reception", 1300, 1300, 5200, 3600, "architecture", ["room", "use:lobby", "dept:front-office"]),
      asset("open-office", "room", "Open studio", 7000, 1300, 7600, 5400, "architecture", ["room", "use:office", "dept:engineering"]),
      asset("meeting", "room", "Meeting room", 15100, 1300, 3600, 3000, "architecture", ["room", "use:meeting", "dept:engineering"]),
      asset("lab", "room", "Engineering lab", 15100, 4700, 3600, 4200, "architecture", ["room", "use:lab", "dept:engineering"]),
      asset("warehouse", "room", "Warehouse / storage", 1300, 7600, 6500, 5600, "architecture", ["room", "use:warehouse", "dept:operations"]),
      asset("utility", "room", "MEP / utility", 8200, 7600, 3100, 2700, "utilities", ["room", "use:utility", "dept:facilities"]),
      asset("restrooms", "room", "Restrooms", 8200, 10600, 3100, 2600, "architecture", ["room", "use:restroom", "dept:shared"]),
      asset("production", "room", "Flexible production hall", 11900, 9500, 10100, 3400, "architecture", ["room", "use:production", "dept:operations"]),
      asset("egress", "agvpath", "Main egress corridor", 1300, 6500, 20700, 700, "aisles", ["egress", "corridor", "life-safety"]),
      asset("stair", "stair", "Stair core", 19100, 1300, 2900, 3000, "structure", ["stairs", "egress"]),
      asset("col-a", "column", "C1", 6900, 7200, 450, 450, "structure", ["column", "grid:a"]),
      asset("col-b", "column", "C2", 11600, 7200, 450, 450, "structure", ["column", "grid:b"]),
      asset("col-c", "column", "C3", 16100, 7200, 450, 450, "structure", ["column", "grid:c"]),
      asset("front-door", "door", "Main double door", 3250, 650, 1700, 260, "architecture", ["door", "egress", "opening:main"]),
      asset("dock-door", "door", "Service roll-up door", 1800, 13150, 2600, 300, "architecture", ["door", "dock", "opening:service"]),
    ],
    annotations: [
      note("title", "Architectural floor core - editable universal CAD template", 1200, 420, "measurements"),
      note("egress-note", "Egress corridor, doors, rooms, columns, and MEP core are separate CAD layers", 7200, 6200, "safety"),
    ],
    connectors: [
      { fromRef: "front-door", toRef: "lobby", kind: "flow" },
      { fromRef: "lobby", toRef: "egress", kind: "flow" },
      { fromRef: "egress", toRef: "production", kind: "flow" },
      { fromRef: "warehouse", toRef: "dock-door", kind: "material" },
    ],
  },
  {
    id: "civil-site-utilities",
    label: "Civil site + utilities",
    description: "Site plan starter with building pad, roads, parking, stormwater, electrical, water, compressed air, and safety setbacks.",
    category: "civil",
    baseWidth: 42000,
    baseHeight: 26000,
    assets: [
      asset("property", "zone", "Property boundary", 800, 800, 40400, 24400, "layout", ["site", "boundary"]),
      asset("building", "room", "Building pad", 10400, 6200, 16400, 9800, "architecture", ["building", "pad"]),
      asset("truck-road", "agvpath", "Truck loop road", 3000, 3600, 36000, 1600, "aisles", ["road", "truck", "fire-lane"]),
      asset("south-road", "agvpath", "South service road", 3000, 19900, 36000, 1400, "aisles", ["road", "service"]),
      asset("parking", "zone", "Parking field", 28400, 7100, 9000, 8200, "layout", ["parking", "site"]),
      asset("storm", "zone", "Stormwater basin", 5200, 17100, 7600, 4800, "utilities", ["stormwater", "detention"]),
      asset("substation", "cabinet", "Electrical substation", 5200, 6900, 2600, 2100, "utilities", ["electrical", "utility"]),
      asset("water", "cabinet", "Water service", 5200, 10100, 2100, 1500, "utilities", ["water", "utility"]),
      asset("air", "cabinet", "Compressed air yard", 5200, 12600, 2400, 1600, "utilities", ["compressed-air", "utility"]),
      asset("setback", "fence", "Fire / code setback", 9300, 5100, 18500, 12000, "safety", ["setback", "code", "fire"]),
      asset("dock", "door", "Truck dock apron", 12400, 16050, 5200, 700, "architecture", ["dock", "apron"]),
    ],
    annotations: [
      note("title", "Civil site + utilities - editable universal CAD template", 1200, 500, "measurements"),
      note("utilities", "Utility nodes and roads are layer-separated for takeoff / DXF export", 15000, 18800, "utilities"),
    ],
    connectors: [
      { fromRef: "substation", toRef: "building", kind: "material" },
      { fromRef: "water", toRef: "building", kind: "material" },
      { fromRef: "air", toRef: "building", kind: "material" },
      { fromRef: "truck-road", toRef: "dock", kind: "flow" },
    ],
  },
  {
    id: "structural-grid-core",
    label: "Structural grid core",
    description: "Column grid, shear/core zones, beams as walls, stairs, expansion joint, and inspection clearances for structural planning.",
    category: "structure",
    baseWidth: 30000,
    baseHeight: 21000,
    assets: [
      asset("grid-a", "wall", "Grid A datum", 1800, 2400, 26000, 80, "measurements", ["grid", "datum", "axis:a"]),
      asset("grid-b", "wall", "Grid B datum", 1800, 8600, 26000, 80, "measurements", ["grid", "datum", "axis:b"]),
      asset("grid-c", "wall", "Grid C datum", 1800, 14800, 26000, 80, "measurements", ["grid", "datum", "axis:c"]),
      asset("core", "room", "Shear / elevator core", 11600, 6200, 5200, 5200, "structure", ["core", "shear-wall", "vertical-transport"]),
      asset("stair-a", "stair", "Stair A", 4800, 4200, 3000, 3600, "structure", ["stairs", "egress"]),
      asset("stair-b", "stair", "Stair B", 21600, 12800, 3000, 3600, "structure", ["stairs", "egress"]),
      asset("joint", "fence", "Expansion joint / seismic gap", 14500, 900, 360, 19000, "safety", ["expansion-joint", "seismic", "clearance"]),
      asset("c1", "column", "A1", 4200, 4000, 520, 520, "structure", ["column", "grid:a1"]),
      asset("c2", "column", "A2", 10200, 4000, 520, 520, "structure", ["column", "grid:a2"]),
      asset("c3", "column", "A3", 16200, 4000, 520, 520, "structure", ["column", "grid:a3"]),
      asset("c4", "column", "A4", 22200, 4000, 520, 520, "structure", ["column", "grid:a4"]),
      asset("c5", "column", "B1", 4200, 10200, 520, 520, "structure", ["column", "grid:b1"]),
      asset("c6", "column", "B2", 10200, 10200, 520, 520, "structure", ["column", "grid:b2"]),
      asset("c7", "column", "B3", 16200, 10200, 520, 520, "structure", ["column", "grid:b3"]),
      asset("c8", "column", "B4", 22200, 10200, 520, 520, "structure", ["column", "grid:b4"]),
      asset("c9", "column", "C1", 4200, 16400, 520, 520, "structure", ["column", "grid:c1"]),
      asset("c10", "column", "C2", 10200, 16400, 520, 520, "structure", ["column", "grid:c2"]),
      asset("c11", "column", "C3", 16200, 16400, 520, 520, "structure", ["column", "grid:c3"]),
      asset("c12", "column", "C4", 22200, 16400, 520, 520, "structure", ["column", "grid:c4"]),
    ],
    annotations: [
      note("title", "Structural grid core - editable universal CAD template", 1200, 700, "measurements"),
      note("joint-note", "Expansion joint and structural core are explicit validation/takeoff objects", 15400, 1900, "safety"),
    ],
    connectors: [],
  },
  {
    id: "mep-plantroom",
    label: "MEP plantroom",
    description: "Mechanical/electrical plantroom with utility rooms, transformer, pumps, compressor, maintenance envelope, and service paths.",
    category: "mep",
    baseWidth: 22000,
    baseHeight: 15000,
    assets: [
      asset("plant", "room", "MEP plantroom shell", 900, 900, 20200, 13200, "architecture", ["room", "use:utility", "dept:facilities"]),
      asset("electrical", "room", "Electrical room", 1600, 1600, 4800, 3900, "utilities", ["electrical", "switchgear", "use:utility"]),
      asset("mechanical", "room", "Mechanical room", 7200, 1600, 6100, 3900, "utilities", ["mechanical", "hvac", "use:utility"]),
      asset("pump", "room", "Pump room", 14100, 1600, 5200, 3900, "utilities", ["pump", "water", "use:utility"]),
      asset("service-aisle", "agvpath", "Service aisle", 1600, 6500, 17700, 900, "aisles", ["service", "maintenance", "egress"]),
      asset("transformer", "cabinet", "Transformer / switchgear", 2500, 2800, 2500, 1200, "utilities", ["electrical", "transformer"]),
      asset("ahu", "machine", "Air handling unit", 8300, 2550, 3600, 1500, "utilities", ["hvac", "ahu"]),
      asset("compressor", "machine", "Compressed air skid", 8500, 9200, 3000, 1700, "utilities", ["compressed-air", "skid"]),
      asset("pump-skid", "machine", "Pump skid", 15100, 2700, 3000, 1500, "utilities", ["pump", "water"]),
      asset("maintenance", "fence", "Maintenance clearance", 7600, 8200, 5200, 3300, "safety", ["maintenance", "clearance", "restricted"]),
      asset("egress-door", "door", "Rated egress door", 10200, 13950, 1700, 260, "architecture", ["door", "egress"]),
    ],
    annotations: [
      note("title", "MEP plantroom - editable universal CAD template", 1200, 520, "measurements"),
      note("clearance", "Maintenance envelopes and utility rooms are layer-separated", 7600, 7900, "safety"),
    ],
    connectors: [
      { fromRef: "transformer", toRef: "electrical", kind: "material" },
      { fromRef: "ahu", toRef: "mechanical", kind: "material" },
      { fromRef: "pump-skid", toRef: "pump", kind: "material" },
      { fromRef: "compressor", toRef: "service-aisle", kind: "flow" },
    ],
  },
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
    id: "supermarket-kitting",
    label: "Supermarket + kitting",
    description: "Kanban lanes, kitting carts, FIFO WIP, ESD boundary, and forklift/pedestrian aisles.",
    category: "warehouse",
    baseWidth: 15500,
    baseHeight: 9200,
    assets: [
      asset("receiving", "zone", "Receiving drop", 700, 900, 2600, 1400, "layout", ["receiving", "drop-zone"]),
      asset("incoming-qc", "workbench", "Incoming QC", 3700, 950, 1400, 850, "equipment", ["quality", "incoming"]),
      asset("supermarket", "zone", "Material supermarket", 5600, 750, 4700, 1900, "layout", ["supermarket", "kitting"]),
      asset("kanban-a", "zone", "Kanban lane A", 5800, 3300, 2600, 650, "layout", ["kanban", "lane-a"]),
      asset("kanban-b", "zone", "Kanban lane B", 5800, 4250, 2600, 650, "layout", ["kanban", "lane-b"]),
      asset("kanban-c", "zone", "Kanban lane C", 5800, 5200, 2600, 650, "layout", ["kanban", "lane-c"]),
      asset("cart-a", "agv", "Kitting cart A", 9000, 3200, 1100, 750, "equipment", ["kitting", "cart"]),
      asset("cart-b", "agv", "Kitting cart B", 9000, 4200, 1100, 750, "equipment", ["kitting", "cart"]),
      asset("cart-c", "agv", "Kitting cart C", 9000, 5200, 1100, 750, "equipment", ["kitting", "cart"]),
      asset("fifo", "zone", "FIFO WIP lane", 10800, 3450, 2100, 2200, "layout", ["fifo", "wip"]),
      asset("point-of-use", "zone", "Line-side delivery", 13200, 3600, 1700, 2000, "layout", ["line-side", "delivery"]),
      asset("replenishment", "rack", "Replenishment rack", 10800, 950, 2900, 900, "equipment", ["replenishment", "rack"]),
      asset("kanban-board", "cabinet", "Kanban board", 14100, 1050, 650, 500, "equipment", ["kanban", "visual-management"]),
      asset("forklift-aisle", "agvpath", "Forklift replenishment aisle", 500, 6650, 14500, 850, "aisles", ["forklift", "aisle"]),
      asset("pedestrian", "agvpath", "Pedestrian pick aisle", 500, 2700, 14500, 450, "aisles", ["pedestrian", "aisle"]),
      asset("esd", "zone", "ESD controlled kitting", 5350, 650, 9900, 5450, "safety", ["esd", "controlled-area"]),
      asset("quarantine", "fence", "Material quarantine", 900, 3900, 2500, 1600, "safety", ["quality", "quarantine"]),
      asset("operator", "operator", "Kitting operator", 10100, 4350, 600, 600, "equipment", ["operator", "kitting"]),
    ],
    annotations: [
      note("title", "Supermarket + kitting - editable template", 750, 450, "measurements"),
      note("pull", "Pull flow: receiving -> supermarket -> cart -> line-side", 5900, 3050, "flow"),
      note("safety", "ESD boundary + quarantine included", 5400, 6300, "safety"),
    ],
    connectors: [
      { fromRef: "receiving", toRef: "incoming-qc", kind: "material" },
      { fromRef: "incoming-qc", toRef: "supermarket", kind: "material" },
      { fromRef: "supermarket", toRef: "kanban-a", kind: "material" },
      { fromRef: "kanban-a", toRef: "cart-a", kind: "flow" },
      { fromRef: "kanban-b", toRef: "cart-b", kind: "flow" },
      { fromRef: "kanban-c", toRef: "cart-c", kind: "flow" },
      { fromRef: "cart-a", toRef: "fifo", kind: "flow" },
      { fromRef: "cart-b", toRef: "fifo", kind: "flow" },
      { fromRef: "cart-c", toRef: "fifo", kind: "flow" },
      { fromRef: "fifo", toRef: "point-of-use", kind: "flow" },
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
  {
    id: "casa-habitacion",
    label: "Casa habitación",
    description: "Arranque universal: sala, comedor, cocina, dos recámaras y baño con muebles a medidas reales — edítalo a tu gusto.",
    category: "architecture",
    baseWidth: 12000,
    baseHeight: 8000,
    assets: [
      asset("shell", "room", "Muro perimetral", 700, 700, 10600, 6600, "architecture", ["architecture", "shell", "casa"]),
      asset("sala", "room", "Sala", 1300, 1300, 3600, 3000, "architecture", ["room", "use:living", "casa"]),
      asset("comedor", "room", "Comedor", 5100, 1300, 3000, 3000, "architecture", ["room", "use:dining", "casa"]),
      asset("cocina", "room", "Cocina", 8300, 1300, 2200, 3000, "architecture", ["room", "use:kitchen", "casa"]),
      asset("recamara-1", "room", "Recámara principal", 1300, 4500, 3400, 2600, "architecture", ["room", "use:bedroom", "casa"]),
      asset("recamara-2", "room", "Recámara 2", 4900, 4500, 2800, 2600, "architecture", ["room", "use:bedroom", "casa"]),
      asset("bano", "room", "Baño", 7900, 4500, 1600, 2600, "architecture", ["room", "use:restroom", "casa"]),
      asset("puerta-principal", "door", "Puerta principal", 2500, 650, 900, 260, "architecture", ["door", "opening:main"]),
      asset("cama", "furniture", "Cama matrimonial", 1500, 4800, 1400, 2000, "equipment", ["furniture", "bed"]),
      asset("sofa", "furniture", "Sofá 3 plazas", 1500, 1500, 2100, 900, "equipment", ["furniture", "sofa"]),
      asset("mesa", "furniture", "Mesa comedor 4", 5700, 2000, 1200, 800, "equipment", ["furniture", "table"]),
      asset("estufa", "furniture", "Estufa", 8450, 1500, 760, 600, "equipment", ["furniture", "stove"]),
    ],
    annotations: [
      note("titulo", "Casa habitación — plantilla universal editable", 1200, 420, "measurements"),
    ],
    connectors: [
      { fromRef: "puerta-principal", toRef: "sala", kind: "flow" },
    ],
  },
  {
    id: "local-comercial",
    label: "Local comercial",
    description: "Arranque universal de tienda: piso de venta con mostrador y góndolas, bodega y baño.",
    category: "architecture",
    baseWidth: 10000,
    baseHeight: 7000,
    assets: [
      asset("shell", "room", "Muro perimetral", 700, 700, 8600, 5600, "architecture", ["architecture", "shell", "tienda"]),
      asset("piso-venta", "room", "Piso de venta", 1300, 1300, 5400, 4400, "architecture", ["room", "use:retail", "tienda"]),
      asset("bodega", "room", "Bodega", 7000, 1300, 2000, 2600, "architecture", ["room", "use:warehouse", "tienda"]),
      asset("bano", "room", "Baño", 7000, 4100, 2000, 1600, "architecture", ["room", "use:restroom", "tienda"]),
      asset("entrada", "door", "Entrada", 2600, 650, 1200, 260, "architecture", ["door", "opening:main"]),
      asset("mostrador", "furniture", "Mostrador con caja", 1500, 1500, 1800, 600, "equipment", ["furniture", "counter", "pos"]),
      asset("gondola-1", "furniture", "Góndola 1", 1500, 2600, 1200, 500, "equipment", ["furniture", "shelf"]),
      asset("gondola-2", "furniture", "Góndola 2", 3100, 2600, 1200, 500, "equipment", ["furniture", "shelf"]),
      asset("gondola-3", "furniture", "Góndola 3", 4700, 2600, 1200, 500, "equipment", ["furniture", "shelf"]),
    ],
    annotations: [
      note("titulo", "Local comercial — plantilla universal editable", 1200, 420, "measurements"),
    ],
    connectors: [
      { fromRef: "entrada", toRef: "piso-venta", kind: "flow" },
      { fromRef: "bodega", toRef: "piso-venta", kind: "material" },
    ],
  },
  {
    id: "consultorio",
    label: "Consultorio",
    description: "Arranque universal de consultorio: sala de espera con recepción, área de consulta y baño.",
    category: "architecture",
    baseWidth: 9000,
    baseHeight: 6000,
    assets: [
      asset("shell", "room", "Muro perimetral", 700, 700, 7600, 4600, "architecture", ["architecture", "shell", "consultorio"]),
      asset("espera", "room", "Sala de espera", 1300, 1300, 3200, 3800, "architecture", ["room", "use:lobby", "consultorio"]),
      asset("consulta", "room", "Consultorio", 4700, 1300, 3400, 2600, "architecture", ["room", "use:exam", "consultorio"]),
      asset("bano", "room", "Baño", 4700, 4100, 1800, 1000, "architecture", ["room", "use:restroom", "consultorio"]),
      asset("entrada", "door", "Entrada", 2200, 650, 900, 260, "architecture", ["door", "opening:main"]),
      asset("recepcion", "furniture", "Recepción", 1500, 1500, 1200, 600, "equipment", ["furniture", "desk"]),
      asset("escritorio", "furniture", "Escritorio médico", 4900, 1500, 1200, 600, "equipment", ["furniture", "desk"]),
      asset("camilla", "furniture", "Camilla", 6500, 2400, 700, 1900, "equipment", ["furniture", "bed", "exam"]),
    ],
    annotations: [
      note("titulo", "Consultorio — plantilla universal editable", 1200, 420, "measurements"),
    ],
    connectors: [
      { fromRef: "entrada", toRef: "espera", kind: "flow" },
      { fromRef: "espera", toRef: "consulta", kind: "flow" },
    ],
  },
  {
    id: "restaurante",
    label: "Restaurante",
    description: "Arranque universal de restaurante: comedor con mesas, barra, cocina y baños.",
    category: "architecture",
    baseWidth: 12000,
    baseHeight: 8000,
    assets: [
      asset("shell", "room", "Muro perimetral", 700, 700, 10600, 6600, "architecture", ["architecture", "shell", "restaurante"]),
      asset("comedor", "room", "Comedor", 1300, 1300, 6000, 5400, "architecture", ["room", "use:dining", "restaurante"]),
      asset("cocina", "room", "Cocina", 7700, 1300, 2900, 3000, "architecture", ["room", "use:kitchen", "restaurante"]),
      asset("banos", "room", "Baños", 7700, 4700, 2900, 1600, "architecture", ["room", "use:restroom", "restaurante"]),
      asset("entrada", "door", "Entrada", 2600, 650, 1200, 260, "architecture", ["door", "opening:main"]),
      asset("barra", "furniture", "Barra con caja", 1500, 1500, 2500, 650, "equipment", ["furniture", "bar", "pos"]),
      asset("mesa-1", "furniture", "Mesa 4 personas", 1800, 3000, 900, 900, "equipment", ["furniture", "table", "dining"]),
      asset("mesa-2", "furniture", "Mesa 4 personas", 3400, 3000, 900, 900, "equipment", ["furniture", "table", "dining"]),
      asset("mesa-3", "furniture", "Mesa 4 personas", 5000, 3000, 900, 900, "equipment", ["furniture", "table", "dining"]),
      asset("mesa-4", "furniture", "Mesa 4 personas", 1800, 4900, 900, 900, "equipment", ["furniture", "table", "dining"]),
      asset("mesa-5", "furniture", "Mesa 4 personas", 3400, 4900, 900, 900, "equipment", ["furniture", "table", "dining"]),
      asset("mesa-6", "furniture", "Mesa 4 personas", 5000, 4900, 900, 900, "equipment", ["furniture", "table", "dining"]),
      asset("estufa", "furniture", "Estufa 6 quemadores", 8000, 1600, 900, 700, "equipment", ["kitchen", "stove"]),
      asset("refri", "furniture", "Refrigerador", 9600, 1600, 800, 750, "equipment", ["kitchen", "refrigerator"]),
      asset("tarja", "furniture", "Tarja doble", 8000, 3300, 1000, 550, "equipment", ["kitchen", "sink"]),
    ],
    annotations: [
      note("titulo", "Restaurante — plantilla universal editable", 1200, 420, "measurements"),
    ],
    connectors: [
      { fromRef: "entrada", toRef: "comedor", kind: "flow" },
      { fromRef: "cocina", toRef: "comedor", kind: "material" },
    ],
  },
  {
    id: "aula-escolar",
    label: "Aula escolar",
    description: "Arranque universal de salón de clases: pizarrón al frente, escritorio del profesor y retícula de 12 pupitres.",
    category: "architecture",
    baseWidth: 9000,
    baseHeight: 7000,
    assets: [
      asset("shell", "room", "Muro perimetral", 700, 700, 7600, 5600, "architecture", ["architecture", "shell", "aula"]),
      asset("entrada", "door", "Entrada", 1200, 650, 900, 260, "architecture", ["door", "opening:main"]),
      asset("pizarron", "whiteboard", "Pizarrón", 2800, 1000, 2400, 100, "equipment", ["whiteboard", "escuela"]),
      asset("profesor", "furniture", "Escritorio del profesor", 6200, 1300, 1200, 600, "equipment", ["furniture", "desk", "profesor"]),
      asset("pupitre-1", "school-desk", "Pupitre", 2000, 2600, 600, 500, "equipment", ["furniture", "pupitre"]),
      asset("pupitre-2", "school-desk", "Pupitre", 3800, 2600, 600, 500, "equipment", ["furniture", "pupitre"]),
      asset("pupitre-3", "school-desk", "Pupitre", 5600, 2600, 600, 500, "equipment", ["furniture", "pupitre"]),
      asset("pupitre-4", "school-desk", "Pupitre", 2000, 3400, 600, 500, "equipment", ["furniture", "pupitre"]),
      asset("pupitre-5", "school-desk", "Pupitre", 3800, 3400, 600, 500, "equipment", ["furniture", "pupitre"]),
      asset("pupitre-6", "school-desk", "Pupitre", 5600, 3400, 600, 500, "equipment", ["furniture", "pupitre"]),
      asset("pupitre-7", "school-desk", "Pupitre", 2000, 4200, 600, 500, "equipment", ["furniture", "pupitre"]),
      asset("pupitre-8", "school-desk", "Pupitre", 3800, 4200, 600, 500, "equipment", ["furniture", "pupitre"]),
      asset("pupitre-9", "school-desk", "Pupitre", 5600, 4200, 600, 500, "equipment", ["furniture", "pupitre"]),
      asset("pupitre-10", "school-desk", "Pupitre", 2000, 5000, 600, 500, "equipment", ["furniture", "pupitre"]),
      asset("pupitre-11", "school-desk", "Pupitre", 3800, 5000, 600, 500, "equipment", ["furniture", "pupitre"]),
      asset("pupitre-12", "school-desk", "Pupitre", 5600, 5000, 600, 500, "equipment", ["furniture", "pupitre"]),
    ],
    annotations: [
      note("titulo", "Aula escolar — plantilla universal editable", 1200, 420, "measurements"),
    ],
    connectors: [
      { fromRef: "entrada", toRef: "pizarron", kind: "flow" },
    ],
  },
  {
    id: "gimnasio",
    label: "Gimnasio",
    description: "Arranque universal de gimnasio: recepción, zona de cardio con caminadoras, zona de pesas y vestidores.",
    category: "architecture",
    baseWidth: 12000,
    baseHeight: 8000,
    assets: [
      asset("shell", "room", "Muro perimetral", 700, 700, 10600, 6600, "architecture", ["architecture", "shell", "gimnasio"]),
      asset("entrada", "door", "Entrada", 1400, 650, 1200, 260, "architecture", ["door", "opening:main"]),
      asset("recepcion", "furniture", "Recepción", 1500, 1400, 1800, 600, "equipment", ["furniture", "counter", "recepcion"]),
      asset("vestidores", "room", "Vestidores y baños", 8300, 1300, 2300, 2600, "architecture", ["room", "use:restroom", "gimnasio"]),
      asset("cardio-1", "treadmill", "Caminadora", 1600, 3000, 800, 1900, "equipment", ["gym", "cardio"]),
      asset("cardio-2", "treadmill", "Caminadora", 2800, 3000, 800, 1900, "equipment", ["gym", "cardio"]),
      asset("cardio-3", "treadmill", "Caminadora", 4000, 3000, 800, 1900, "equipment", ["gym", "cardio"]),
      asset("rack-1", "weight-rack", "Rack de pesas", 6200, 3200, 1800, 600, "equipment", ["gym", "pesas"]),
      asset("rack-2", "weight-rack", "Rack de pesas", 6200, 4400, 1800, 600, "equipment", ["gym", "pesas"]),
      asset("banco-1", "gym-bench", "Banco de gimnasio", 8600, 4400, 1200, 500, "equipment", ["gym", "banco"]),
      asset("banco-2", "gym-bench", "Banco de gimnasio", 8600, 5400, 1200, 500, "equipment", ["gym", "banco"]),
      asset("espera", "furniture", "Sofá de espera", 3800, 1400, 2100, 900, "equipment", ["furniture", "sofa", "espera"]),
    ],
    annotations: [
      note("titulo", "Gimnasio — plantilla universal editable", 1200, 420, "measurements"),
    ],
    connectors: [
      { fromRef: "entrada", toRef: "recepcion", kind: "flow" },
      { fromRef: "recepcion", toRef: "vestidores", kind: "flow" },
    ],
  },
  {
    id: "oficina-coworking",
    label: "Oficina / Coworking",
    description: "Arranque universal de oficina: recepción, seis escritorios en isla, sala de juntas y archivo.",
    category: "architecture",
    baseWidth: 12000,
    baseHeight: 8000,
    assets: [
      asset("shell", "room", "Muro perimetral", 700, 700, 10600, 6600, "architecture", ["architecture", "shell", "oficina"]),
      asset("entrada", "door", "Entrada", 1400, 650, 1200, 260, "architecture", ["door", "opening:main"]),
      asset("recepcion", "furniture", "Recepción", 1500, 1400, 1800, 600, "equipment", ["furniture", "counter", "recepcion"]),
      asset("juntas", "room", "Sala de juntas", 7700, 1300, 2900, 2800, "architecture", ["room", "use:meeting", "oficina"]),
      asset("mesa-juntas", "meeting-table-8", "Mesa de juntas 8", 8200, 1800, 2400, 1100, "equipment", ["furniture", "meeting"]),
      asset("archivo", "room", "Archivo", 7700, 4700, 2900, 1600, "architecture", ["room", "use:storage", "oficina"]),
      asset("archivero-1", "file-cabinet", "Archivero", 7950, 4950, 500, 600, "equipment", ["furniture", "storage"]),
      asset("archivero-2", "file-cabinet", "Archivero", 8650, 4950, 500, 600, "equipment", ["furniture", "storage"]),
      asset("escritorio-1", "desk", "Escritorio", 1800, 3000, 1400, 700, "equipment", ["furniture", "desk"]),
      asset("escritorio-2", "desk", "Escritorio", 3800, 3000, 1400, 700, "equipment", ["furniture", "desk"]),
      asset("escritorio-3", "desk", "Escritorio", 5800, 3000, 1400, 700, "equipment", ["furniture", "desk"]),
      asset("escritorio-4", "desk", "Escritorio", 1800, 4800, 1400, 700, "equipment", ["furniture", "desk"]),
      asset("escritorio-5", "desk", "Escritorio", 3800, 4800, 1400, 700, "equipment", ["furniture", "desk"]),
      asset("escritorio-6", "desk", "Escritorio", 5800, 4800, 1400, 700, "equipment", ["furniture", "desk"]),
    ],
    annotations: [
      note("titulo", "Oficina / Coworking — plantilla universal editable", 1200, 420, "measurements"),
    ],
    connectors: [
      { fromRef: "entrada", toRef: "recepcion", kind: "flow" },
      { fromRef: "recepcion", toRef: "juntas", kind: "flow" },
    ],
  },
  {
    id: "bodega-pyme",
    label: "Bodega PyME",
    description: "Arranque universal de bodega: recibo, cuatro racks en dos filas con pasillo de montacargas, embarque y oficina.",
    category: "warehouse",
    baseWidth: 14000,
    baseHeight: 9000,
    assets: [
      asset("shell", "room", "Muro perimetral", 700, 700, 12600, 7600, "architecture", ["architecture", "shell", "bodega"]),
      asset("porton-recibo", "door", "Portón de recibo", 1600, 650, 2400, 260, "architecture", ["door", "opening:dock"]),
      asset("porton-embarque", "door", "Portón de embarque", 9600, 650, 2400, 260, "architecture", ["door", "opening:dock"]),
      asset("recibo", "zone", "Zona de recibo", 1300, 1300, 3200, 2200, "layout", ["zone", "use:receiving", "bodega"]),
      asset("embarque", "zone", "Zona de embarque", 9100, 1300, 3200, 2200, "layout", ["zone", "use:shipping", "bodega"]),
      asset("rack-1", "warehouse-rack", "Rack A1", 1600, 4300, 2700, 1100, "equipment", ["rack", "storage"]),
      asset("rack-2", "warehouse-rack", "Rack A2", 4800, 4300, 2700, 1100, "equipment", ["rack", "storage"]),
      asset("rack-3", "warehouse-rack", "Rack B1", 1600, 6600, 2700, 1100, "equipment", ["rack", "storage"]),
      asset("rack-4", "warehouse-rack", "Rack B2", 4800, 6600, 2700, 1100, "equipment", ["rack", "storage"]),
      asset("pasillo", "forklift-path", "Pasillo de montacargas", 1600, 5600, 5900, 800, "aisles", ["aisle", "forklift"]),
      asset("oficina", "room", "Oficina de bodega", 9100, 4700, 3200, 2600, "architecture", ["room", "use:office", "bodega"]),
      asset("escritorio-bodega", "desk", "Escritorio", 9600, 5200, 1400, 700, "equipment", ["furniture", "desk"]),
    ],
    annotations: [
      note("titulo", "Bodega PyME — plantilla universal editable", 1200, 420, "measurements"),
    ],
    connectors: [
      { fromRef: "porton-recibo", toRef: "recibo", kind: "material" },
      { fromRef: "recibo", toRef: "rack-1", kind: "material" },
      { fromRef: "rack-2", toRef: "embarque", kind: "material" },
      { fromRef: "embarque", toRef: "porton-embarque", kind: "material" },
    ],
  },
  {
    id: "taller-mecanico",
    label: "Taller mecánico",
    description: "Arranque universal de taller automotriz: dos bahías con elevador, bancos de trabajo, herramientas, llantera y recepción de clientes.",
    category: "factory",
    baseWidth: 12000,
    baseHeight: 8000,
    assets: [
      asset("shell", "room", "Muro perimetral", 700, 700, 10600, 6600, "architecture", ["architecture", "shell", "taller"]),
      asset("porton-servicio", "door", "Portón de servicio", 1900, 650, 2800, 260, "architecture", ["door", "opening:dock"]),
      asset("puerta-clientes", "door", "Puerta de clientes", 9800, 650, 900, 260, "architecture", ["door", "opening:entry"]),
      asset("bahia-1", "zone", "Bahía de servicio 1", 1400, 1100, 3600, 5000, "layout", ["zone", "use:service", "taller"]),
      asset("bahia-2", "zone", "Bahía de servicio 2", 5200, 1100, 3600, 5000, "layout", ["zone", "use:service", "taller"]),
      asset("elevador-1", "car-lift", "Elevador 1", 1500, 1200, 3400, 4800, "equipment", ["lift", "taller"]),
      asset("elevador-2", "car-lift", "Elevador 2", 5300, 1200, 3400, 4800, "equipment", ["lift", "taller"]),
      asset("auto-1", "car", "Auto en servicio", 2300, 1350, 1800, 4500, "equipment", ["car", "taller"]),
      asset("banco-1", "workbench", "Banco de trabajo 1", 1600, 6400, 1800, 750, "equipment", ["workbench", "taller"]),
      asset("banco-2", "workbench", "Banco de trabajo 2", 3600, 6400, 1800, 750, "equipment", ["workbench", "taller"]),
      asset("gabinete", "tool-cabinet", "Gabinete de herramientas", 5600, 6500, 700, 450, "equipment", ["tools", "taller"]),
      asset("compresor", "air-compressor", "Compresor de aire", 6500, 6500, 600, 600, "equipment", ["compressor", "taller"]),
      asset("estante-llantas", "tire-rack", "Estante de llantas", 7300, 6500, 2000, 500, "equipment", ["tires", "storage", "taller"]),
      asset("recepcion", "room", "Recepción de clientes", 9200, 1100, 2000, 2400, "architecture", ["room", "use:office", "taller"]),
      asset("escritorio-recepcion", "desk", "Escritorio de recepción", 9400, 1300, 1400, 700, "equipment", ["furniture", "desk"]),
    ],
    annotations: [
      note("titulo", "Taller mecánico — plantilla universal editable", 1200, 420, "measurements"),
    ],
    connectors: [
      { fromRef: "porton-servicio", toRef: "bahia-1", kind: "material" },
      { fromRef: "porton-servicio", toRef: "bahia-2", kind: "material" },
      { fromRef: "recepcion", toRef: "bahia-1", kind: "flow" },
    ],
  },
  {
    id: "cafeteria",
    label: "Cafetería",
    description: "Arranque universal de cafetería: barra, caja, cocina compacta, cuatro mesas, baño y bodega con estante.",
    category: "architecture",
    baseWidth: 10000,
    baseHeight: 7000,
    assets: [
      asset("shell", "room", "Muro perimetral", 700, 700, 8600, 5600, "architecture", ["architecture", "shell", "cafeteria"]),
      asset("puerta-entrada", "door", "Puerta de entrada", 4500, 650, 900, 260, "architecture", ["door", "opening:entry"]),
      asset("barra", "bar-counter", "Barra de café", 1200, 1400, 3000, 600, "equipment", ["bar", "cafeteria"]),
      asset("caja", "counter", "Mostrador de caja", 4600, 1400, 1800, 600, "equipment", ["counter", "pos", "cafeteria"]),
      asset("cocina", "room", "Cocina", 6900, 900, 2200, 2200, "architecture", ["room", "use:kitchen", "cafeteria"]),
      asset("estufa", "stove", "Estufa", 7100, 1100, 600, 600, "equipment", ["stove", "kitchen"]),
      asset("refri", "refrigerator", "Refrigerador", 8200, 1100, 750, 700, "equipment", ["refrigerator", "kitchen"]),
      asset("mesa-1", "restaurant-table-4", "Mesa 1", 1500, 3600, 900, 900, "equipment", ["table", "seating"]),
      asset("mesa-2", "restaurant-table-4", "Mesa 2", 3300, 3600, 900, 900, "equipment", ["table", "seating"]),
      asset("mesa-3", "restaurant-table-4", "Mesa 3", 1500, 5100, 900, 900, "equipment", ["table", "seating"]),
      asset("mesa-4", "restaurant-table-4", "Mesa 4", 3300, 5100, 900, 900, "equipment", ["table", "seating"]),
      asset("bano", "room", "Baño", 6900, 3600, 1500, 1500, "architecture", ["room", "use:bathroom", "cafeteria"]),
      asset("wc-cafeteria", "wc", "WC", 7100, 3800, 400, 650, "equipment", ["wc", "bathroom"]),
      asset("bodega-cafe", "room", "Bodega", 6900, 5400, 2200, 900, "architecture", ["room", "use:storage", "cafeteria"]),
      asset("estante-bodega", "shelf-gondola", "Estante de insumos", 7000, 5550, 1200, 450, "equipment", ["shelf", "storage"]),
    ],
    annotations: [
      note("titulo", "Cafetería — plantilla universal editable", 1200, 420, "measurements"),
    ],
    connectors: [
      { fromRef: "puerta-entrada", toRef: "caja", kind: "flow" },
      { fromRef: "caja", toRef: "barra", kind: "flow" },
      { fromRef: "cocina", toRef: "barra", kind: "material" },
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
