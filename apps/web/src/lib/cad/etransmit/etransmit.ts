/**
 * ETRANSMIT: empaquetar la entrega, no sólo el dibujo.
 *
 * Un despacho no manda un `.dwg` suelto: manda el dibujo, sus xrefs, sus
 * imágenes y un papel que dice qué va dentro. `SAVEAS` ya entrega el
 * documento; lo que faltaba era el paquete y, sobre todo, el PAPEL — un ZIP al
 * que le falta una xref y no lo dice es peor que no empaquetar, porque quien
 * lo abre en otra máquina no se entera hasta que el plano sale con un hueco.
 *
 * ## Por qué xrefs e imágenes casi siempre salen «missing» hoy
 *
 * `CadExternalReference` e `CadImageDefinition` guardan un `uri`/`assetId` —
 * una REFERENCIA al blob del inquilino, nunca sus bytes— y este módulo es
 * puro: no hace red. Recibe un mapa de bytes YA resueltos por el anfitrión
 * (`resolvedAssets`, opcional) y sólo empaqueta lo que ahí aparece; todo lo
 * demás se declara en el manifiesto como pendiente, con su motivo. Es la
 * misma frontera que `sheet-set-publish.ts` ya traza para los documentos:
 * «los documentos ENTRAN, no se buscan» — aquí los bytes entran igual.
 */
import type { CadDocument } from "../cad-document";
import { buildZip, type CadZipEntry } from "./zip-writer";

export interface CadTransmittalManifestEntry {
  kind: "document" | "xref" | "image";
  name: string;
  /** Ruta dentro del paquete. Ausente cuando `included` es `false`. */
  path?: string;
  included: boolean;
  /** Por qué no viaja, cuando `included` es `false`. */
  reason?: string;
}

/**
 * La revisión de entrega, tal y como viaja DENTRO del paquete.
 *
 * Es lo que un `.zip` de AutoCAD no lleva: su informe de eTransmit dice qué
 * ARCHIVOS van dentro, no qué le pasa al PROYECTO. Quien abre este paquete en
 * otra máquina —el cliente, el contratista, el que revisa— lee lo mismo que
 * leyó quien lo mandó, sin tener que fiarse de que lo mirara.
 *
 * Va en el manifiesto del paquete, que es un artefacto GENERADO: no toca el
 * documento persistido ni añade un campo al formato.
 */
export interface CadTransmittalReview {
  /** El renglón que se lee primero. */
  verdict: string;
  /** Lo que se miró, con lo que se contó en cada área. */
  checked: readonly string[];
  /** Lo que no aplica porque el dibujo no tiene nada de esa disciplina. */
  skipped: readonly string[];
  findings: readonly { severity: string; area: string; detail: string }[];
  /** Lo que esta revisión NO mira. Viaja con el informe, siempre. */
  limits: string;
  /**
   * `true` cuando se empaquetó A PESAR de los hallazgos que bloquean.
   *
   * Empaquetar con bloqueos es legítimo —hay entregas parciales, y quien firma
   * decide—, pero tiene que quedar por escrito EN EL PAQUETE: lo caro no es
   * mandar un plano con defectos, es que quien lo recibe no lo sepa.
   */
  packedDespiteBlocking: boolean;
}

export interface CadTransmittalManifest {
  generatedAt: string;
  document: CadTransmittalManifestEntry;
  entries: CadTransmittalManifestEntry[];
  /** Ausente cuando el llamador no aportó revisión (anfitrión sin documento). */
  review?: CadTransmittalReview;
  /**
   * Secciones del documento que el llamador supo que NO pudo aportar —
   * historial de cambios, registro de publicaciones— y que por tanto NO
   * viajan en `document`. Vacío cuando el documento va completo.
   */
  omittedSections: readonly string[];
}

export interface CadTransmittalPackage {
  manifest: CadTransmittalManifest;
  zip: Uint8Array;
}

export interface BuildCadTransmittalPackageInput {
  document: CadDocument;
  /** Nombre del documento principal, tal y como lo conoce el usuario. */
  documentName: string;
  generatedAt: string;
  /**
   * Bytes ya resueltos por el anfitrión, indexados por `assetId` y por `uri`
   * (lo que exista). Sin ella, TODO xref/imagen sale «no incluido».
   */
  resolvedAssets?: ReadonlyMap<string, Uint8Array>;
  /** Ver `CadTransmittalManifest.omittedSections`. */
  omittedSections?: readonly string[];
  /** Ver `CadTransmittalManifest.review`. */
  review?: CadTransmittalReview;
}

/**
 * El informe en texto plano que viaja junto al manifiesto.
 *
 * El manifiesto es JSON y lo lee una máquina; esto lo lee una PERSONA que
 * descomprimió el paquete y no va a abrir un `.json`. Mismo contenido, sin
 * ningún dato que no esté en el manifiesto.
 */
export function describeCadTransmittalReview(review: CadTransmittalReview): string {
  const lineas = [review.verdict, ""];
  if (review.packedDespiteBlocking)
    lineas.push(
      "ATENCIÓN: este paquete se armó A PESAR de los hallazgos que bloquean, por decisión de quien lo mandó.",
      "",
    );
  lineas.push(`Revisado: ${review.checked.join("; ") || "nada"}`);
  if (review.skipped.length > 0) lineas.push(`No aplica: ${review.skipped.join("; ")}`);
  if (review.findings.length > 0) {
    lineas.push("", "Hallazgos:");
    for (const hallazgo of review.findings)
      lineas.push(`  ${hallazgo.severity} · ${hallazgo.area}: ${hallazgo.detail}`);
  }
  lineas.push("", review.limits, "");
  return lineas.join("\n");
}

function sanitize(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, "_").trim();
  return cleaned.length > 0 ? cleaned : "sin-nombre";
}

/**
 * Construye el manifiesto y el ZIP en una sola pasada.
 *
 * El documento principal SIEMPRE viaja: es lo único que este módulo puede
 * garantizar sin ayuda del anfitrión, porque ya está en memoria. `document`
 * se serializa completo — es el mismo JSON que el estudio guarda, así que
 * abrirlo en otra máquina reproduce el dibujo exacto, no una vista parcial.
 */
export function buildCadTransmittalPackage(
  input: BuildCadTransmittalPackageInput,
): CadTransmittalPackage {
  const resolved = input.resolvedAssets ?? new Map<string, Uint8Array>();
  const zipEntries: CadZipEntry[] = [];
  const manifestEntries: CadTransmittalManifestEntry[] = [];

  const documentFileName = `${sanitize(input.documentName)}.json`;
  const documentBytes = new TextEncoder().encode(JSON.stringify(input.document, null, 2));
  zipEntries.push({ path: documentFileName, bytes: documentBytes });
  const documentEntry: CadTransmittalManifestEntry = {
    kind: "document",
    name: input.documentName,
    path: documentFileName,
    included: true,
  };

  const resolve = (assetId: string | undefined, uri: string): Uint8Array | undefined =>
    (assetId ? resolved.get(assetId) : undefined) ?? resolved.get(uri);

  const used = new Set<string>();
  const dedupedPath = (folder: string, base: string): string => {
    const stem = sanitize(base);
    let candidate = `${folder}/${stem}`;
    let attempt = 1;
    while (used.has(candidate)) {
      attempt += 1;
      candidate = `${folder}/${stem} (${attempt})`;
    }
    used.add(candidate);
    return candidate;
  };

  for (const xref of input.document.externalReferences) {
    const bytes = resolve(xref.assetId, xref.uri);
    if (bytes) {
      const path = dedupedPath("xrefs", xref.name);
      zipEntries.push({ path, bytes });
      manifestEntries.push({ kind: "xref", name: xref.name, path, included: true });
    } else {
      manifestEntries.push({
        kind: "xref",
        name: xref.name,
        included: false,
        reason: `sin bytes disponibles para «${xref.uri}»: el espacio de trabajo no resolvió este activo`,
      });
    }
  }

  for (const image of input.document.imageDefinitions ?? []) {
    const bytes = resolve(image.assetId, image.uri);
    if (bytes) {
      const path = dedupedPath("imagenes", image.name);
      zipEntries.push({ path, bytes });
      manifestEntries.push({ kind: "image", name: image.name, path, included: true });
    } else {
      manifestEntries.push({
        kind: "image",
        name: image.name,
        included: false,
        reason: `sin bytes disponibles para «${image.uri}»: el espacio de trabajo no resolvió este activo`,
      });
    }
  }

  const manifest: CadTransmittalManifest = {
    generatedAt: input.generatedAt,
    document: documentEntry,
    entries: manifestEntries,
    omittedSections: input.omittedSections ?? [],
    ...(input.review ? { review: input.review } : {}),
  };
  // El informe legible va junto al manifiesto, no en su lugar: quien
  // descomprime el paquete no abre un `.json`.
  if (input.review)
    zipEntries.push({
      path: "REVISION.txt",
      bytes: new TextEncoder().encode(describeCadTransmittalReview(input.review)),
    });
  zipEntries.push({
    path: "manifiesto.json",
    bytes: new TextEncoder().encode(JSON.stringify(manifest, null, 2)),
  });

  return { manifest, zip: buildZip(zipEntries) };
}

/** Resumen de una línea, para el renglón de la línea de comandos. */
export function describeCadTransmittalManifest(manifest: CadTransmittalManifest): string {
  const included = manifest.entries.filter((entry) => entry.included);
  const missing = manifest.entries.filter((entry) => !entry.included);
  // El veredicto va DELANTE del recuento de activos: qué le pasa al proyecto
  // importa más que cuántos ficheros viajan.
  const veredicto = manifest.review ? `${manifest.review.verdict} ` : "";
  if (manifest.entries.length === 0)
    return `${veredicto}${manifest.document.name}: sólo el documento, sin xrefs ni imágenes que empaquetar.`;
  const parts = [`${veredicto}${manifest.document.name}: ${included.length} activo(s) incluido(s)`];
  if (missing.length > 0)
    parts.push(
      `${missing.length} SIN incluir — ${missing
        .slice(0, 3)
        .map((entry) => `${entry.name} (${entry.reason})`)
        .join("; ")}${missing.length > 3 ? `; y ${missing.length - 3} más` : ""}`,
    );
  if (manifest.omittedSections.length > 0)
    parts.push(`el documento va SIN ${manifest.omittedSections.join(", ")}`);
  return parts.join("; ");
}
