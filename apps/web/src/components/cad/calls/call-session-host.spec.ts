/**
 * LAS SEÑALES DE UN PAR SE ATIENDEN EN FILA, Y NINGÚN CANDIDATO SE PIERDE.
 *
 * ## El defecto, medido
 *
 * `onWireEvent` atendía cada señal con `void handleIncomingSignal(...)`: sin
 * esperar a la anterior. Un `ice-candidate` que llega pisando los talones a la
 * oferta entra en `addIceCandidate` mientras `setRemoteDescription` sigue en
 * vuelo; el navegador lanza `InvalidStateError` y ESE CANDIDATO SE PIERDE.
 *
 * No hay error en la consola ni aviso en pantalla: la llamada se queda en
 * «Conectando…» para siempre y el usuario concluye que las llamadas «a veces no
 * van». Medido el 2026-09-03 en este árbol, con la prueba de dos navegadores
 * reales (`e2e/real/llamada-webrtc-real.spec.ts`): 1 fallo de cada 4 corridas,
 * los dos extremos viéndose en la sala y ningún enlace llegando a `connected`.
 * Y la pila de llamadas es IDÉNTICA a la de `main` —comprobado con `git diff`—,
 * así que no lo trajo ninguna ola: llevaba ahí desde que existe.
 *
 * ## Por qué esta prueba y no la de dos navegadores
 *
 * Una carrera que falla 1 de cada 4 no se fija con una prueba de navegador: se
 * fija con un `RTCPeerConnection` de mentira que SIEMPRE llega tarde. Aquí
 * `setRemoteDescription` tarda tres vueltas del bucle de eventos y
 * `addIceCandidate` se NIEGA sin descripción remota, igual que el navegador.
 * Con eso, el defecto es determinista y el arreglo se puede medir.
 */
import { strict as assert } from "node:assert";

// El módulo construye `MediaStream` al crear un par. En Node no existe: se le
// da el mínimo que usa (añadir y listar pistas), porque lo que se mide aquí es
// la negociación, no los medios.
class FakeMediaStream {
  private tracks: unknown[] = [];
  addTrack(track: unknown) {
    this.tracks.push(track);
  }
  getTracks() {
    return this.tracks;
  }
}
(globalThis as { MediaStream?: unknown }).MediaStream ??= FakeMediaStream;

type HostModule = typeof import("./call-session-host");
type WireEvent = Parameters<
  Parameters<
    NonNullable<
      Parameters<HostModule["createCallSessionHost"]>[0]["signaling"]
    >["connect"]
  >[2]
>[0];

let verdes = 0;
const ok = (condicion: unknown, mensaje: string) => {
  assert.ok(condicion, mensaje);
  verdes += 1;
};
const eq = (actual: unknown, esperado: unknown, mensaje: string) => {
  assert.equal(actual, esperado, mensaje);
  verdes += 1;
};

/** Espera a que se vacíe la cola de microtareas unas cuantas vueltas. */
const asentar = async (vueltas = 30) => {
  for (let i = 0; i < vueltas; i += 1) await new Promise((r) => setTimeout(r, 0));
};

/**
 * Un `RTCPeerConnection` que se comporta como el de verdad EN LO QUE IMPORTA:
 * `setRemoteDescription` tarda, y `addIceCandidate` se niega mientras no haya
 * descripción remota. Nada más — no se simula ICE ni medios.
 */
function fakePeerConnection() {
  const aceptados: RTCIceCandidateInit[] = [];
  const rechazados: RTCIceCandidateInit[] = [];
  const pc = {
    remoteDescription: null as RTCSessionDescriptionInit | null,
    localDescription: null as RTCSessionDescriptionInit | null,
    signalingState: "stable" as RTCSignalingState,
    iceConnectionState: "new" as RTCIceConnectionState,
    onnegotiationneeded: null as (() => void) | null,
    onicecandidate: null as ((e: { candidate: unknown }) => void) | null,
    ontrack: null as ((e: unknown) => void) | null,
    oniceconnectionstatechange: null as (() => void) | null,
    aceptados,
    rechazados,
    async setRemoteDescription(description: RTCSessionDescriptionInit) {
      // TRES vueltas del bucle: el hueco por el que se colaba el candidato.
      await asentar(3);
      pc.remoteDescription = description;
    },
    async setLocalDescription(description?: RTCSessionDescriptionInit) {
      pc.localDescription = description ?? { type: "offer", sdp: "local" };
    },
    async createOffer() {
      return { type: "offer" as const, sdp: "oferta" };
    },
    async createAnswer() {
      return { type: "answer" as const, sdp: "respuesta" };
    },
    async addIceCandidate(candidate: RTCIceCandidateInit) {
      if (!pc.remoteDescription) {
        rechazados.push(candidate);
        throw new Error("InvalidStateError: no hay descripción remota");
      }
      aceptados.push(candidate);
    },
    // El anfitrión abre un canal de datos para que la negociación arranque sin
    // esperar a que haya medios; aquí basta con que exista.
    createDataChannel: () => ({ close() {} }),
    addTrack: () => ({}) as RTCRtpSender,
    getSenders: () => [],
    close() {
      pc.signalingState = "closed";
    },
  };
  return pc;
}

async function montar(
  createCallSessionHost: HostModule["createCallSessionHost"],
  /** Id propio. Manda quién es «cortés»: cortés = propio < ajeno. */
  selfId = "a",
) {
  const pc = fakePeerConnection();
  let emitir: (event: WireEvent) => void = () => {};
  const enviados: { kind: string }[] = [];
  const host = createCallSessionHost({
    documentId: "doc-1",
    signaling: {
      join: async () => ({
        roomId: "sala-1",
        participantId: selfId,
        participants: [
          { id: selfId, userId: "ua", name: "A" },
          { id: "b", userId: "ub", name: "B" },
        ],
        iceServers: [],
        turnConfigured: false,
      }),
      leave: async () => {},
      sendSignal: async (
        _room: string,
        _from: string,
        _to: string,
        kind: string,
      ) => {
        enviados.push({ kind });
      },
      connect: (
        _room: string,
        _participant: string,
        onEvent: (event: WireEvent) => void,
      ) => {
        emitir = onEvent;
        return () => {};
      },
    } as never,
    peerConnectionFactory: () => pc as unknown as RTCPeerConnection,
  });
  await host.start();
  await asentar(5);
  return { host, pc, emitir: (event: WireEvent) => emitir(event), enviados };
}

const señal = (kind: string, payload: Record<string, unknown>): WireEvent =>
  ({
    type: "signal",
    signal: {
      id: `s-${Math.random()}`,
      fromParticipantId: "b",
      kind,
      payload,
      queuedAt: new Date().toISOString(),
    },
  }) as WireEvent;

async function main() {
  const { createCallSessionHost } = await import("./call-session-host");

  // --- 1 · el candidato que pisa los talones a la oferta NO se pierde ---------
  {
    const { pc, emitir, host } = await montar(createCallSessionHost);
    // Las dos señales salen en la MISMA vuelta, que es como llegan por el canal
    // en vivo cuando el otro extremo ya tenía sus candidatos listos.
    emitir(señal("offer", { type: "offer", sdp: "de-b" }));
    emitir(señal("ice-candidate", { candidate: "candidato-1", sdpMLineIndex: 0 }));
    emitir(señal("ice-candidate", { candidate: "candidato-2", sdpMLineIndex: 0 }));
    await asentar(40);

    eq(pc.aceptados.length, 2, "los dos candidatos entraron");
    eq(
      (pc.aceptados[0] as { candidate?: string }).candidate,
      "candidato-1",
      "y en el ORDEN en que llegaron: un candidato fuera de orden es otra ruta",
    );
    eq(pc.rechazados.length, 0, "ninguno se intentó antes de tiempo");
    ok(pc.remoteDescription, "la descripción remota se aplicó");
    host.dispose();
  }

  // --- 2 · un candidato ANTERIOR a cualquier oferta se guarda, no se tira -----
  {
    const { pc, emitir, host } = await montar(createCallSessionHost);
    emitir(señal("ice-candidate", { candidate: "adelantado", sdpMLineIndex: 0 }));
    await asentar(10);
    eq(pc.aceptados.length, 0, "todavía no se puede aplicar");
    eq(pc.rechazados.length, 0, "pero tampoco se ha tirado");

    emitir(señal("offer", { type: "offer", sdp: "de-b" }));
    await asentar(40);
    eq(pc.aceptados.length, 1, "en cuanto hay descripción remota, entra");
    eq(
      (pc.aceptados[0] as { candidate?: string }).candidate,
      "adelantado",
      "y es el que se había guardado",
    );
    host.dispose();
  }

  // --- 3 · la fila sobrevive a una señal que falla ----------------------------
  {
    const { pc, emitir, host } = await montar(createCallSessionHost);
    const original = console.error;
    console.error = () => {};
    try {
      // Una oferta ilegible rompe `setRemoteDescription`; la siguiente señal
      // TIENE que atenderse igual. Si la fila se quedara con la promesa
      // rechazada, este par se quedaría mudo para siempre.
      pc.setRemoteDescription = async (description) => {
        pc.setRemoteDescription = async (d) => {
          await asentar(3);
          pc.remoteDescription = d;
        };
        void description;
        throw new Error("descripción ilegible");
      };
      emitir(señal("offer", { type: "offer", sdp: "rota" }));
      await asentar(20);
      emitir(señal("offer", { type: "offer", sdp: "buena" }));
      emitir(señal("ice-candidate", { candidate: "tras-el-fallo", sdpMLineIndex: 0 }));
      await asentar(40);
      eq(pc.aceptados.length, 1, "la señal siguiente al fallo se atendió");
    } finally {
      console.error = original;
      host.dispose();
    }
  }

  // --- 4 · la decisión de ignorar una oferta NO se queda puesta --------------
  {
    // `ignoreOffer` sólo se asignaba al llegar una OFERTA, y nunca volvía a
    // falso. El `catch` del candidato se traga el error cuando está puesta, así
    // que tras el primer cruce de ofertas ese par quedaba MUDO ante cualquier
    // fallo posterior: la llamada no conecta y no se entera nadie.
    // `z` > `b`: este extremo es el DESCORTÉS, el que ignora la oferta cruzada.
    const { pc, emitir, host, enviados } = await montar(createCallSessionHost, "z");
    // Se fuerza el cruce: el par está en mitad de su propia oferta.
    pc.signalingState = "have-local-offer";
    emitir(señal("offer", { type: "offer", sdp: "cruzada" }));
    await asentar(20);
    eq(
      enviados.filter((e) => e.kind === "answer").length,
      0,
      "en un cruce, el descortés ignora la oferta y no responde",
    );

    // Negociación cerrada por la vía normal: llega la respuesta a su oferta.
    pc.signalingState = "stable";
    emitir(señal("answer", { type: "answer", sdp: "a-mi-oferta" }));
    await asentar(20);

    // Y ahora una oferta LIMPIA sí se contesta: la decisión anterior no quedó
    // pegada.
    emitir(señal("offer", { type: "offer", sdp: "limpia" }));
    await asentar(40);
    eq(
      enviados.filter((e) => e.kind === "answer").length,
      1,
      "cerrada la negociación, la siguiente oferta se contesta con normalidad",
    );
    host.dispose();
  }

  console.log(
    `call-session-host: ${verdes} comprobaciones verdes — señales en fila, candidatos guardados y el cruce de ofertas que no se queda pegado`,
  );

}

void main();
