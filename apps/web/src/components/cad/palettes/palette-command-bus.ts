"use client";

/**
 * El puente entre un comando tecleado y una paleta abierta.
 *
 * ## El problema que resuelve
 *
 * Un comando del motor es una máquina de estados PURA: no sabe que existe
 * React y no puede abrir nada. Una paleta, al revés, es un componente que vive
 * dentro de un árbol y no puede ser importada por `lib/cad`. Entre los dos hace
 * falta algo, y ese algo tiene que ser tan tonto que no pueda estropear
 * ninguno de los dos lados.
 *
 * Esto es un registro de un solo nivel: quien sabe abrir algo se apunta, y el
 * anfitrión del motor pregunta. Nadie importa a nadie.
 *
 * ## Por qué un módulo y no un contexto de React
 *
 * Porque el anfitrión del motor NO es un componente. Vive fuera de React, como
 * todo lo de esta carpeta, para no ocupar `useState` en un archivo que sólo
 * puede encoger. Un contexto obligaría a meterlo dentro del árbol y a arrastrar
 * el puente por cinco niveles de props.
 *
 * ## Qué pasa cuando nadie se ha apuntado
 *
 * `requestCadUi` devuelve `false` y el anfitrión enseña el texto que la propia
 * petición trae. Un comando NUNCA se traga en silencio: o abre, o dice qué se
 * está perdiendo el usuario y cuál es la variante que sí funciona.
 */
import type { CadUiRequest, CadUiTarget } from "@/lib/cad/engine/command-types";

export type CadUiHandler = (request: CadUiRequest) => boolean;

const handlers = new Map<CadUiTarget, CadUiHandler>();

/**
 * Apunta un manejador. Devuelve la baja, para llamarla al desmontar.
 *
 * Un segundo manejador para el mismo destino SUSTITUYE al primero: en un
 * momento dado sólo hay un editor montado, y encadenarlos haría que una paleta
 * desmontada siguiese contestando.
 */
export function registerCadUiHandler(
  target: CadUiTarget,
  handler: CadUiHandler,
): () => void {
  handlers.set(target, handler);
  return () => {
    if (handlers.get(target) === handler) handlers.delete(target);
  };
}

export function requestCadUi(request: CadUiRequest): boolean {
  const handler = handlers.get(request.target);
  if (!handler) return false;
  try {
    return handler(request);
  } catch {
    // Un manejador que revienta no debe tirar el comando: se comporta como si
    // no estuviera y el usuario ve el texto de «no disponible».
    return false;
  }
}

/** Sólo para las specs: deja el registro como recién cargado. */
export function resetCadUiHandlers(): void {
  handlers.clear();
}

export function cadUiHandlerTargets(): CadUiTarget[] {
  return [...handlers.keys()].sort();
}

/**
 * Lee un archivo que el usuario elige, sin montar interfaz.
 *
 * SCRIPT y LINETYPE necesitan un archivo y no hay dónde poner un botón sin
 * tocar el monolito, que en esta ola pertenece a otra sesión. Un `input` creado
 * al vuelo resuelve las dos: el navegador enseña SU selector, que es el que el
 * usuario reconoce, y no queda nada en el árbol.
 *
 * Devuelve `null` si el usuario cancela o si esto no corre en un navegador.
 */
export async function pickCadTextFile(accept: string): Promise<{ name: string; text: string } | null> {
  const [file] = await pickBrowserFiles(accept, false);
  if (!file) return null;
  try {
    return { name: file.name, text: await file.text() };
  } catch {
    return null;
  }
}

/**
 * Lee VARIOS archivos elegidos a la vez, como bytes.
 *
 * MAPIMPORT (Ola G) los necesita así: un shapefile son cuatro archivos y dos
 * de ellos binarios, y `File.text()` sobre un binario lo destroza (sustituye
 * cada byte inválido). Devuelve vacío si el usuario cancela.
 */
export async function pickCadFiles(accept: string): Promise<Array<{ name: string; bytes: Uint8Array }>> {
  const files = await pickBrowserFiles(accept, true);
  const read: Array<{ name: string; bytes: Uint8Array }> = [];
  for (const file of files) {
    try {
      read.push({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
    } catch {
      // Un archivo que el navegador no deja leer no entra; los demás sí.
    }
  }
  return read;
}

function pickBrowserFiles(accept: string, multiple: boolean): Promise<File[]> {
  if (typeof document === "undefined") return Promise.resolve([]);
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = multiple;
    input.style.display = "none";
    let settled = false;
    const finish = (value: File[]) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(value);
    };
    input.addEventListener("change", () => finish([...(input.files ?? [])]));
    // `cancel` no existe en todos los navegadores; sin este respaldo la promesa
    // quedaría viva para siempre y con ella el `input` en el DOM.
    input.addEventListener("cancel", () => finish([]));
    document.body.append(input);
    input.click();
  });
}
