/**
 * Corredor del MERGE SEMÁNTICO real para la evidencia de review.concurrency.
 *
 * POR QUÉ EXISTE. El probe de concurrencia (`apps/api/src/load-probe/
 * review-concurrency.main.ts`) vive en el mundo del API y el merge de
 * documentos vive en el del editor (`apps/web/src/lib/cad/
 * cad-conflict-resolution.ts`). Copiar la fusión al probe publicaría evidencia
 * de un merge que el producto NO ejecuta; este corredor importa la función
 * REAL —la misma que resuelve el 409 en la pantalla— y la expone por
 * stdin/stdout para que el probe la invoque como proceso, igual que
 * `rubric.mjs` invoca su sonda de registro con tsx.
 *
 * ENTRADA (stdin, JSON): { base, mine, theirs, theirsVersion } donde los tres
 * documentos vienen en la forma CANÓNICA que la API devuelve al abrir. Cada
 * uno pasa por `migrateCadDocument` —el MISMO camino por el que el editor
 * carga un documento del servidor— antes de fusionarse, y el resultado vuelve
 * por `serializeCadDocument`, que es la forma en la que el editor guarda.
 * SALIDA  (stdout, JSON): {
 *   mergeReady, autoMerged, collisions, sectionCollisions,
 *   resolutionsApplied, document, saveAgainstVersion
 * }
 *
 * POLÍTICA DE COLISIONES, DECLARADA. Si la fusión exige elegir, este corredor
 * elige `mine` (el perdedor del CAS conserva su cambio en las entidades en
 * disputa) y lo dice en `resolutionsApplied`. Es la elección que un usuario
 * haría para no perder su trabajo; la evidencia publica QUÉ colisionó y qué
 * se eligió, nunca una fusión silenciosa.
 */
import {
  planCadConflictResolution,
  summarizeCadConflict,
  type CadConflictInputs,
} from "../../apps/web/src/lib/cad/cad-conflict-resolution";
import type { CadMergeResolution } from "../../apps/web/src/lib/cad/cad-collaboration";
import { migrateCadDocument } from "../../apps/web/src/lib/cad/cad-document-migrate";
import { serializeCadDocument } from "../../apps/web/src/lib/cad/cad-document";
import type { CadSectionResolution } from "../../apps/web/src/lib/cad/cad-document-merge";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

const raw = await readStdin();
const wire = JSON.parse(raw) as {
  base: unknown;
  mine: unknown;
  theirs: unknown;
  theirsVersion: number;
};
const inputs: CadConflictInputs = {
  base: migrateCadDocument(wire.base),
  mine: migrateCadDocument(wire.mine),
  theirs: migrateCadDocument(wire.theirs),
  theirsVersion: wire.theirsVersion,
};

const summary = summarizeCadConflict(inputs);

// Primero sin resoluciones; si la fusión pide decidir, se decide `mine` para
// TODO lo disputado y se vuelve a planear. La política queda en la salida.
const resolutions: Record<string, CadMergeResolution> = {};
const sectionResolutions: Record<string, CadSectionResolution> = {};
for (const key of summary.unresolved) resolutions[key] = { strategy: "mine" };
for (const key of summary.unresolvedSections)
  sectionResolutions[key] = { strategy: "mine" };

const planned = planCadConflictResolution("merge", {
  ...inputs,
  resolutions,
  sectionResolutions,
});

process.stdout.write(
  JSON.stringify(
    planned.ok
      ? {
          mergeReady: true,
          autoMerged: summary.autoMerged,
          collisions: summary.collisions.map((collision) => collision.entityId),
          sectionCollisions: summary.sectionCollisions.map(
            (collision) => collision.key,
          ),
          resolutionsApplied: {
            policy: "mine",
            entityKeys: Object.keys(resolutions),
            sectionKeys: Object.keys(sectionResolutions),
          },
          // La forma de GUARDAR del editor: canónica y determinista.
          document: JSON.parse(serializeCadDocument(planned.plan.document)),
          saveAgainstVersion: planned.plan.saveAgainstVersion,
        }
      : {
          mergeReady: false,
          autoMerged: summary.autoMerged,
          collisions: summary.collisions.map((collision) => collision.entityId),
          sectionCollisions: summary.sectionCollisions.map(
            (collision) => collision.key,
          ),
          reason: planned.reason,
          referenceBreaks: planned.referenceBreaks,
        },
  ),
);
