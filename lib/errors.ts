/**
 * Error contract: code → HTTP status + default Spanish message.
 * Owner: orion. Safe for client and server (no runtime deps).
 */
import type { ApiError, ApiErrorBody, ApiErrorCode } from "@/lib/types";

export const ERROR_HTTP_STATUS = {
  BAD_REQUEST: 400,
  VALIDATION_ERROR: 422,
  MATCH_NOT_FOUND: 404,
  SUMMONER_NOT_FOUND: 404,
  SYNC_IN_PROGRESS: 409,
  RIOT_KEY_MISSING: 503,
  RIOT_KEY_INVALID: 502,
  RIOT_RATE_LIMITED: 503,
  RIOT_UNAVAILABLE: 502,
  INTERNAL_ERROR: 500,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  PROFILE_REQUIRED: 409,
  RIOT_ID_TAKEN: 409,
  SYNC_COOLDOWN: 429,
  RATE_LIMITED: 429,
  RSO_DISABLED: 404,
  RSO_FAILED: 502,
} as const satisfies Record<ApiErrorCode, number>;

export const ERROR_MESSAGES_ES = {
  BAD_REQUEST: "La petición no es válida.",
  VALIDATION_ERROR: "Revisa los datos enviados.",
  MATCH_NOT_FOUND: "No encontramos esa partida.",
  SUMMONER_NOT_FOUND: "No encontramos ese Riot ID. Revisa el nombre y el tag (ej. Nombre#LAN).",
  SYNC_IN_PROGRESS: "Ya hay una sincronización en curso. Espera a que termine.",
  RIOT_KEY_MISSING:
    "Falta la API key de Riot. Pégala en .env.local (RIOT_API_KEY=...) y reinicia la app, o activa RIOT_MOCK=1 para usar datos de ejemplo.",
  RIOT_KEY_INVALID:
    "Riot rechazó la API key (caducada o inválida). Las keys de desarrollo caducan cada 24 h: genera una nueva en developer.riotgames.com.",
  RIOT_RATE_LIMITED: "Riot está limitando las peticiones. Espera un momento y vuelve a sincronizar.",
  RIOT_UNAVAILABLE: "Los servidores de Riot no responden ahora mismo. Inténtalo más tarde.",
  INTERNAL_ERROR: "Ocurrió un error inesperado. Inténtalo de nuevo.",
  UNAUTHENTICATED: "Inicia sesión para continuar.",
  FORBIDDEN: "No tienes permiso para hacer esto.",
  PROFILE_REQUIRED: "Vincula tu Riot ID para ver tus partidas.",
  RIOT_ID_TAKEN: "Ese Riot ID ya está verificado por otra cuenta.",
  SYNC_COOLDOWN: "Acabas de sincronizar. Espera un par de minutos antes de volver a intentarlo.",
  RATE_LIMITED: "Demasiadas peticiones. Espera un momento.",
  RSO_DISABLED: "El inicio de sesión con Riot aún no está disponible.",
  RSO_FAILED: "No pudimos iniciar sesión con Riot. Inténtalo de nuevo.",
} as const satisfies Record<ApiErrorCode, string>;

export function apiError(code: ApiErrorCode, extra?: Omit<Partial<ApiError>, "code">): ApiError {
  return { code, message: extra?.message ?? ERROR_MESSAGES_ES[code], ...extra };
}

export function errorBody(error: ApiError): ApiErrorBody {
  return { error };
}

export function httpStatusFor(code: ApiErrorCode): number {
  return ERROR_HTTP_STATUS[code];
}
