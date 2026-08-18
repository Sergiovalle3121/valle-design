/**
 * El anfitrión de intercambio entrega el archivo y CUENTA lo que no lleva.
 *
 * Dos cosas se prueban aquí porque las dos se pueden romper sin que nada más se
 * entere: que los bytes que se descargan sean el DXF que el motor fabricó —no
 * una cadena recodificada a medias, que es lo que rompe los acentos de las
 * capas mexicanas— y que el renglón de respuesta enumere las pérdidas en vez de
 * decir «exportado» y callarse.
 *
 * También se fija que este anfitrión NO conteste a lo que no es suyo: se
 * encadena delante del de trazado y tragarse una petición de PLOT dejaría al
 * usuario sin PDF y sin error.
 *
 * Correr:  npx tsx src/components/cad/command-line/dxf-host.spec.ts
 */
import { strict as assert } from "node:assert";
import type { CadHostRequest } from "@/lib/cad/engine/host-requests";
import {
  CAD_DXF_MIME_TYPE,
  describeCadDxfExportLosses,
  handleCadDxfHostRequest,
} from "./dxf-host";

const downloads: Array<{ fileName: string; bytes: Uint8Array; mimeType: string }> = [];
const bridge = {
  download: (fileName: string, bytes: Uint8Array, mimeType: string) =>
    void downloads.push({ fileName, bytes, mimeType }),
};

// --- lo que se descarga es exactamente lo que el motor fabricó --------------
{
  const content = "0\nSECTION\n2\nENTITIES\n0\nLINE\n8\nCIMENTACIÓN\n0\nENDSEC\n0\nEOF\n";
  const line = handleCadDxfHostRequest(
    {
      kind: "dxf-export",
      fileName: "planta-baja.dxf",
      content,
      entityCount: 1,
      layers: ["0", "CIMENTACIÓN"],
      losses: [],
    },
    bridge,
  );
  assert.equal(downloads.length, 1);
  assert.equal(downloads[0].fileName, "planta-baja.dxf");
  assert.equal(downloads[0].mimeType, CAD_DXF_MIME_TYPE);
  // Ida y vuelta por UTF-8: una capa con acento que se descodifique mal deja al
  // estructurista con una capa nueva llamada «CIMENTACIÃ“N».
  assert.equal(new TextDecoder().decode(downloads[0].bytes), content);
  assert.ok(line?.includes("1 entidad"), line ?? "");
  assert.ok(line?.includes("2 capa"), line ?? "");
  assert.ok(line?.includes("Sin pérdidas declaradas"), line ?? "");
}

// --- las pérdidas se cuentan, y las ausencias van primero -------------------
{
  const text = describeCadDxfExportLosses([
    { code: "dxf_export_z_flattened", detail: "La elevación Z se aplana.", severity: "warning" },
    { code: "dxf_export_entity_dropped", detail: "El muro NO estará en el archivo.", severity: "error" },
    { code: "dxf_export_wall_parametric_degraded", detail: "El muro sale como contorno.", severity: "warning" },
    { code: "dxf_export_opaque_entity_dropped", detail: "Una entidad ajena no se reescribe.", severity: "error" },
    { code: "dxf_export_point_style_global", detail: "El estilo de punto es global.", severity: "info" },
  ]);
  assert.ok(text.startsWith("2 cosa(s) NO viajan"), text);
  // Lo que NO está va antes que lo que está peor: una degradación se puede
  // vivir, una ausencia no.
  const first = text.split("\n")[1];
  assert.ok(first.includes("NO estará") || first.includes("no se reescribe"), first);
  assert.ok(text.includes("y 2 más"), `las que no caben se cuentan: ${text}`);
}

// --- no contesta a lo que no es suyo ---------------------------------------
{
  const foreign: CadHostRequest = { kind: "space", space: "paper", layoutId: "A-101" };
  assert.equal(
    handleCadDxfHostRequest(foreign, bridge),
    null,
    "una petición ajena se deja pasar al siguiente anfitrión",
  );
  assert.equal(downloads.length, 1, "y no descarga nada");
}

console.log(
  "dxf-host: los bytes descargados son el DXF exacto en UTF-8, el renglón cuenta las pérdidas con " +
    "las ausencias primero, y las peticiones ajenas pasan de largo",
);
