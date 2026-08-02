# Troubleshooting

| Síntoma                   | Comprobación                                  | Acción segura                                                              |
| ------------------------- | --------------------------------------------- | -------------------------------------------------------------------------- |
| API no arranca en prod    | log sobre DB/secreto/synchronize              | definir PostgreSQL, secreto ≥16 y `SYNCHRONIZE=false`; no habilitar SQLite |
| 401                       | expiración, `sub`/`email`, secreto compartido | renovar sesión/coordinar secreto; no usar fallback dev                     |
| 403                       | `cad:*`, `design.cad`, Platform URL           | corregir emisión/entitlement; no cambiar prod a `allow-all`                |
| CORS                      | `ALLOWED_ORIGIN` exacto, sin slash            | añadir origen explícito y redesplegar                                      |
| web llama host viejo      | valor en build                                | reconstruir con `NEXT_PUBLIC_API_URL`; reiniciar no cambia bundle          |
| 409/CAS                   | versión del cliente vs servidor               | recargar/comparar; jamás sobrescribir versión a mano                       |
| documento grande no abre  | fila manifiesto y blob tenant-scoped          | preservar datos, verificar SHA/tamaño; no ejecutar GC                      |
| IA `available:false`      | CIDE URL/modelo/red                           | configurar CIDE o aceptar degradación; no es fallo de arranque             |
| tests PG saltan/fallan    | `TEST_DATABASE_URL`                           | usar PostgreSQL 16; en CI fijar `REQUIRE_POSTGRES_TESTS=true`              |
| migración rechaza archivo | hashes/conteos/manifiesto                     | recuperar archivo completo; no editar NDJSON ni manifiesto                 |
| DXF pierde semántica      | loss manifest/XDATA                           | conservar archivo, correr golden; no renombrar XDATA                       |
| DWG no abre               | capacidad ausente                             | convertir mediante proveedor autorizado a DXF; no renombrar extensión      |

Comandos base: `npm run typecheck`, `npm test`,
`npm run test:pg --workspace=valle-design-api`, `npm run build` y
`git diff --check`. Para E2E real, construir web con el origen del API, arrancar
API en 4000 y usar las variables mostradas en `.github/workflows/ci.yml`.
