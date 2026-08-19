# Producto

Valle Design permite que un equipo cree, edite, versione y revise dibujos CAD
desde el navegador sin depender de otro producto para identidad o acceso. La
unidad de colaboración y aislamiento es la organización; cada organización
opera como un tenant independiente.

## Recorridos disponibles

- Registrar una cuenta, verificar el correo, iniciar/cerrar sesión, recuperar
  contraseña y listar, rotar o revocar sesiones.
- Crear y activar organizaciones, consultar membresías, invitar por email y
  aceptar invitaciones con roles `owner`, `admin`, `member` o `viewer`.
- Iniciar un trial al crear la organización y consultar la suscripción y los
  entitlements efectivos. El producto no publica precios ni captura pagos.
- Crear proyectos y documentos, abrirlos por UUID en
  `/studio/[documentId]`, editar con herramientas CAD, autosave, undo/redo,
  guardado CAS y consulta de versiones.
- Importar DXF de texto o JSON canónico desde el dashboard, incluidos archivos
  grandes mediante gzip/blob; el flujo muestra progreso, cancelación y
  advertencias.
- Exportar el subconjunto DXF implementado y publicar hojas PDF.
- Crear review links revocables, comentar y resolver comentarios dentro de la
  superficie de revisión acotada.
- Usar asistencia NL→CAD o Vision→CAD cuando CIDE está configurado; los cambios
  requieren el flujo de confirmación del documento.

## Personas y permisos

- `owner` y `admin`: administran la organización y tienen todos los permisos
  CAD del release.
- `member`: ve, edita, revisa y publica.
- `viewer`: ve y revisa; no edita ni publica.
- Revisor por enlace: acceso de solo lectura y comentarios al documento
  compartido, sin una membresía general.

El servidor deriva rol, permisos, organización y tenant a partir de la sesión y
la membresía persistida. Además se requiere un `design.cad` vigente; un trial
expirado o una suscripción inactiva niega el acceso.

## Qué significa “guardado”

El documento canónico es la fuente de verdad. Guardado manual y autosave se
serializan en una cola y usan la versión CAS conocida. Un `409` no se resuelve
silenciosamente: el estado permanece pendiente hasta recargar, comparar o
resolver el conflicto. Las versiones del servidor son inmutables; undo/redo es
historia local acotada y no sustituye el versionado persistido.

Sin conexión, el trabajo queda en un journal local comprimido y verificado por
hash —verificado, no cifrado— y el editor lo dice —«Sin conexión · cambios pendientes»—, no finge que guardó. Al volver la
red, lo pendiente sube solo: no hace falta que nadie vuelva a dibujar ni pulse
Guardar. Si la pestaña muere sin avisar, al reabrir el documento se ofrece ese
borrador para restaurarlo o descartarlo, también desde otra pestaña. Lo que sí
se puede perder es lo dibujado desde el último checkpoint local: la ventana está
medida y publicada, con la máquina, en `docs/cad/evidence/document-limits.json`
junto al tamaño de plano hasta el que se sostiene esta promesa. El recorrido
completo —caída de red, dos pestañas sobre el mismo plano y cierre forzado— se
verifica contra la API real y PostgreSQL en
`apps/web/e2e/real/cad-offline-multitab.spec.ts`.

## Promesas que no se hacen

- Valle Design no es AutoCAD 2027 ni declara paridad funcional, de formato o
  rendimiento.
- DWG no se abre ni se escribe. DXF es un subconjunto de texto con pérdidas
  explícitas; no se promete fidelidad universal.
- No existe compatibilidad .NET/VBA, GIS, raster georreferenciado, nubes de
  puntos, IFC ni object storage S3 conectado.
- Sí existen, y por eso ya no se niegan aquí: un modelador sólido B-rep
  facetado (`EXTRUDE`, `REVOLVE`, booleanas, empalmes, propiedades másicas),
  intercambio `IMPORT`/`EXPORT` en STEP e IGES 5.3, y un intérprete AutoLISP en
  sandbox con biblioteca `.lsp` por organización. Sus límites, que sí se
  mantienen: los sólidos son FACETADOS —un intercambio STEP/IGES conserva la
  faceta, no la superficie exacta que la generó— y el AutoLISP es un subconjunto
  con presupuesto de ejecución y una única puerta de mutación, no el intérprete
  de Autodesk.
- El corpus de 100k usa LOD. Los números actuales no demuestran 60 FPS, tiempo
  real, memoria estabilizada ni detalle completo de 100k entidades.
- “Standalone” describe la identidad, autorización, datos y despliegue del
  producto. No implica que el repositorio incluya un proveedor de correo, un
  procesador de pagos o el servicio CIDE.
- Un test unitario, un golden con red simulada o una ruta visible no bastan para
  anunciar una capacidad completa. La matriz competitiva exige evidencia del
  límite relevante y mantiene los gaps abiertos.

Consulta `docs/competitive/autocad-2027-gap-matrix.md` para el estado y los
criterios de promoción de cada categoría.
