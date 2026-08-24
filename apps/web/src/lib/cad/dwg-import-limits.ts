/**
 * Tope de bytes para `.dwg` del lado UI — única fuente productiva.
 *
 * Debe coincidir exactamente con el límite de tamaño por defecto del códec
 * DWG propio (paquete interno del monorepo), verificado por una
 * comprobación cruzada en la spec del único adaptador de producto
 * autorizado a importar ese códec directamente
 * (`scripts/dwg/check-product-boundary.mjs` nombra ese único archivo — éste
 * no es ese archivo, así que ni siquiera puede mencionar la ruta del paquete
 * en un comentario sin que el boundary lo marque como referencia). Este
 * archivo no reexporta la constante del códec porque ese boundary restringe
 * deliberadamente quién puede referenciarlo: declara el mismo número de
 * forma independiente, y es el test cruzado el que impide que diverjan en
 * silencio.
 *
 * Antes de este arreglo la UI aceptaba hasta 24.000.000 de bytes mientras el
 * códec rechazaba (correctamente, fallo cerrado) cualquier archivo por
 * encima de 16.777.216: un archivo de, por ejemplo, 20 MB pasaba la
 * validación de la UI y el worker lo rechazaba después — con un mensaje que
 * además decía "firma inválida o archivo truncado", no "demasiado grande"
 * (ver el mapeo de mensajes por código junto al adaptador). Se elige bajar
 * la UI a coincidir con el códec, no subir el códec: no hay benchmark ni
 * threat model en este repositorio que justifique un límite binario mayor a
 * 16 MiB para esta beta.
 */
export const DWG_MAX_IMPORT_BYTES = 16 * 1024 * 1024;
