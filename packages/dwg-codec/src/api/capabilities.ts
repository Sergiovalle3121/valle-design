import {
  DWG_VERSION_REGISTRY,
  type DwgVersionCode,
  type DwgVersionLabel,
} from "../container/version-registry.js";

export type DwgCapabilityState = "supported" | "unsupported";
export type DwgCapabilityDirection = "read" | "write";

const CAPABILITY_TARGETS = [
  {
    id: "envelope",
    title: "Envelope and binary container",
    properties: [
      "container",
      "sections",
      "streams",
      "checksums",
      "compression",
    ],
  },
  {
    id: "object-database",
    title: "Classes and object database",
    properties: ["classes", "object-map", "handles", "owners", "dictionaries"],
  },
  {
    id: "symbol-tables",
    title: "Symbol tables",
    properties: ["layers", "linetypes", "styles", "named-records"],
  },
  {
    id: "geometry-2d",
    title: "2D geometry",
    properties: ["primitives", "curves", "polylines"],
  },
  {
    id: "geometry-3d",
    title: "3D geometry",
    properties: ["primitives", "curves", "transforms"],
  },
  {
    id: "annotation",
    title: "Annotation",
    properties: ["text", "multiline-text", "leaders", "tables"],
  },
  {
    id: "blocks",
    title: "Blocks",
    properties: ["definitions", "inserts", "attributes"],
  },
  {
    id: "dynamic-blocks",
    title: "Dynamic blocks",
    properties: ["parameters", "actions", "visibility"],
  },
  {
    id: "dimensions",
    title: "Dimensions",
    properties: ["geometry", "styles", "associativity"],
  },
  {
    id: "hatch",
    title: "Hatch and fills",
    properties: ["boundaries", "patterns", "gradients"],
  },
  {
    id: "layouts",
    title: "Layouts and view state",
    properties: ["model-space", "paper-space", "viewports"],
  },
  {
    id: "xrefs",
    title: "External references",
    properties: ["references", "paths", "overlays"],
  },
  {
    id: "constraints",
    title: "Constraints",
    properties: ["geometric", "dimensional", "dependencies"],
  },
  {
    id: "images",
    title: "Raster images",
    properties: ["definitions", "placements", "clipping"],
  },
  {
    id: "meshes",
    title: "Meshes",
    properties: ["vertices", "faces", "subdivision"],
  },
  {
    id: "regions",
    title: "Regions",
    properties: ["topology", "boundaries", "opaque-preservation"],
  },
  {
    id: "surfaces",
    title: "Surfaces",
    properties: ["geometry", "trimming", "opaque-preservation"],
  },
  {
    id: "solids",
    title: "Solids",
    properties: ["geometry", "history", "opaque-preservation"],
  },
  {
    id: "authorized-vertical-extensions",
    title: "Authorized vertical extensions",
    properties: ["registration", "typed-codecs", "quarantine-preservation"],
  },
] as const;

export type DwgCapabilityFamily = (typeof CAPABILITY_TARGETS)[number]["id"];

export interface DwgCapabilityFamilyDefinition {
  readonly id: DwgCapabilityFamily;
  readonly title: string;
  readonly properties: readonly string[];
}

export interface DwgPropertyCapabilities {
  readonly id: string;
  readonly state: "unsupported";
}

export interface DwgFamilyCapabilities {
  readonly id: DwgCapabilityFamily;
  readonly state: "unsupported";
  readonly properties: readonly DwgPropertyCapabilities[];
}

export interface DwgDirectionCapabilities {
  readonly direction: DwgCapabilityDirection;
  readonly state: "unsupported";
  readonly families: readonly DwgFamilyCapabilities[];
}

export interface DwgVersionCapabilities {
  readonly code: DwgVersionCode;
  readonly label: DwgVersionLabel;
  readonly probe: "supported";
  readonly directions: readonly DwgDirectionCapabilities[];
}

export interface DwgCapabilityMatrix {
  readonly schemaVersion: "1.0.0";
  readonly matrixVersion: "v1";
  readonly neutralModelVersion: 1;
  readonly productionAvailable: false;
  readonly versions: readonly DwgVersionCapabilities[];
}

export const DWG_CAPABILITY_FAMILIES: readonly DwgCapabilityFamilyDefinition[] =
  Object.freeze(
    CAPABILITY_TARGETS.map((family) =>
      Object.freeze({
        id: family.id,
        title: family.title,
        properties: Object.freeze([...family.properties]),
      }),
    ),
  );

const UNSUPPORTED_DIRECTIONS: readonly DwgDirectionCapabilities[] =
  Object.freeze(
    (["read", "write"] as const).map((direction) =>
      Object.freeze({
        direction,
        state: "unsupported" as const,
        families: Object.freeze(
          DWG_CAPABILITY_FAMILIES.map((family) =>
            Object.freeze({
              id: family.id,
              state: "unsupported" as const,
              properties: Object.freeze(
                family.properties.map((property) =>
                  Object.freeze({
                    id: property,
                    state: "unsupported" as const,
                  }),
                ),
              ),
            }),
          ),
        ),
      }),
    ),
  );

const VERSION_CAPABILITIES = Object.freeze(
  DWG_VERSION_REGISTRY.map((version) =>
    Object.freeze({
      code: version.code,
      label: version.label,
      probe: "supported" as const,
      directions: UNSUPPORTED_DIRECTIONS,
    }),
  ),
);

const CAPABILITIES: DwgCapabilityMatrix = Object.freeze({
  schemaVersion: "1.0.0",
  matrixVersion: "v1",
  neutralModelVersion: 1,
  productionAvailable: false,
  versions: VERSION_CAPABILITIES,
});

export function getDwgCapabilities(): DwgCapabilityMatrix {
  return CAPABILITIES;
}
