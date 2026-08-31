/** Tests de cad-format-detect (Fase 74). npx tsx src/components/cad/interop/cad-format-detect.spec.ts */
import {
  detectCadFormat,
  isDwg,
  ACAD_VERSION_NAMES,
} from "./cad-format-detect";

let passed = 0;
const fails: string[] = [];
const ok = (cond: boolean, m: string) => {
  if (cond) passed++;
  else fails.push(m);
};

const bytesOf = (s: string) =>
  new Uint8Array([...s].map((c) => c.charCodeAt(0)));

// ── DWG por cabecera de versión ──
{
  const r = detectCadFormat("AC1032\x00\x00\x00other binary junk");
  ok(
    r.format === "dwg" && r.version === "AC1032" && r.versionName === "2018",
    "DWG 2018 detectado",
  );
  ok(
    r.nativeSupport === false && /DXF/.test(r.message),
    "DWG no soportado nativo, guía a DXF",
  );
}
{
  const r = detectCadFormat(bytesOf("AC1027........"));
  ok(
    r.format === "dwg" && r.versionName === "2013",
    "DWG 2013 desde Uint8Array",
  );
}
{
  const r = detectCadFormat("AC1099raro");
  ok(
    r.format === "dwg" && r.version === "AC1099" && r.versionName === undefined,
    "versión DWG desconocida: detecta formato sin nombre",
  );
}

// ── DXF de texto ──
{
  const dxf =
    "0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1009\n0\nENDSEC\n0\nEOF";
  const r = detectCadFormat(dxf);
  ok(
    r.format === "dxf" && r.nativeSupport === true,
    "DXF detectado y soportado",
  );
  ok(
    r.version === "AC1009" && r.versionName === "R12",
    "versión DXF R12 leída del cuerpo",
  );
}
{
  const r = detectCadFormat(
    "999\nComentario\n0\nSECTION\n2\nENTITIES\n0\nENDSEC",
  );
  ok(r.format === "dxf", "DXF sin $ACADVER pero con SECTION");
}

// ── glTF binario (.glb) por firma ──
{
  const glb = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0, 0, 0, 0, 0]);
  const r = detectCadFormat(glb);
  ok(r.format === "gltf" && r.nativeSupport === true, "glb detectado por firma");
}

// ── glTF de texto (.gltf) ──
{
  const r = detectCadFormat('{"asset":{"version":"2.0"},"scenes":[]}');
  ok(r.format === "gltf" && r.nativeSupport === true, "gltf de texto detectado por su sección asset");
}

// ── COLLADA (.dae) ──
{
  const r = detectCadFormat('<?xml version="1.0"?><COLLADA xmlns="x"><asset/></COLLADA>');
  ok(r.format === "collada" && r.nativeSupport === true, "COLLADA detectado por su raíz");
}

// ── STL ASCII y binario ──
{
  const ascii = "solid cubo\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nendloop\nendfacet\nendsolid cubo";
  const r = detectCadFormat(ascii);
  ok(r.format === "stl" && r.nativeSupport === true, "STL ASCII detectado");
}
{
  const triangleCount = 1;
  const binary = new Uint8Array(84 + triangleCount * 50);
  new DataView(binary.buffer).setUint32(80, triangleCount, true);
  const r = detectCadFormat(binary);
  ok(r.format === "stl" && r.nativeSupport === true, "STL binario detectado por aritmética de tamaño");
}

// ── OBJ ──
{
  const obj = "# comentario\no Cubo\nv 0 0 0\nv 1 0 0\nv 1 1 0\nf 1 2 3";
  const r = detectCadFormat(obj);
  ok(r.format === "obj" && r.nativeSupport === true, "OBJ detectado por vocabulario de línea");
}

// ── .skp: se detecta para RECHAZAR, no para leer ──
{
  const r = detectCadFormat(bytesOf("SketchUp Model relleno binario"));
  ok(r.format === "skp" && r.nativeSupport === false, "SKP detectado y marcado como NO soportado");
  ok(/COLLADA|glTF/.test(r.message), "el mensaje de SKP ofrece una alternativa real");
}

// ── isDwg helper ──
ok(isDwg("AC1024xxxx") === true, "isDwg true para DWG");
ok(isDwg("0\nSECTION\n2\nENTITIES") === false, "isDwg false para DXF");

// ── desconocido ──
{
  const r = detectCadFormat("%PDF-1.7 esto es un pdf");
  ok(r.format === "unknown" && r.nativeSupport === false, "PDF → desconocido");
}
{
  const r = detectCadFormat("");
  ok(r.format === "unknown", "vacío → desconocido");
}

// ── tabla de versiones ──
ok(
  ACAD_VERSION_NAMES.AC1015 === "2000" && ACAD_VERSION_NAMES.AC1014 === "R14",
  "tabla de versiones correcta",
);

if (fails.length) {
  console.log(`❌ ${passed}/${passed + fails.length}`);
  for (const f of fails) console.log("  - " + f);
  process.exit(1);
}
console.log(`✅ ${passed}/${passed} cad-format-detect`);
