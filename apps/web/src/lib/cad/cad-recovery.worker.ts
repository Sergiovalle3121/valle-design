import type { CadDocument } from './cad-document';
import {
  decodeCadRecoveryPayload,
  encodeCadRecoveryPayload,
  type CadRecoveryPayloadFormat,
} from './cad-recovery-codec';

type WorkerRequest =
  | { id: number; type: 'encode'; document: CadDocument }
  | { id: number; type: 'decode'; format: CadRecoveryPayloadFormat; buffer: ArrayBuffer };

type WorkerResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string };

const workerScope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (message: WorkerResponse, transfer?: Transferable[]) => void;
};

workerScope.onmessage = (event) => {
  const request = event.data;
  void (async () => {
    if (request.type === 'encode') {
      const result = await encodeCadRecoveryPayload(request.document);
      workerScope.postMessage(
        { id: request.id, ok: true, result },
        [result.buffer],
      );
      return;
    }
    const document = await decodeCadRecoveryPayload(request.format, request.buffer);
    workerScope.postMessage({ id: request.id, ok: true, result: document });
  })().catch((cause) => {
    workerScope.postMessage({
      id: request.id,
      ok: false,
      error: cause instanceof Error ? cause.message : 'Falló el worker de recovery CAD.',
    });
  });
};

export {};
