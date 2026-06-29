export interface ApiSuccessEnvelope<
  TData,
  TMeta extends Record<string, unknown> = Record<string, never>,
> {
  success: true;
  data: TData;
  timestamp: string;
  meta?: TMeta;
}

export interface ApiErrorEnvelope<TDetails = unknown> {
  success: false;
  statusCode: number;
  message: string;
  timestamp: string;
  code?: string;
  details?: TDetails;
}

export type ApiResponseEnvelope<
  TData,
  TMeta extends Record<string, unknown> = Record<string, never>,
  TDetails = unknown,
> = ApiSuccessEnvelope<TData, TMeta> | ApiErrorEnvelope<TDetails>;

export function createApiSuccessEnvelope<
  TData,
  TMeta extends Record<string, unknown> = Record<string, never>,
>(
  data: TData,
  options: { timestamp?: string; meta?: TMeta } = {},
): ApiSuccessEnvelope<TData, TMeta> {
  return {
    success: true,
    data,
    timestamp: options.timestamp ?? new Date().toISOString(),
    ...(options.meta ? { meta: options.meta } : {}),
  };
}

export function createApiErrorEnvelope<TDetails = unknown>(params: {
  statusCode: number;
  message: string;
  timestamp?: string;
  code?: string;
  details?: TDetails;
}): ApiErrorEnvelope<TDetails> {
  return {
    success: false,
    statusCode: params.statusCode,
    message: params.message,
    timestamp: params.timestamp ?? new Date().toISOString(),
    ...(params.code ? { code: params.code } : {}),
    ...(params.details !== undefined ? { details: params.details } : {}),
  };
}
