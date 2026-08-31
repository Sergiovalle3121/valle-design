import {
  CallParticipantNotFoundError,
  CallRoomFullError,
  CallRoomNotFoundError,
  CallRoomStore,
  MAX_PARTICIPANTS_PER_ROOM,
} from './call-room-store';
import type { CallServerEvent } from './calls.types';

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';
const DOC_1 = 'doc-1';

function actor(userId: string) {
  return { userId, name: `${userId}@ejemplo.mx` };
}

describe('CallRoomStore', () => {
  it('crea una sala nueva y la reutiliza para el mismo documento y tenant', () => {
    const store = new CallRoomStore();
    const first = store.join(TENANT_A, DOC_1, actor('u1'));
    const second = store.join(TENANT_A, DOC_1, actor('u2'));
    expect(second.room.id).toBe(first.room.id);
    expect(second.participants.map((p) => p.userId).sort()).toEqual([
      'u1',
      'u2',
    ]);
  });

  it('el mismo documentId en OTRO tenant abre una sala distinta', () => {
    const store = new CallRoomStore();
    const a = store.join(TENANT_A, DOC_1, actor('u1'));
    const b = store.join(TENANT_B, DOC_1, actor('u9'));
    expect(a.room.id).not.toBe(b.room.id);
  });

  it('rechaza al quinto participante — la malla completa topa en cuatro', () => {
    const store = new CallRoomStore();
    let roomId = '';
    for (let i = 0; i < MAX_PARTICIPANTS_PER_ROOM; i += 1) {
      roomId = store.join(TENANT_A, DOC_1, actor(`u${i}`)).room.id;
    }
    expect(() => store.join(TENANT_A, DOC_1, actor('u-quinto'))).toThrow(
      CallRoomFullError,
    );
    expect(roomId).not.toBe('');
  });

  it('leave saca al participante y avisa al roster de los que quedan', () => {
    const store = new CallRoomStore();
    const events: CallServerEvent[] = [];
    const { room, participant: p1 } = store.join(TENANT_A, DOC_1, actor('u1'));
    const p2 = store.join(TENANT_A, DOC_1, actor('u2')).participant;
    store.connect(TENANT_A, room.id, p2.id, (e) => events.push(e));
    events.length = 0;

    store.leave(TENANT_A, room.id, p1.id);

    const roster = events.find((e) => e.type === 'roster');
    if (roster?.type !== 'roster')
      throw new Error('se esperaba un evento roster');
    expect(roster.participants.map((p) => p.id)).toEqual([p2.id]);
  });

  it('cuando el último participante se va, la sala desaparece', () => {
    const store = new CallRoomStore();
    const { room, participant } = store.join(TENANT_A, DOC_1, actor('u1'));
    store.leave(TENANT_A, room.id, participant.id);
    expect(store.roomCount()).toBe(0);
    // Un join posterior al mismo documento abre una sala NUEVA.
    const again = store.join(TENANT_A, DOC_1, actor('u1'));
    expect(again.room.id).not.toBe(room.id);
  });

  it('leave contra un roomId de otro tenant no encuentra la sala', () => {
    const store = new CallRoomStore();
    const { room, participant } = store.join(TENANT_A, DOC_1, actor('u1'));
    expect(() => store.leave(TENANT_B, room.id, participant.id)).toThrow(
      CallRoomNotFoundError,
    );
  });

  it('una señal se entrega en vivo cuando el destinatario tiene SSE abierto', () => {
    const store = new CallRoomStore();
    const { room, participant: caller } = store.join(
      TENANT_A,
      DOC_1,
      actor('u1'),
    );
    const callee = store.join(TENANT_A, DOC_1, actor('u2')).participant;
    const received: CallServerEvent[] = [];
    store.connect(TENANT_A, room.id, callee.id, (e) => received.push(e));
    received.length = 0;

    store.postSignal(TENANT_A, room.id, caller.id, callee.id, 'offer', {
      sdp: 'v=0...',
    });

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      type: 'signal',
      signal: { kind: 'offer', fromParticipantId: caller.id },
    });
  });

  it('sin SSE abierto, la señal se guarda en el buzón y se entrega al conectar', () => {
    const store = new CallRoomStore();
    const { room, participant: caller } = store.join(
      TENANT_A,
      DOC_1,
      actor('u1'),
    );
    const callee = store.join(TENANT_A, DOC_1, actor('u2')).participant;

    store.postSignal(TENANT_A, room.id, caller.id, callee.id, 'offer', {
      sdp: 'oferta',
    });

    const received: CallServerEvent[] = [];
    store.connect(TENANT_A, room.id, callee.id, (e) => received.push(e));

    const signalEvents = received.filter((e) => e.type === 'signal');
    expect(signalEvents).toHaveLength(1);
  });

  it('postSignal contra un participante inexistente falla explícito', () => {
    const store = new CallRoomStore();
    const { room, participant: caller } = store.join(
      TENANT_A,
      DOC_1,
      actor('u1'),
    );
    expect(() =>
      store.postSignal(TENANT_A, room.id, caller.id, 'fantasma', 'bye', {}),
    ).toThrow(CallParticipantNotFoundError);
  });

  it('el barrido saca a un participante desconectado tras vencer el TTL', () => {
    let clock = 1_000;
    const store = new CallRoomStore(() => clock);
    const { room, participant } = store.join(TENANT_A, DOC_1, actor('u1'));
    const other = store.join(TENANT_A, DOC_1, actor('u2')).participant;
    // u1 se queda conectado — el que vence es u2, y sólo u2.
    store.connect(TENANT_A, room.id, participant.id, () => {});
    const teardown = store.connect(TENANT_A, room.id, other.id, () => {});
    teardown(); // u2 se desconecta

    clock += 46_000; // por encima del margen de 45s
    store.sweep();

    expect(() =>
      store.postSignal(TENANT_A, room.id, participant.id, other.id, 'bye', {}),
    ).toThrow(CallParticipantNotFoundError);
  });

  it('el barrido purga una señal en buzón que nadie recogió a tiempo', () => {
    let clock = 1_000;
    const store = new CallRoomStore(() => clock);
    const { room, participant: caller } = store.join(
      TENANT_A,
      DOC_1,
      actor('u1'),
    );
    const callee = store.join(TENANT_A, DOC_1, actor('u2')).participant;

    store.postSignal(TENANT_A, room.id, caller.id, callee.id, 'offer', {});
    clock += 31_000; // por encima del margen de 30s
    store.sweep();

    const received: CallServerEvent[] = [];
    store.connect(TENANT_A, room.id, callee.id, (e) => received.push(e));
    expect(received.filter((e) => e.type === 'signal')).toHaveLength(0);
  });

  it('el barrido no toca a nadie mientras todos siguen dentro del margen', () => {
    let clock = 1_000;
    const store = new CallRoomStore(() => clock);
    const { room, participant } = store.join(TENANT_A, DOC_1, actor('u1'));
    const teardown = store.connect(TENANT_A, room.id, participant.id, () => {});
    teardown();
    clock += 10_000;
    store.sweep();
    expect(store.roomCount()).toBe(1);
  });
});
