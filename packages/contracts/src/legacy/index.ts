/**
 * MÓDULO `legacy/` — identificadores que NO pueden renombrarse todavía.
 *
 * Todo lo que se exporta desde aquí es un valor que vive FUERA del
 * repositorio: en la base de datos de tenants, dentro de archivos DXF que ya
 * están en discos de clientes, o dentro de credenciales ya firmadas por
 * Platform. Cambiar su valor no es un renombre; es una migración.
 *
 * Ver `README.md` de esta carpeta: qué es cada alias, por qué no puede
 * cambiarse y qué haría falta para retirarlo.
 */

export * from "./cad-studio-identifiers";
export * from "./dxf-xdata-apps";
export * from "./rbac-transition";
