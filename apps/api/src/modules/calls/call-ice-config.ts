/**
 * Configuración ICE de la llamada, leída de variable de entorno — NUNCA de
 * código ni de lo que manda el navegador. Ver `docs/execution/` (o el PR que
 * introduce este módulo) para el límite completo: WebRTC punto a punto
 * necesita STUN para descubrir la dirección pública de cada par, y TURN para
 * relevar el tráfico cuando ninguno de los dos NAT deja pasar la conexión
 * directa — del orden del 15% de los pares en redes reales (NAT simétrico,
 * firewall corporativo). Sin TURN, esas llamadas específicas fallan: es
 * infraestructura que este repositorio no opera, y `turnConfigured` existe
 * para que el cliente lo sepa ANTES de quedarse pegado en "conectando" para
 * siempre.
 */
export interface CallIceServerConfig {
  urls: string[];
  username?: string;
  credential?: string;
}

export interface CallIceConfig {
  iceServers: CallIceServerConfig[];
  turnConfigured: boolean;
}

/**
 * STUN públicos y gratuitos de Google: el default que usa casi cualquier
 * tutorial o despliegue WebRTC cuando no se opera uno propio. No llevan
 * credenciales ni son un SDK — son una URL de servidor, exactamente como un
 * NTP; `CALLS_STUN_URLS` los reemplaza por completo si el despliegue quiere
 * su propio STUN.
 */
const DEFAULT_STUN_URLS = [
  'stun:stun.l.google.com:19302',
  'stun:stun1.l.google.com:19302',
];

function splitUrls(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function resolveCallIceConfig(
  env: NodeJS.ProcessEnv = process.env,
): CallIceConfig {
  const iceServers: CallIceServerConfig[] = [];
  const stunUrls =
    env.CALLS_STUN_URLS === undefined
      ? DEFAULT_STUN_URLS
      : splitUrls(env.CALLS_STUN_URLS);
  if (stunUrls.length > 0) iceServers.push({ urls: stunUrls });

  const turnUrls = splitUrls(env.CALLS_TURN_URLS);
  const turnConfigured = turnUrls.length > 0;
  if (turnConfigured) {
    iceServers.push({
      urls: turnUrls,
      username: env.CALLS_TURN_USERNAME || undefined,
      credential: env.CALLS_TURN_CREDENTIAL || undefined,
    });
  }
  return { iceServers, turnConfigured };
}
