/**
 * El CARRIL DE SISTEMA de la biblioteca de bloques.
 *
 * `sf_cad_blocks` guarda dos cosas distintas en la misma tabla: los bloques que
 * el arquitecto crea con BLOCK —que llevan `tenant_id` y son suyos— y los que
 * el PRODUCTO trae de fábrica, sembrados por migración con `tenant_id IS NULL`
 * y una llave estable en `legacy_source_id`. Distinguirlos por `tenant_id` a
 * secas no vale: una sesión sin inquilino escribe también con `tenant_id NULL`,
 * y entonces sus propios bloques quedarían marcados como del producto y no se
 * podrían editar. La marca es la LLAVE, y por eso vive aquí y no en un `if`
 * repartido por el servicio.
 *
 * El prefijo es un contrato de datos: hay filas con él en bases de clientes.
 * Cambiarlo no renombra nada — deja huérfanas las filas viejas y siembra otras
 * nuevas al lado. Si algún día hay que moverlo, se mueve con una migración que
 * reescriba las llaves, no editando esta constante.
 */
export const SYSTEM_CAD_BLOCK_PREFIX = 'valle:arq:';

/** Patrón `LIKE` del carril; el `%` va aquí y no repartido por las consultas. */
export const SYSTEM_CAD_BLOCK_LIKE = `${SYSTEM_CAD_BLOCK_PREFIX}%`;

/**
 * ¿Esta fila es un bloque del producto?
 *
 * Se pregunta antes de MODIFICAR o BORRAR. Un bloque de fábrica es de sólo
 * lectura para todo el mundo: si un inquilino pudiera redefinirlo, el siguiente
 * sembrado lo dejaría a medias entre su versión y la nuestra, y si pudiera
 * borrarlo se lo borraría a los demás — es una sola fila para todos.
 */
export const isSystemCadBlockKey = (
  legacySourceId: string | null | undefined,
): boolean =>
  typeof legacySourceId === 'string' &&
  legacySourceId.startsWith(SYSTEM_CAD_BLOCK_PREFIX);
