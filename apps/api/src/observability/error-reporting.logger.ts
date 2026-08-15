import { ConsoleLogger, type LoggerService } from '@nestjs/common';
import type { ErrorReporter } from './error-reporter.port';
import { scrubStack, scrubText } from './scrub';

/**
 * Puente entre el logger de Nest y el puerto `ErrorReporter`.
 *
 * Por qué existe, en vez de llamar al reporter desde cada sitio: el
 * `AllExceptionsFilter` sólo ve errores que llegaron por HTTP. Los fallos del
 * **worker de outbox** no llegan por HTTP — ocurren en un temporizador, sin
 * petición ni respuesta — y hoy su única salida es `this.logger.error(...)`.
 * Un reporter enganchado sólo al filtro dejaría ciega precisamente la parte
 * del sistema que corre sin nadie mirando.
 *
 * Enganchando el LOGGER se cubren los dos y, además, cualquier futuro
 * componente de fondo sin tocarlo: todo lo que Nest registra como error se
 * reporta.
 *
 * Lo que NO hace: cambiar el formato del log ni tragarse nada. Delega en
 * `ConsoleLogger`, así que la salida del servidor es byte a byte la de antes;
 * el reporte es un efecto añadido. Y NUNCA deja escapar una excepción del
 * reporter: un backend de telemetría caído no puede romper el logging.
 */
export class ErrorReportingLogger
  extends ConsoleLogger
  implements LoggerService
{
  constructor(private readonly reporter: ErrorReporter) {
    super();
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    super.error(message, ...(optionalParams as never[]));
    try {
      this.reporter.report({
        kind: 'LoggedError',
        message: scrubText(stringify(message)),
        level: 'error',
        source: contextOf(optionalParams) ?? 'Nest',
        stack: scrubStack(stackOf(optionalParams)),
      });
    } catch {
      // Silencio deliberado: el reporte es best effort.
    }
  }
}

function stringify(message: unknown): string {
  if (typeof message === 'string') return message;
  if (message instanceof Error) return message.message;
  try {
    return JSON.stringify(message);
  } catch {
    return String(message);
  }
}

/**
 * Nest llama `error(message, stack?, context?)`. El contexto es el último
 * argumento string y la traza, el que contiene saltos de línea con `at `.
 */
function contextOf(params: unknown[]): string | undefined {
  const strings = params.filter((p): p is string => typeof p === 'string');
  const last = strings[strings.length - 1];
  if (!last || /\n\s*at\s/.test(last)) return undefined;
  return last;
}

function stackOf(params: unknown[]): string | undefined {
  for (const param of params) {
    if (typeof param === 'string' && /\n\s*at\s/.test(param)) return param;
    if (param instanceof Error && param.stack) return param.stack;
  }
  return undefined;
}
