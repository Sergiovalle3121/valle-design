/**
 * LA MATRIZ HONESTA DE LO QUE SIGUE PIDIENDO SERVIDOR.
 *
 * ## Por qué existe
 *
 * El estudio ya tiene cascarón sin red: `/sin-conexion` se precachea, el
 * service worker sirve la copia cuando la navegación no llega, el journal
 * guarda checkpoints en IndexedDB y el oyente de `online` reintenta el
 * guardado pendiente. Con todo eso ya es posible escribir en una página de
 * marketing la frase «funciona sin internet», y esa frase —dicha así, sin
 * frontera— sería falsa. La regla 3 de la campaña de cimientos existe por eso:
 * ninguna capacidad se anuncia sin la evidencia de su límite.
 *
 * Este módulo ES esa frontera, y es ejecutable. Cada familia de endpoint del
 * producto lleva un veredicto de tres —funciona sin red, degrada y reintenta,
 * requiere backend— con el flujo humano al lado y con los archivos donde se
 * puede comprobar. No es un documento: `offline-capability-matrix.spec.ts` lo
 * contrasta contra el contrato OpenAPI (autoridad, según AGENTS.md) y contra
 * `lib/cad/legacy/layout-http-adapter.ts`, que es la ÚNICA puerta del editor a
 * la red.
 *
 * ## Los dos defectos que un documento a mano no puede evitar
 *
 *   1. EL ENDPOINT SIN VEREDICTO. Alguien añade una familia nueva al contrato,
 *      el documento sigue diciendo lo mismo y nadie se entera de que la
 *      promesa sin red ya no cubre lo que el producto hace. Aquí falla el
 *      spec: toda ruta declarada en el contrato tiene que estar en una fila.
 *   2. EL ENDPOINT FANTASMA. La matriz clasifica una ruta que se borró hace
 *      seis meses, y la frontera describe un producto que ya no existe. Aquí
 *      también falla: cada endpoint tiene que estar declarado en el contrato Y
 *      aparecer en al menos uno de los archivos que su fila cita.
 *
 * ## La premisa que se importa en vez de copiarse
 *
 * `SW_NEVER_CACHE_PREFIXES` viene de la política del service worker de al
 * lado. La afirmación «esto funciona sin red» sólo puede sostenerla algo que
 * el worker no tenga que ir a buscar, y el worker declara `/v1/` como lo que
 * ni siquiera intercepta. Si mañana alguien decidiera cachear una respuesta de
 * `/v1/`, esta matriz dejaría de decir la verdad — y el spec lo grita en vez
 * de dejar la premisa escrita a mano en un comentario que nadie revisa.
 *
 * ## Lo que este módulo NO es
 *
 * No es una cola de sincronización ni el diseño de una. Describe lo que el
 * producto hace HOY. Un veredicto «requiere backend» no dice «esto nunca
 * funcionará sin red»: dice «hoy no funciona, y así es como se nota».
 */
import { SW_NEVER_CACHE_PREFIXES } from "./service-worker-policy";

/**
 * Los tres veredictos. No hay un cuarto a propósito: «funciona a medias» es
 * exactamente la frase que esta matriz existe para prohibir.
 *
 * - `funciona-sin-red`: el flujo entero ocurre en el navegador. No toca la red
 *   ni para empezar ni para terminar.
 * - `degrada-y-reintenta`: se nota que no hay red, el trabajo NO se pierde y
 *   algo concreto vuelve a intentarlo cuando la red vuelve. Ese «algo» se
 *   nombra en `reintento` y tiene que existir en el árbol.
 * - `requiere-backend`: sin red no pasa. Punto.
 */
export type VeredictoSinRed =
  | "funciona-sin-red"
  | "degrada-y-reintenta"
  | "requiere-backend";

/** Una familia de endpoint —o un flujo local— con su veredicto y su prueba. */
export interface FilaSinRed {
  /** Identificador estable. Se usa en la bitácora y en los specs; no se renombra por estética. */
  id: string;
  /** El flujo dicho como lo diría quien dibuja, no como lo llama el backend. */
  flujo: string;
  veredicto: VeredictoSinRed;
  /**
   * Familias de endpoint que el flujo toca, normalizadas (`:id` en cada
   * parámetro). Vacío SÓLO cuando el flujo no toca la red: es la manera de que
   * «funciona sin red» sea comprobable y no una opinión.
   */
  endpoints: readonly string[];
  /**
   * Archivos del árbol donde el veredicto se comprueba, desde la raíz del
   * repositorio. El spec exige que existan, y que entre ellos aparezca cada
   * endpoint de la fila.
   */
  evidencia: readonly string[];
  /** Por qué ese veredicto y no otro. */
  porque: string;
  /** Lo que la persona VE cuando no hay red. Una frontera que no se nota no sirve. */
  seNota: string;
  /** Obligatorio en `degrada-y-reintenta`, prohibido en el resto: qué dispara el reintento. */
  reintento?: string;
  /**
   * Escape declarado, no atajo: la familia existe en el contrato pero NINGÚN
   * código de navegador la llama (la atiende el servidor, o un flujo asistido
   * fuera del producto). Sin esta marca el spec exige una puerta real en
   * `apps/web/` o en `packages/design-sdk/`.
   */
  sinPuertaEnElNavegador?: true;
}

/**
 * LA MATRIZ.
 *
 * El orden es el del recorrido de alguien que abre el producto: primero lo que
 * pasa dentro del navegador, después el documento, después el equipo, y al
 * final la cuenta. No es alfabético a propósito — se lee de arriba abajo como
 * se lee una jornada de trabajo.
 */
export const MATRIZ_SIN_RED: readonly FilaSinRed[] = [
  /* ── Lo que ocurre entero dentro del navegador ─────────────────────────── */
  {
    id: "cascaron-de-la-sesion",
    flujo: "Recargar el estudio con el cable desconectado y ver una pantalla del producto",
    veredicto: "funciona-sin-red",
    endpoints: [],
    evidencia: [
      "apps/web/src/app/(sw)/service-worker-policy.ts",
      "apps/web/src/app/(sw)/sin-conexion/page.tsx",
    ],
    porque:
      "El cascarón (`/sin-conexion`, el manifiesto, los iconos y las dos woff2) se precachea en `install` y la navegación cae a la copia. La evidencia son la POLÍTICA y la página, no `service-worker-source.ts`: el cuerpo del worker sí llama a la red —es `network-first` con caída a la copia— y este veredicto se sostiene en lo que ya está guardado, no en esa llamada. Con una condición que hay que decir entera: el estudio abre sin red DESPUÉS de haberse abierto una vez CON red; una primera visita sin conexión sigue sin poder abrir nada.",
    seNota:
      "En vez de la página de error del navegador sale `/sin-conexion`, con su marca y su tipografía, diciendo qué sí y qué no.",
  },
  {
    id: "dibujar-acotar-modelar",
    flujo: "Dibujar, acotar, referenciar a objeto y empujar caras en 3D",
    veredicto: "funciona-sin-red",
    endpoints: [],
    evidencia: [
      "apps/web/src/lib/cad/commands/registry.ts",
      "apps/web/src/lib/cad/snap-engine.ts",
      "apps/web/src/lib/brep/index.ts",
    ],
    porque:
      "El motor 2D, el registro de frases y el B-rep facetado son TypeScript que corre en la pestaña. Ninguno consulta al servidor para trazar una línea, resolver una referencia a objeto o extruir una cara.",
    seNota: "Nada. Es el único trozo del producto donde la red no se echa de menos.",
  },
  {
    id: "diario-de-recuperacion",
    flujo: "Recuperar el borrador después de un cierre inesperado",
    veredicto: "funciona-sin-red",
    endpoints: [],
    evidencia: [
      "apps/web/src/lib/cad/cad-recovery.ts",
      "apps/web/src/lib/cad/cad-recovery-journal.ts",
    ],
    porque:
      "El journal vive en IndexedDB, indexado por ámbito y por carril de pestaña. Escribir y podar checkpoints no toca la red en ningún momento.",
    seNota:
      "La barra de estado dice desde cuándo hay borrador local. El aviso honesto es de dónde vive: este navegador y este perfil, no la cuenta.",
  },
  {
    id: "exportar-dxf-en-el-navegador",
    flujo: "Exportar el dibujo a DXF y bajárselo",
    veredicto: "funciona-sin-red",
    endpoints: [],
    evidencia: [
      "apps/web/src/lib/cad/dxf-document-export.ts",
      "apps/web/src/lib/cad/dxf-export-loss-manifest.ts",
    ],
    porque:
      "El escritor DXF del producto es un módulo puro: ensambla el archivo —con su manifiesto de pérdidas— desde el documento que ya está en memoria. La ruta de servidor equivalente existe en el contrato y HOY no la llama ninguna pantalla (ver `exportar-dxf-en-servidor`).",
    seNota: "Nada: el archivo se genera y se descarga igual.",
  },
  {
    id: "importar-desde-el-disco",
    flujo: "Abrir un DXF que llegó por correo",
    veredicto: "funciona-sin-red",
    endpoints: [],
    evidencia: ["apps/web/src/lib/cad/dxf-import.ts", "apps/web/src/lib/cad/dxf-import-report.ts"],
    porque:
      "La importación lee el archivo que la persona elige del disco y lo convierte en el documento canónico dentro de la pestaña. Lo que no se puede sin red es GUARDAR el resultado (ver `guardar-el-dibujo`).",
    seNota: "Nada al importar. El informe de importación sale igual, con sus avisos y sus pérdidas.",
  },
  {
    id: "historial-de-comandos",
    flujo: "Deshacer, rehacer y repetir la última orden",
    veredicto: "funciona-sin-red",
    endpoints: [],
    evidencia: ["apps/web/src/lib/cad/command-session.ts"],
    porque:
      "La sesión de comandos y su historial se serializan en el almacenamiento local del navegador. El servidor nunca ha participado en el deshacer.",
    seNota:
      "Nada, ni siquiera al recargar: el historial se rehidrata del almacenamiento local, que sigue ahí sin red.",
  },
  {
    id: "biblioteca-lisp-local",
    flujo: "Guardar y volver a cargar una rutina LISP propia",
    veredicto: "funciona-sin-red",
    endpoints: [],
    evidencia: ["apps/web/src/components/cad/lisp/library-storage.ts"],
    porque:
      "No hay endpoint de LISP en el contrato y el módulo lo dice con todas sus letras: la biblioteca es local por decisión, no por descuido. Por eso funciona sin red — y por eso no viaja a otra máquina.",
    seNota:
      "Nada mientras se trabaje en el mismo navegador. Cambiar de equipo sí se nota: las rutinas no están allí, con red o sin ella.",
  },

  /* ── El documento ──────────────────────────────────────────────────────── */
  {
    id: "abrir-el-dibujo",
    flujo: "Abrir un dibujo guardado",
    veredicto: "requiere-backend",
    endpoints: [
      "/v1/cad/documents",
      "/v1/cad/documents/:id",
      "/v1/cad/documents/:id/provisional",
    ],
    porque:
      "Y aquí está la frontera que más incomoda, porque el borrador SÍ está en la máquina: el efecto que ofrece la recuperación arranca con `if (!open || !data || ...) return`, o sea que sólo corre DESPUÉS de que el documento del servidor haya cargado. Sin ese GET no hay contra qué comparar el checkpoint, y el journal —que tiene el trabajo— no se llega a mirar.",
    seNota:
      "El estudio no llega a montar el documento; si la navegación es la que falla, sale `/sin-conexion`. El trabajo sigue en IndexedDB y vuelve a ofrecerse en cuanto el dibujo abre con red.",
    evidencia: [
      "apps/web/src/lib/cad/legacy/layout-http-adapter.ts",
      "apps/web/src/lib/cad/repositories/documents.ts",
      "packages/design-sdk/src/client.ts",
      "apps/web/src/components/cad/editor/Layout3DEditor.tsx",
    ],
  },
  {
    id: "guardar-el-dibujo",
    flujo: "Guardar lo dibujado (a mano o por autosave)",
    veredicto: "degrada-y-reintenta",
    endpoints: ["/v1/cad/documents/:id/content", "/v1/cad/documents/:id/archive"],
    porque:
      "El `PUT` falla, el editor lo marca pendiente y el journal conserva el trabajo. Es el ÚNICO flujo del producto con las tres piezas completas: aviso honesto, copia local y reintento automático.",
    seNota:
      "«Sin conexión · cambios pendientes» en la barra de estado, y el aviso de guardado dice qué pasó, dónde está el trabajo y qué hacer — no el `Failed to fetch` del navegador.",
    reintento:
      "El oyente de `online` de `document-lifecycle/connectivity.ts` fuerza el flush de la cola de un solo escritor. Sin él pasaban 30 s desde que vuelve el cable sin que saliera una sola petición (medido en `e2e/real/cad-offline-multitab.spec.ts`).",
    evidencia: [
      "apps/web/src/lib/cad/legacy/layout-http-adapter.ts",
      "apps/web/src/components/cad/document-lifecycle/connectivity.ts",
      "apps/web/src/components/cad/document-lifecycle/save-failure.ts",
      "packages/design-sdk/src/client.ts",
    ],
  },
  {
    id: "historial-de-versiones",
    flujo: "Mirar el historial de versiones del servidor y volver a una",
    veredicto: "requiere-backend",
    endpoints: ["/v1/cad/documents/:id/versions", "/v1/cad/documents/:id/versions/:id"],
    porque:
      "La historia CAS es inmutable y vive en el servidor. Lo local son los checkpoints del journal, que son otra cosa: un borrador reciente por carril, no la línea de versiones del documento.",
    seNota: "El panel de versiones no carga. Los checkpoints locales siguen ahí y se dicen aparte.",
    evidencia: [
      "apps/web/src/lib/cad/repositories/versions.ts",
      "packages/design-sdk/src/client.ts",
    ],
  },
  {
    id: "publicar-una-revision",
    flujo: "Publicar una revisión del plano",
    veredicto: "requiere-backend",
    endpoints: ["/v1/cad/documents/:id/publications"],
    porque:
      "Publicar es un acto del servidor: fija una versión, la sella y la deja disponible para los demás. Nada de eso tiene sentido en una pestaña aislada.",
    seNota: "La acción falla con el aviso de guardado; el dibujo no cambia.",
    evidencia: [
      "apps/web/src/lib/cad/legacy/layout-http-adapter.ts",
      "apps/web/src/lib/cad/repositories/publications.ts",
    ],
  },
  {
    id: "dxf-adjunto-al-documento",
    flujo: "Adjuntar, reemplazar o quitar el DXF de referencia del documento",
    veredicto: "requiere-backend",
    endpoints: ["/v1/cad/documents/:id/dxf"],
    porque:
      "El DXF adjunto se guarda junto al documento en el servidor, con el mismo CAS. Es persistencia, no lectura de archivo.",
    seNota: "La operación falla. El DXF que ya estaba cargado en la pestaña se sigue viendo.",
    evidencia: [
      "apps/web/src/lib/cad/legacy/layout-http-adapter.ts",
      "packages/design-sdk/src/client.ts",
    ],
  },
  {
    id: "exportar-dxf-en-servidor",
    flujo: "Pedirle al servidor el DXF del documento guardado",
    veredicto: "requiere-backend",
    endpoints: ["/v1/cad/documents/:id/export/dxf"],
    porque:
      "Existe en el contrato y en el SDK, y hoy NINGUNA pantalla la llama: el estudio exporta en el navegador. Se clasifica igual porque una familia sin veredicto es exactamente el hueco que esta matriz cierra.",
    seNota:
      "Nada, porque nadie la usa desde la interfaz. Si algún día una pantalla la usa, este veredicto es su frontera.",
    evidencia: ["packages/design-sdk/src/client.ts"],
  },
  {
    id: "biblioteca-de-bloques-del-equipo",
    flujo: "Buscar un bloque del equipo e insertarlo",
    veredicto: "requiere-backend",
    endpoints: ["/v1/cad/blocks", "/v1/cad/blocks/:id"],
    porque:
      "El catálogo es del tenant y vive en el servidor. No hay copia local del catálogo: cachearlo sería enseñar el catálogo de OTRA organización en el disco de ésta, que es justo lo que la política del worker prohíbe.",
    seNota:
      "El catálogo sale vacío. Los bloques YA insertados en este dibujo se siguen colocando y editando: sus definiciones viajan dentro del documento.",
    evidencia: [
      "apps/web/src/lib/cad/legacy/layout-http-adapter.ts",
      "apps/web/src/lib/cad/repositories/blocks.ts",
    ],
  },
  {
    id: "conjuntos-de-planos",
    flujo: "Armar el conjunto de planos de la entrega",
    veredicto: "requiere-backend",
    endpoints: ["/v1/cad/sheet-sets", "/v1/cad/sheet-sets/:id"],
    porque: "El conjunto es una entidad del servidor que agrupa documentos de la organización.",
    seNota: "El panel no carga y no se puede añadir ni quitar láminas.",
    evidencia: [
      "apps/web/src/lib/cad/repositories/sheet-sets.ts",
      "packages/design-sdk/src/client.ts",
    ],
  },
  {
    id: "proyectos",
    flujo: "Ordenar los dibujos por proyecto",
    veredicto: "requiere-backend",
    endpoints: ["/v1/cad/projects", "/v1/cad/projects/:id"],
    porque: "El árbol de proyectos es del tenant y sólo el servidor lo conoce.",
    seNota: "La lista de proyectos no carga.",
    evidencia: ["packages/design-sdk/src/client.ts"],
  },

  /* ── El equipo ─────────────────────────────────────────────────────────── */
  {
    id: "enlace-de-revision",
    flujo: "Mandar un enlace de revisión y atender lo que el revisor comenta",
    veredicto: "requiere-backend",
    endpoints: [
      "/v1/cad/documents/:id/review-sessions",
      "/v1/cad/review-sessions/:id/close",
      "/v1/cad/review/context",
      "/v1/cad/review/comments",
      "/v1/cad/review/comments/:id/resolve",
    ],
    porque:
      "El enlace es propiedad del servidor: el token en claro sólo existe en la respuesta que lo crea, y el canje del contexto de sólo lectura es una llamada con `X-Review-Token`. Sin servidor no hay ni enlace ni revisor.",
    seNota:
      "Crear, abrir o cerrar una revisión falla, y el revisor del otro lado no ve nada nuevo hasta que la conexión vuelve.",
    evidencia: [
      "apps/web/src/lib/cad/legacy/layout-http-adapter.ts",
      "apps/web/src/lib/cad/repositories/reviews.ts",
      "packages/design-sdk/src/client.ts",
    ],
  },
  {
    id: "comentarios-sobre-el-plano",
    flujo: "Comentar sobre un punto del plano y darlo por resuelto",
    veredicto: "requiere-backend",
    endpoints: ["/v1/cad/documents/:id/comments", "/v1/cad/comments/:id/resolve"],
    porque:
      "Un comentario es para otra persona: nace en el servidor o no nace. Guardarlo local sería prometer una conversación que nadie recibe.",
    seNota: "El hilo no carga y el botón de comentar falla. El anclaje al punto del plano es local y no se pierde.",
    evidencia: ["packages/design-sdk/src/client.ts"],
  },
  {
    id: "presencia-en-el-dibujo",
    flujo: "Ver quién más está en el dibujo y dónde tiene el cursor",
    veredicto: "degrada-y-reintenta",
    endpoints: ["/v1/cad/documents/:id/presence", "/v1/cad/documents/:id/presence/stream"],
    porque:
      "El stream se corta y la presencia remota se apaga; nada que sea del usuario se pierde, porque la presencia es efímera por definición.",
    seNota:
      "Los cursores de los demás desaparecen. Entre pestañas del MISMO navegador la presencia sigue viéndose: ese camino es `BroadcastChannel`, no la red.",
    reintento:
      "`EventSource` reintenta solo el corte de red, y `collab/server-presence-channel.ts` añade lo que el navegador no hace: detecta el cierre DEFINITIVO (`readyState === CLOSED`) y reabre con backoff de 1 s a 15 s.",
    evidencia: [
      "apps/web/src/lib/cad/collab/server-presence-channel.ts",
      "apps/web/src/lib/cad/collab/presence-channel.ts",
      "packages/design-sdk/src/presence.ts",
    ],
  },
  {
    id: "mensajeria-del-equipo",
    flujo: "Leer y escribir en los canales del equipo",
    veredicto: "requiere-backend",
    endpoints: [
      "/v1/messaging/channels",
      "/v1/messaging/channels/:id/messages",
      "/v1/messaging/channels/:id/read",
    ],
    porque:
      "No hay cola de salida: `send()` llama y devuelve `false` si falla. Un mensaje encolado en silencio que se entrega media hora tarde es peor que uno que no salió, porque nadie sabe cuál de los dos pasó.",
    seNota: "El envío falla y el texto se queda en la caja. La lista de canales tampoco carga.",
    evidencia: [
      "apps/web/src/components/cad/messaging/use-team-messaging.ts",
      "packages/design-sdk/src/messaging.ts",
    ],
  },
  {
    id: "mensajes-en-vivo",
    flujo: "Que un mensaje nuevo aparezca solo, sin recargar",
    veredicto: "degrada-y-reintenta",
    endpoints: ["/v1/messaging/events"],
    porque:
      "Es `EventSource` con la cookie de sesión: el navegador reintenta la conexión por su cuenta y el panel se marca desconectado mientras tanto.",
    seNota:
      "El panel se marca desconectado y deja de llegar nada. Al volver la conexión llegan los mensajes NUEVOS; los del hueco aparecen cuando el canal se vuelve a listar, no por el stream.",
    reintento:
      "La reconexión nativa de `EventSource`; `onopen` vuelve a marcar conectado. No hay puesta al día automática del hueco, y por eso se dice aquí.",
    evidencia: [
      "apps/web/src/components/cad/messaging/use-team-messaging.ts",
      "packages/design-sdk/src/messaging.ts",
    ],
  },
  {
    id: "llamada-y-pantalla-compartida",
    flujo: "Entrar a una llamada del dibujo y compartir pantalla",
    veredicto: "requiere-backend",
    endpoints: ["/v1/calls/rooms", "/v1/calls/rooms/:id/leave", "/v1/calls/rooms/:id/signals"],
    porque:
      "Unirse, salir y señalizar son llamadas HTTP, y el medio en sí viaja por la red entre pares. Una llamada sin red no degrada: no existe.",
    seNota: "La barra de llamada dice «sin conexión» y no se puede entrar a la sala.",
    evidencia: [
      "apps/web/src/lib/cad/calls/call-signaling-transport.ts",
      "packages/design-sdk/src/calls.ts",
    ],
  },
  {
    id: "senalizacion-de-la-llamada",
    flujo: "Que la llamada aguante un microcorte sin echar a nadie",
    veredicto: "degrada-y-reintenta",
    endpoints: ["/v1/calls/rooms/:id/events"],
    porque:
      "El stream de señalización es `EventSource`, que reintenta solo. El transporte distingue el corte pasajero del abandono definitivo y sólo avisa en el segundo caso: reportar cada microcorte como llamada perdida sería mentir en la dirección contraria.",
    seNota: "Un corte breve no se nota. Uno definitivo levanta `call_signaling_lost` y la barra lo dice.",
    reintento:
      "La reconexión nativa de `EventSource`; `call-signaling-transport.ts` sólo llama a `onError` cuando `readyState === CLOSED`, o sea cuando el navegador ya se rindió.",
    evidencia: [
      "apps/web/src/lib/cad/calls/call-signaling-transport.ts",
      "packages/design-sdk/src/calls.ts",
    ],
  },

  /* ── La cuenta ─────────────────────────────────────────────────────────── */
  {
    id: "iniciar-sesion",
    flujo: "Entrar a la cuenta y cerrar la sesión",
    veredicto: "requiere-backend",
    endpoints: [
      "/v1/auth/register",
      "/v1/auth/login",
      "/v1/auth/login/mfa",
      "/v1/auth/session",
      "/v1/auth/logout",
    ],
    porque:
      "La sesión es una cookie OPACA: el navegador no puede validarla por su cuenta ni sabe qué permisos lleva. Cachear la respuesta de sesión sería inventarse una identidad.",
    seNota:
      "No se puede entrar ni salir. Quien ya tenía la sesión abierta conserva la cookie, pero cualquier pantalla que la verifique contra el servidor falla.",
    evidencia: ["packages/design-sdk/src/identity.ts"],
  },
  {
    id: "cuidar-la-cuenta",
    flujo: "Revisar sesiones abiertas, actividad y segundo factor",
    veredicto: "requiere-backend",
    endpoints: [
      "/v1/auth/sessions",
      "/v1/auth/sessions/:id",
      "/v1/auth/sessions/rotate",
      "/v1/auth/sessions/revoke-all",
      "/v1/auth/activity",
      "/v1/auth/mfa",
      "/v1/auth/mfa/setup",
      "/v1/auth/mfa/activate",
      "/v1/auth/mfa/disable",
      "/v1/auth/mfa/backup-codes",
    ],
    porque:
      "Son operaciones de seguridad sobre estado del servidor. Una respuesta cacheada aquí no es un dato viejo: es decirle a alguien que revocó una sesión que sigue revocada cuando quizá no lo está.",
    seNota: "Las pantallas de seguridad de la cuenta no cargan.",
    evidencia: ["packages/design-sdk/src/identity.ts"],
  },
  {
    id: "recuperar-el-acceso",
    flujo: "Verificar el correo o restablecer la contraseña",
    veredicto: "requiere-backend",
    endpoints: [
      "/v1/auth/verify-email",
      "/v1/auth/verify-email/resend",
      "/v1/auth/password/forgot",
      "/v1/auth/password/reset",
    ],
    porque:
      "El token viaja por correo desde el servidor, como registro transaccional del outbox. Sin red no hay a quién pedírselo ni con quién canjearlo.",
    seNota: "El formulario falla al enviar.",
    evidencia: ["packages/design-sdk/src/identity.ts"],
  },
  {
    id: "organizacion-y-equipo",
    flujo: "Cambiar de organización, invitar a alguien o aceptar una invitación",
    veredicto: "requiere-backend",
    endpoints: [
      "/v1/organizations",
      "/v1/organizations/active",
      "/v1/organizations/:id/memberships",
      "/v1/organizations/:id/invitations",
      "/v1/organizations/invitations/accept",
    ],
    porque:
      "La membresía se verifica en el servidor SIEMPRE: `organization.id` es el identificador de tenant y nada del navegador puede fijarlo. Es un invariante de AGENTS.md, no una limitación de esta campaña.",
    seNota: "No se puede cambiar de organización ni gestionar el equipo.",
    evidencia: ["packages/design-sdk/src/client.ts"],
  },
  {
    id: "permiso-de-uso-y-suscripcion",
    flujo: "Saber si la suscripción da acceso al CAD",
    veredicto: "requiere-backend",
    endpoints: [
      "/v1/commercial/subscription",
      "/v1/commercial/entitlements",
      "/v1/commercial/plans",
      "/v1/commercial/subscription/cancel",
    ],
    porque:
      "El permiso `design.cad` lo deriva el servidor y las pruebas vencidas deniegan acceso. Guardar un permiso en el disco del cliente es exactamente el defecto que convierte una suscripción caducada en una activa.",
    seNota:
      "Las pantallas de cuenta no cargan. Una pestaña ya abierta sigue dibujando: el permiso se comprobó al entrar.",
    evidencia: ["packages/design-sdk/src/commercial.ts"],
  },
  {
    id: "precios-publicos",
    flujo: "Mirar los planes y sus precios antes de contratar",
    veredicto: "requiere-backend",
    endpoints: ["/v1/commercial/public/plans", "/v1/commercial/public/tax-catalogs"],
    porque:
      "Es catálogo público y podría cachearse, pero un precio es un dato que no puede salir viejo: enseñar el del mes pasado es una oferta que el producto no va a honrar. Hoy se pide siempre a la red.",
    seNota: "La página de precios no llega a pintar sus cifras.",
    evidencia: [
      "apps/web/src/lib/commercial/public-catalog.ts",
      "packages/design-sdk/src/commercial.ts",
    ],
  },
  {
    id: "pagar-y-facturar",
    flujo: "Pagar, bajar una factura o su CFDI",
    veredicto: "requiere-backend",
    endpoints: [
      "/v1/commercial/checkout-sessions",
      "/v1/commercial/billing-portal-sessions",
      "/v1/commercial/invoices",
      "/v1/commercial/tax-profile",
      "/v1/commercial/cfdi",
      "/v1/commercial/cfdi/:id/files/:id",
    ],
    porque:
      "Cobro y comprobante fiscal son del servidor y de su proveedor de pago. El CFDI además es un documento con validez legal: una copia local sin verificar no es un comprobante.",
    seNota: "No se puede iniciar un pago ni descargar una factura.",
    evidencia: ["packages/design-sdk/src/commercial.ts"],
  },
  {
    id: "alta-de-plan-asistida",
    flujo: "Cambiar de plan con ayuda de alguien del equipo comercial",
    veredicto: "requiere-backend",
    endpoints: [
      "/v1/commercial/upgrade-intents",
      "/v1/commercial/upgrade-intents/:id/confirm",
      "/v1/commercial/upgrade-intents/:id/cancel",
    ],
    sinPuertaEnElNavegador: true,
    porque:
      "El cobro asistido ocurre FUERA del producto y se registra por esta familia; ninguna pantalla del navegador la llama hoy. Se clasifica igual porque existe en el contrato y una familia sin veredicto es un hueco en la frontera.",
    seNota: "Nada en el navegador: no hay pantalla que dependa de ella.",
    evidencia: [
      "packages/contracts/specs/design-api.v1.yaml",
      "packages/design-sdk/src/generated/design-api.ts",
    ],
  },
  {
    id: "cobro-confirmado-por-el-proveedor",
    flujo: "Que el pago hecho en la pasarela quede reflejado en la cuenta",
    veredicto: "requiere-backend",
    endpoints: ["/v1/commercial/webhooks/stripe"],
    sinPuertaEnElNavegador: true,
    porque:
      "Es un webhook firmado de servidor a servidor. El navegador no lo llama nunca —ni podría: la firma se verifica sobre el cuerpo crudo con el secreto del proveedor.",
    seNota: "Nada en el navegador. Sin red del SERVIDOR el pago se confirma tarde, no se pierde: la entrega es al menos una vez.",
    evidencia: [
      "packages/contracts/specs/design-api.v1.yaml",
      "packages/design-sdk/src/generated/design-api.ts",
    ],
  },
  {
    id: "aceptar-terminos",
    flujo: "Leer y aceptar los términos y el aviso de privacidad",
    veredicto: "requiere-backend",
    endpoints: ["/v1/legal/documents", "/v1/legal/acceptances"],
    porque:
      "La aceptación es un registro con fecha y versión del documento: sólo vale si el servidor la guardó. Una aceptación local no es una aceptación.",
    seNota: "La compuerta legal no puede resolverse y el flujo que la exige se queda esperando.",
    evidencia: [
      "apps/web/src/lib/legal/acceptance-gate.ts",
      "packages/design-sdk/src/client.ts",
    ],
  },
  {
    id: "reportar-y-opinar",
    flujo: "Reportar un problema o mandar una opinión",
    veredicto: "requiere-backend",
    endpoints: ["/v1/support/incidents", "/v1/feedback", "/v1/feedback/mine", "/v1/feedback/:id"],
    porque:
      "El reporte es para que alguien lo lea. Guardarlo en el navegador y no decirlo sería prometer una respuesta que nadie va a dar.",
    seNota:
      "El envío falla y lo dice. Es la peor frontera de la lista, porque el momento en que alguien reporta suele ser el momento en que algo va mal.",
    evidencia: ["packages/design-sdk/src/client.ts"],
  },
];

/**
 * LO QUE `/sin-conexion` LE PROMETE A QUIEN LA LEE, atado a la matriz.
 *
 * La pantalla nombra tres cosas que funcionan y tres que no. Esas seis frases
 * son copy —viven en `messages/{en,es}/offline.json`— y el copy se puede
 * cambiar sin tocar una línea de código. Esta tabla es lo que impide que la
 * pantalla y la matriz se separen: si un veredicto cambia aquí, o si alguien
 * borra la clave de allí, el spec falla y hay que decidir a propósito cuál de
 * las dos estaba mintiendo.
 */
export const PROMESAS_DE_SIN_CONEXION: readonly {
  /** Clave del namespace `offline`, tal cual aparece en el catálogo. */
  clave: string;
  /** La fila de esta matriz que sostiene esa frase. */
  fila: string;
  veredicto: VeredictoSinRed;
}[] = [
  { clave: "works.drawTitle", fila: "dibujar-acotar-modelar", veredicto: "funciona-sin-red" },
  { clave: "works.journalTitle", fila: "diario-de-recuperacion", veredicto: "funciona-sin-red" },
  { clave: "works.retryTitle", fila: "guardar-el-dibujo", veredicto: "degrada-y-reintenta" },
  { clave: "blocked.saveTitle", fila: "guardar-el-dibujo", veredicto: "degrada-y-reintenta" },
  {
    clave: "blocked.blocksTitle",
    fila: "biblioteca-de-bloques-del-equipo",
    veredicto: "requiere-backend",
  },
  { clave: "blocked.reviewTitle", fila: "enlace-de-revision", veredicto: "requiere-backend" },
];

/* ── Extracción y normalización de rutas ───────────────────────────────────
   Lo que sigue es lo que convierte esta matriz en algo comprobable contra el
   código en vez de contra la memoria de quien la escribió. */

/**
 * Un segmento de ruta tal y como aparece en el ÁRBOL, no en una URL: puede ser
 * literal (`documents`), un parámetro de OpenAPI (`{documentId}`), un
 * parámetro ya normalizado (`:id`) o una interpolación de plantilla completa
 * —`${encodeURIComponent(model)}`, paréntesis incluidos—, porque las rutas
 * reales se escriben así en TypeScript.
 */
const SEGMENTO = String.raw`(?:\$\{[^}]*\}|\{[A-Za-z][A-Za-z0-9]*\}|:[A-Za-z][A-Za-z0-9]*|[A-Za-z0-9_.*-]+)`;

/** `/v1` seguido de al menos un segmento. El `g` se recrea en cada llamada a propósito. */
function expresionDeRuta(): RegExp {
  return new RegExp(String.raw`/v1(?:/${SEGMENTO})+`, "g");
}

/**
 * Toda parte variable se colapsa a `:id`.
 *
 * Se pierde el NOMBRE del parámetro (`{documentId}` y `{version}` acaban
 * iguales) y es una pérdida aceptada: el contrato de hoy no tiene dos rutas que
 * sólo se distingan por el nombre de un parámetro, y `documents/:id/versions/:id`
 * sigue siendo inconfundible. A cambio, la misma ruta escrita en YAML, en el
 * SDK y en el adaptador se reduce siempre a la misma cadena, que es la única
 * forma de compararlas sin una tabla de sinónimos escrita a mano.
 */
export function normalizaRutaV1(ruta: string): string {
  const segmentos = ruta
    .split("/")
    .filter(Boolean)
    .map((segmento) =>
      segmento.startsWith("${") || segmento.startsWith("{") || segmento.startsWith(":")
        ? ":id"
        : segmento,
    );
  return `/${segmentos.join("/")}`;
}

/**
 * Todas las rutas del área `/v1` que aparecen en un texto, normalizadas y sin
 * repetir. Las que llevan comodín (`/v1/cad/*`, que es como los comentarios
 * hablan de un ÁREA entera) se descartan: no son endpoints.
 */
export function extraeRutasV1(texto: string): readonly string[] {
  const encontradas = new Set<string>();
  for (const coincidencia of texto.matchAll(expresionDeRuta())) {
    const cruda = coincidencia[0];
    if (cruda.includes("*")) continue;
    encontradas.add(normalizaRutaV1(cruda));
  }
  return [...encontradas].sort();
}

/** Las rutas que el contrato OpenAPI declara, que es la autoridad (AGENTS.md). */
export function rutasDeclaradasEnContrato(yaml: string): readonly string[] {
  const declaradas = new Set<string>();
  for (const linea of yaml.split("\n")) {
    const coincidencia = /^ {2}(\/v1\/[^\s:]+):\s*$/.exec(linea);
    if (coincidencia) declaradas.add(normalizaRutaV1(coincidencia[1]));
  }
  return [...declaradas].sort();
}

/**
 * Qué es una ruta extraída de un archivo, a la luz del contrato.
 *
 * `prefijo` es la categoría que evita el falso positivo más molesto: el código
 * y los comentarios mencionan áreas enteras (`"/v1/auth/"` en la lista de
 * prefijos del SDK, «el contrato /v1/cad» en la cabecera del adaptador) y eso
 * no es una ruta sin clasificar. Se deriva del propio contrato en vez de
 * escribirse a mano: prefijo es lo que NO está declarado pero es principio de
 * algo declarado. Así, si mañana aparece una ruta del área CAD que el contrato
 * no conoce, no se cuela como «prefijo»: sale `desconocida` y el spec lo grita.
 */
export function clasificaRuta(
  ruta: string,
  declaradas: readonly string[],
): "endpoint" | "prefijo" | "desconocida" {
  if (declaradas.includes(ruta)) return "endpoint";
  if (declaradas.some((declarada) => declarada.startsWith(`${ruta}/`))) return "prefijo";
  return "desconocida";
}

/* ── Consultas sobre la matriz ─────────────────────────────────────────────── */

/** ¿Esta ruta cae en la superficie que el service worker ni siquiera intercepta? */
export function tocaLaRed(endpoint: string): boolean {
  return SW_NEVER_CACHE_PREFIXES.some((prefijo) => endpoint.startsWith(prefijo));
}

/** Todos los endpoints clasificados, sin repetir. */
export function endpointsClasificados(): readonly string[] {
  return [...new Set(MATRIZ_SIN_RED.flatMap((fila) => fila.endpoints))].sort();
}

/** La fila que clasifica este endpoint, o `null` si ninguna lo hace. */
export function filaDelEndpoint(endpoint: string): FilaSinRed | null {
  return MATRIZ_SIN_RED.find((fila) => fila.endpoints.includes(endpoint)) ?? null;
}

/** La fila con este identificador, o `null`. */
export function filaPorId(id: string): FilaSinRed | null {
  return MATRIZ_SIN_RED.find((fila) => fila.id === id) ?? null;
}

/** El recuento que se copia a la bitácora. Se calcula; no se escribe a mano. */
export function resumenSinRed(): {
  filas: number;
  funcionaSinRed: number;
  degradaYReintenta: number;
  requiereBackend: number;
  endpoints: number;
} {
  const cuenta = (veredicto: VeredictoSinRed) =>
    MATRIZ_SIN_RED.filter((fila) => fila.veredicto === veredicto).length;
  return {
    filas: MATRIZ_SIN_RED.length,
    funcionaSinRed: cuenta("funciona-sin-red"),
    degradaYReintenta: cuenta("degrada-y-reintenta"),
    requiereBackend: cuenta("requiere-backend"),
    endpoints: endpointsClasificados().length,
  };
}

/**
 * Una línea por fila, en el orden de la matriz. Es lo que se pega en la
 * bitácora o en un informe sin volver a redactar nada — la regla 4 de la
 * campaña dice que ninguna cifra vive en dos sitios, y esto es la fuente.
 */
export function matrizComoTexto(): string {
  return MATRIZ_SIN_RED.map((fila) => {
    const rutas = fila.endpoints.length ? fila.endpoints.join(" ") : "(no toca la red)";
    return `${fila.veredicto}\t${fila.flujo}\t${rutas}`;
  }).join("\n");
}
