"use client";

/**
 * EL ENLACE TEMPORAL DE LA DEMOSTRACIÓN, del lado del navegador.
 *
 * Quien dibuja en `/demo` no tiene cuenta, y aun así tiene que poder mandar su
 * plano a un celular: es la cuarta tarea del robot estudiante
 * (`scripts/qa/medir-tareas.mjs`) y la que cierra el primer uso. El servidor
 * guarda una copia saneada de sólo lectura que caduca a los siete días
 * (`apps/api/src/modules/cad/cad-demo-share.service.ts`); aquí vive lo que
 * hace falta para crearla, recordarla y, al crear cuenta, reclamarla.
 *
 * ## Por qué los dos tokens van a `localStorage`
 *
 * El invitado de un review link guarda su token en `sessionStorage` y nunca en
 * `localStorage` (`review-token.ts`): el enlace es de OTRO y no debe quedarse
 * en un navegador ajeno. Aquí es al revés: el enlace es del propio visitante,
 * su dibujo ya vive en `localStorage` (`DEMO_STORAGE_KEY`) y el reclamo ocurre
 * DESPUÉS de verificar el correo, casi siempre en otra pestaña. Se guarda sólo
 * mientras el enlace vive: al leerlo caducado, se olvida.
 *
 * ## Una copia por estado del dibujo
 *
 * El enlace es una FOTO: quien lo recibe ve el plano tal como estaba al pulsar
 * «Compartir». Si el visitante sigue dibujando y vuelve a pulsar, se crea uno
 * nuevo y se borra el anterior; si no cambió nada, se reutiliza el mismo y no
 * se gasta cupo del límite por IP.
 */
import type { DemoShareContext } from "@valle/design-sdk";
import { designClient } from "@/lib/cad/repositories/client";
import type { CadDocument } from "@/lib/cad/cad-document";

export const DEMO_SHARE_STORAGE_KEY = "valle.demoShare.v1";

/** Prefijo del token de lectura del enlace temporal (el review link usa `vdrl_`). */
export const DEMO_SHARE_TOKEN_PREFIX = "vdds_";

export interface StoredDemoShare {
  shareToken: string;
  manageToken: string;
  expiresAt: string;
  /** Huella del dibujo compartido: si no cambió, el enlace se reutiliza. */
  signature: string;
}

type ShareStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const browserStorage = (): ShareStorage | undefined => {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
};

export function isDemoShareToken(token: string): boolean {
  return token.startsWith(DEMO_SHARE_TOKEN_PREFIX);
}

/**
 * Huella barata del dibujo (FNV-1a de 32 bits sobre el JSON y su longitud).
 * No es criptográfica ni tiene que serlo: sólo decide si reutilizar el enlace
 * o crear uno nuevo, y un choque improbable cuesta, como mucho, un enlace con
 * la versión anterior del dibujo.
 */
export function documentSignature(json: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < json.length; index += 1) {
    hash ^= json.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${json.length.toString(36)}.${hash.toString(36)}`;
}

export function readStoredDemoShare(
  storage: ShareStorage | undefined = browserStorage(),
  now: number = Date.now(),
): StoredDemoShare | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(DEMO_SHARE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredDemoShare>;
    const expires = Date.parse(String(parsed.expiresAt ?? ""));
    if (
      typeof parsed.shareToken !== "string" ||
      typeof parsed.manageToken !== "string" ||
      typeof parsed.signature !== "string" ||
      !Number.isFinite(expires) ||
      expires <= now
    ) {
      storage.removeItem(DEMO_SHARE_STORAGE_KEY);
      return null;
    }
    return parsed as StoredDemoShare;
  } catch {
    return null;
  }
}

function remember(share: StoredDemoShare, storage: ShareStorage | undefined): void {
  try {
    storage?.setItem(DEMO_SHARE_STORAGE_KEY, JSON.stringify(share));
  } catch {
    // Sin almacenamiento el enlace sigue sirviendo; sólo no se podrá reclamar
    // desde la cuenta. Nada que el visitante tenga que resolver.
  }
}

export function forgetStoredDemoShare(
  storage: ShareStorage | undefined = browserStorage(),
): void {
  try {
    storage?.removeItem(DEMO_SHARE_STORAGE_KEY);
  } catch {
    /* nada que olvidar */
  }
}

async function gzip(text: string): Promise<Blob> {
  const stream = new Blob([text], { type: "application/json" })
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  return new Response(stream).blob();
}

/**
 * Devuelve el enlace vigente para ESTE dibujo, creándolo si hace falta. Si el
 * dibujo cambió desde el último, el anterior se borra (sin esperar: si falla,
 * caduca solo a los siete días).
 */
export async function shareDemoDocument(
  document: CadDocument,
  name: string | undefined,
  storage: ShareStorage | undefined = browserStorage(),
): Promise<StoredDemoShare> {
  const json = JSON.stringify(document);
  const signature = documentSignature(json);
  const previous = readStoredDemoShare(storage);
  if (previous && previous.signature === signature) return previous;
  const created = await designClient.demoShares.create(await gzip(json), name);
  const share: StoredDemoShare = {
    shareToken: created.shareToken,
    manageToken: created.manageToken,
    expiresAt: created.expiresAt,
    signature,
  };
  remember(share, storage);
  if (previous) void designClient.demoShares.remove(previous.manageToken).catch(() => undefined);
  return share;
}

/** Borra el enlace en el servidor y lo olvida aquí. */
export async function deleteDemoShare(
  share: StoredDemoShare,
  storage: ShareStorage | undefined = browserStorage(),
): Promise<void> {
  await designClient.demoShares.remove(share.manageToken);
  forgetStoredDemoShare(storage);
}

/** El canje del invitado: sólo lectura, sin sesión. */
export function redeemDemoShare(shareToken: string): Promise<DemoShareContext> {
  return designClient.demoShares.context(shareToken);
}

/**
 * Al crear cuenta: el enlace temporal pasa a ser un enlace de revisión del
 * documento que nació del dibujo. La URL que ya tiene el destinatario sigue
 * abriendo. Si el reclamo falla, el enlace temporal sigue vivo hasta caducar;
 * por eso sólo se olvida aquí cuando el servidor confirmó.
 */
export async function claimStoredDemoShare(
  documentId: string,
  storage: ShareStorage | undefined = browserStorage(),
): Promise<boolean> {
  const share = readStoredDemoShare(storage);
  if (!share) return false;
  await designClient.demoShares.claim(documentId, share.manageToken);
  forgetStoredDemoShare(storage);
  return true;
}
