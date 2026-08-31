import { resolveCallIceConfig } from './call-ice-config';

describe('resolveCallIceConfig', () => {
  it('sin variables de entorno, usa el STUN público por default y turnConfigured es false', () => {
    const config = resolveCallIceConfig({});
    expect(config.iceServers).toHaveLength(1);
    expect(config.iceServers[0].urls.length).toBeGreaterThan(0);
    expect(config.turnConfigured).toBe(false);
  });

  it('CALLS_STUN_URLS reemplaza el default por completo', () => {
    const config = resolveCallIceConfig({
      CALLS_STUN_URLS: 'stun:propio.ejemplo.mx:3478',
    });
    expect(config.iceServers[0].urls).toEqual(['stun:propio.ejemplo.mx:3478']);
  });

  it('CALLS_STUN_URLS vacío desactiva STUN sin caer al default', () => {
    const config = resolveCallIceConfig({ CALLS_STUN_URLS: '' });
    expect(config.iceServers).toHaveLength(0);
  });

  it('con TURN configurado, turnConfigured es true y viajan usuario/credencial', () => {
    const config = resolveCallIceConfig({
      CALLS_TURN_URLS: 'turn:turn.ejemplo.mx:3478,turns:turn.ejemplo.mx:5349',
      CALLS_TURN_USERNAME: 'valle',
      CALLS_TURN_CREDENTIAL: 'secreta',
    });
    expect(config.turnConfigured).toBe(true);
    const turnEntry = config.iceServers.find((s) =>
      s.urls[0].startsWith('turn'),
    );
    expect(turnEntry).toMatchObject({
      username: 'valle',
      credential: 'secreta',
    });
    expect(turnEntry?.urls).toHaveLength(2);
  });

  it('sin TURN_URLS, no hay entrada TURN aunque haya usuario/credencial sueltos', () => {
    const config = resolveCallIceConfig({
      CALLS_TURN_USERNAME: 'valle',
      CALLS_TURN_CREDENTIAL: 'secreta',
    });
    expect(config.turnConfigured).toBe(false);
    expect(config.iceServers.every((s) => !s.username)).toBe(true);
  });
});
