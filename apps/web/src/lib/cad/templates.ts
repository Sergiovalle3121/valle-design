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
  | "cafeteria"
  | "salon-belleza"
  | "farmacia"
  | "jardin-eventos"
  | "panaderia"
  | "veterinaria"
  | "lavanderia"
  | "guarderia"
  | "ferreteria"
  | "habitacion-hotel"
  | "consultorio-dental"
  | "estacionamiento"
  | "cancha-futbol"
  | "salon-fiestas"
  | "iglesia"
  | "minisuper"
  | "taqueria"
  | "carniceria"
  | "fruteria"
  | "barberia"
  | "tortilleria"
  | "papeleria"
  | "fondita"
  | "estetica-canina"
  | "fisioterapia"
  | "spa"
  | "cibercafe"
  | "gimnasio-box"
  | "polleria"
  | "floreria"
  | "cremeria"
  | "neveria"
  | "jugueria"
  | "pescaderia"
  | "boutique"
  | "hostal"
  | "autolavado"
  | "llantera"
  | "purificadora"
  | "optica"
  | "departamento";

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
  {
    id: "salon-belleza",
    label: "Salón de belleza",
    description: "Arranque universal de salón/barbería: tres estaciones con tocador y silla, dos lavacabezas, recepción, sala de espera y baño.",
    category: "architecture",
    baseWidth: 9000,
    baseHeight: 6000,
    assets: [
      asset("shell", "room", "Muro perimetral", 700, 700, 7600, 4600, "architecture", ["architecture", "shell", "salon"]),
      asset("puerta-entrada", "door", "Puerta de entrada", 4000, 650, 900, 260, "architecture", ["door", "opening:entry"]),
      asset("tocador-1", "styling-mirror", "Tocador 1", 1300, 1000, 1200, 450, "equipment", ["tocador", "salon"]),
      asset("tocador-2", "styling-mirror", "Tocador 2", 3100, 1000, 1200, 450, "equipment", ["tocador", "salon"]),
      asset("tocador-3", "styling-mirror", "Tocador 3", 4900, 1000, 1200, 450, "equipment", ["tocador", "salon"]),
      asset("silla-1", "styling-chair", "Silla de estilista 1", 1600, 1600, 600, 600, "equipment", ["silla", "salon"]),
      asset("silla-2", "styling-chair", "Silla de estilista 2", 3400, 1600, 600, 600, "equipment", ["silla", "salon"]),
      asset("silla-3", "styling-chair", "Silla de estilista 3", 5200, 1600, 600, 600, "equipment", ["silla", "salon"]),
      asset("lavado-1", "wash-station", "Lavacabezas 1", 6900, 1000, 600, 1000, "equipment", ["lavado", "salon"]),
      asset("lavado-2", "wash-station", "Lavacabezas 2", 7600, 1000, 600, 1000, "equipment", ["lavado", "salon"]),
      asset("recepcion-salon", "counter", "Recepción", 1300, 4200, 1800, 600, "equipment", ["counter", "recepcion", "salon"]),
      asset("sofa-espera", "sofa-3", "Sofá de espera", 3400, 4100, 2100, 900, "equipment", ["sofa", "espera", "salon"]),
      asset("bano-salon", "room", "Baño", 6700, 3700, 1500, 1500, "architecture", ["room", "use:bathroom", "salon"]),
      asset("wc-salon", "wc", "WC", 6900, 3900, 400, 650, "equipment", ["wc", "bathroom"]),
    ],
    annotations: [
      note("titulo", "Salón de belleza — plantilla universal editable", 1200, 420, "measurements"),
    ],
    connectors: [
      { fromRef: "puerta-entrada", toRef: "recepcion-salon", kind: "flow" },
      { fromRef: "recepcion-salon", toRef: "silla-1", kind: "flow" },
      { fromRef: "silla-1", toRef: "lavado-1", kind: "flow" },
    ],
  },
  {
    id: "farmacia",
    label: "Farmacia",
    description: "Arranque universal de farmacia: mostrador de atención, góndolas de piso de venta, refrigerador de medicinas y trastienda con estante.",
    category: "architecture",
    baseWidth: 9000,
    baseHeight: 6000,
    assets: [
      asset("shell", "room", "Muro perimetral", 700, 700, 7600, 4600, "architecture", ["architecture", "shell", "farmacia"]),
      asset("puerta-entrada", "door", "Puerta de entrada", 4000, 650, 900, 260, "architecture", ["door", "opening:entry"]),
      asset("mostrador-atencion", "counter", "Mostrador de atención", 1300, 1400, 1800, 600, "equipment", ["counter", "atencion", "farmacia"]),
      asset("gondola-1", "shelf-gondola", "Góndola 1", 1300, 2800, 1200, 500, "equipment", ["gondola", "venta", "farmacia"]),
      asset("gondola-2", "shelf-gondola", "Góndola 2", 3100, 2800, 1200, 500, "equipment", ["gondola", "venta", "farmacia"]),
      asset("gondola-3", "shelf-gondola", "Góndola 3", 4900, 2800, 1200, 500, "equipment", ["gondola", "venta", "farmacia"]),
      asset("refri-medicinas", "refrigerator", "Refrigerador de medicinas", 6900, 1100, 750, 700, "equipment", ["refrigerator", "medicinas", "farmacia"]),
      asset("trastienda", "room", "Trastienda", 6700, 2900, 1500, 2200, "architecture", ["room", "use:storage", "farmacia"]),
      asset("estante-trastienda", "shelf-gondola", "Estante de trastienda", 6800, 3100, 1200, 500, "equipment", ["shelf", "storage", "farmacia"]),
    ],
    annotations: [
      note("titulo", "Farmacia — plantilla universal editable", 1200, 420, "measurements"),
    ],
    connectors: [
      { fromRef: "puerta-entrada", toRef: "mostrador-atencion", kind: "flow" },
      { fromRef: "trastienda", toRef: "mostrador-atencion", kind: "material" },
    ],
  },
  {
    id: "jardin-eventos",
    label: "Jardín de eventos",
    description: "Arranque universal de jardín de eventos: acceso, seis mesas, pista de baile, escenario, barra, baño, estacionamiento y arbolado.",
    category: "architecture",
    baseWidth: 20000,
    baseHeight: 12000,
    assets: [
      asset("perimetro", "room", "Perímetro del jardín", 700, 700, 18600, 10600, "architecture", ["architecture", "shell", "jardin"]),
      asset("acceso", "door", "Acceso principal", 9300, 650, 1400, 260, "architecture", ["door", "opening:entry"]),
      asset("mesa-1", "restaurant-table-4", "Mesa 1", 3000, 3200, 900, 900, "equipment", ["table", "evento"]),
      asset("mesa-2", "restaurant-table-4", "Mesa 2", 5200, 3200, 900, 900, "equipment", ["table", "evento"]),
      asset("mesa-3", "restaurant-table-4", "Mesa 3", 7400, 3200, 900, 900, "equipment", ["table", "evento"]),
      asset("mesa-4", "restaurant-table-4", "Mesa 4", 3000, 5400, 900, 900, "equipment", ["table", "evento"]),
      asset("mesa-5", "restaurant-table-4", "Mesa 5", 5200, 5400, 900, 900, "equipment", ["table", "evento"]),
      asset("mesa-6", "restaurant-table-4", "Mesa 6", 7400, 5400, 900, 900, "equipment", ["table", "evento"]),
      asset("pista", "zone", "Pista de baile", 10500, 3200, 4500, 3500, "layout", ["zone", "use:dancefloor", "evento"]),
      asset("escenario", "zone", "Escenario", 15600, 3200, 2800, 2000, "layout", ["zone", "use:stage", "evento"]),
      asset("barra-jardin", "bar-counter", "Barra de bebidas", 10500, 8200, 3000, 600, "equipment", ["bar", "evento"]),
      asset("bano-jardin", "room", "Baños", 16200, 8200, 2200, 2200, "architecture", ["room", "use:bathroom", "jardin"]),
      asset("wc-jardin", "wc", "WC", 16500, 8500, 400, 650, "equipment", ["wc", "bathroom"]),
      asset("banca-1", "outdoor-bench", "Banca 1", 1500, 8600, 1500, 550, "architecture", ["banca", "exterior"]),
      asset("arbol-1", "tree", "Árbol 1", 1500, 1200, 3000, 3000, "architecture", ["arbol", "exterior"]),
      asset("arbol-2", "tree", "Árbol 2", 5800, 8000, 3000, 3000, "architecture", ["arbol", "exterior"]),
      asset("banca-2", "outdoor-bench", "Banca 2", 3300, 8600, 1500, 550, "architecture", ["banca", "exterior"]),
    ],
    annotations: [
      note("titulo", "Jardín de eventos — plantilla universal editable", 1200, 420, "measurements"),
    ],
    connectors: [
      { fromRef: "acceso", toRef: "mesa-1", kind: "flow" },
      { fromRef: "mesa-1", toRef: "pista", kind: "flow" },
      { fromRef: "barra-jardin", toRef: "mesa-1", kind: "material" },
    ],
  },
  {
    id: "panaderia",
    label: "Panadería",
    description: "Arranque universal de panadería: venta con vitrinas y caja, taller con horno, amasadora y mesa de trabajo, y bodega de insumos.",
    category: "architecture",
    baseWidth: 10000,
    baseHeight: 7000,
    assets: [
      asset("shell", "room", "Muro perimetral", 700, 700, 8600, 5600, "architecture", ["architecture", "shell", "panaderia"]),
      asset("puerta-entrada", "door", "Puerta de entrada", 4500, 650, 900, 260, "architecture", ["door", "opening:entry"]),
      asset("vitrina-1", "display-case", "Vitrina 1", 1300, 1400, 1500, 700, "equipment", ["vitrina", "venta"]),
      asset("vitrina-2", "display-case", "Vitrina 2", 3100, 1400, 1500, 700, "equipment", ["vitrina", "venta"]),
      asset("caja-pan", "counter", "Caja", 5000, 1400, 1800, 600, "equipment", ["counter", "pos"]),
      asset("taller", "room", "Taller de horneado", 1300, 3200, 5200, 2900, "architecture", ["room", "use:kitchen", "panaderia"]),
      asset("horno-pan", "oven", "Horno", 1600, 3500, 800, 800, "equipment", ["horno", "panaderia"]),
      asset("amasadora-pan", "dough-mixer", "Amasadora", 2700, 3500, 600, 600, "equipment", ["amasadora", "panaderia"]),
      asset("mesa-trabajo", "workbench", "Mesa de trabajo", 1600, 4800, 1800, 750, "equipment", ["mesa de trabajo", "panaderia"]),
      asset("refri-pan", "refrigerator", "Refrigerador", 5500, 3500, 750, 700, "equipment", ["refrigerator", "panaderia"]),
      asset("bodega-pan", "room", "Bodega de insumos", 7000, 3200, 2200, 2900, "architecture", ["room", "use:storage", "panaderia"]),
      asset("estante-pan", "shelf-gondola", "Estante de harinas", 7200, 3500, 1200, 500, "equipment", ["shelf", "storage"]),
    ],
    annotations: [
      note("titulo", "Panadería — plantilla universal editable", 1200, 420, "measurements"),
    ],
    connectors: [
      { fromRef: "puerta-entrada", toRef: "caja-pan", kind: "flow" },
      { fromRef: "taller", toRef: "vitrina-1", kind: "material" },
      { fromRef: "bodega-pan", toRef: "taller", kind: "material" },
    ],
  },
  {
    id: "veterinaria",
    label: "Veterinaria",
    description: "Arranque universal de clínica veterinaria: sala de espera con recepción, consultorio con mesa de exploración y hospitalización con jaulas.",
    category: "architecture",
    baseWidth: 9000,
    baseHeight: 6000,
    assets: [
      asset("shell", "room", "Muro perimetral", 700, 700, 7600, 4600, "architecture", ["architecture", "shell", "veterinaria"]),
      asset("entrada", "door", "Entrada", 2200, 650, 900, 260, "architecture", ["door", "opening:main"]),
      asset("espera-vet", "room", "Sala de espera", 1300, 1300, 3200, 3800, "architecture", ["room", "use:lobby", "veterinaria"]),
      asset("recepcion-vet", "counter", "Recepción", 1500, 1500, 1200, 600, "equipment", ["counter", "recepcion"]),
      asset("silla-espera-1", "office-chair", "Silla de espera 1", 1500, 2600, 600, 600, "equipment", ["silla", "espera"]),
      asset("silla-espera-2", "office-chair", "Silla de espera 2", 2300, 2600, 600, 600, "equipment", ["silla", "espera"]),
      asset("consulta-vet", "room", "Consultorio", 4700, 1300, 3400, 2600, "architecture", ["room", "use:exam", "veterinaria"]),
      asset("escritorio-vet", "furniture", "Escritorio veterinario", 4900, 1500, 1200, 600, "equipment", ["furniture", "desk"]),
      asset("mesa-exploracion", "furniture", "Mesa de exploración", 6500, 2000, 700, 1400, "equipment", ["furniture", "exam", "veterinaria"]),
      asset("hospitalizacion", "room", "Hospitalización", 4700, 4100, 3400, 1000, "architecture", ["room", "use:ward", "veterinaria"]),
      asset("jaula-1", "kennel-cage", "Jaula 1", 4800, 4250, 900, 700, "equipment", ["jaula", "veterinaria"]),
      asset("jaula-2", "kennel-cage", "Jaula 2", 5900, 4250, 900, 700, "equipment", ["jaula", "veterinaria"]),
      asset("jaula-3", "kennel-cage", "Jaula 3", 7000, 4250, 900, 700, "equipment", ["jaula", "veterinaria"]),
    ],
    annotations: [
      note("titulo", "Veterinaria — plantilla universal editable", 1200, 420, "measurements"),
    ],
    connectors: [
      { fromRef: "entrada", toRef: "espera-vet", kind: "flow" },
      { fromRef: "espera-vet", toRef: "consulta-vet", kind: "flow" },
      { fromRef: "consulta-vet", toRef: "hospitalizacion", kind: "flow" },
    ],
  },
  {
    id: "lavanderia",
    label: "Lavandería",
    description: "Arranque universal de lavandería: mostrador de recepción, batería de lavadoras y secadoras, mesa de doblado y sillas de espera.",
    category: "architecture",
    baseWidth: 8000,
    baseHeight: 6000,
    assets: [
      asset("shell", "room", "Muro perimetral", 700, 700, 6600, 4600, "architecture", ["architecture", "shell", "lavanderia"]),
      asset("puerta-entrada", "door", "Puerta de entrada", 3500, 650, 900, 260, "architecture", ["door", "opening:entry"]),
      asset("mostrador-lav", "counter", "Mostrador", 1300, 1400, 1800, 600, "equipment", ["counter", "recepcion"]),
      asset("lavadora-1", "washer", "Lavadora 1", 1300, 3000, 600, 600, "equipment", ["lavadora", "lavanderia"]),
      asset("lavadora-2", "washer", "Lavadora 2", 2000, 3000, 600, 600, "equipment", ["lavadora", "lavanderia"]),
      asset("lavadora-3", "washer", "Lavadora 3", 2700, 3000, 600, 600, "equipment", ["lavadora", "lavanderia"]),
      asset("lavadora-4", "washer", "Lavadora 4", 3400, 3000, 600, 600, "equipment", ["lavadora", "lavanderia"]),
      asset("secadora-1", "dryer", "Secadora 1", 1300, 4200, 600, 600, "equipment", ["secadora", "lavanderia"]),
      asset("secadora-2", "dryer", "Secadora 2", 2000, 4200, 600, 600, "equipment", ["secadora", "lavanderia"]),
      asset("secadora-3", "dryer", "Secadora 3", 2700, 4200, 600, 600, "equipment", ["secadora", "lavanderia"]),
      asset("mesa-doblado", "workbench", "Mesa de doblado", 4300, 3000, 1800, 750, "equipment", ["mesa", "doblado", "lavanderia"]),
      asset("silla-lav-1", "office-chair", "Silla de espera 1", 5200, 1400, 600, 600, "equipment", ["silla", "espera"]),
      asset("silla-lav-2", "office-chair", "Silla de espera 2", 5900, 1400, 600, 600, "equipment", ["silla", "espera"]),
    ],
    annotations: [
      note("titulo", "Lavandería — plantilla universal editable", 1200, 420, "measurements"),
    ],
    connectors: [
      { fromRef: "puerta-entrada", toRef: "mostrador-lav", kind: "flow" },
      { fromRef: "mostrador-lav", toRef: "lavadora-1", kind: "material" },
      { fromRef: "lavadora-1", toRef: "secadora-1", kind: "material" },
      { fromRef: "secadora-1", toRef: "mesa-doblado", kind: "material" },
    ],
  },
  {
    id: "guarderia",
    label: "Guardería",
    description: "Arranque universal de guardería: sala de juegos con mesas infantiles, área de cunas y baño.",
    category: "architecture",
    baseWidth: 9000,
    baseHeight: 6000,
    assets: [
      asset("shell", "room", "Muro perimetral", 700, 700, 7600, 4600, "architecture", ["architecture", "shell", "guarderia"]),
      asset("entrada", "door", "Entrada", 2200, 650, 900, 260, "architecture", ["door", "opening:main"]),
      asset("sala-juegos", "zone", "Sala de juegos", 1300, 1300, 3600, 3000, "layout", ["zone", "use:play", "guarderia"]),
      asset("mesa-infantil-1", "school-desk", "Mesa infantil 1", 1500, 2000, 600, 500, "equipment", ["mesa", "infantil"]),
      asset("mesa-infantil-2", "school-desk", "Mesa infantil 2", 2400, 2000, 600, 500, "equipment", ["mesa", "infantil"]),
      asset("cuna-1", "crib", "Cuna 1", 5200, 1300, 700, 1300, "equipment", ["cuna", "guarderia"]),
      asset("cuna-2", "crib", "Cuna 2", 6100, 1300, 700, 1300, "equipment", ["cuna", "guarderia"]),
      asset("cuna-3", "crib", "Cuna 3", 7000, 1300, 700, 1300, "equipment", ["cuna", "guarderia"]),
      asset("bano-guarderia", "room", "Baño", 6700, 3700, 1500, 1500, "architecture", ["room", "use:bathroom", "guarderia"]),
      asset("wc-guarderia", "wc", "WC", 6900, 3900, 400, 650, "equipment", ["wc", "bathroom"]),
    ],
    annotations: [
      note("titulo", "Guardería — plantilla universal editable", 1200, 420, "measurements"),
    ],
    connectors: [
      { fromRef: "entrada", toRef: "sala-juegos", kind: "flow" },
      { fromRef: "sala-juegos", toRef: "cuna-1", kind: "flow" },
    ],
  },
  {
    id: "ferreteria",
    label: "Ferretería",
    description: "Arranque universal de ferretería: mostrador, góndolas de venta, bodega con racks y mesa de cortes.",
    category: "architecture",
    baseWidth: 10000,
    baseHeight: 7000,
    assets: [
      asset("shell", "room", "Muro perimetral", 700, 700, 8600, 5600, "architecture", ["architecture", "shell", "ferreteria"]),
      asset("puerta-entrada", "door", "Puerta de entrada", 4500, 650, 900, 260, "architecture", ["door", "opening:entry"]),
      asset("mostrador-fer", "counter", "Mostrador", 1300, 1400, 1800, 600, "equipment", ["counter", "pos", "ferreteria"]),
      asset("gondola-fer-1", "shelf-gondola", "Góndola 1", 1300, 2800, 1200, 500, "equipment", ["gondola", "venta"]),
      asset("gondola-fer-2", "shelf-gondola", "Góndola 2", 3100, 2800, 1200, 500, "equipment", ["gondola", "venta"]),
      asset("gondola-fer-3", "shelf-gondola", "Góndola 3", 1300, 3900, 1200, 500, "equipment", ["gondola", "venta"]),
      asset("gondola-fer-4", "shelf-gondola", "Góndola 4", 3100, 3900, 1200, 500, "equipment", ["gondola", "venta"]),
      asset("bodega-fer", "room", "Bodega", 5300, 2900, 3300, 3000, "architecture", ["room", "use:storage", "ferreteria"]),
      asset("rack-fer-1", "warehouse-rack", "Rack de bodega 1", 5600, 3200, 2700, 1100, "equipment", ["rack", "storage"]),
      asset("rack-fer-2", "warehouse-rack", "Rack de bodega 2", 5600, 4500, 2700, 1100, "equipment", ["rack", "storage"]),
      asset("mesa-cortes", "workbench", "Mesa de cortes", 5600, 1400, 1800, 750, "equipment", ["mesa de trabajo", "cortes"]),
    ],
    annotations: [
      note("titulo", "Ferretería — plantilla universal editable", 1200, 420, "measurements"),
    ],
    connectors: [
      { fromRef: "puerta-entrada", toRef: "mostrador-fer", kind: "flow" },
      { fromRef: "bodega-fer", toRef: "gondola-fer-1", kind: "material" },
    ],
  },
  {
    id: "habitacion-hotel",
    label: "Habitación de hotel",
    description: "Arranque universal de habitación de hotel: cama matrimonial con burós, ropero, escritorio con silla y baño con regadera.",
    category: "architecture",
    baseWidth: 7000,
    baseHeight: 5000,
    assets: [
      asset("shell", "room", "Muro perimetral", 700, 700, 5600, 3600, "architecture", ["architecture", "shell", "hotel"]),
      asset("puerta-hab", "door", "Puerta de entrada", 1500, 650, 900, 260, "architecture", ["door", "opening:main"]),
      asset("bano-hab", "room", "Baño", 4700, 700, 1600, 1600, "architecture", ["room", "use:bathroom", "hotel"]),
      asset("regadera-hab", "shower", "Regadera", 4750, 750, 900, 900, "equipment", ["regadera", "bathroom"]),
      asset("wc-hab", "wc", "WC", 5800, 1500, 400, 650, "equipment", ["wc", "bathroom"]),
      asset("cama-hab", "bed-queen", "Cama matrimonial", 1500, 1500, 1400, 2000, "equipment", ["cama", "hotel"]),
      asset("buro-1", "nightstand", "Buró 1", 1000, 1500, 450, 400, "equipment", ["buro", "hotel"]),
      asset("buro-2", "nightstand", "Buró 2", 2950, 1500, 450, 400, "equipment", ["buro", "hotel"]),
      asset("ropero-hab", "wardrobe", "Ropero", 1000, 3600, 1500, 600, "equipment", ["ropero", "hotel"]),
      asset("escritorio-hab", "desk", "Escritorio", 3500, 3500, 1400, 700, "equipment", ["escritorio", "hotel"]),
      asset("silla-hab", "office-chair", "Silla", 5100, 3500, 600, 600, "equipment", ["silla", "hotel"]),
    ],
    annotations: [
      note("titulo", "Habitación de hotel — plantilla universal editable", 1200, 420, "measurements"),
    ],
    connectors: [
      { fromRef: "puerta-hab", toRef: "cama-hab", kind: "flow" },
      { fromRef: "cama-hab", toRef: "bano-hab", kind: "flow" },
    ],
  },
  {
    id: "consultorio-dental",
    label: "Consultorio dental",
    description: "Arranque universal de consultorio dental: recepción con sala de espera, área clínica con sillón dental y gabinete, y esterilización.",
    category: "architecture",
    baseWidth: 8000,
    baseHeight: 6000,
    assets: [
      asset("shell", "room", "Muro perimetral", 700, 700, 6600, 4600, "architecture", ["architecture", "shell", "dental"]),
      asset("entrada", "door", "Entrada", 2000, 650, 900, 260, "architecture", ["door", "opening:main"]),
      asset("recepcion-dental", "counter", "Recepción", 1500, 1500, 1200, 600, "equipment", ["counter", "recepcion"]),
      asset("silla-dental-1", "office-chair", "Silla de espera 1", 1500, 2600, 600, 600, "equipment", ["silla", "espera"]),
      asset("silla-dental-2", "office-chair", "Silla de espera 2", 2200, 2600, 600, 600, "equipment", ["silla", "espera"]),
      asset("clinica-dental", "room", "Área clínica", 4100, 1300, 3000, 2600, "architecture", ["room", "use:exam", "dental"]),
      asset("sillon-dental", "dental-chair", "Sillón dental", 4700, 1600, 900, 1800, "equipment", ["sillon", "dental"]),
      asset("gabinete-dental", "tool-cabinet", "Gabinete de instrumental", 6300, 1500, 700, 450, "equipment", ["gabinete", "dental"]),
      asset("esterilizacion", "room", "Esterilización", 4100, 4100, 3000, 1000, "architecture", ["room", "use:clean", "dental"]),
      asset("mesa-esterilizacion", "workbench", "Mesa de esterilización", 4300, 4250, 1800, 750, "equipment", ["mesa", "esterilizacion"]),
    ],
    annotations: [
      note("titulo", "Consultorio dental — plantilla universal editable", 1200, 420, "measurements"),
    ],
    connectors: [
      { fromRef: "entrada", toRef: "recepcion-dental", kind: "flow" },
      { fromRef: "recepcion-dental", toRef: "clinica-dental", kind: "flow" },
      { fromRef: "clinica-dental", toRef: "esterilizacion", kind: "flow" },
    ],
  },
  {
    id: "estacionamiento",
    label: "Estacionamiento",
    description: "Arranque universal de estacionamiento: acceso, caseta de cobro, ocho cajones en dos filas y pasillo de circulación.",
    category: "architecture",
    baseWidth: 20000,
    baseHeight: 14000,
    assets: [
      asset("perimetro", "room", "Perímetro", 700, 700, 18600, 12600, "architecture", ["architecture", "shell", "estacionamiento"]),
      asset("acceso", "door", "Acceso vehicular", 9300, 650, 1400, 260, "architecture", ["door", "opening:gate"]),
      asset("caseta", "room", "Caseta de cobro", 16800, 900, 1800, 1500, "architecture", ["room", "use:booth", "estacionamiento"]),
      asset("mostrador-caseta", "counter", "Mostrador de caseta", 17000, 1100, 1200, 600, "equipment", ["counter", "cobro"]),
      asset("cajon-a1", "parking-spot", "Cajón A1", 1500, 1000, 2500, 5000, "architecture", ["parking", "cajon"]),
      asset("cajon-a2", "parking-spot", "Cajón A2", 4100, 1000, 2500, 5000, "architecture", ["parking", "cajon"]),
      asset("cajon-a3", "parking-spot", "Cajón A3", 6700, 1000, 2500, 5000, "architecture", ["parking", "cajon"]),
      asset("cajon-a4", "parking-spot", "Cajón A4", 9300, 1000, 2500, 5000, "architecture", ["parking", "cajon"]),
      asset("pasillo-circulacion", "zone", "Pasillo de circulación", 1400, 6200, 15000, 1400, "aisles", ["aisle", "circulacion"]),
      asset("cajon-b1", "parking-spot", "Cajón B1", 1500, 7800, 2500, 5000, "architecture", ["parking", "cajon"]),
      asset("cajon-b2", "parking-spot", "Cajón B2", 4100, 7800, 2500, 5000, "architecture", ["parking", "cajon"]),
      asset("cajon-b3", "parking-spot", "Cajón B3", 6700, 7800, 2500, 5000, "architecture", ["parking", "cajon"]),
      asset("cajon-b4", "parking-spot", "Cajón B4", 9300, 7800, 2500, 5000, "architecture", ["parking", "cajon"]),
    ],
    annotations: [
      note("titulo", "Estacionamiento — plantilla universal editable", 1200, 420, "measurements"),
    ],
    connectors: [
      { fromRef: "acceso", toRef: "pasillo-circulacion", kind: "flow" },
      { fromRef: "pasillo-circulacion", toRef: "cajon-a1", kind: "flow" },
    ],
  },
  {
    id: "cancha-futbol",
    label: "Cancha de fútbol rápido",
    description: "Arranque universal de cancha de fútbol rápido: cancha con línea media, dos porterías, gradas y bancas de jugadores.",
    category: "architecture",
    baseWidth: 30000,
    baseHeight: 18000,
    assets: [
      asset("perimetro", "room", "Perímetro", 700, 700, 28600, 16600, "architecture", ["architecture", "shell", "cancha"]),
      asset("acceso", "door", "Acceso", 14300, 650, 1400, 260, "architecture", ["door", "opening:entry"]),
      asset("cancha", "zone", "Cancha", 1500, 2500, 27000, 13000, "layout", ["zone", "use:field", "cancha"]),
      asset("linea-media", "zone", "Línea media", 14900, 2500, 200, 13000, "layout", ["zone", "line", "cancha"]),
      asset("porteria-1", "goal", "Portería 1", 1600, 8500, 1000, 3000, "equipment", ["porteria", "cancha"]),
      asset("porteria-2", "goal", "Portería 2", 27400, 8500, 1000, 3000, "equipment", ["porteria", "cancha"]),
      asset("banca-jugadores-1", "outdoor-bench", "Banca de jugadores 1", 6000, 1100, 1500, 550, "architecture", ["banca", "jugadores"]),
      asset("banca-jugadores-2", "outdoor-bench", "Banca de jugadores 2", 22500, 1100, 1500, 550, "architecture", ["banca", "jugadores"]),
      asset("gradas", "zone", "Gradas", 1500, 16000, 27000, 1000, "layout", ["zone", "use:stands", "cancha"]),
    ],
    annotations: [
      note("titulo", "Cancha de fútbol rápido — plantilla universal editable", 1200, 420, "measurements"),
    ],
    connectors: [
      { fromRef: "acceso", toRef: "cancha", kind: "flow" },
      { fromRef: "cancha", toRef: "gradas", kind: "flow" },
    ],
  },
  {
    id: "salon-fiestas",
    label: "Salón de fiestas infantiles",
    description: "Arranque universal de salón de fiestas: área de juegos con brincolín, mesas de invitados, dulcería, mesa de pastel, pista y baño.",
    category: "architecture",
    baseWidth: 15000,
    baseHeight: 10000,
    assets: [
      asset("shell", "room", "Muro perimetral", 700, 700, 13600, 8600, "architecture", ["architecture", "shell", "fiestas"]),
      asset("entrada", "door", "Entrada", 7000, 650, 1000, 260, "architecture", ["door", "opening:entry"]),
      asset("area-juegos", "zone", "Área de juegos", 1300, 1300, 3600, 3600, "layout", ["zone", "use:play", "fiestas"]),
      asset("brincolin", "bounce-house", "Brincolín", 1500, 1500, 3000, 3000, "equipment", ["brincolin", "fiestas"]),
      asset("mesa-fiesta-1", "restaurant-table-4", "Mesa 1", 6000, 2000, 900, 900, "equipment", ["table", "fiestas"]),
      asset("mesa-fiesta-2", "restaurant-table-4", "Mesa 2", 8000, 2000, 900, 900, "equipment", ["table", "fiestas"]),
      asset("mesa-fiesta-3", "restaurant-table-4", "Mesa 3", 6000, 4000, 900, 900, "equipment", ["table", "fiestas"]),
      asset("mesa-fiesta-4", "restaurant-table-4", "Mesa 4", 8000, 4000, 900, 900, "equipment", ["table", "fiestas"]),
      asset("dulceria", "counter", "Dulcería", 10500, 1500, 1800, 600, "equipment", ["counter", "dulceria"]),
      asset("mesa-pastel", "workbench", "Mesa de pastel", 10500, 3000, 1800, 750, "equipment", ["mesa", "pastel"]),
      asset("pista-fiesta", "zone", "Pista de baile", 5500, 6000, 4000, 3000, "layout", ["zone", "use:dancefloor", "fiestas"]),
      asset("bano-fiestas", "room", "Baño", 11500, 6500, 1800, 1800, "architecture", ["room", "use:bathroom", "fiestas"]),
      asset("wc-fiestas", "wc", "WC", 11700, 6700, 400, 650, "equipment", ["wc", "bathroom"]),
    ],
    annotations: [
      note("titulo", "Salón de fiestas infantiles — plantilla universal editable", 1200, 420, "measurements"),
    ],
    connectors: [
      { fromRef: "entrada", toRef: "mesa-fiesta-1", kind: "flow" },
      { fromRef: "mesa-fiesta-1", toRef: "pista-fiesta", kind: "flow" },
      { fromRef: "dulceria", toRef: "mesa-fiesta-1", kind: "material" },
    ],
  },
  {
    id: "iglesia",
    label: "Iglesia / Salón de culto",
    description: "Arranque universal de iglesia o salón de culto: vestíbulo, nave con dos columnas de bancas y pasillo central, presbiterio con púlpito y mesa de altar, sala de niños y baño.",
    category: "architecture",
    baseWidth: 16000,
    baseHeight: 12000,
    assets: [
      asset("shell", "room", "Muro perimetral", 700, 700, 14600, 10600, "architecture", ["architecture", "shell", "iglesia"]),
      asset("entrada", "door", "Entrada principal", 7300, 650, 1400, 260, "architecture", ["door", "opening:entry"]),
      asset("vestibulo", "zone", "Vestíbulo", 5800, 1300, 4400, 1500, "layout", ["zone", "use:lobby", "iglesia"]),
      asset("sala-ninos", "zone", "Sala de niños", 1300, 1300, 2600, 2600, "layout", ["zone", "use:kids", "iglesia"]),
      asset("nave", "zone", "Nave", 4300, 3200, 7400, 5200, "layout", ["zone", "use:nave", "iglesia"]),
      asset("banca-izq-1", "pew", "Banca izquierda 1", 4600, 3500, 2600, 550, "equipment", ["banca", "iglesia"]),
      asset("banca-izq-2", "pew", "Banca izquierda 2", 4600, 4600, 2600, 550, "equipment", ["banca", "iglesia"]),
      asset("banca-izq-3", "pew", "Banca izquierda 3", 4600, 5700, 2600, 550, "equipment", ["banca", "iglesia"]),
      asset("banca-izq-4", "pew", "Banca izquierda 4", 4600, 6800, 2600, 550, "equipment", ["banca", "iglesia"]),
      asset("banca-der-1", "pew", "Banca derecha 1", 8600, 3500, 2600, 550, "equipment", ["banca", "iglesia"]),
      asset("banca-der-2", "pew", "Banca derecha 2", 8600, 4600, 2600, 550, "equipment", ["banca", "iglesia"]),
      asset("banca-der-3", "pew", "Banca derecha 3", 8600, 5700, 2600, 550, "equipment", ["banca", "iglesia"]),
      asset("banca-der-4", "pew", "Banca derecha 4", 8600, 6800, 2600, 550, "equipment", ["banca", "iglesia"]),
      asset("presbiterio", "zone", "Presbiterio", 4300, 8800, 7400, 2000, "layout", ["zone", "use:chancel", "iglesia"]),
      asset("pulpito", "pulpit", "Púlpito", 6600, 9200, 800, 600, "equipment", ["pulpito", "iglesia"]),
      asset("mesa-altar", "workbench", "Mesa de altar", 8200, 9200, 1800, 750, "equipment", ["altar", "iglesia"]),
      asset("bano-iglesia", "room", "Baño", 12500, 1300, 1800, 1800, "architecture", ["room", "use:bathroom", "iglesia"]),
      asset("wc-iglesia", "wc", "WC", 12700, 1500, 400, 650, "equipment", ["wc", "bathroom"]),
    ],
    annotations: [
      note("titulo", "Iglesia / Salón de culto — plantilla universal editable", 1200, 420, "measurements"),
    ],
    connectors: [
      { fromRef: "entrada", toRef: "vestibulo", kind: "flow" },
      { fromRef: "vestibulo", toRef: "nave", kind: "flow" },
      { fromRef: "nave", toRef: "presbiterio", kind: "flow" },
    ],
  },
  {
    id: "minisuper",
    label: "Minisúper / Abarrotes",
    description: "Arranque universal de minisúper o tienda de abarrotes: caja con vitrina, tres góndolas centrales, refrigeradores de pared, bodega con anaquel y pasillo de acceso.",
    category: "architecture",
    baseWidth: 12000,
    baseHeight: 8000,
    assets: [
      asset("shell", "room", "Muro perimetral", 700, 700, 10600, 6600, "architecture", ["architecture", "shell", "minisuper", "abarrotes"]),
      asset("entrada", "door", "Entrada", 2000, 650, 1000, 260, "architecture", ["door", "opening:entry"]),
      asset("zona-cajas", "zone", "Área de cajas", 1300, 1200, 2400, 2200, "layout", ["zone", "use:checkout", "minisuper"]),
      asset("caja", "counter", "Caja / Mostrador", 1500, 1400, 1800, 600, "equipment", ["counter", "caja", "minisuper"]),
      asset("vitrina", "display-case", "Vitrina de dulces", 1500, 2400, 1200, 600, "equipment", ["vitrina", "minisuper"]),
      asset("gondola-1", "shelf-gondola", "Góndola 1", 4000, 2000, 4000, 500, "equipment", ["gondola", "abarrotes"]),
      asset("gondola-2", "shelf-gondola", "Góndola 2", 4000, 3300, 4000, 500, "equipment", ["gondola", "abarrotes"]),
      asset("gondola-3", "shelf-gondola", "Góndola 3", 4000, 4600, 4000, 500, "equipment", ["gondola", "abarrotes"]),
      asset("refri-1", "refrigerator", "Refrigerador de bebidas 1", 10300, 1500, 800, 700, "equipment", ["refrigerador", "minisuper"]),
      asset("refri-2", "refrigerator", "Refrigerador de bebidas 2", 10300, 2400, 800, 700, "equipment", ["refrigerador", "minisuper"]),
      asset("refri-3", "refrigerator", "Refrigerador de lácteos", 10300, 3300, 800, 700, "equipment", ["refrigerador", "minisuper"]),
      asset("bodega", "room", "Bodega", 1300, 5000, 2400, 2000, "architecture", ["room", "use:storage", "minisuper"]),
      asset("anaquel-bodega", "warehouse-rack", "Anaquel de bodega", 1500, 5300, 2000, 500, "equipment", ["rack", "bodega"]),
      asset("pasillo-acceso", "zone", "Pasillo de acceso", 4000, 6000, 4000, 1000, "aisles", ["aisle", "minisuper"]),
    ],
    annotations: [
      note("titulo", "Minisúper / Abarrotes — plantilla universal editable", 1200, 420, "measurements"),
    ],
    connectors: [
      { fromRef: "entrada", toRef: "caja", kind: "flow" },
      { fromRef: "gondola-1", toRef: "caja", kind: "flow" },
      { fromRef: "bodega", toRef: "gondola-1", kind: "material" },
    ],
  },
  {
    id: "taqueria",
    label: "Taquería",
    description: "Arranque universal de taquería: cocina con comal y refrigerador, barra de tacos, mostrador para llevar, comedor con cuatro mesas y baño.",
    category: "architecture",
    baseWidth: 12000,
    baseHeight: 8000,
    assets: [
      asset("shell", "room", "Muro perimetral", 700, 700, 10600, 6600, "architecture", ["architecture", "shell", "taqueria"]),
      asset("entrada", "door", "Entrada", 5500, 650, 1000, 260, "architecture", ["door", "opening:entry"]),
      asset("cocina-taq", "zone", "Cocina", 1300, 1300, 3200, 2600, "layout", ["zone", "use:kitchen", "taqueria"]),
      asset("comal", "stove", "Comal / Plancha", 1500, 1500, 900, 650, "equipment", ["comal", "taqueria"]),
      asset("refri-taq", "refrigerator", "Refrigerador", 2600, 1500, 800, 700, "equipment", ["refrigerador", "taqueria"]),
      asset("barra-tacos", "bar-counter", "Barra de tacos", 1500, 4200, 3000, 650, "equipment", ["barra", "taqueria"]),
      asset("mostrador-togo", "counter", "Mostrador para llevar", 4800, 1300, 1800, 600, "equipment", ["counter", "para llevar"]),
      asset("comedor-taq", "zone", "Comedor", 5000, 3000, 5800, 3800, "layout", ["zone", "use:dining", "taqueria"]),
      asset("mesa-taq-1", "restaurant-table-4", "Mesa 1", 5500, 3300, 900, 900, "equipment", ["table", "taqueria"]),
      asset("mesa-taq-2", "restaurant-table-4", "Mesa 2", 7500, 3300, 900, 900, "equipment", ["table", "taqueria"]),
      asset("mesa-taq-3", "restaurant-table-4", "Mesa 3", 5500, 5300, 900, 900, "equipment", ["table", "taqueria"]),
      asset("mesa-taq-4", "restaurant-table-4", "Mesa 4", 7500, 5300, 900, 900, "equipment", ["table", "taqueria"]),
      asset("bano-taq", "room", "Baño", 9500, 1300, 1600, 1600, "architecture", ["room", "use:bathroom", "taqueria"]),
      asset("wc-taq", "wc", "WC", 9700, 1500, 400, 650, "equipment", ["wc", "bathroom"]),
    ],
    annotations: [
      note("titulo", "Taquería — plantilla universal editable", 1200, 420, "measurements"),
    ],
    connectors: [
      { fromRef: "entrada", toRef: "mostrador-togo", kind: "flow" },
      { fromRef: "comal", toRef: "barra-tacos", kind: "material" },
      { fromRef: "barra-tacos", toRef: "mesa-taq-1", kind: "flow" },
    ],
  },
  {
    id: "carniceria",
    label: "Carnicería",
    description: "Arranque universal de carnicería: vitrina de cortes con báscula y mostrador, dos congeladores y refrigerador, cuarto frío y mesa de corte.",
    category: "architecture",
    baseWidth: 11000,
    baseHeight: 7000,
    assets: [
      asset("shell", "room", "Muro perimetral", 700, 700, 9600, 5600, "architecture", ["architecture", "shell", "carniceria"]),
      asset("entrada", "door", "Entrada", 4500, 650, 1000, 260, "architecture", ["door", "opening:entry"]),
      asset("area-atencion", "zone", "Área de atención", 1300, 1300, 4000, 2200, "layout", ["zone", "use:service", "carniceria"]),
      asset("vitrina-cortes", "display-case", "Vitrina de cortes", 1500, 1500, 2000, 600, "equipment", ["vitrina", "carniceria"]),
      asset("bascula-carn", "scale", "Báscula", 3700, 1500, 500, 500, "equipment", ["bascula", "carniceria"]),
      asset("mostrador-carn", "counter", "Mostrador", 1500, 2600, 2600, 600, "equipment", ["counter", "carniceria"]),
      asset("congelador-1", "freezer", "Congelador 1", 6000, 1300, 1500, 700, "equipment", ["congelador", "carniceria"]),
      asset("congelador-2", "freezer", "Congelador 2", 7700, 1300, 1500, 700, "equipment", ["congelador", "carniceria"]),
      asset("refri-carn", "refrigerator", "Refrigerador", 9300, 1300, 800, 700, "equipment", ["refrigerador", "carniceria"]),
      asset("mesa-corte", "workbench", "Mesa de corte", 3000, 4500, 1800, 750, "equipment", ["mesa", "corte", "carniceria"]),
      asset("cuarto-frio", "room", "Cuarto frío", 6000, 4200, 2600, 1900, "architecture", ["room", "use:coldroom", "carniceria"]),
    ],
    annotations: [
      note("titulo", "Carnicería — plantilla universal editable", 1200, 420, "measurements"),
    ],
    connectors: [
      { fromRef: "entrada", toRef: "mostrador-carn", kind: "flow" },
      { fromRef: "cuarto-frio", toRef: "mesa-corte", kind: "material" },
      { fromRef: "mesa-corte", toRef: "vitrina-cortes", kind: "material" },
    ],
  },
  {
    id: "fruteria",
    label: "Frutería / Verdulería",
    description: "Arranque universal de frutería: mostrador con báscula, cajones de fruta, góndolas de fruta y verdura, refrigerador y bodega con anaquel.",
    category: "architecture",
    baseWidth: 10000,
    baseHeight: 7000,
    assets: [
      asset("shell", "room", "Muro perimetral", 700, 700, 8600, 5600, "architecture", ["architecture", "shell", "fruteria"]),
      asset("entrada", "door", "Entrada", 4000, 650, 1000, 260, "architecture", ["door", "opening:entry"]),
      asset("mostrador-fruta", "counter", "Mostrador", 1300, 1400, 1800, 600, "equipment", ["counter", "fruteria"]),
      asset("bascula-fruta", "scale", "Báscula", 3300, 1400, 500, 500, "equipment", ["bascula", "fruteria"]),
      asset("zona-exhibicion", "zone", "Exhibición de fruta", 1300, 2400, 3200, 1000, "layout", ["zone", "use:display", "fruteria"]),
      asset("cajon-1", "fruit-crate", "Cajón de fruta 1", 1500, 2600, 600, 400, "equipment", ["cajon", "fruteria"]),
      asset("cajon-2", "fruit-crate", "Cajón de fruta 2", 2200, 2600, 600, 400, "equipment", ["cajon", "fruteria"]),
      asset("cajon-3", "fruit-crate", "Cajón de fruta 3", 2900, 2600, 600, 400, "equipment", ["cajon", "fruteria"]),
      asset("cajon-4", "fruit-crate", "Cajón de fruta 4", 3600, 2600, 600, 400, "equipment", ["cajon", "fruteria"]),
      asset("gondola-fruta", "shelf-gondola", "Góndola de fruta", 5000, 1500, 3000, 500, "equipment", ["gondola", "fruteria"]),
      asset("gondola-verdura", "shelf-gondola", "Góndola de verdura", 5000, 2800, 3000, 500, "equipment", ["gondola", "fruteria"]),
      asset("refri-fruteria", "refrigerator", "Refrigerador", 8300, 1400, 800, 700, "equipment", ["refrigerador", "fruteria"]),
      asset("bodega-fruta", "room", "Bodega", 1300, 4200, 2400, 1800, "architecture", ["room", "use:storage", "fruteria"]),
      asset("anaquel-fruta", "warehouse-rack", "Anaquel de bodega", 1500, 4500, 2000, 500, "equipment", ["rack", "fruteria"]),
    ],
    annotations: [
      note("titulo", "Frutería / Verdulería — plantilla universal editable", 1200, 420, "measurements"),
    ],
    connectors: [
      { fromRef: "entrada", toRef: "mostrador-fruta", kind: "flow" },
      { fromRef: "bodega-fruta", toRef: "cajon-1", kind: "material" },
      { fromRef: "cajon-1", toRef: "mostrador-fruta", kind: "flow" },
    ],
  },
  {
    id: "barberia",
    label: "Barbería",
    description: "Arranque universal de barbería: sala de espera con sofá, tres estaciones de tocador con silla, lavacabezas y mostrador de cobro.",
    category: "architecture",
    baseWidth: 9000,
    baseHeight: 6000,
    assets: [
      asset("shell", "room", "Muro perimetral", 700, 700, 7600, 4600, "architecture", ["architecture", "shell", "barberia"]),
      asset("entrada", "door", "Entrada", 3500, 650, 1000, 260, "architecture", ["door", "opening:entry"]),
      asset("espera", "zone", "Sala de espera", 1300, 1300, 2400, 1500, "layout", ["zone", "use:waiting", "barberia"]),
      asset("sofa-espera", "sofa-3", "Sofá de espera", 1500, 1500, 2100, 900, "equipment", ["sofa", "barberia"]),
      asset("tocador-b1", "styling-mirror", "Tocador 1", 4200, 1000, 1200, 450, "equipment", ["tocador", "barberia"]),
      asset("tocador-b2", "styling-mirror", "Tocador 2", 5700, 1000, 1200, 450, "equipment", ["tocador", "barberia"]),
      asset("silla-b1", "styling-chair", "Silla de barbero 1", 4500, 1600, 600, 600, "equipment", ["silla", "barberia"]),
      asset("silla-b2", "styling-chair", "Silla de barbero 2", 6000, 1600, 600, 600, "equipment", ["silla", "barberia"]),
      asset("lavado-b", "wash-station", "Lavacabezas", 7300, 1000, 600, 1000, "equipment", ["lavado", "barberia"]),
      asset("mostrador-b", "counter", "Mostrador de cobro", 1500, 3600, 1800, 600, "equipment", ["counter", "barberia"]),
      asset("bano-b", "room", "Baño", 6400, 3400, 1600, 1600, "architecture", ["room", "use:bathroom", "barberia"]),
      asset("wc-b", "wc", "WC", 6600, 3600, 400, 650, "equipment", ["wc", "bathroom"]),
    ],
    annotations: [
      note("titulo", "Barbería — plantilla universal editable", 1200, 420, "measurements"),
    ],
    connectors: [
      { fromRef: "entrada", toRef: "espera", kind: "flow" },
      { fromRef: "espera", toRef: "silla-b1", kind: "flow" },
      { fromRef: "silla-b1", toRef: "mostrador-b", kind: "flow" },
    ],
  },
  {
    id: "tortilleria",
    label: "Tortillería",
    description: "Arranque universal de tortillería: máquina tortilladora, comal, mesa de amasado, refrigerador de masa, mostrador con báscula, bodega de maíz y despacho.",
    category: "architecture",
    baseWidth: 9000,
    baseHeight: 6000,
    assets: [
      asset("shell", "room", "Muro perimetral", 700, 700, 7600, 4600, "architecture", ["architecture", "shell", "tortilleria"]),
      asset("entrada", "door", "Entrada", 3500, 650, 1000, 260, "architecture", ["door", "opening:entry"]),
      asset("maquina-tort", "tortilla-machine", "Máquina tortilladora", 1500, 1500, 1200, 800, "equipment", ["tortilladora", "tortilleria"]),
      asset("comal-tort", "stove", "Comal", 3000, 1500, 900, 650, "equipment", ["comal", "tortilleria"]),
      asset("mesa-amasado", "workbench", "Mesa de amasado", 4500, 1500, 1800, 750, "equipment", ["mesa", "amasado", "tortilleria"]),
      asset("refri-masa", "refrigerator", "Refrigerador de masa", 6800, 1500, 800, 700, "equipment", ["refrigerador", "tortilleria"]),
      asset("despacho", "zone", "Despacho", 1300, 3300, 3000, 1300, "layout", ["zone", "use:service", "tortilleria"]),
      asset("mostrador-tort", "counter", "Mostrador", 1500, 3600, 1800, 600, "equipment", ["counter", "tortilleria"]),
      asset("bascula-tort", "scale", "Báscula", 3500, 3600, 500, 500, "equipment", ["bascula", "tortilleria"]),
      asset("bodega-maiz", "room", "Bodega de maíz", 6000, 3200, 1900, 1800, "architecture", ["room", "use:storage", "tortilleria"]),
    ],
    annotations: [
      note("titulo", "Tortillería — plantilla universal editable", 1200, 420, "measurements"),
    ],
    connectors: [
      { fromRef: "bodega-maiz", toRef: "maquina-tort", kind: "material" },
      { fromRef: "maquina-tort", toRef: "mostrador-tort", kind: "material" },
      { fromRef: "entrada", toRef: "mostrador-tort", kind: "flow" },
    ],
  },
  {
    id: "papeleria",
    label: "Papelería",
    description: "Arranque universal de papelería: mostrador con vitrina, dos góndolas, copiadora, mesa de trabajo y bodega.",
    category: "architecture",
    baseWidth: 9000,
    baseHeight: 6000,
    assets: [
      asset("shell", "room", "Muro perimetral", 700, 700, 7600, 4600, "architecture", ["architecture", "shell", "papeleria"]),
      asset("entrada", "door", "Entrada", 3500, 650, 1000, 260, "architecture", ["door", "opening:entry"]),
      asset("mostrador-pap", "counter", "Mostrador", 1500, 1400, 1800, 600, "equipment", ["counter", "papeleria"]),
      asset("vitrina-pap", "display-case", "Vitrina de artículos", 3600, 1400, 1200, 600, "equipment", ["vitrina", "papeleria"]),
      asset("copiadora", "copier", "Copiadora", 5200, 1400, 700, 600, "equipment", ["copiadora", "papeleria"]),
      asset("gondola-pap-1", "shelf-gondola", "Góndola de papelería", 1500, 2800, 3000, 500, "equipment", ["gondola", "papeleria"]),
      asset("gondola-pap-2", "shelf-gondola", "Góndola de escolares", 1500, 4000, 3000, 500, "equipment", ["gondola", "papeleria"]),
      asset("mesa-trabajo-pap", "desk", "Mesa de trabajo", 5200, 2600, 1400, 700, "equipment", ["mesa", "papeleria"]),
      asset("bodega-pap", "room", "Bodega", 6400, 3400, 1600, 1600, "architecture", ["room", "use:storage", "papeleria"]),
    ],
    annotations: [
      note("titulo", "Papelería — plantilla universal editable", 1200, 420, "measurements"),
    ],
    connectors: [
      { fromRef: "entrada", toRef: "mostrador-pap", kind: "flow" },
      { fromRef: "bodega-pap", toRef: "gondola-pap-1", kind: "material" },
      { fromRef: "copiadora", toRef: "mostrador-pap", kind: "flow" },
    ],
  },
  {
    id: "fondita",
    label: "Cocina económica / Fondita",
    description: "Arranque universal de cocina económica: cocina con estufa, refrigerador y mesa de preparación, barra de servicio, comedor con cuatro mesas y baño.",
    category: "architecture",
    baseWidth: 10000,
    baseHeight: 7000,
    assets: [
      asset("shell", "room", "Muro perimetral", 700, 700, 8600, 5600, "architecture", ["architecture", "shell", "fondita"]),
      asset("entrada", "door", "Entrada", 4000, 650, 1000, 260, "architecture", ["door", "opening:entry"]),
      asset("cocina-fon", "zone", "Cocina", 1300, 1300, 3200, 2400, "layout", ["zone", "use:kitchen", "fondita"]),
      asset("estufa-fon", "stove", "Estufa", 1500, 1500, 900, 650, "equipment", ["estufa", "fondita"]),
      asset("refri-fon", "refrigerator", "Refrigerador", 2600, 1500, 800, 700, "equipment", ["refrigerador", "fondita"]),
      asset("mesa-prep-fon", "workbench", "Mesa de preparación", 1500, 2500, 1800, 750, "equipment", ["mesa", "fondita"]),
      asset("barra-fon", "counter", "Barra de servicio", 1300, 4200, 2600, 600, "equipment", ["counter", "fondita"]),
      asset("comedor-fon", "zone", "Comedor", 5000, 1300, 3800, 3200, "layout", ["zone", "use:dining", "fondita"]),
      asset("mesa-fon-1", "restaurant-table-4", "Mesa 1", 5500, 1800, 900, 900, "equipment", ["table", "fondita"]),
      asset("mesa-fon-2", "restaurant-table-4", "Mesa 2", 7300, 1800, 900, 900, "equipment", ["table", "fondita"]),
      asset("mesa-fon-3", "restaurant-table-4", "Mesa 3", 5500, 3300, 900, 900, "equipment", ["table", "fondita"]),
      asset("mesa-fon-4", "restaurant-table-4", "Mesa 4", 7300, 3300, 900, 900, "equipment", ["table", "fondita"]),
      asset("bano-fon", "room", "Baño", 5200, 4800, 1600, 1500, "architecture", ["room", "use:bathroom", "fondita"]),
      asset("wc-fon", "wc", "WC", 5400, 5000, 400, 650, "equipment", ["wc", "bathroom"]),
    ],
    annotations: [
      note("titulo", "Cocina económica / Fondita — plantilla universal editable", 1200, 420, "measurements"),
    ],
    connectors: [
      { fromRef: "entrada", toRef: "comedor-fon", kind: "flow" },
      { fromRef: "estufa-fon", toRef: "barra-fon", kind: "material" },
      { fromRef: "barra-fon", toRef: "mesa-fon-1", kind: "flow" },
    ],
  },
  {
    id: "estetica-canina",
    label: "Estética canina",
    description: "Arranque universal de estética canina: recepción, sala de espera con sofá, tina de baño, mesa de estética, zona de secado, dos jaulas y baño.",
    category: "architecture",
    baseWidth: 9000,
    baseHeight: 6000,
    assets: [
      asset("shell", "room", "Muro perimetral", 700, 700, 7600, 4600, "architecture", ["architecture", "shell", "estetica-canina"]),
      asset("entrada", "door", "Entrada", 3500, 650, 1000, 260, "architecture", ["door", "opening:entry"]),
      asset("recepcion-ec", "counter", "Recepción", 1500, 1400, 1800, 600, "equipment", ["counter", "estetica-canina"]),
      asset("espera-ec", "zone", "Sala de espera", 1300, 2400, 2400, 1400, "layout", ["zone", "use:waiting", "estetica-canina"]),
      asset("sofa-ec", "sofa-3", "Sofá de espera", 1500, 2600, 2100, 900, "equipment", ["sofa", "estetica-canina"]),
      asset("tina-ec", "wash-station", "Tina de baño", 4500, 1400, 600, 1000, "equipment", ["tina", "estetica-canina"]),
      asset("mesa-groom", "workbench", "Mesa de estética", 5500, 1400, 1800, 750, "equipment", ["mesa", "estetica-canina"]),
      asset("secado-ec", "zone", "Zona de secado", 4500, 2800, 2400, 1200, "layout", ["zone", "use:drying", "estetica-canina"]),
      asset("jaula-ec-1", "kennel-cage", "Jaula 1", 7500, 1400, 600, 900, "equipment", ["jaula", "estetica-canina"]),
      asset("jaula-ec-2", "kennel-cage", "Jaula 2", 7500, 2500, 600, 900, "equipment", ["jaula", "estetica-canina"]),
      asset("bano-ec", "room", "Baño", 6400, 3600, 1600, 1400, "architecture", ["room", "use:bathroom", "estetica-canina"]),
      asset("wc-ec", "wc", "WC", 6600, 3800, 400, 650, "equipment", ["wc", "bathroom"]),
    ],
    annotations: [
      note("titulo", "Estética canina — plantilla universal editable", 1200, 420, "measurements"),
    ],
    connectors: [
      { fromRef: "entrada", toRef: "recepcion-ec", kind: "flow" },
      { fromRef: "recepcion-ec", toRef: "tina-ec", kind: "flow" },
      { fromRef: "tina-ec", toRef: "mesa-groom", kind: "flow" },
    ],
  },
  {
    id: "fisioterapia",
    label: "Consultorio de fisioterapia",
    description: "Arranque universal de fisioterapia: recepción, sala de espera, dos camillas, zona de ejercicios con caminadora y rack de pesas, y baño.",
    category: "architecture",
    baseWidth: 9000,
    baseHeight: 6000,
    assets: [
      asset("shell", "room", "Muro perimetral", 700, 700, 7600, 4600, "architecture", ["architecture", "shell", "fisioterapia"]),
      asset("entrada", "door", "Entrada", 3500, 650, 1000, 260, "architecture", ["door", "opening:entry"]),
      asset("recepcion-fis", "counter", "Recepción", 1500, 1400, 1800, 600, "equipment", ["counter", "fisioterapia"]),
      asset("espera-fis", "zone", "Sala de espera", 1300, 2400, 2400, 1400, "layout", ["zone", "use:waiting", "fisioterapia"]),
      asset("sofa-fis", "sofa-3", "Sofá de espera", 1500, 2600, 2100, 900, "equipment", ["sofa", "fisioterapia"]),
      asset("camilla-1", "exam-table", "Camilla 1", 4500, 1400, 700, 1900, "equipment", ["camilla", "fisioterapia"]),
      asset("camilla-2", "exam-table", "Camilla 2", 5700, 1400, 700, 1900, "equipment", ["camilla", "fisioterapia"]),
      asset("ejercicios-fis", "zone", "Zona de ejercicios", 4500, 3600, 3200, 1500, "layout", ["zone", "use:gym", "fisioterapia"]),
      asset("caminadora-fis", "treadmill", "Caminadora", 4700, 3800, 800, 1200, "equipment", ["caminadora", "fisioterapia"]),
      asset("pesas-fis", "weight-rack", "Rack de pesas", 6000, 3800, 1500, 600, "equipment", ["pesas", "fisioterapia"]),
      asset("bano-fis", "room", "Baño", 7000, 1400, 1200, 1500, "architecture", ["room", "use:bathroom", "fisioterapia"]),
      asset("wc-fis", "wc", "WC", 7150, 1550, 400, 650, "equipment", ["wc", "bathroom"]),
    ],
    annotations: [
      note("titulo", "Consultorio de fisioterapia — plantilla universal editable", 1200, 420, "measurements"),
    ],
    connectors: [
      { fromRef: "entrada", toRef: "recepcion-fis", kind: "flow" },
      { fromRef: "recepcion-fis", toRef: "camilla-1", kind: "flow" },
      { fromRef: "camilla-1", toRef: "ejercicios-fis", kind: "flow" },
    ],
  },
  {
    id: "spa",
    label: "Spa / Masajes",
    description: "Arranque universal de spa: recepción, sala de espera con sofá, dos cabinas de masaje con camilla, sala de vapor y baño.",
    category: "architecture",
    baseWidth: 10000,
    baseHeight: 7000,
    assets: [
      asset("shell", "room", "Muro perimetral", 700, 700, 8600, 5600, "architecture", ["architecture", "shell", "spa"]),
      asset("entrada", "door", "Entrada", 4000, 650, 1000, 260, "architecture", ["door", "opening:entry"]),
      asset("recepcion-spa", "counter", "Recepción", 1500, 1400, 1800, 600, "equipment", ["counter", "spa"]),
      asset("espera-spa", "zone", "Sala de espera", 1300, 2400, 2400, 1400, "layout", ["zone", "use:waiting", "spa"]),
      asset("sofa-spa", "sofa-3", "Sofá de espera", 1500, 2600, 2100, 900, "equipment", ["sofa", "spa"]),
      asset("cabina-1", "room", "Cabina 1", 4500, 1300, 2000, 2400, "architecture", ["room", "use:massage", "spa"]),
      asset("camilla-spa-1", "exam-table", "Camilla 1", 5100, 1500, 700, 1900, "equipment", ["camilla", "spa"]),
      asset("cabina-2", "room", "Cabina 2", 6800, 1300, 2000, 2400, "architecture", ["room", "use:massage", "spa"]),
      asset("camilla-spa-2", "exam-table", "Camilla 2", 7400, 1500, 700, 1900, "equipment", ["camilla", "spa"]),
      asset("vapor-spa", "zone", "Sala de vapor", 4500, 4200, 2000, 1500, "layout", ["zone", "use:steam", "spa"]),
      asset("bano-spa", "room", "Baño", 6800, 4200, 1600, 1500, "architecture", ["room", "use:bathroom", "spa"]),
      asset("wc-spa", "wc", "WC", 6950, 4350, 400, 650, "equipment", ["wc", "bathroom"]),
    ],
    annotations: [
      note("titulo", "Spa / Masajes — plantilla universal editable", 1200, 420, "measurements"),
    ],
    connectors: [
      { fromRef: "entrada", toRef: "recepcion-spa", kind: "flow" },
      { fromRef: "recepcion-spa", toRef: "cabina-1", kind: "flow" },
      { fromRef: "cabina-1", toRef: "vapor-spa", kind: "flow" },
    ],
  },
  {
    id: "cibercafe",
    label: "Cibercafé / Café internet",
    description: "Arranque universal de cibercafé: mostrador con copiadora, zona de computadoras con cuatro escritorios y sillas, vitrina de accesorios y baño.",
    category: "architecture",
    baseWidth: 9000,
    baseHeight: 6000,
    assets: [
      asset("shell", "room", "Muro perimetral", 700, 700, 7600, 4600, "architecture", ["architecture", "shell", "cibercafe"]),
      asset("entrada", "door", "Entrada", 3500, 650, 1000, 260, "architecture", ["door", "opening:entry"]),
      asset("mostrador-cc", "counter", "Mostrador", 1500, 1400, 1800, 600, "equipment", ["counter", "cibercafe"]),
      asset("copiadora-cc", "copier", "Copiadora", 3600, 1400, 700, 600, "equipment", ["copiadora", "cibercafe"]),
      asset("vitrina-cc", "display-case", "Vitrina de accesorios", 6850, 1500, 1200, 600, "equipment", ["vitrina", "cibercafe"]),
      asset("zona-pc", "zone", "Zona de computadoras", 1300, 2400, 5000, 2600, "layout", ["zone", "use:computers", "cibercafe"]),
      asset("esc-cc-1", "desk", "Escritorio 1", 1500, 2600, 1400, 700, "equipment", ["escritorio", "cibercafe"]),
      asset("esc-cc-2", "desk", "Escritorio 2", 3100, 2600, 1400, 700, "equipment", ["escritorio", "cibercafe"]),
      asset("esc-cc-3", "desk", "Escritorio 3", 1500, 3800, 1400, 700, "equipment", ["escritorio", "cibercafe"]),
      asset("esc-cc-4", "desk", "Escritorio 4", 3100, 3800, 1400, 700, "equipment", ["escritorio", "cibercafe"]),
      asset("silla-cc-1", "office-chair", "Silla 1", 2950, 2700, 500, 500, "equipment", ["silla", "cibercafe"]),
      asset("silla-cc-2", "office-chair", "Silla 2", 4550, 2700, 500, 500, "equipment", ["silla", "cibercafe"]),
      asset("silla-cc-3", "office-chair", "Silla 3", 2950, 3900, 500, 500, "equipment", ["silla", "cibercafe"]),
      asset("silla-cc-4", "office-chair", "Silla 4", 4550, 3900, 500, 500, "equipment", ["silla", "cibercafe"]),
      asset("bano-cc", "room", "Baño", 6800, 3600, 1500, 1500, "architecture", ["room", "use:bathroom", "cibercafe"]),
      asset("wc-cc", "wc", "WC", 6950, 3750, 400, 650, "equipment", ["wc", "bathroom"]),
    ],
    annotations: [
      note("titulo", "Cibercafé / Café internet — plantilla universal editable", 1200, 420, "measurements"),
    ],
    connectors: [
      { fromRef: "entrada", toRef: "mostrador-cc", kind: "flow" },
      { fromRef: "mostrador-cc", toRef: "zona-pc", kind: "flow" },
      { fromRef: "copiadora-cc", toRef: "mostrador-cc", kind: "flow" },
    ],
  },
  {
    id: "gimnasio-box",
    label: "Gimnasio de box",
    description: "Arranque universal de gimnasio de box: ring, zona de costales, rack de pesas, caminadora, vestidor con banca y baño.",
    category: "architecture",
    baseWidth: 12000,
    baseHeight: 8000,
    assets: [
      asset("shell", "room", "Muro perimetral", 700, 700, 10600, 6600, "architecture", ["architecture", "shell", "box"]),
      asset("entrada", "door", "Entrada", 5000, 650, 1000, 260, "architecture", ["door", "opening:entry"]),
      asset("ring-box", "zone", "Ring de box", 1500, 1500, 4000, 4000, "layout", ["zone", "use:ring", "box"]),
      asset("zona-costales", "zone", "Zona de costales", 6300, 1300, 4200, 1200, "layout", ["zone", "use:bags", "box"]),
      asset("costal-1", "punching-bag", "Costal 1", 6500, 1500, 500, 500, "equipment", ["costal", "box"]),
      asset("costal-2", "punching-bag", "Costal 2", 7800, 1500, 500, 500, "equipment", ["costal", "box"]),
      asset("costal-3", "punching-bag", "Costal 3", 9100, 1500, 500, 500, "equipment", ["costal", "box"]),
      asset("pesas-box", "weight-rack", "Rack de pesas", 6500, 3500, 1500, 600, "equipment", ["pesas", "box"]),
      asset("caminadora-box", "treadmill", "Caminadora", 8500, 3500, 800, 1400, "equipment", ["caminadora", "box"]),
      asset("vestidor-box", "room", "Vestidor", 1500, 5800, 2400, 1400, "architecture", ["room", "use:lockers", "box"]),
      asset("banca-box", "gym-bench", "Banca", 1700, 6000, 1200, 400, "equipment", ["banca", "box"]),
      asset("bano-box", "room", "Baño", 6500, 5500, 1600, 1600, "architecture", ["room", "use:bathroom", "box"]),
      asset("wc-box", "wc", "WC", 6650, 5650, 400, 650, "equipment", ["wc", "bathroom"]),
    ],
    annotations: [
      note("titulo", "Gimnasio de box — plantilla universal editable", 1200, 420, "measurements"),
    ],
    connectors: [
      { fromRef: "entrada", toRef: "ring-box", kind: "flow" },
      { fromRef: "ring-box", toRef: "zona-costales", kind: "flow" },
      { fromRef: "vestidor-box", toRef: "ring-box", kind: "flow" },
    ],
  },
  {
    id: "polleria",
    label: "Pollería",
    description: "Arranque universal de pollería: mostrador con vitrina refrigerada y báscula, congelador, mesa de corte, refrigerador, cuarto frío y despacho.",
    category: "architecture",
    baseWidth: 9000,
    baseHeight: 6000,
    assets: [
      asset("shell", "room", "Muro perimetral", 700, 700, 7600, 4600, "architecture", ["architecture", "shell", "polleria"]),
      asset("entrada", "door", "Entrada", 3500, 650, 1000, 260, "architecture", ["door", "opening:entry"]),
      asset("mostrador-pol", "counter", "Mostrador", 1500, 1400, 1800, 600, "equipment", ["counter", "polleria"]),
      asset("vitrina-pol", "display-case", "Vitrina refrigerada", 3600, 1400, 1500, 600, "equipment", ["vitrina", "polleria"]),
      asset("bascula-pol", "scale", "Báscula", 5400, 1400, 500, 500, "equipment", ["bascula", "polleria"]),
      asset("congelador-pol", "freezer", "Congelador", 6300, 1400, 1500, 700, "equipment", ["congelador", "polleria"]),
      asset("mesa-corte-pol", "workbench", "Mesa de corte", 1500, 2800, 1800, 750, "equipment", ["mesa", "corte", "polleria"]),
      asset("refri-pol", "refrigerator", "Refrigerador", 3600, 2800, 800, 700, "equipment", ["refrigerador", "polleria"]),
      asset("despacho-pol", "zone", "Despacho", 1300, 3900, 3000, 1300, "layout", ["zone", "use:service", "polleria"]),
      asset("cuarto-frio-pol", "room", "Cuarto frío", 6000, 3200, 1900, 1800, "architecture", ["room", "use:coldroom", "polleria"]),
    ],
    annotations: [
      note("titulo", "Pollería — plantilla universal editable", 1200, 420, "measurements"),
    ],
    connectors: [
      { fromRef: "entrada", toRef: "mostrador-pol", kind: "flow" },
      { fromRef: "cuarto-frio-pol", toRef: "mesa-corte-pol", kind: "material" },
      { fromRef: "mesa-corte-pol", toRef: "vitrina-pol", kind: "material" },
    ],
  },
  {
    id: "floreria",
    label: "Florería",
    description: "Arranque universal de florería: mostrador, cámara floral, mesa de arreglos, cubetas de flor, estante de macetas y trastienda.",
    category: "architecture",
    baseWidth: 9000,
    baseHeight: 6000,
    assets: [
      asset("shell", "room", "Muro perimetral", 700, 700, 7600, 4600, "architecture", ["architecture", "shell", "floreria"]),
      asset("entrada", "door", "Entrada", 3500, 650, 1000, 260, "architecture", ["door", "opening:entry"]),
      asset("mostrador-flo", "counter", "Mostrador", 1500, 1400, 1800, 600, "equipment", ["counter", "floreria"]),
      asset("camara-flo", "display-case", "Cámara floral", 3600, 1400, 1800, 700, "equipment", ["vitrina", "flor", "floreria"]),
      asset("estante-flo", "shelf", "Estante de macetas", 5800, 1400, 2400, 500, "equipment", ["estante", "maceta", "floreria"]),
      asset("mesa-arreglos-flo", "workbench", "Mesa de arreglos", 1500, 2600, 2000, 800, "equipment", ["mesa", "arreglos", "floreria"]),
      asset("cubetas-flo", "zone", "Cubetas de flor", 3900, 2600, 1600, 900, "layout", ["zone", "use:display", "floreria"]),
      asset("maceta-flo-1", "plant-pot", "Maceta", 1000, 4600, 450, 450, "equipment", ["maceta", "floreria"]),
      asset("maceta-flo-2", "plant-pot", "Maceta", 1600, 4600, 450, 450, "equipment", ["maceta", "floreria"]),
      asset("trastienda-flo", "room", "Trastienda", 6000, 3200, 1900, 1800, "architecture", ["room", "use:storage", "floreria"]),
    ],
    annotations: [
      note("titulo", "Florería — plantilla universal editable", 1200, 420, "measurements"),
    ],
    connectors: [
      { fromRef: "entrada", toRef: "mostrador-flo", kind: "flow" },
      { fromRef: "trastienda-flo", toRef: "mesa-arreglos-flo", kind: "material" },
      { fromRef: "mesa-arreglos-flo", toRef: "camara-flo", kind: "material" },
    ],
  },
  {
    id: "cremeria",
    label: "Cremería",
    description: "Arranque universal de cremería: mostrador con vitrina de lácteos, báscula, caja registradora, mesa de corte y rebanado, refrigerador, cuarto frío y despacho.",
    category: "architecture",
    baseWidth: 9000,
    baseHeight: 6000,
    assets: [
      asset("shell", "room", "Muro perimetral", 700, 700, 7600, 4600, "architecture", ["architecture", "shell", "cremeria"]),
      asset("entrada", "door", "Entrada", 3500, 650, 1000, 260, "architecture", ["door", "opening:entry"]),
      asset("mostrador-cre", "counter", "Mostrador", 1500, 1400, 1800, 600, "equipment", ["counter", "cremeria"]),
      asset("vitrina-cre", "display-case", "Vitrina de lácteos", 3600, 1400, 1800, 700, "equipment", ["vitrina", "queso", "cremeria"]),
      asset("bascula-cre", "scale", "Báscula", 5700, 1400, 500, 500, "equipment", ["bascula", "cremeria"]),
      asset("caja-cre", "cash-register", "Caja registradora", 6500, 1400, 450, 400, "equipment", ["caja", "cobro", "cremeria"]),
      asset("mesa-corte-cre", "workbench", "Mesa de corte y rebanado", 1500, 2800, 2000, 800, "equipment", ["mesa", "corte", "cremeria"]),
      asset("refri-cre", "refrigerator", "Refrigerador", 3900, 2800, 800, 700, "equipment", ["refrigerador", "cremeria"]),
      asset("despacho-cre", "zone", "Despacho", 1300, 4000, 2600, 1200, "layout", ["zone", "use:service", "cremeria"]),
      asset("cuarto-frio-cre", "room", "Cuarto frío", 6000, 3200, 1900, 1800, "architecture", ["room", "use:coldroom", "cremeria"]),
    ],
    annotations: [
      note("titulo", "Cremería — plantilla universal editable", 1200, 420, "measurements"),
    ],
    connectors: [
      { fromRef: "entrada", toRef: "mostrador-cre", kind: "flow" },
      { fromRef: "cuarto-frio-cre", toRef: "mesa-corte-cre", kind: "material" },
      { fromRef: "mesa-corte-cre", toRef: "vitrina-cre", kind: "material" },
    ],
  },
  {
    id: "neveria",
    label: "Nevería / Paletería",
    description: "Arranque universal de nevería: mostrador con vitrina de paletas, caja registradora, congelador de reserva, dos mesitas, bote de basura y bodega.",
    category: "architecture",
    baseWidth: 9000,
    baseHeight: 6000,
    assets: [
      asset("shell", "room", "Muro perimetral", 700, 700, 7600, 4600, "architecture", ["architecture", "shell", "neveria"]),
      asset("entrada", "door", "Entrada", 3500, 650, 1000, 260, "architecture", ["door", "opening:entry"]),
      asset("mostrador-nev", "counter", "Mostrador", 1500, 1400, 1800, 600, "equipment", ["counter", "neveria"]),
      asset("vitrina-nev", "display-case", "Vitrina de paletas", 3600, 1400, 1800, 700, "equipment", ["vitrina", "helado", "neveria"]),
      asset("caja-nev", "cash-register", "Caja registradora", 5700, 1400, 450, 400, "equipment", ["caja", "cobro", "neveria"]),
      asset("congelador-nev", "freezer", "Congelador de reserva", 6600, 1400, 1500, 700, "equipment", ["congelador", "neveria"]),
      asset("mesa-nev-1", "restaurant-table-4", "Mesita 1", 1500, 3000, 900, 900, "equipment", ["table", "seating", "neveria"]),
      asset("mesa-nev-2", "restaurant-table-4", "Mesita 2", 3000, 3000, 900, 900, "equipment", ["table", "seating", "neveria"]),
      asset("basura-nev", "trash-bin", "Bote de basura", 5200, 3000, 400, 400, "equipment", ["basura", "neveria"]),
      asset("bodega-nev", "room", "Bodega", 6000, 3200, 1900, 1800, "architecture", ["room", "use:storage", "neveria"]),
    ],
    annotations: [
      note("titulo", "Nevería — plantilla universal editable", 1200, 420, "measurements"),
    ],
    connectors: [
      { fromRef: "entrada", toRef: "mostrador-nev", kind: "flow" },
      { fromRef: "bodega-nev", toRef: "congelador-nev", kind: "material" },
      { fromRef: "congelador-nev", toRef: "vitrina-nev", kind: "material" },
    ],
  },
  {
    id: "jugueria",
    label: "Juguería / Jugos y licuados",
    description: "Arranque universal de juguería: barra de jugos, caja registradora, exhibidor de fruta con huacales, refrigerador, dos mesitas y bodega.",
    category: "architecture",
    baseWidth: 9000,
    baseHeight: 6000,
    assets: [
      asset("shell", "room", "Muro perimetral", 700, 700, 7600, 4600, "architecture", ["architecture", "shell", "jugueria"]),
      asset("entrada", "door", "Entrada", 3500, 650, 1000, 260, "architecture", ["door", "opening:entry"]),
      asset("barra-jug", "bar-counter", "Barra de jugos", 1500, 1400, 2400, 600, "equipment", ["bar", "jugos", "jugueria"]),
      asset("caja-jug", "cash-register", "Caja registradora", 4200, 1400, 450, 400, "equipment", ["caja", "cobro", "jugueria"]),
      asset("exhibidor-jug", "shelf", "Exhibidor de fruta", 5000, 1400, 1800, 500, "equipment", ["estante", "fruta", "jugueria"]),
      asset("huacal-jug-1", "fruit-crate", "Huacal de fruta", 7100, 1400, 500, 400, "equipment", ["huacal", "fruta", "jugueria"]),
      asset("huacal-jug-2", "fruit-crate", "Huacal de fruta", 7100, 1900, 500, 400, "equipment", ["huacal", "fruta", "jugueria"]),
      asset("refri-jug", "refrigerator", "Refrigerador", 1500, 2800, 800, 700, "equipment", ["refrigerador", "jugueria"]),
      asset("mesa-jug-1", "restaurant-table-4", "Mesita 1", 3000, 3000, 900, 900, "equipment", ["table", "seating", "jugueria"]),
      asset("mesa-jug-2", "restaurant-table-4", "Mesita 2", 4500, 3000, 900, 900, "equipment", ["table", "seating", "jugueria"]),
      asset("bodega-jug", "room", "Bodega", 6000, 3200, 1900, 1800, "architecture", ["room", "use:storage", "jugueria"]),
    ],
    annotations: [
      note("titulo", "Juguería — plantilla universal editable", 1200, 420, "measurements"),
    ],
    connectors: [
      { fromRef: "entrada", toRef: "barra-jug", kind: "flow" },
      { fromRef: "bodega-jug", toRef: "exhibidor-jug", kind: "material" },
      { fromRef: "exhibidor-jug", toRef: "barra-jug", kind: "material" },
    ],
  },
  {
    id: "pescaderia",
    label: "Pescadería",
    description: "Arranque universal de pescadería: mostrador con vitrina con hielo, báscula, caja registradora, mesa de fileteado, congelador, cuarto frío y despacho.",
    category: "architecture",
    baseWidth: 9000,
    baseHeight: 6000,
    assets: [
      asset("shell", "room", "Muro perimetral", 700, 700, 7600, 4600, "architecture", ["architecture", "shell", "pescaderia"]),
      asset("entrada", "door", "Entrada", 3500, 650, 1000, 260, "architecture", ["door", "opening:entry"]),
      asset("mostrador-pes", "counter", "Mostrador", 1500, 1400, 1800, 600, "equipment", ["counter", "pescaderia"]),
      asset("vitrina-pes", "display-case", "Vitrina con hielo", 3600, 1400, 1800, 700, "equipment", ["vitrina", "hielo", "pescaderia"]),
      asset("bascula-pes", "scale", "Báscula", 5700, 1400, 500, 500, "equipment", ["bascula", "pescaderia"]),
      asset("caja-pes", "cash-register", "Caja registradora", 6500, 1400, 450, 400, "equipment", ["caja", "cobro", "pescaderia"]),
      asset("mesa-fileteo-pes", "workbench", "Mesa de fileteado", 1500, 2800, 2000, 800, "equipment", ["mesa", "fileteado", "pescaderia"]),
      asset("congelador-pes", "freezer", "Congelador", 3900, 2800, 1500, 700, "equipment", ["congelador", "pescaderia"]),
      asset("despacho-pes", "zone", "Despacho", 1300, 4000, 2600, 1200, "layout", ["zone", "use:service", "pescaderia"]),
      asset("cuarto-frio-pes", "room", "Cuarto frío", 6000, 3200, 1900, 1800, "architecture", ["room", "use:coldroom", "pescaderia"]),
    ],
    annotations: [
      note("titulo", "Pescadería — plantilla universal editable", 1200, 420, "measurements"),
    ],
    connectors: [
      { fromRef: "entrada", toRef: "mostrador-pes", kind: "flow" },
      { fromRef: "cuarto-frio-pes", toRef: "mesa-fileteo-pes", kind: "material" },
      { fromRef: "mesa-fileteo-pes", toRef: "vitrina-pes", kind: "material" },
    ],
  },
  {
    id: "boutique",
    label: "Boutique / Tienda de ropa",
    description: "Arranque universal de boutique: mostrador con caja, dos racks de ropa, mesa de exhibición, perchero, dos probadores y bodega.",
    category: "architecture",
    baseWidth: 9000,
    baseHeight: 6000,
    assets: [
      asset("shell", "room", "Muro perimetral", 700, 700, 7600, 4600, "architecture", ["architecture", "shell", "boutique"]),
      asset("entrada", "door", "Entrada", 3500, 650, 1000, 260, "architecture", ["door", "opening:entry"]),
      asset("mostrador-bou", "counter", "Mostrador", 1500, 1400, 1800, 600, "equipment", ["counter", "boutique"]),
      asset("caja-bou", "cash-register", "Caja registradora", 3600, 1400, 450, 400, "equipment", ["caja", "cobro", "boutique"]),
      asset("rack-bou-1", "shelf", "Rack de ropa", 4800, 1400, 1600, 450, "equipment", ["rack", "ropa", "boutique"]),
      asset("rack-bou-2", "shelf", "Rack de ropa", 6600, 1400, 1600, 450, "equipment", ["rack", "ropa", "boutique"]),
      asset("perchero-bou", "coat-rack", "Perchero", 1200, 2600, 400, 400, "equipment", ["perchero", "boutique"]),
      asset("mesa-exhibicion-bou", "display-case", "Mesa de exhibición", 4200, 2800, 1400, 700, "equipment", ["exhibicion", "boutique"]),
      asset("probador-bou-1", "room", "Probador 1", 1200, 3800, 1200, 1300, "architecture", ["room", "use:fitting", "boutique"]),
      asset("probador-bou-2", "room", "Probador 2", 2600, 3800, 1200, 1300, "architecture", ["room", "use:fitting", "boutique"]),
      asset("bodega-bou", "room", "Bodega", 6000, 3200, 1900, 1800, "architecture", ["room", "use:storage", "boutique"]),
    ],
    annotations: [
      note("titulo", "Boutique — plantilla universal editable", 1200, 420, "measurements"),
    ],
    connectors: [
      { fromRef: "entrada", toRef: "mostrador-bou", kind: "flow" },
      { fromRef: "bodega-bou", toRef: "rack-bou-1", kind: "material" },
      { fromRef: "rack-bou-1", toRef: "mostrador-bou", kind: "material" },
    ],
  },
  {
    id: "hostal",
    label: "Hostal / Casa de huéspedes",
    description: "Arranque universal de hostal: recepción, casilleros, dormitorio compartido con literas, cocina común, baño compartido y sala común.",
    category: "architecture",
    baseWidth: 10000,
    baseHeight: 7000,
    assets: [
      asset("shell", "room", "Muro perimetral", 700, 700, 8600, 5600, "architecture", ["architecture", "shell", "hostal"]),
      asset("entrada", "door", "Entrada", 4500, 650, 900, 260, "architecture", ["door", "opening:entry"]),
      asset("recepcion-hos", "counter", "Recepción", 1200, 1400, 1800, 600, "equipment", ["counter", "recepcion", "hostal"]),
      asset("casilleros-hos", "shelf", "Casilleros", 3300, 1400, 1600, 450, "equipment", ["casilleros", "lockers", "hostal"]),
      asset("dormitorio-hos", "room", "Dormitorio compartido", 5600, 900, 3500, 2600, "architecture", ["room", "use:bedroom", "hostal"]),
      asset("litera-hos-1", "bunk-bed", "Litera 1", 5800, 1100, 2000, 1000, "equipment", ["litera", "hostal"]),
      asset("litera-hos-2", "bunk-bed", "Litera 2", 5800, 2300, 2000, 1000, "equipment", ["litera", "hostal"]),
      asset("cocina-hos", "room", "Cocina común", 1200, 2800, 2600, 1800, "architecture", ["room", "use:kitchen", "hostal"]),
      asset("fregadero-hos", "kitchen-sink", "Fregadero", 1400, 3000, 800, 550, "equipment", ["fregadero", "hostal"]),
      asset("refri-hos", "refrigerator", "Refrigerador", 2400, 3000, 750, 700, "equipment", ["refrigerador", "hostal"]),
      asset("bano-hos", "room", "Baño compartido", 4200, 4200, 1800, 1800, "architecture", ["room", "use:bathroom", "hostal"]),
      asset("wc-hos", "wc", "WC", 4400, 4400, 400, 650, "equipment", ["wc", "hostal"]),
      asset("sala-hos", "zone", "Sala común", 6600, 4200, 2400, 1800, "layout", ["zone", "use:lounge", "hostal"]),
    ],
    annotations: [
      note("titulo", "Hostal — plantilla universal editable", 1200, 420, "measurements"),
    ],
    connectors: [
      { fromRef: "entrada", toRef: "recepcion-hos", kind: "flow" },
      { fromRef: "recepcion-hos", toRef: "dormitorio-hos", kind: "flow" },
    ],
  },
  {
    id: "autolavado",
    label: "Autolavado",
    description: "Arranque universal de autolavado: portón, dos carriles de lavado, equipo de lavado, zona de aspirado, caja y sala de espera con TV y dispensador.",
    category: "architecture",
    baseWidth: 12000,
    baseHeight: 7000,
    assets: [
      asset("shell", "room", "Muro perimetral", 700, 700, 10600, 5600, "architecture", ["architecture", "shell", "autolavado"]),
      asset("porton", "door", "Portón de entrada", 4500, 650, 2500, 260, "architecture", ["door", "opening:entry"]),
      asset("carril-lav-1", "zone", "Carril de lavado 1", 1200, 1400, 3600, 2200, "layout", ["zone", "use:wash", "autolavado"]),
      asset("carril-lav-2", "zone", "Carril de lavado 2", 5200, 1400, 3600, 2200, "layout", ["zone", "use:wash", "autolavado"]),
      asset("equipo-lav", "workbench", "Equipo de lavado", 9200, 1400, 1500, 800, "equipment", ["equipo", "autolavado"]),
      asset("aspirado-lav", "zone", "Zona de aspirado", 1200, 4000, 3600, 1800, "layout", ["zone", "use:vacuum", "autolavado"]),
      asset("caja-lav", "counter", "Caja", 5600, 4200, 1500, 600, "equipment", ["counter", "autolavado"]),
      asset("registradora-lav", "cash-register", "Caja registradora", 7300, 4200, 450, 400, "equipment", ["caja", "cobro", "autolavado"]),
      asset("sala-lav", "zone", "Sala de espera", 8200, 4000, 2800, 1800, "layout", ["zone", "use:lounge", "autolavado"]),
      asset("tv-lav", "tv-screen", "Pantalla", 8400, 4200, 1200, 150, "equipment", ["pantalla", "autolavado"]),
      asset("garrafon-lav", "water-dispenser", "Dispensador de agua", 9800, 4500, 350, 350, "equipment", ["agua", "autolavado"]),
    ],
    annotations: [
      note("titulo", "Autolavado — plantilla universal editable", 1200, 420, "measurements"),
    ],
    connectors: [
      { fromRef: "porton", toRef: "carril-lav-1", kind: "flow" },
      { fromRef: "carril-lav-1", toRef: "aspirado-lav", kind: "flow" },
      { fromRef: "aspirado-lav", toRef: "caja-lav", kind: "flow" },
    ],
  },
  {
    id: "llantera",
    label: "Llantera / Vulcanizadora",
    description: "Arranque universal de llantera: portón, dos bahías de servicio, montadora de llantas, compresor, rack de llantas, conos, caja y bodega.",
    category: "architecture",
    baseWidth: 10000,
    baseHeight: 7000,
    assets: [
      asset("shell", "room", "Muro perimetral", 700, 700, 8600, 5600, "architecture", ["architecture", "shell", "llantera"]),
      asset("porton", "door", "Portón", 4500, 650, 2200, 260, "architecture", ["door", "opening:entry"]),
      asset("bahia-lla-1", "zone", "Bahía de servicio 1", 1200, 1400, 3200, 2400, "layout", ["zone", "use:service", "llantera"]),
      asset("bahia-lla-2", "zone", "Bahía de servicio 2", 4800, 1400, 3200, 2400, "layout", ["zone", "use:service", "llantera"]),
      asset("montadora-lla", "workbench", "Montadora de llantas", 8300, 1400, 900, 700, "equipment", ["montadora", "llantera"]),
      asset("compresor-lla", "air-compressor", "Compresor de aire", 8300, 2400, 750, 600, "equipment", ["compresor", "llantera"]),
      asset("rack-lla", "rack", "Rack de llantas", 1200, 4200, 2400, 600, "equipment", ["rack", "llantas", "llantera"]),
      asset("cono-lla-1", "traffic-cone", "Cono", 4000, 4200, 300, 300, "safety", ["cono", "llantera"]),
      asset("cono-lla-2", "traffic-cone", "Cono", 4500, 4200, 300, 300, "safety", ["cono", "llantera"]),
      asset("caja-lla", "counter", "Caja", 5600, 4400, 1500, 600, "equipment", ["counter", "llantera"]),
      asset("registradora-lla", "cash-register", "Caja registradora", 7300, 4400, 450, 400, "equipment", ["caja", "cobro", "llantera"]),
      asset("bodega-lla", "room", "Bodega", 8000, 4000, 1300, 1800, "architecture", ["room", "use:storage", "llantera"]),
    ],
    annotations: [
      note("titulo", "Llantera — plantilla universal editable", 1200, 420, "measurements"),
    ],
    connectors: [
      { fromRef: "porton", toRef: "bahia-lla-1", kind: "flow" },
      { fromRef: "rack-lla", toRef: "montadora-lla", kind: "material" },
      { fromRef: "montadora-lla", toRef: "bahia-lla-1", kind: "material" },
    ],
  },
  {
    id: "purificadora",
    label: "Purificadora de agua",
    description: "Arranque universal de purificadora: área de llenado, equipo de purificación, filtros, estantes de garrafones, caja con registradora y bodega.",
    category: "architecture",
    baseWidth: 9000,
    baseHeight: 6000,
    assets: [
      asset("shell", "room", "Muro perimetral", 700, 700, 7600, 4600, "architecture", ["architecture", "shell", "purificadora"]),
      asset("entrada", "door", "Entrada", 3500, 650, 1000, 260, "architecture", ["door", "opening:entry"]),
      asset("llenado-pur", "zone", "Área de llenado", 1200, 1400, 2600, 1800, "layout", ["zone", "use:fill", "purificadora"]),
      asset("equipo-pur", "workbench", "Equipo de purificación", 4200, 1400, 1800, 800, "equipment", ["equipo", "filtro", "purificadora"]),
      asset("filtros-pur", "shelf", "Filtros y repuestos", 6400, 1400, 1600, 450, "equipment", ["estante", "filtros", "purificadora"]),
      asset("llenos-pur", "shelf", "Garrafones llenos", 1200, 3600, 2400, 600, "equipment", ["estante", "garrafones", "purificadora"]),
      asset("vacios-pur", "zone", "Garrafones vacíos", 3900, 3600, 1600, 900, "layout", ["zone", "garrafones", "purificadora"]),
      asset("caja-pur", "counter", "Caja", 5800, 3600, 1500, 600, "equipment", ["counter", "purificadora"]),
      asset("registradora-pur", "cash-register", "Caja registradora", 5800, 4400, 450, 400, "equipment", ["caja", "cobro", "purificadora"]),
      asset("bodega-pur", "room", "Bodega", 7400, 3400, 900, 1700, "architecture", ["room", "use:storage", "purificadora"]),
    ],
    annotations: [
      note("titulo", "Purificadora — plantilla universal editable", 1200, 420, "measurements"),
    ],
    connectors: [
      { fromRef: "entrada", toRef: "caja-pur", kind: "flow" },
      { fromRef: "equipo-pur", toRef: "llenado-pur", kind: "material" },
      { fromRef: "llenado-pur", toRef: "llenos-pur", kind: "material" },
    ],
  },
  {
    id: "optica",
    label: "Óptica",
    description: "Arranque universal de óptica: mostrador con caja, exhibidores de armazones, espejo de pared, sala de espera, gabinete de examen visual y taller de ajuste.",
    category: "architecture",
    baseWidth: 9000,
    baseHeight: 6000,
    assets: [
      asset("shell", "room", "Muro perimetral", 700, 700, 7600, 4600, "architecture", ["architecture", "shell", "optica"]),
      asset("entrada", "door", "Entrada", 3500, 650, 1000, 260, "architecture", ["door", "opening:entry"]),
      asset("mostrador-opt", "counter", "Mostrador", 1500, 1400, 1800, 600, "equipment", ["counter", "optica"]),
      asset("registradora-opt", "cash-register", "Caja registradora", 3600, 1400, 450, 400, "equipment", ["caja", "cobro", "optica"]),
      asset("exhibidor-opt-1", "display-case", "Exhibidor de armazones", 4800, 1400, 1500, 500, "equipment", ["exhibidor", "armazones", "optica"]),
      asset("exhibidor-opt-2", "display-case", "Exhibidor de armazones", 6500, 1400, 1500, 500, "equipment", ["exhibidor", "armazones", "optica"]),
      asset("espejo-opt", "wall-mirror", "Espejo de pared", 1200, 2600, 1000, 100, "equipment", ["espejo", "optica"]),
      asset("espera-opt", "zone", "Sala de espera", 1200, 3400, 2400, 1600, "layout", ["zone", "use:lounge", "optica"]),
      asset("gabinete-opt", "room", "Gabinete de examen", 4200, 3000, 2400, 2200, "architecture", ["room", "use:exam", "optica"]),
      asset("equipo-opt", "workbench", "Equipo de examen visual", 4400, 3200, 1200, 700, "equipment", ["equipo", "examen", "optica"]),
      asset("taller-opt", "room", "Taller de ajuste", 7000, 3200, 1300, 1800, "architecture", ["room", "use:workshop", "optica"]),
    ],
    annotations: [
      note("titulo", "Óptica — plantilla universal editable", 1200, 420, "measurements"),
    ],
    connectors: [
      { fromRef: "entrada", toRef: "mostrador-opt", kind: "flow" },
      { fromRef: "espera-opt", toRef: "gabinete-opt", kind: "flow" },
      { fromRef: "gabinete-opt", toRef: "taller-opt", kind: "material" },
    ],
  },
  {
    id: "departamento",
    label: "Departamento",
    description: "Arranque universal de departamento de renta: sala, comedor, cocina con fregadero y refrigerador, dos recámaras con camas y baño completo.",
    category: "architecture",
    baseWidth: 10000,
    baseHeight: 7000,
    assets: [
      asset("shell", "room", "Muro perimetral", 700, 700, 8600, 5600, "architecture", ["architecture", "shell", "departamento"]),
      asset("entrada", "door", "Entrada", 4500, 650, 900, 260, "architecture", ["door", "opening:entry"]),
      asset("sala-dep", "zone", "Sala", 1200, 1200, 2600, 2000, "layout", ["zone", "use:living", "departamento"]),
      asset("comedor-dep", "zone", "Comedor", 4200, 1200, 2200, 2000, "layout", ["zone", "use:dining", "departamento"]),
      asset("mesa-dep", "restaurant-table-4", "Mesa de comedor", 4800, 1700, 900, 900, "equipment", ["table", "departamento"]),
      asset("cocina-dep", "room", "Cocina", 6900, 900, 2200, 2000, "architecture", ["room", "use:kitchen", "departamento"]),
      asset("fregadero-dep", "kitchen-sink", "Fregadero", 7100, 1100, 800, 550, "equipment", ["fregadero", "departamento"]),
      asset("refri-dep", "refrigerator", "Refrigerador", 8300, 1700, 750, 700, "equipment", ["refrigerador", "departamento"]),
      asset("recamara-dep-1", "room", "Recámara principal", 1200, 3600, 2800, 2600, "architecture", ["room", "use:bedroom", "departamento"]),
      asset("cama-dep-1", "bed-queen", "Cama matrimonial", 1400, 3900, 1400, 2000, "equipment", ["cama", "departamento"]),
      asset("recamara-dep-2", "room", "Recámara 2", 4300, 3600, 2400, 2600, "architecture", ["room", "use:bedroom", "departamento"]),
      asset("cama-dep-2", "furniture", "Cama individual", 4500, 3900, 1000, 1900, "equipment", ["cama", "departamento"]),
      asset("bano-dep", "room", "Baño", 7100, 3600, 2000, 1600, "architecture", ["room", "use:bathroom", "departamento"]),
      asset("wc-dep", "wc", "WC", 7300, 3800, 400, 650, "equipment", ["wc", "departamento"]),
    ],
    annotations: [
      note("titulo", "Departamento — plantilla universal editable", 1200, 420, "measurements"),
    ],
    connectors: [
      { fromRef: "entrada", toRef: "sala-dep", kind: "flow" },
      { fromRef: "sala-dep", toRef: "comedor-dep", kind: "flow" },
      { fromRef: "cocina-dep", toRef: "comedor-dep", kind: "material" },
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
