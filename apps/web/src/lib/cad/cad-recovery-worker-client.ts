import type { CadDocument } from './cad-document';
import {
  decodeCadRecoveryPayload,
  encodeCadRecoveryPayload,
  type CadRecoveryPayloadFormat,
  type EncodedCadRecoveryPayload,
} from './cad-recovery-codec';

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
};

let worker: Worker | null = null;
let nextRequestId = 1;
const pending = new Map<number, PendingRequest>();

function recoveryWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./cad-recovery.worker.ts', import.meta.url), {
      type: 'module',
      name: 'cad-recovery',
    });
    worker.addEventListener('message', (event: MessageEvent<{
      id: number;
      ok: boolean;
      result?: unknown;
      error?: string;
    }>) => {
      const request = pending.get(event.data.id);
      if (!request) return;
      pending.delete(event.data.id);
      if (event.data.ok) request.resolve(event.data.result);
      else request.reject(new Error(event.data.error ?? 'Falló el worker de recovery CAD.'));
    });
    worker.addEventListener('error', (event) => {
      const error = new Error(event.message || 'Falló el worker de recovery CAD.');
      for (const request of pending.values()) request.reject(error);
      pending.clear();
      worker?.terminate();
      worker = null;
    });
    return worker;
  } catch {
    worker = null;
    return null;
  }
}

function requestWorker<T>(message: Record<string, unknown>, transfer?: Transferable[]): Promise<T> {
  const activeWorker = recoveryWorker();
  if (!activeWorker) return Promise.reject(new Error('worker-unavailable'));
  const id = nextRequestId++;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, {
      resolve: (value) => resolve(value as T),
      reject,
    });
    activeWorker.postMessage({ ...message, id }, transfer ?? []);
  });
}

export async function encodeCadRecoveryOffThread(
  document: CadDocument,
): Promise<EncodedCadRecoveryPayload> {
  try {
    const encoded = await requestWorker<EncodedCadRecoveryPayload>({ type: 'encode', document });
    return { ...encoded, encoder: 'worker' };
  } catch {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    return { ...(await encodeCadRecoveryPayload(document)), encoder: 'main-thread-fallback' };
  }
}

export async function decodeCadRecoveryOffThread(
  format: CadRecoveryPayloadFormat,
  buffer: ArrayBuffer,
): Promise<CadDocument> {
  const fallbackBuffer = buffer.slice(0);
  try {
    return await requestWorker<CadDocument>({ type: 'decode', format, buffer }, [buffer]);
  } catch {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    return decodeCadRecoveryPayload(format, fallbackBuffer);
  }
}
