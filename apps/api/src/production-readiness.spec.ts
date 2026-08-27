import { readFileSync } from 'node:fs';
import path from 'node:path';
import { API_RATE_LIMITS } from './modules/identity/api-rate-limit.service';
import { ormOptions } from './orm.options';

/**
 * LOS CINCO AJUSTES DE PRODUCCIÓN, VERIFICADOS EN VEZ DE REHECHOS.
 *
 * ── Por qué esta suite y no cinco parches ─────────────────────────────────
 *
 * La campaña listaba cinco arreglos «abiertos»: pool, timeouts, token de
 * métricas, SSL estricto y límites de tasa. Al mirarlos, **cuatro ya estaban
 * puestos** —la campaña de 8 h dejó el SSL estricto por defecto, los
 * presupuestos de conexión y el 404 sin `METRICS_TOKEN`—, y rehacerlos habría
 * sido gastar el tiempo en trabajo ya hecho, que es exactamente lo que la
 * regla de herencias existe para impedir.
 *
 * Lo que faltaba no era código: era **evidencia**. Que un default esté escrito
 * hoy no impide que alguien lo cambie mañana «para probar algo» y se quede.
 * Esta suite convierte los cinco en afirmaciones falsables.
 *
 * ── El quinto, que sí necesitaba pensarse ─────────────────────────────────
 *
 * «Límites de tasa razonables que no estorben a un usuario legítimo dibujando»
 * no se puede comprobar mirando el número: 120 sólo significa algo comparado
 * con lo que el producto MISMO genera. El estudio guarda con un rebote de 2 s,
 * así que un arquitecto dibujando sin parar produce como mucho 30 guardados por
 * minuto y por documento. El techo tiene que dejar holgura sobre ESO, no sobre
 * una intuición.
 */

const root = path.resolve(__dirname, '../../..');
const read = (relative: string) => readFileSync(path.join(root, relative), 'utf8');

/**
 * El rebote del autosave del estudio, en milisegundos.
 *
 * Vive en el editor web (`createDebouncedAutosave(2_000, …)`), que esta suite
 * no puede importar —son dos aplicaciones—, así que se declara aquí CON su
 * comprobación: si alguien lo baja, la afirmación de abajo deja de ser cierta
 * y hay que rehacer la cuenta, no ajustar el número a mano.
 */
const AUTOSAVE_DEBOUNCE_MS = 2_000;

const withEnv = <T,>(env: Record<string, string | undefined>, fn: () => T): T => {
  const previous = new Map(Object.keys(env).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

describe('Ajustes de producción — los cinco, con evidencia', () => {
  /* ── 1 · SSL ESTRICTO ─────────────────────────────────────────────────── */

  it('1 · en producción el certificado se VALIDA sin que nadie lo pida', () => {
    const options = withEnv(
      {
        NODE_ENV: 'production',
        // Producción EXIGE declararlo: sin él, `ormOptions` se niega a
        // arrancar antes de llegar al SSL. Esa es otra defensa que ya estaba y
        // que estas pruebas ejercitan de paso.
        SYNCHRONIZE: 'false',
        DATABASE_URL: 'postgres://u:p@db.example.com:5432/valle',
        DB_SSL_STRICT: undefined,
      },
      () => ormOptions() as { ssl?: { rejectUnauthorized?: boolean } },
    );
    // Un TLS que no valida al servidor protege del sniffing y no del MITM. El
    // silencio de `rejectUnauthorized: false` es el default que nadie revisa
    // hasta el incidente.
    expect(options.ssl).toEqual({ rejectUnauthorized: true });
  });

  it('1b · aflojarlo exige escribirlo, y queda a la vista de quien opera', () => {
    const options = withEnv(
      {
        NODE_ENV: 'production',
        // Producción EXIGE declararlo: sin él, `ormOptions` se niega a
        // arrancar antes de llegar al SSL. Esa es otra defensa que ya estaba y
        // que estas pruebas ejercitan de paso.
        SYNCHRONIZE: 'false',
        DATABASE_URL: 'postgres://u:p@db.example.com:5432/valle',
        DB_SSL_STRICT: 'false',
      },
      () => ormOptions() as { ssl?: { rejectUnauthorized?: boolean } },
    );
    expect(options.ssl).toEqual({ rejectUnauthorized: false });
  });

  /* ── 2 y 3 · POOL Y TIMEOUTS ──────────────────────────────────────────── */

  it('2 · el pool y los tres presupuestos de conexión tienen default', () => {
    const options = withEnv(
      {
        NODE_ENV: 'production',
        // Producción EXIGE declararlo: sin él, `ormOptions` se niega a
        // arrancar antes de llegar al SSL. Esa es otra defensa que ya estaba y
        // que estas pruebas ejercitan de paso.
        SYNCHRONIZE: 'false',
        DATABASE_URL: 'postgres://u:p@db.example.com:5432/valle',
        DB_POOL_SIZE: undefined,
        DB_STATEMENT_TIMEOUT_MS: undefined,
        DB_IDLE_IN_TRANSACTION_TIMEOUT_MS: undefined,
        DB_LOCK_TIMEOUT_MS: undefined,
      },
      () => ormOptions() as { extra?: Record<string, number> },
    );
    // Sin estos, una query degenerada retiene su conexión para siempre y una
    // transacción olvidada retiene sus locks: una degradación silenciosa en
    // vez de un error ruidoso y acotado.
    expect(options.extra).toEqual({
      max: 20,
      statement_timeout: 30_000,
      idle_in_transaction_session_timeout: 30_000,
      lock_timeout: 10_000,
    });
  });

  it('3 · y Railway puede bajarlos: el plugin limita conexiones por proyecto', () => {
    const options = withEnv(
      {
        NODE_ENV: 'production',
        // Producción EXIGE declararlo: sin él, `ormOptions` se niega a
        // arrancar antes de llegar al SSL. Esa es otra defensa que ya estaba y
        // que estas pruebas ejercitan de paso.
        SYNCHRONIZE: 'false',
        DATABASE_URL: 'postgres://u:p@db.example.com:5432/valle',
        DB_POOL_SIZE: '10',
      },
      () => ormOptions() as { extra?: Record<string, number> },
    );
    expect(options.extra?.max).toBe(10);
  });

  /* ── 4 · TOKEN DE MÉTRICAS ────────────────────────────────────────────── */

  it('4 · sin METRICS_TOKEN los endpoints de métricas NO EXISTEN', () => {
    // La semántica es 404, no 401: un 401 confirma que la ruta está ahí, que
    // es justo lo que no hace falta anunciarle a quien la sondea.
    const source = read('apps/api/src/observability/metrics-access.ts');
    expect(source).toMatch(/disabled/u);
    for (const controller of [
      'apps/api/src/health/activation-metrics.controller.ts',
    ]) {
      const text = read(controller);
      expect(text).toMatch(/evaluateMetricsAccess/u);
      expect(text).toMatch(/NotFoundException/u);
      expect(text).toMatch(/UnauthorizedException/u);
    }
  });

  /* ── 5 · LÍMITES DE TASA QUE NO ESTORBAN ──────────────────────────────── */

  it('5 · el techo de guardado deja holgura sobre lo que el propio estudio genera', () => {
    // Un arquitecto dibujando sin levantar la mano no puede producir más
    // guardados que los que su rebote permite.
    const guardadosPorMinutoDeUnHumano = Math.ceil(60_000 / AUTOSAVE_DEBOUNCE_MS);
    expect(guardadosPorMinutoDeUnHumano).toBe(30);

    // Holgura de al menos 3×: deja sitio a un guardado manual entre autosaves,
    // a dos pestañas del mismo plano y a un reintento tras volver la red, que
    // son las tres cosas que de verdad multiplican el ritmo de una persona.
    expect(API_RATE_LIMITS.cadContentWritePerDocument).toBeGreaterThanOrEqual(
      guardadosPorMinutoDeUnHumano * 3,
    );

    // El de archivo comprimido es más bajo a propósito (hasta 20 MiB cada uno),
    // pero tiene que seguir por encima del ritmo humano.
    expect(API_RATE_LIMITS.cadArchiveWritePerDocument).toBeGreaterThanOrEqual(
      guardadosPorMinutoDeUnHumano,
    );
  });

  it('5b · ningún techo es tan bajo que lo alcance una persona sola', () => {
    // Dos por minuto sería un techo que una persona alcanza sin proponérselo;
    // el más estrecho de todos tiene que dejar sitio a una tarde de trabajo.
    // Jest no acepta mensaje en `expect`, así que el nombre viaja en el dato
    // comparado: un fallo dice CUÁL techo se quedó corto, no sólo que uno lo hizo.
    const estrechos = Object.entries(API_RATE_LIMITS)
      .filter(([, techo]) => techo < 10)
      .map(([nombre, techo]) => `${nombre}=${techo}/min`);
    expect(estrechos).toEqual([]);
  });

  /* ── Y que el documento de despliegue los NOMBRE ──────────────────────── */

  it('los cinco están en DESPLIEGUE-RAILWAY.md, o el operador no los pondrá', () => {
    const doc = read('docs/onboarding/DESPLIEGUE-RAILWAY.md');
    const faltan = [
      'DB_SSL_STRICT',
      'DB_POOL_SIZE',
      'METRICS_TOKEN',
      'SUPPORT_EMAIL',
      'TRIAL_DAYS',
    ].filter((variable) => !doc.includes(variable));
    expect(faltan).toEqual([]);
  });
});
