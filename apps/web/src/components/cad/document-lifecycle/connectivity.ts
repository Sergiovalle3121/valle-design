/**
 * Cuándo hay que forzar el guardado pendiente, y por qué esos momentos.
 *
 * ## El defecto que este módulo existe para cerrar
 *
 * El editor no tiene cola offline: cuando el `PUT` falla por red, marca «Sin
 * conexión · cambios pendientes» y se queda ahí. El siguiente intento sólo
 * llega si pasa una de tres cosas: la persona dibuja otra vez (lo que
 * reprograma el debounce), pulsa Guardar, o cierra/oculta la pestaña.
 *
 * Falta el cuarto momento, que es el único que no depende de que nadie mire:
 * **que vuelva la red**. Sin él, el arquitecto que pierde el wifi, termina el
 * plano, cierra el portátil y se va a comer vuelve con su trabajo únicamente
 * en IndexedDB de esa máquina y ese perfil. No está «perdido», pero tampoco
 * está guardado, y basta con que abra el plano en otro equipo —o con que el
 * navegador limpie el almacenamiento del sitio— para que lo esté. Medido en
 * `apps/web/e2e/real/cad-offline-multitab.spec.ts`: sin este oyente pasan 30 s
 * desde que vuelve el cable sin que salga UNA sola petición.
 *
 * ## Por qué vive fuera de `Layout3DEditor.tsx`
 *
 * Porque son cuatro oyentes con una regla común, y esa regla se puede probar
 * sin montar un editor de 22.000 líneas: aquí se le inyectan los anfitriones
 * de eventos y el spec de al lado los sustituye por dobles. El monolito se
 * queda con la llamada, no con la política.
 */

/** Lo que el editor presta: su estado sucio y su cola de guardado. */
export interface CadSaveFlushBridge {
  /** ¿Hay trabajo que todavía no ha llegado al servidor? */
  isDirty(): boolean;
  /** Reprograma el autosave con la versión CAS vigente del documento. */
  scheduleAutosave(): void;
  /** Ejecuta ya lo que hubiera pendiente en la cola de un solo escritor. */
  flush(): Promise<void>;
}

/** Oyente genérico: cada manejador estrecha el evento que sí le importa. */
type FlushListener = (event: unknown) => void;

interface EventHost {
  addEventListener(type: string, listener: FlushListener): void;
  removeEventListener(type: string, listener: FlushListener): void;
}

interface DocumentHost extends EventHost {
  readonly visibilityState: string;
}

/** Anfitriones de eventos. Se inyectan para poder probar la política. */
export interface CadSaveFlushHosts {
  window: EventHost;
  document: DocumentHost;
}

type UnloadEvent = { preventDefault(): void; returnValue?: unknown };

function defaultHosts(): CadSaveFlushHosts | null {
  if (typeof window === "undefined" || typeof document === "undefined")
    return null;
  return {
    window: window as unknown as EventHost,
    document: document as unknown as DocumentHost,
  };
}

/**
 * Registra los cuatro momentos en que un cambio pendiente tiene que intentar
 * subir, y devuelve el desmontaje.
 *
 * `beforeunload` es el único que además FRENA la salida: avisar de que hay
 * trabajo sin guardar sólo tiene sentido si de verdad lo hay, así que cuando
 * no está sucio no se toca el evento y la pestaña se cierra sin molestar.
 *
 * El desmontaje vacía la cola a propósito: la petición pendiente pertenece al
 * documento que se está abandonando, y si no se ejecuta aquí, el editor habrá
 * cambiado sus referencias al documento siguiente cuando le toque el turno.
 */
export function observeCadSaveFlush(
  bridge: CadSaveFlushBridge,
  hosts: CadSaveFlushHosts | null = defaultHosts(),
): () => void {
  if (!hosts) return () => undefined;
  const flushCurrent = () => {
    if (bridge.isDirty()) bridge.scheduleAutosave();
    void bridge.flush().catch(() => undefined);
  };
  const onBeforeUnload = (event: UnloadEvent) => {
    if (!bridge.isDirty()) return;
    flushCurrent();
    event.preventDefault();
    event.returnValue = "";
  };
  const onPageHide = () => flushCurrent();
  const onVisibilityChange = () => {
    if (hosts.document.visibilityState === "hidden") flushCurrent();
  };
  // Volver la red NO es una acción de la persona, y ése es justo el caso que
  // se perdía: nadie va a tocar nada porque nadie está mirando.
  const onOnline = () => {
    if (bridge.isDirty()) flushCurrent();
  };
  const listeners: [EventHost, string, FlushListener][] = [
    [hosts.window, "beforeunload", onBeforeUnload as FlushListener],
    [hosts.window, "pagehide", onPageHide as FlushListener],
    [hosts.window, "online", onOnline as FlushListener],
    [hosts.document, "visibilitychange", onVisibilityChange as FlushListener],
  ];
  for (const [host, type, listener] of listeners)
    host.addEventListener(type, listener);
  return () => {
    for (const [host, type, listener] of listeners)
      host.removeEventListener(type, listener);
    void bridge.flush().catch(() => undefined);
  };
}
