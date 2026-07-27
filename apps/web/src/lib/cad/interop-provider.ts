/**
 * Contrato de interoperabilidad de AXOS CAD Next (CAD-NEXT-061).
 *
 * Regla del programa (D5 — "DWG honesto"): NO se hace ingeniería inversa del
 * formato DWG y NUNCA se declara importación/exportación DWG funcionando sin un
 * proveedor real con licencia (ODA/RealDWG o equivalente). Este módulo define el
 * contrato que ese proveedor deberá cumplir, un registro para resolverlo por
 * formato, el proveedor DXF nativo (ya funcional, kernel propio) y el placeholder
 * DWG que reporta su indisponibilidad con la razón exacta — para que la UI diga
 * la verdad en vez de fallar en silencio o fingir soporte.
 *
 * Puro (sin DOM/three): todo testeable en Node.
 */

import {
  exportCadDxf,
  type CadDxfExportModel,
  type CadDxfExportOptions,
} from "./dxf-export";
import {
  importDxfPrimitives,
  type CadDxfImportWarning,
  type CadDxfPrimitive,
} from "./dxf-import";
import { PRODUCT_LABEL } from "@/config/brand";

export type CadInteropFormat = "dxf" | "dwg";

export interface CadInteropAvailability {
  available: boolean;
  /** Obligatoria cuando `available` es false: la razón honesta y accionable. */
  reason?: string;
}

export interface CadInteropImportResult {
  ok: boolean;
  primitives: CadDxfPrimitive[];
  warnings: CadDxfImportWarning[];
  layers: string[];
  error?: string;
}

export interface CadInteropExportResult {
  ok: boolean;
  content?: string;
  entityCount?: number;
  error?: string;
}

/**
 * Lo que un proveedor de interoperabilidad debe cumplir. El proveedor DWG
 * comercial que se contrate implementará exactamente esta interfaz; mientras no
 * exista, el placeholder responde `available:false` y las operaciones fallan
 * con error explícito — jamás un éxito fingido.
 */
export interface CadInteroperabilityProvider {
  id: string;
  label: string;
  format: CadInteropFormat;
  availability(): CadInteropAvailability;
  importDrawing(content: string): CadInteropImportResult;
  exportDrawing(
    model: CadDxfExportModel,
    options?: CadDxfExportOptions,
  ): CadInteropExportResult;
}

const importFailure = (error: string): CadInteropImportResult => ({
  ok: false,
  primitives: [],
  warnings: [],
  layers: [],
  error,
});

/** Proveedor DXF nativo: envuelve el kernel propio (round-trip testeado). */
export const nativeDxfProvider: CadInteroperabilityProvider = {
  id: "axos-dxf",
  label: `${PRODUCT_LABEL.design} · DXF nativo`,
  format: "dxf",
  availability: () => ({ available: true }),
  importDrawing: (content) => {
    const result = importDxfPrimitives(content);
    // Sin primitivas y con advertencias ⇒ el archivo no se pudo aprovechar.
    const ok = result.primitives.length > 0 || result.warnings.length === 0;
    return { ok, ...result };
  },
  exportDrawing: (model, options) => {
    const exported = exportCadDxf(model, options);
    return { ok: true, content: exported.content, entityCount: exported.entityCount };
  },
};

export const DWG_UNAVAILABLE_REASON =
  "DWG requiere un proveedor con licencia (ODA Drawings SDK / Autodesk RealDWG). " +
  `${PRODUCT_LABEL.design} no hace ingeniería inversa del formato: conecta un proveedor ` +
  "licenciado que implemente CadInteroperabilityProvider o convierte el archivo " +
  "a DXF para importarlo hoy.";

/** Placeholder DWG honesto: existe para decir la verdad, no para fingir. */
export const unlicensedDwgProvider: CadInteroperabilityProvider = {
  id: "dwg-unlicensed",
  label: "DWG (sin proveedor licenciado)",
  format: "dwg",
  availability: () => ({ available: false, reason: DWG_UNAVAILABLE_REASON }),
  importDrawing: () => importFailure(DWG_UNAVAILABLE_REASON),
  exportDrawing: () => ({ ok: false, error: DWG_UNAVAILABLE_REASON }),
};

export interface CadInteropFormatSupport {
  format: CadInteropFormat;
  available: boolean;
  providerId?: string;
  reason?: string;
}

/**
 * Registro de proveedores. Registrar un proveedor del mismo id lo reemplaza
 * (así un proveedor DWG real sustituye al placeholder sin tocar callers).
 */
export class CadInteropRegistry {
  private providers = new Map<string, CadInteroperabilityProvider>();

  register(provider: CadInteroperabilityProvider): { replaced: boolean } {
    const replaced = this.providers.has(provider.id);
    this.providers.set(provider.id, provider);
    return { replaced };
  }

  providersFor(format: CadInteropFormat): CadInteroperabilityProvider[] {
    return [...this.providers.values()]
      .filter((p) => p.format === format)
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  /** Primer proveedor DISPONIBLE para el formato, o null (sin fingir). */
  resolve(format: CadInteropFormat): CadInteroperabilityProvider | null {
    return this.providersFor(format).find((p) => p.availability().available) ?? null;
  }

  /** Estado por formato para la UI: qué se soporta hoy y por qué no lo demás. */
  describeFormatSupport(): CadInteropFormatSupport[] {
    const formats: CadInteropFormat[] = ["dxf", "dwg"];
    return formats.map((format) => {
      const active = this.resolve(format);
      if (active) return { format, available: true, providerId: active.id };
      const reasons = this.providersFor(format)
        .map((p) => p.availability().reason)
        .filter((reason): reason is string => !!reason);
      return {
        format,
        available: false,
        reason: reasons[0] ?? `Sin proveedor registrado para ${format.toUpperCase()}.`,
      };
    });
  }
}

/** Registro con los proveedores de arranque: DXF funcional + DWG honesto. */
export function createDefaultInteropRegistry(): CadInteropRegistry {
  const registry = new CadInteropRegistry();
  registry.register(nativeDxfProvider);
  registry.register(unlicensedDwgProvider);
  return registry;
}
