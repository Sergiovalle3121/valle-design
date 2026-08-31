/**
 * ETRANSMIT como comando: se teclea, pide un nombre, y termina pidiéndole al
 * anfitrión que entregue un ZIP con bytes reales — no una promesa.
 */
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import type { CadCommandContext } from "../command-types";
import { CAD_ETRANSMIT_COMMANDS } from "./etransmit-commands";

let checks = 0;
function ok(condition: unknown, message: string): void {
  assert.ok(condition, message);
  checks += 1;
}

const command = CAD_ETRANSMIT_COMMANDS[0];
ok(command.name === "ETRANSMIT", "el descriptor se llama ETRANSMIT");

function context(withDocument: boolean): CadCommandContext {
  return {
    entityIds: ["l1"],
    entity: () => undefined,
    selection: [],
    activeLayer: "0",
    view: { pixelsPerUnit: 1, centerX: 0, centerY: 0 },
    newEntityId: () => "probe",
    paperSpaces: () => [],
    constraints: [],
    ...(withDocument
      ? {
          document: () => ({
            meta: { version: 1, schema: 4, unit: "mm" },
            entities: [],
            blocks: [],
            layers: [],
            styles: { text: {}, dimension: {}, mleader: {}, table: {}, plot: {} },
            externalReferences: [],
            modelSpace: { entityIds: [] },
            unsupportedEntities: [],
          }),
        }
      : {}),
  };
}

// --- sin anfitrión de documento: se niega diciendo por qué -----------------
{
  const step1 = command.begin(context(false));
  ok(step1.result === undefined, "el primer paso sólo pide el nombre");
  const step2 = command.step(step1.state, { kind: "enter" }, context(false));
  ok(step2.result?.kind === "message", "sin documento, termina en un mensaje");
  ok(
    step2.result?.kind === "message" && /no expone el documento/.test(step2.result.text),
    `declara su límite: ${JSON.stringify(step2.result)}`,
  );
}

// --- con documento: produce el paquete de verdad ----------------------------
{
  const step1 = command.begin(context(true));
  const step2 = command.step(step1.state, { kind: "text", value: "Entrega obra negra" }, context(true));
  ok(step2.result?.kind === "host", "termina pidiéndole al anfitrión que entregue un archivo");
  const request = step2.result?.kind === "host" ? step2.result.request : null;
  ok(request?.kind === "etransmit", "la petición es la de ETRANSMIT");
  if (request?.kind === "etransmit") {
    ok(request.fileName === "Entrega obra negra.zip", `el nombre se respeta: ${request.fileName}`);
    ok(request.bytes.length > 0, "hay bytes de verdad, no una promesa vacía");
    ok(request.bytes[0] === 0x50 && request.bytes[1] === 0x4b, "los bytes empiezan con la firma ZIP «PK»");

    const dir = mkdtempSync(path.join(tmpdir(), "cad-etransmit-cmd-"));
    const zipPath = path.join(dir, "paquete.zip");
    writeFileSync(zipPath, request.bytes);
    const listing = spawnSync("unzip", ["-l", zipPath], { encoding: "utf8" });
    if (!listing.error && listing.status === 0) {
      ok(listing.stdout.includes("Entrega obra negra.json"), "el ZIP real trae el documento");
      ok(listing.stdout.includes("manifiesto.json"), "el ZIP real trae el manifiesto");
      checks += 1;
    } else {
      console.log("etransmit-commands.spec: `unzip` no está instalado — se omite la lectura externa");
    }
  }
}

console.log(`etransmit-commands.spec: ${checks} comprobaciones OK`);
