/** Tests de dxf-editable-import-losses. npx tsx src/components/cad/interop/dxf-editable-import-losses.spec.ts */
import {
  describeDxfOriginOffsetLoss,
  buildDxfConversionLossManifest,
} from "./dxf-editable-import-losses";

let passed = 0;
const fails: string[] = [];
const ok = (cond: boolean, m: string) => {
  if (cond) passed++;
  else fails.push(m);
};

// ── describeDxfOriginOffsetLoss ──────────────────────────────────────────
ok(
  describeDxfOriginOffsetLoss(0, 0) === null,
  "dx=dy=0 no genera entrada de pérdida",
);
{
  const entry = describeDxfOriginOffsetLoss(-500000, -2150000);
  ok(entry !== null, "desplazamiento no nulo genera una entrada");
  ok(entry?.code === "dxf_import:origin_shifted", "código estable para filtrar/agrupar");
  ok(entry?.severity === "warning", "severidad warning, no error (nada se pierde, se desplaza)");
  ok(entry?.sourceType === "DXF", "sourceType declara el origen");
  ok(
    !!entry?.detail.includes("-500000.000") && !!entry?.detail.includes("-2150000.000"),
    "el detalle trae las cifras EXACTAS del desplazamiento, no sólo un aviso genérico",
  );
  ok(
    /reexportar/.test(entry?.detail ?? "") && /Ajustar DXF/.test(entry?.detail ?? ""),
    "el detalle es honesto: dice que no se revierte solo, y dónde está el otro offset relevante",
  );
}
{
  const entry = describeDxfOriginOffsetLoss(12.5, 0);
  ok(entry !== null, "sólo X desplazado también genera entrada");
  ok(!!entry?.detail.includes("12.500"), "cifra de X presente");
}
{
  const entry = describeDxfOriginOffsetLoss(0, -3);
  ok(entry !== null, "sólo Y desplazado también genera entrada");
  ok(!!entry?.detail.includes("-3.000"), "cifra de Y presente");
}

// ── buildDxfConversionLossManifest ───────────────────────────────────────
{
  const entries = buildDxfConversionLossManifest(
    [],
    { truncated: false, cap: 850 },
    { dx: 0, dy: 0 },
  );
  ok(
    entries.length === 0,
    "sin warnings, sin truncar, sin desplazamiento: manifiesto vacío",
  );
}
{
  const entries = buildDxfConversionLossManifest(
    [{ code: "unsupported_entity", message: "Entidad DXF no soportada: WIPEOUT.", entityType: "WIPEOUT" }],
    { truncated: false, cap: 850 },
    { dx: 0, dy: 0 },
  );
  ok(entries.length === 1, "un warning de lectura se traduce en una entrada");
  ok(
    entries[0].code === "dxf_import:unsupported_entity",
    "el código se prefija con dxf_import: para agrupar con el resto del manifiesto",
  );
  ok(entries[0].sourceType === "WIPEOUT", "sourceType toma el entityType del warning");
}
{
  const entries = buildDxfConversionLossManifest(
    [{ code: "x", message: "m", layer: "A-WALLS" }],
    { truncated: false, cap: 850 },
    { dx: 0, dy: 0 },
  );
  ok(
    entries[0].detail.includes("A-WALLS"),
    "la capa del warning queda en el detalle cuando la trae",
  );
}
{
  const entries = buildDxfConversionLossManifest(
    [],
    { truncated: true, cap: 850 },
    { dx: 0, dy: 0 },
  );
  ok(entries.length === 1, "truncado sin warnings ni desplazamiento: una entrada");
  ok(
    entries[0].code === "dxf_import:conversion_truncated" && entries[0].detail.includes("850"),
    "la entrada de truncado trae el cap exacto",
  );
}
{
  // El caso que motivó P0-3: un DXF a magnitud UTM, sin warnings de lectura ni recorte.
  const entries = buildDxfConversionLossManifest(
    [],
    { truncated: false, cap: 850 },
    { dx: -500000, dy: -2150000 },
  );
  ok(
    entries.length === 1 && entries[0].code === "dxf_import:origin_shifted",
    "un DXF UTM sin más pérdidas igual queda con el desplazamiento declarado — ya no es mudo",
  );
}
{
  // Los tres casos a la vez, en el orden en que Layout3DEditor.tsx los push-eaba a mano.
  const entries = buildDxfConversionLossManifest(
    [{ code: "unsupported_entity", message: "m", entityType: "WIPEOUT" }],
    { truncated: true, cap: 850 },
    { dx: 10, dy: 20 },
  );
  ok(
    entries.length === 3 &&
      entries[0].code === "dxf_import:unsupported_entity" &&
      entries[1].code === "dxf_import:conversion_truncated" &&
      entries[2].code === "dxf_import:origin_shifted",
    "warnings, truncado y desplazamiento conviven en el mismo orden que antes",
  );
}

if (fails.length) {
  console.log(`❌ ${passed}/${passed + fails.length}`);
  for (const f of fails) console.log("  - " + f);
  process.exit(1);
}
console.log(`✅ ${passed}/${passed} dxf-editable-import-losses`);
