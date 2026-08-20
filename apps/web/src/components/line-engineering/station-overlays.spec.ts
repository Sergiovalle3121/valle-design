/**
 * Spec de las capas de estado en vivo.
 *
 * Esta tabla vivía dentro de `Layout3DEditor.tsx`, donde no se podía mirar sin
 * montar el editor entero — y es justo el código que se rompe sin hacer ruido:
 * si el servidor renombra un estado, la estación deja de teñirse, no falla
 * nada, y el plano MIENTE sobre el estado de la línea sin que nadie lo note.
 *
 * Se cierran cuatro cosas:
 *
 *  1. Cada vocabulario del servidor lleva al color que la leyenda promete.
 *  2. Lo que no se entiende se OMITE. No hay color por defecto: un bloque sin
 *     entrada conserva el suyo, que es lo que significa «de esta estación no sé
 *     nada». Teñirlo de un gris inventado se leería como un dato.
 *  3. Una respuesta que no tiene la forma esperada devuelve un mapa vacío en
 *     vez de reventar el visor a media carga.
 *  4. La leyenda que lee el usuario y el color que pinta el visor son el mismo
 *     hecho escrito dos veces, así que el spec exige que coincidan.
 */
import assert from "node:assert/strict";
import {
  BAY_HEX,
  BAY_UNASSIGNED_HEX,
  HEAT_HEX,
  MES_HEX,
  OVERLAY_DEFS,
  QUAL_HEX,
  hexToInt,
  overlayColorMap,
  type OverlayKind,
} from "./station-overlays";

let checks = 0;
function ok(condition: boolean, message: string): void {
  assert.ok(condition, message);
  checks += 1;
}

/** Envuelve filas en la forma que devuelven las rutas de capa del visor 2D. */
const payload = (...stations: unknown[]) => ({ stations });

// ---- 1. EL COLOR DE CSS Y EL DE THREE SON EL MISMO COLOR ------------------
{
  assert.equal(hexToInt("#10b981"), 0x10b981);
  assert.equal(hexToInt("#000000"), 0);
  assert.equal(hexToInt("#ffffff"), 0xffffff);
  ok(true, "el hexadecimal de la leyenda se convierte al entero que come THREE");
}

// ---- 2. MES: EL VOCABULARIO DEL SERVIDOR ----------------------------------
{
  const m = overlayColorMap(
    "mes",
    payload(
      { station: "E-10", status: "down" },
      { station: "E-20", status: "warn" },
      { station: "E-30", status: "ok" },
      { station: "E-40", status: "idle" },
      { station: "E-50", status: "unknown" },
    ),
  );
  assert.equal(m.get("E-10"), MES_HEX.down);
  assert.equal(m.get("E-20"), MES_HEX.warn);
  assert.equal(m.get("E-30"), MES_HEX.ok);
  assert.equal(m.get("E-40"), MES_HEX.idle);
  assert.equal(m.get("E-50"), MES_HEX.unknown);
  assert.notEqual(
    MES_HEX.unknown,
    MES_HEX.idle,
    "sin dato y parada de verdad NO pueden verse igual sobre el plano",
  );
  ok(m.size === 5, "las cinco palabras del MES tienen color, y «sin dato» tiene el suyo");
}

// ---- 3. LO QUE NO SE ENTIENDE NO SE PINTA ---------------------------------
{
  const m = overlayColorMap(
    "mes",
    payload(
      { station: "E-10", status: "ok" },
      { station: "E-11", status: "PARADA_PROGRAMADA" },
      { station: "E-12" },
      { station: 12, status: "ok" },
      null,
      "E-13",
    ),
  );
  assert.deepEqual([...m.keys()], ["E-10"], "sólo entra la fila que se entiende entera");
  ok(true, "un estado nuevo del servidor deja el bloque con su color, no con uno inventado");
}

// ---- 4. CALOR DE CICLO ----------------------------------------------------
{
  const m = overlayColorMap(
    "heat",
    payload(
      { station: "E-10", level: "cold" },
      { station: "E-20", level: "cool" },
      { station: "E-30", level: "warm" },
      { station: "E-40", level: "hot" },
      { station: "E-50", level: "over" },
      { station: "E-60", level: "tibio" },
    ),
  );
  assert.equal(m.get("E-10"), HEAT_HEX.cold);
  assert.equal(m.get("E-50"), HEAT_HEX.over);
  assert.equal(m.has("E-60"), false);
  ok(m.size === 5, "los cinco tramos de takt tienen color y el sexto no se inventa");
}

// ---- 5. COMPLETITUD: UN BOOLEANO, DOS COLORES -----------------------------
{
  const m = overlayColorMap(
    "completeness",
    payload(
      { station: "E-10", complete: true },
      { station: "E-20", complete: false },
      { station: "E-30" },
    ),
  );
  assert.notEqual(m.get("E-10"), m.get("E-20"), "completa e incompleta se distinguen");
  assert.equal(
    m.get("E-30"),
    m.get("E-20"),
    "sin el campo, la estación cuenta como INCOMPLETA: la documental es una capa de deuda",
  );
  ok(m.size === 3, "la completitud siempre tiene veredicto, y a falta de dato es el prudente");
}

// ---- 6. BAHÍAS: SEIS COLORES Y UN GRIS QUE NO ES UNA BAHÍA ----------------
{
  const m = overlayColorMap(
    "bays",
    payload(
      { station: "E-10", bahia: 1 },
      { station: "E-20", bahia: 6 },
      { station: "E-30", bahia: null },
      { station: "E-40" },
      { station: "E-50", bahia: 9 },
    ),
  );
  assert.equal(m.get("E-10"), BAY_HEX[1]);
  assert.equal(m.get("E-20"), BAY_HEX[6]);
  assert.equal(m.get("E-30"), BAY_UNASSIGNED_HEX, "sin bahía asignada, gris");
  assert.equal(m.get("E-40"), BAY_UNASSIGNED_HEX, "y el campo ausente es lo mismo que sin asignar");
  assert.equal(m.has("E-50"), false, "una bahía que no existe no recibe color prestado");
  ok(true, "las seis bahías se distinguen y «ninguna» tiene su propio gris");
}

// ---- 7. CALIDAD -----------------------------------------------------------
{
  const m = overlayColorMap(
    "quality",
    payload(
      { station: "E-10", level: "ok" },
      { station: "E-20", level: "minor" },
      { station: "E-30", level: "major" },
    ),
  );
  assert.equal(m.get("E-10"), QUAL_HEX.ok);
  assert.equal(m.get("E-20"), QUAL_HEX.minor);
  assert.equal(m.get("E-30"), QUAL_HEX.major);
  ok(true, "los tres grados de calidad acumulada tienen color propio");
}

// ---- 8. UNA RESPUESTA CON OTRA FORMA NO REVIENTA EL VISOR -----------------
{
  const kinds: OverlayKind[] = ["mes", "heat", "completeness", "bays", "quality"];
  for (const kind of kinds)
    for (const bad of [undefined, null, {}, { stations: null }, { stations: "E-10" }, []])
      assert.equal(
        overlayColorMap(kind, bad).size,
        0,
        `«${kind}» con una respuesta rara devuelve un mapa vacío`,
      );
  ok(true, "una capa que responde otra cosa deja el plano como estaba, sin excepción");
}

// ---- 9. LAS CINCO CAPAS DEL MENÚ ------------------------------------------
{
  const keys = OVERLAY_DEFS.map((def) => def.key);
  assert.deepEqual(keys, ["mes", "heat", "completeness", "bays", "quality"]);
  assert.equal(new Set(keys).size, keys.length, "dos capas con la misma clave se taparían");
  for (const def of OVERLAY_DEFS) {
    assert.ok(def.label.length > 0, `${def.key} necesita un nombre que leer en el menú`);
    assert.ok(def.endpoint.length > 0, `${def.key} necesita una ruta`);
    assert.ok(
      !def.endpoint.startsWith("/"),
      // Se concatena como `layout/${endpoint}`: una barra delante la sacaría de
      // su prefijo y la llamada se iría a la raíz del servidor.
      `${def.key}: la ruta es RELATIVA a layout/, no absoluta`,
    );
    assert.ok(def.legend.length > 0, `${def.key} necesita leyenda: un color sin nombre no informa`);
  }
  ok(true, "las cinco capas están completas y sus rutas cuelgan del prefijo que las usa");
}

// ---- 10. LA LEYENDA NO PUEDE PROMETER UN COLOR QUE NADIE PINTA ------------
{
  const completeness = overlayColorMap(
    "completeness",
    payload({ station: "sí", complete: true }, { station: "no", complete: false }),
  );
  const paleta: Record<OverlayKind, string[]> = {
    mes: Object.values(MES_HEX),
    heat: Object.values(HEAT_HEX),
    completeness: [...completeness.values()],
    bays: [...Object.values(BAY_HEX), BAY_UNASSIGNED_HEX],
    quality: Object.values(QUAL_HEX),
  };
  for (const def of OVERLAY_DEFS)
    for (const entry of def.legend)
      assert.ok(
        paleta[def.key].includes(entry.hex),
        `${def.key}/«${entry.label}»: la leyenda anuncia ${entry.hex} y el visor no lo pinta nunca`,
      );
  ok(true, "cada color de la leyenda es un color que el visor pinta de verdad");
}

console.log(
  `station-overlays: ${checks} comprobaciones — las cinco capas traducen el vocabulario del ` +
    `servidor a color, omiten lo que no entienden en vez de inventar un dato, sobreviven a una ` +
    `respuesta con otra forma, y la leyenda no promete ningún color que el visor no pinte.`,
);
