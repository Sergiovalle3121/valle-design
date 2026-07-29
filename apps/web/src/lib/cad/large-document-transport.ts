export const CAD_ARCHIVE_UPLOAD_THRESHOLD_BYTES = 6_000_000;

export interface SerializedCadDocument {
  json: string;
  bytes: number;
  useArchive: boolean;
}

export function serializeCadDocumentForTransport(
  document: unknown,
): SerializedCadDocument {
  const json = JSON.stringify(document);
  const bytes = new TextEncoder().encode(json).byteLength;
  return {
    json,
    bytes,
    useArchive: bytes > CAD_ARCHIVE_UPLOAD_THRESHOLD_BYTES,
  };
}

export async function gzipCadDocumentJson(json: string): Promise<Blob> {
  if (typeof CompressionStream === "undefined") {
    throw new Error(
      "Este navegador no ofrece compresión gzip para dibujos CAD grandes.",
    );
  }
  const source = new Blob([json], { type: "application/json" });
  const compressed = source.stream().pipeThrough(new CompressionStream("gzip"));
  return new Response(compressed).blob();
}
