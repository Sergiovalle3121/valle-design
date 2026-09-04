/**
 * ETRANSMIT como comando: se teclea, pide un nombre, y termina pidiéndole al
 * anfitrión que entregue un ZIP con bytes reales — no una promesa.
 *
 * Desde la Ola 9 el paquete pasa antes por la revisión de entrega y FALLA
 * CERRADO. Lo que se mide aquí no es «que llame a la revisión»: es que un plano
 * con un defecto que bloquea NO produzca paquete, que produzca uno cuando se
 * dice explícitamente que sí, que ese paquete lo diga POR DENTRO, y —el caso
 * que da valor a los otros tres— que un plano limpio pase de largo sin
 * preguntar nada, porque una puerta que siempre pregunta se aprende a saltar.
 */
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import type { CadCommandContext } from "../command-types";
import type { CadEntity } from "../../cad-document";
import { CAD_IE_TAG } from "../../electrical/device-tags";
import { CAD_ETRANSMIT_COMMANDS } from "./etransmit-commands";

let checks = 0;
function ok(condition: unknown, message: string): void {
  assert.ok(condition, message);
  checks += 1;
}

const command = CAD_ETRANSMIT_COMMANDS[0];
ok(command.name === "ETRANSMIT", "el descriptor se llama ETRANSMIT");

/** Dos luminarias con la MISMA etiqueta: en la obra sólo hay una. */
const luminaria = (id: string, tag: string): CadEntity =>
  ({
    id,
    type: "insert",
    block: "MEP-LUMINARIA",
    position: { x: 0, y: 0, z: 0 },
    rotation: 0,
    scale: { x: 1, y: 1, z: 1 },
    layer: "IE-ALU",
    attributes: { [CAD_IE_TAG]: tag },
  }) as unknown as CadEntity;

function context(withDocument: boolean, entities: CadEntity[] = []): CadCommandContext {
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
            entities,
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

// --- la puerta de entrega: con un bloqueo, NO se empaqueta ------------------
{
  const sucio = [luminaria("L1", "-LT1"), luminaria("L2", "-LT1")];
  const step1 = command.begin(context(true, sucio));
  const step2 = command.step(step1.state, { kind: "text", value: "Entrega" }, context(true, sucio));
  ok(step2.result === undefined, "con un hallazgo que bloquea NO sale paquete: falla cerrado");
  ok(/NO ENTREGABLE/.test(step2.prompt.message), `y el veredicto va delante: ${step2.prompt.message}`);
  ok(
    /-LT1/.test(step2.prompt.message),
    "diciendo QUÉ bloquea, no sólo que algo bloquea: sin eso no se puede arreglar",
  );
  ok(
    step2.prompt.options.length === 1 && step2.prompt.options[0].keyword === "Empaquetar",
    "y ofrece armarlo igual: hay entregas parciales, y quien firma decide",
  );

  // Cualquier otra cosa NO arma el paquete: el silencio no vale por un sí.
  const nada = command.step(step2.state, { kind: "enter" }, context(true, sucio));
  ok(
    nada.result?.kind === "message" && /no se armó el paquete/i.test(nada.result.text),
    `un Enter no arma la entrega: ${JSON.stringify(nada.result)}`,
  );
  ok(
    nada.result?.kind === "message" && /REVISA/.test(nada.result.text),
    "y remite a la orden que lo explica con detalle",
  );

  // Diciendo que sí, el paquete sale Y LO DICE POR DENTRO.
  const armado = command.step(step2.state, { kind: "keyword", keyword: "Empaquetar" }, context(true, sucio));
  const request = armado.result?.kind === "host" ? armado.result.request : null;
  ok(request?.kind === "etransmit", "dicho que sí, el paquete se arma");
  ok(
    armado.result?.kind === "host" && /NO ENTREGABLE/.test(armado.result.label),
    `y el veredicto encabeza lo que se le dice al usuario: ${armado.result?.kind === "host" ? armado.result.label : ""}`,
  );
  if (request?.kind === "etransmit") {
    const dir = mkdtempSync(path.join(tmpdir(), "cad-etransmit-rev-"));
    const zipPath = path.join(dir, "paquete.zip");
    writeFileSync(zipPath, request.bytes);
    const listing = spawnSync("unzip", ["-l", zipPath], { encoding: "utf8" });
    if (!listing.error && listing.status === 0) {
      ok(listing.stdout.includes("REVISION.txt"), "el informe legible viaja DENTRO del ZIP");
      const texto = spawnSync("unzip", ["-p", zipPath, "REVISION.txt"], { encoding: "utf8" });
      ok(
        /A PESAR de los hallazgos que bloquean/.test(texto.stdout),
        "y dice que se armó a pesar de los bloqueos: lo caro es que quien recibe no lo sepa",
      );
      ok(/-LT1/.test(texto.stdout), "con el hallazgo concreto, no un «hay problemas»");
      const manifiesto = spawnSync("unzip", ["-p", zipPath, "manifiesto.json"], { encoding: "utf8" });
      const leido = JSON.parse(manifiesto.stdout) as {
        review?: { packedDespiteBlocking?: boolean; limits?: string };
      };
      ok(leido.review?.packedDespiteBlocking === true, "y el manifiesto lo lleva en un campo, para una máquina");
      ok(
        typeof leido.review?.limits === "string" && leido.review.limits.length > 0,
        "con los límites de la revisión: un informe que no dice lo que NO mira es un certificado",
      );
    } else {
      console.log("etransmit-commands.spec: `unzip` no está instalado — se omite la lectura externa");
    }
  }
}

// --- el negativo de control: un plano limpio pasa de largo ------------------
{
  const limpio = [luminaria("L1", "-LT1"), luminaria("L2", "-LT2")];
  const step1 = command.begin(context(true, limpio));
  const step2 = command.step(step1.state, { kind: "text", value: "Entrega" }, context(true, limpio));
  ok(
    step2.result?.kind === "host",
    "sin bloqueos NO se pregunta nada: una puerta que siempre pregunta se aprende a saltar",
  );
  const request = step2.result?.kind === "host" ? step2.result.request : null;
  if (request?.kind === "etransmit") {
    const dir = mkdtempSync(path.join(tmpdir(), "cad-etransmit-limpio-"));
    const zipPath = path.join(dir, "paquete.zip");
    writeFileSync(zipPath, request.bytes);
    const manifiesto = spawnSync("unzip", ["-p", zipPath, "manifiesto.json"], { encoding: "utf8" });
    if (!manifiesto.error && manifiesto.status === 0) {
      const leido = JSON.parse(manifiesto.stdout) as {
        review?: { packedDespiteBlocking?: boolean; checked?: string[] };
      };
      ok(
        leido.review?.packedDespiteBlocking === false,
        "el informe viaja IGUAL cuando no hay nada malo: uno que sólo aparece con defectos enseña a no leerlo",
      );
      ok(
        (leido.review?.checked ?? []).length > 0,
        "y dice lo que MIRÓ, que es lo que distingue «limpio» de «no se revisó»",
      );
    }
  }
}

console.log(`etransmit-commands.spec: ${checks} comprobaciones OK`);
