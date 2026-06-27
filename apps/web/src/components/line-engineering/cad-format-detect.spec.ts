/** Tests de cad-format-detect (Fase 74). npx tsx src/components/line-engineering/cad-format-detect.spec.ts */
import { detectCadFormat, isDwg, ACAD_VERSION_NAMES } from './cad-format-detect';

let passed = 0; const fails: string[] = [];
const ok = (cond: boolean, m: string) => { if (cond) passed++; else fails.push(m); };

const bytesOf = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));

// ── DWG por cabecera de versión ──
{ const r = detectCadFormat('AC1032\x00\x00\x00other binary junk');
  ok(r.format === 'dwg' && r.version === 'AC1032' && r.versionName === '2018', 'DWG 2018 detectado');
  ok(r.nativeSupport === false && /DXF/.test(r.message), 'DWG no soportado nativo, guía a DXF'); }
{ const r = detectCadFormat(bytesOf('AC1027........'));
  ok(r.format === 'dwg' && r.versionName === '2013', 'DWG 2013 desde Uint8Array'); }
{ const r = detectCadFormat('AC1099raro');
  ok(r.format === 'dwg' && r.version === 'AC1099' && r.versionName === undefined, 'versión DWG desconocida: detecta formato sin nombre'); }

// ── DXF de texto ──
{ const dxf = '0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1009\n0\nENDSEC\n0\nEOF';
  const r = detectCadFormat(dxf);
  ok(r.format === 'dxf' && r.nativeSupport === true, 'DXF detectado y soportado');
  ok(r.version === 'AC1009' && r.versionName === 'R12', 'versión DXF R12 leída del cuerpo'); }
{ const r = detectCadFormat('999\nComentario\n0\nSECTION\n2\nENTITIES\n0\nENDSEC');
  ok(r.format === 'dxf', 'DXF sin $ACADVER pero con SECTION'); }

// ── isDwg helper ──
ok(isDwg('AC1024xxxx') === true, 'isDwg true para DWG');
ok(isDwg('0\nSECTION\n2\nENTITIES') === false, 'isDwg false para DXF');

// ── desconocido ──
{ const r = detectCadFormat('%PDF-1.7 esto es un pdf');
  ok(r.format === 'unknown' && r.nativeSupport === false, 'PDF → desconocido'); }
{ const r = detectCadFormat('');
  ok(r.format === 'unknown', 'vacío → desconocido'); }

// ── tabla de versiones ──
ok(ACAD_VERSION_NAMES.AC1015 === '2000' && ACAD_VERSION_NAMES.AC1014 === 'R14', 'tabla de versiones correcta');

if (fails.length) { console.log(`❌ ${passed}/${passed + fails.length}`); for (const f of fails) console.log('  - ' + f); process.exit(1); }
console.log(`✅ ${passed}/${passed} cad-format-detect`);
