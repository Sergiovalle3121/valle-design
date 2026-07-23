/**
 * Framework de Industry Packs de AXOS CAD Next (CAD-NEXT-090).
 *
 * La ventaja competitiva de AXOS CAD frente a un CAD genérico es que un objeto
 * no es sólo geometría: es un **objeto inteligente de un dominio** (una estación
 * de trabajo, un tanque de proceso, un cajón de estacionamiento) con parámetros,
 * cálculos de negocio y reglas. Un Industry Pack registra esos objetos para una
 * industria concreta, pero TODOS comparten el mismo `CadDocument`, el mismo
 * render y el mismo motor de comandos — no hay editores paralelos por industria.
 *
 * Este módulo define el contrato + un registro, y deja que cada objeto sepa:
 *  - `toEntities`: cómo se dibuja en el documento canónico (cajas/círculos, etc.),
 *  - `calculate`: qué números de negocio produce (área, capacidad, throughput…),
 *  - `validate`: qué reglas debe cumplir.
 *
 * Puro (sin three/DOM/Date.now): registro y objetos se testean en Node y el
 * resultado (`CadEntity[]`) entra al mismo documento del resto del CAD.
 */

import type { CadEntity } from "./cad-document";

/** Un parámetro editable de un objeto inteligente. */
export interface IndustryField {
  key: string;
  label: string;
  type: "number" | "text";
  /** Unidad mostrada (mm, s, m³…) — informativa. */
  unit?: string;
  default: number | string;
  /** Mínimo para campos numéricos (validación de rango básica). */
  min?: number;
}

/** Una instancia colocada de un objeto inteligente en el plano. */
export interface SmartObjectInstance {
  /** Id único de esta instancia (= id de la entidad principal generada). */
  id: string;
  /** Id del objeto de industria del que es instancia. */
  objectId: string;
  /** Ancla en coordenadas del documento (esquina superior-izquierda). */
  x: number;
  y: number;
  rotation?: number;
  /** Valores de los parámetros; los faltantes toman el `default` del campo. */
  props: Record<string, number | string>;
}

export interface IndustryFinding {
  level: "error" | "warning";
  message: string;
}

/** Definición de un objeto inteligente de una industria. */
export interface IndustryObjectDef {
  id: string;
  label: string;
  /** Industria a la que pertenece (para agrupar en la paleta). */
  industry: string;
  /** Categoría/subgrupo dentro de la industria. */
  category: string;
  fields: IndustryField[];
  /** Proyecta la instancia a entidades canónicas del documento compartido. */
  toEntities: (instance: SmartObjectInstance) => CadEntity[];
  /** Cálculos de negocio derivados de los parámetros (área, capacidad…). */
  calculate?: (instance: SmartObjectInstance) => Record<string, number>;
  /** Reglas de dominio; vacío = válido. */
  validate?: (instance: SmartObjectInstance) => IndustryFinding[];
  /**
   * Recupera los parámetros GEOMÉTRICOS desde el tamaño del objeto colocado
   * (ancho × fondo del asset en el editor). Permite RE-EVALUAR las reglas del
   * pack en REVISAR PLANO después de redimensionar (CAD-NEXT-095). Ausente =
   * las reglas del objeto no son re-evaluables desde la geometría (honesto:
   * mejor ningún hallazgo que uno inventado con defaults).
   */
  propsFromSize?: (w: number, h: number) => Record<string, number>;
}

export interface IndustryPack {
  id: string;
  label: string;
  objects: IndustryObjectDef[];
}

/** Devuelve el valor de un parámetro o el `default` del campo. */
export function fieldValue(
  def: IndustryObjectDef,
  instance: SmartObjectInstance,
  key: string,
): number | string {
  const field = def.fields.find((f) => f.key === key);
  const raw = instance.props[key];
  if (raw !== undefined && raw !== null && raw !== "") return raw;
  return field ? field.default : 0;
}
/** Igual que `fieldValue` pero forzando número (para geometría/cálculo). */
export function numField(
  def: IndustryObjectDef,
  instance: SmartObjectInstance,
  key: string,
): number {
  const v = fieldValue(def, instance, key);
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Registro de Industry Packs. Un objeto por concern (no duplica industrias):
 * registrar dos veces la misma industria la reemplaza, con aviso vía el valor
 * de retorno para que el llamador decida.
 */
export class IndustryPackRegistry {
  private packs = new Map<string, IndustryPack>();

  register(pack: IndustryPack): { replaced: boolean } {
    const replaced = this.packs.has(pack.id);
    this.packs.set(pack.id, pack);
    return { replaced };
  }

  getPack(id: string): IndustryPack | undefined {
    return this.packs.get(id);
  }

  listPacks(): IndustryPack[] {
    return [...this.packs.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  /** Todos los objetos de todos los packs, aplanados y ordenados por id. */
  listObjects(): IndustryObjectDef[] {
    return this.listPacks()
      .flatMap((p) => p.objects)
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  getObject(objectId: string): IndustryObjectDef | undefined {
    for (const pack of this.packs.values()) {
      const found = pack.objects.find((o) => o.id === objectId);
      if (found) return found;
    }
    return undefined;
  }

  /** Instancia → entidades canónicas, o `[]` si el objeto no está registrado. */
  instantiate(instance: SmartObjectInstance): CadEntity[] {
    const def = this.getObject(instance.objectId);
    return def ? def.toEntities(instance) : [];
  }

  /** Cálculos de negocio de una instancia (vacío si no aplica). */
  calculate(instance: SmartObjectInstance): Record<string, number> {
    const def = this.getObject(instance.objectId);
    return def?.calculate ? def.calculate(instance) : {};
  }

  /** Hallazgos de validación; un objeto desconocido es un error. */
  validate(instance: SmartObjectInstance): IndustryFinding[] {
    const def = this.getObject(instance.objectId);
    if (!def) return [{ level: "error", message: `Objeto desconocido: ${instance.objectId}` }];
    return def.validate ? def.validate(instance) : [];
  }

  /**
   * Re-evalúa las reglas del pack para un objeto YA COLOCADO usando sólo su
   * geometría actual (CAD-NEXT-095). Devuelve `[]` si el objeto no está
   * registrado o no declara `propsFromSize` — sin hallazgos inventados.
   */
  validatePlaced(objectId: string, w: number, h: number): IndustryFinding[] {
    const def = this.getObject(objectId);
    if (!def?.propsFromSize || !def.validate) return [];
    return def.validate({
      id: "placed",
      objectId,
      x: 0,
      y: 0,
      props: def.propsFromSize(w, h),
    });
  }
}

const MM2_PER_M2 = 1_000_000;
const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// Pack 1 — Manufactura (MES): la estación de trabajo (geometría rectangular)
// ---------------------------------------------------------------------------

/** Estación de trabajo: caja rectangular con tiempo de ciclo y operarios. */
export const workstationObject: IndustryObjectDef = {
  id: "mfg.workstation",
  label: "Estación de trabajo",
  industry: "manufactura",
  category: "línea",
  fields: [
    { key: "width", label: "Ancho", type: "number", unit: "mm", default: 1500, min: 1 },
    { key: "depth", label: "Fondo", type: "number", unit: "mm", default: 800, min: 1 },
    { key: "cycleTimeSec", label: "Tiempo de ciclo", type: "number", unit: "s", default: 45, min: 0 },
    { key: "operators", label: "Operarios", type: "number", default: 1, min: 0 },
    { key: "name", label: "Nombre", type: "text", default: "Estación" },
  ],
  toEntities: (instance) => {
    const width = numField(workstationObject, instance, "width");
    const depth = numField(workstationObject, instance, "depth");
    const label = String(fieldValue(workstationObject, instance, "name"));
    return [
      {
        id: instance.id,
        type: "box",
        kind: "workstation",
        x: instance.x,
        y: instance.y,
        w: width,
        h: depth,
        rotation: instance.rotation ?? 0,
        layer: "manufactura",
        shape: "rect",
        label,
      },
    ];
  },
  calculate: (instance) => {
    const width = numField(workstationObject, instance, "width");
    const depth = numField(workstationObject, instance, "depth");
    const cycle = numField(workstationObject, instance, "cycleTimeSec");
    const areaM2 = round2((width * depth) / MM2_PER_M2);
    const throughputPerHour = cycle > 0 ? Math.round(3600 / cycle) : 0;
    return { areaM2, throughputPerHour };
  },
  validate: (instance) => {
    const findings: IndustryFinding[] = [];
    if (numField(workstationObject, instance, "cycleTimeSec") <= 0)
      findings.push({ level: "warning", message: "Tiempo de ciclo 0: no se puede estimar el throughput." });
    if (numField(workstationObject, instance, "operators") < 0)
      findings.push({ level: "error", message: "El número de operarios no puede ser negativo." });
    return findings;
  },
};

export const manufacturingPack: IndustryPack = {
  id: "manufactura",
  label: "Manufactura / MES",
  objects: [workstationObject],
};

// ---------------------------------------------------------------------------
// Pack 2 — Proceso / almacenamiento: el tanque (geometría CIRCULAR real)
// ---------------------------------------------------------------------------

/**
 * Tanque de proceso: se dibuja como CÍRCULO real (usa `shape:"circle"`,
 * CAD-NEXT-020) y calcula volumen cilíndrico. Industria deliberadamente
 * contrastante con la manufactura para probar que un solo documento/render
 * sirve a geometrías y dominios distintos.
 */
export const storageTankObject: IndustryObjectDef = {
  id: "process.tank",
  label: "Tanque de proceso",
  industry: "proceso",
  category: "almacenamiento",
  propsFromSize: (w) => ({ diameter: w }),
  fields: [
    { key: "diameter", label: "Diámetro", type: "number", unit: "mm", default: 3000, min: 1 },
    { key: "heightM", label: "Altura", type: "number", unit: "m", default: 6, min: 0 },
    { key: "product", label: "Producto", type: "text", default: "Agua" },
  ],
  toEntities: (instance) => {
    const d = numField(storageTankObject, instance, "diameter");
    const product = String(fieldValue(storageTankObject, instance, "product"));
    return [
      {
        id: instance.id,
        type: "box",
        kind: "tank",
        x: instance.x,
        y: instance.y,
        w: d,
        h: d,
        rotation: 0,
        layer: "proceso",
        shape: "circle",
        label: `Tanque · ${product}`,
      },
    ];
  },
  calculate: (instance) => {
    const d = numField(storageTankObject, instance, "diameter");
    const heightM = numField(storageTankObject, instance, "heightM");
    const radiusM = d / 2 / 1000;
    const footprintM2 = round2(Math.PI * radiusM * radiusM);
    const volumeM3 = round2(footprintM2 * heightM);
    return { footprintM2, volumeM3, capacityLiters: Math.round(volumeM3 * 1000) };
  },
  validate: (instance) => {
    const findings: IndustryFinding[] = [];
    if (numField(storageTankObject, instance, "diameter") <= 0)
      findings.push({ level: "error", message: "El diámetro debe ser mayor que 0." });
    if (numField(storageTankObject, instance, "heightM") <= 0)
      findings.push({ level: "warning", message: "Altura 0: el volumen será 0." });
    return findings;
  },
};

export const processPack: IndustryPack = {
  id: "proceso",
  label: "Proceso / Almacenamiento",
  objects: [storageTankObject],
};

// ---------------------------------------------------------------------------
// Pack 3 — Civil / urbanismo: el cajón de estacionamiento (regla normativa)
// ---------------------------------------------------------------------------

/** Mínimos de accesibilidad (aprox.) para un cajón normal vs. accesible, en mm. */
const STALL_MIN_WIDTH = 2400;
const STALL_ACCESSIBLE_MIN_WIDTH = 3800;

/**
 * Cajón de estacionamiento: caja rectangular con una **regla normativa** real —
 * un cajón accesible exige un ancho mínimo mayor. Tercera industria para mostrar
 * que el mismo documento/registro sirve a manufactura, proceso y obra civil.
 */
export const parkingStallObject: IndustryObjectDef = {
  id: "civil.parking-stall",
  label: "Cajón de estacionamiento",
  industry: "civil",
  category: "vialidad",
  propsFromSize: (w, h) => ({ width: w, length: h }),
  fields: [
    { key: "width", label: "Ancho", type: "number", unit: "mm", default: 2500, min: 1 },
    { key: "length", label: "Largo", type: "number", unit: "mm", default: 5000, min: 1 },
    { key: "accessible", label: "Accesible (1/0)", type: "number", default: 0, min: 0 },
  ],
  toEntities: (instance) => {
    const width = numField(parkingStallObject, instance, "width");
    const length = numField(parkingStallObject, instance, "length");
    const accessible = numField(parkingStallObject, instance, "accessible") >= 1;
    return [
      {
        id: instance.id,
        type: "box",
        kind: "parking-stall",
        x: instance.x,
        y: instance.y,
        w: width,
        h: length,
        rotation: instance.rotation ?? 0,
        layer: "civil",
        shape: "rect",
        label: accessible ? "Cajón accesible" : "Cajón",
      },
    ];
  },
  calculate: (instance) => {
    const width = numField(parkingStallObject, instance, "width");
    const length = numField(parkingStallObject, instance, "length");
    return { areaM2: round2((width * length) / MM2_PER_M2) };
  },
  validate: (instance) => {
    const findings: IndustryFinding[] = [];
    const width = numField(parkingStallObject, instance, "width");
    const accessible = numField(parkingStallObject, instance, "accessible") >= 1;
    if (accessible && width < STALL_ACCESSIBLE_MIN_WIDTH)
      findings.push({ level: "error", message: `Un cajón accesible requiere ≥ ${STALL_ACCESSIBLE_MIN_WIDTH} mm de ancho.` });
    else if (!accessible && width < STALL_MIN_WIDTH)
      findings.push({ level: "warning", message: `Ancho ${width} mm por debajo del mínimo recomendado (${STALL_MIN_WIDTH} mm).` });
    return findings;
  },
};

export const civilPack: IndustryPack = {
  id: "civil",
  label: "Civil / Urbanismo",
  objects: [parkingStallObject],
};

// ---------------------------------------------------------------------------
// Pack 4 — Logística / Almacén: rack de pallets + pasillo de montacargas
// ---------------------------------------------------------------------------

/** Huella estándar de un pallet (mm) y holgura por posición. */
const PALLET_W = 1200;
const PALLET_D = 1000;
const PALLET_SLOT_GAP = 100;
/** Ancho mínimo de pasillo para montacargas contrapesado (aprox., mm). */
const FORKLIFT_AISLE_MIN = 3500;

/**
 * Rack de pallets: caja rectangular; calcula posiciones por nivel (a lo largo
 * del frente) y capacidad total = posiciones × niveles.
 */
export const palletRackObject: IndustryObjectDef = {
  id: "logistics.pallet-rack",
  label: "Rack de pallets",
  industry: "logistica",
  category: "almacenamiento",
  propsFromSize: (w, h) => ({ length: w, depth: h }),
  fields: [
    { key: "length", label: "Frente", type: "number", unit: "mm", default: 8400, min: 1 },
    { key: "depth", label: "Fondo", type: "number", unit: "mm", default: 1100, min: 1 },
    { key: "levels", label: "Niveles", type: "number", default: 4, min: 1 },
  ],
  toEntities: (instance) => {
    const length = numField(palletRackObject, instance, "length");
    const depth = numField(palletRackObject, instance, "depth");
    return [
      {
        id: instance.id,
        type: "box",
        kind: "rack",
        x: instance.x,
        y: instance.y,
        w: length,
        h: depth,
        rotation: instance.rotation ?? 0,
        layer: "logistica",
        shape: "rect",
        label: "Rack de pallets",
      },
    ];
  },
  calculate: (instance) => {
    const length = numField(palletRackObject, instance, "length");
    const levels = Math.max(1, Math.floor(numField(palletRackObject, instance, "levels")));
    const slotsPerLevel = Math.floor(length / (PALLET_W + PALLET_SLOT_GAP));
    return {
      slotsPerLevel,
      palletPositions: slotsPerLevel * levels,
      frontMeters: round2(length / 1000),
    };
  },
  validate: (instance) => {
    const findings: IndustryFinding[] = [];
    const depth = numField(palletRackObject, instance, "depth");
    if (depth < PALLET_D)
      findings.push({
        level: "warning",
        message: `Fondo ${depth} mm menor que un pallet (${PALLET_D} mm): el pallet sobresaldría.`,
      });
    if (numField(palletRackObject, instance, "length") < PALLET_W + PALLET_SLOT_GAP)
      findings.push({ level: "error", message: "El frente no cabe ni una posición de pallet." });
    return findings;
  },
};

/**
 * Pasillo de montacargas: zona rectangular con REGLA NORMATIVA de ancho mínimo
 * para operación segura de montacargas contrapesado.
 */
export const forkliftAisleObject: IndustryObjectDef = {
  id: "logistics.forklift-aisle",
  label: "Pasillo de montacargas",
  industry: "logistica",
  category: "vialidad",
  propsFromSize: (w, h) => ({ width: w, length: h }),
  fields: [
    { key: "width", label: "Ancho", type: "number", unit: "mm", default: 3500, min: 1 },
    { key: "length", label: "Largo", type: "number", unit: "mm", default: 20000, min: 1 },
  ],
  toEntities: (instance) => {
    const width = numField(forkliftAisleObject, instance, "width");
    const length = numField(forkliftAisleObject, instance, "length");
    return [
      {
        id: instance.id,
        type: "box",
        kind: "agvpath",
        x: instance.x,
        y: instance.y,
        w: width,
        h: length,
        rotation: instance.rotation ?? 0,
        layer: "logistica",
        shape: "rect",
        label: "Pasillo montacargas",
      },
    ];
  },
  calculate: (instance) => {
    const width = numField(forkliftAisleObject, instance, "width");
    const length = numField(forkliftAisleObject, instance, "length");
    return { areaM2: round2((width * length) / MM2_PER_M2), lengthMeters: round2(length / 1000) };
  },
  validate: (instance) => {
    const findings: IndustryFinding[] = [];
    const width = numField(forkliftAisleObject, instance, "width");
    if (width < FORKLIFT_AISLE_MIN)
      findings.push({
        level: "error",
        message: `Pasillo de ${width} mm: un montacargas contrapesado requiere ≥ ${FORKLIFT_AISLE_MIN} mm.`,
      });
    return findings;
  },
};

export const logisticsPack: IndustryPack = {
  id: "logistica",
  label: "Logística / Almacén",
  objects: [forkliftAisleObject, palletRackObject],
};

// ---------------------------------------------------------------------------
// Pack 5 — Retail / Comercio: góndola + línea de cajas
// ---------------------------------------------------------------------------

/** Espacio mínimo de fila frente a una caja de cobro (mm). */
const CHECKOUT_QUEUE_MIN = 4000;

/**
 * Góndola de exhibición: calcula frentes (facings) por nivel a lo largo del
 * frente y el total = frentes × niveles — el número que le importa a retail.
 */
export const gondolaObject: IndustryObjectDef = {
  id: "retail.gondola",
  label: "Góndola de exhibición",
  industry: "retail",
  category: "exhibición",
  propsFromSize: (w, h) => ({ length: w, depth: h }),
  fields: [
    { key: "length", label: "Frente", type: "number", unit: "mm", default: 3600, min: 1 },
    { key: "depth", label: "Fondo", type: "number", unit: "mm", default: 600, min: 1 },
    { key: "levels", label: "Niveles", type: "number", default: 5, min: 1 },
    { key: "facingWidth", label: "Ancho de frente", type: "number", unit: "mm", default: 300, min: 1 },
  ],
  toEntities: (instance) => {
    const length = numField(gondolaObject, instance, "length");
    const depth = numField(gondolaObject, instance, "depth");
    return [
      {
        id: instance.id,
        type: "box",
        kind: "rack",
        x: instance.x,
        y: instance.y,
        w: length,
        h: depth,
        rotation: instance.rotation ?? 0,
        layer: "retail",
        shape: "rect",
        label: "Góndola",
      },
    ];
  },
  calculate: (instance) => {
    const length = numField(gondolaObject, instance, "length");
    const levels = Math.max(1, Math.floor(numField(gondolaObject, instance, "levels")));
    const facingWidth = Math.max(1, numField(gondolaObject, instance, "facingWidth"));
    const facingsPerLevel = Math.floor(length / facingWidth);
    return { facingsPerLevel, totalFacings: facingsPerLevel * levels, frontMeters: round2(length / 1000) };
  },
  validate: (instance) => {
    const findings: IndustryFinding[] = [];
    if (numField(gondolaObject, instance, "length") < numField(gondolaObject, instance, "facingWidth"))
      findings.push({ level: "error", message: "El frente no cabe ni un facing." });
    return findings;
  },
};

/**
 * Línea de cajas: mueble de cobro con REGLA de espacio de fila — sin ≥4 m de
 * fila libre frente a la caja, el pasillo se bloquea en hora pico.
 */
export const checkoutLaneObject: IndustryObjectDef = {
  id: "retail.checkout-lane",
  label: "Línea de cajas",
  industry: "retail",
  category: "cobro",
  fields: [
    { key: "width", label: "Ancho", type: "number", unit: "mm", default: 1500, min: 1 },
    { key: "depth", label: "Fondo", type: "number", unit: "mm", default: 2400, min: 1 },
    { key: "queueSpace", label: "Espacio de fila", type: "number", unit: "mm", default: 4000, min: 0 },
  ],
  toEntities: (instance) => {
    const width = numField(checkoutLaneObject, instance, "width");
    const depth = numField(checkoutLaneObject, instance, "depth");
    const queueSpace = Math.max(0, numField(checkoutLaneObject, instance, "queueSpace"));
    return [
      {
        id: instance.id,
        type: "box",
        kind: "workbench",
        x: instance.x,
        y: instance.y,
        w: width,
        h: depth,
        rotation: instance.rotation ?? 0,
        layer: "retail",
        shape: "rect",
        label: "Caja de cobro",
      },
      // La fila se dibuja como zona propia (detrás del mueble): visible y
      // revisable por el motor de reglas como cualquier otra caja.
      {
        id: `${instance.id}:queue`,
        type: "box",
        kind: "zone",
        x: instance.x,
        y: instance.y + depth,
        w: width,
        h: queueSpace,
        rotation: instance.rotation ?? 0,
        layer: "retail",
        shape: "rect",
        label: "Fila",
      },
    ];
  },
  calculate: (instance) => {
    const queueSpace = Math.max(0, numField(checkoutLaneObject, instance, "queueSpace"));
    return { queueMeters: round2(queueSpace / 1000), shoppersInQueue: Math.floor(queueSpace / 600) };
  },
  validate: (instance) => {
    const findings: IndustryFinding[] = [];
    const queueSpace = Math.max(0, numField(checkoutLaneObject, instance, "queueSpace"));
    if (queueSpace < CHECKOUT_QUEUE_MIN)
      findings.push({
        level: "warning",
        message: `Fila de ${queueSpace} mm: se recomiendan ≥ ${CHECKOUT_QUEUE_MIN} mm para no bloquear el pasillo.`,
      });
    return findings;
  },
};

export const retailPack: IndustryPack = {
  id: "retail",
  label: "Retail / Comercio",
  objects: [checkoutLaneObject, gondolaObject],
};

/** Crea un registro con los packs de arranque ya cargados. */
export function createDefaultIndustryRegistry(): IndustryPackRegistry {
  const registry = new IndustryPackRegistry();
  registry.register(manufacturingPack);
  registry.register(processPack);
  registry.register(civilPack);
  registry.register(logisticsPack);
  registry.register(retailPack);
  return registry;
}
