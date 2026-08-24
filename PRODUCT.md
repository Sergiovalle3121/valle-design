# Producto

Valle Design es un **CAD 2D general y universal**: permite que un equipo cree,
edite, versione y revise dibujos CAD desde el navegador sin depender de otro
producto para identidad o acceso. El plano puede ser de cualquier disciplina
—arquitectónico, mecánico, eléctrico, civil, de instalaciones, de mobiliario, de
terreno— y el catálogo mexicano de plantillas y normas es la fortaleza inicial
del producto, no su frontera. Qué es y qué **no** es Valle Design está en
[`IDENTITY.md`](IDENTITY.md).

La unidad de colaboración y aislamiento es la organización; cada organización
opera como un tenant independiente.

## Recorridos disponibles

- Registrar una cuenta, verificar el correo, iniciar/cerrar sesión, recuperar
  contraseña y listar, rotar o revocar sesiones.
- Crear y activar organizaciones, consultar membresías, invitar por email y
  aceptar invitaciones con roles `owner`, `admin`, `member` o `viewer`.
- Iniciar un trial al crear la organización y consultar la suscripción y los
  entitlements efectivos.
- Consultar los planes y precios publicados en `/precios` —los importes los
  sirve el catálogo real (`GET /v1/commercial/public/plans`), no un texto
  estático— y comprar por autoservicio: checkout hospedado de Stripe con
  tarjeta, OXXO y SPEI, portal de facturación del proveedor, historial de
  facturas y baja de la suscripción. Los datos de pago no pasan por Valle:
  los custodia la pasarela. **Caveat fiscal honesto:** no hay PAC contratado;
  los datos fiscales se capturan y validan en el producto y el CFDI lo emite
  una persona con ellos delante (`mode: 'manual'` en
  `GET /v1/commercial/tax-profile`). El producto no timbra todavía.
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
- DWG no se abre ni se escribe en el producto público. Existe una beta
  interna de sólo importación (`DWG_NATIVE_IMPORT_BETA`, perfil
  `AC1015_MODELSPACE_2D_V3`, ADR-0009 §6-bis, ampliada §6-ter y §6-quater;
  AC1018 opcional detrás de su propia variable, §7), apagada por defecto y
  sin ninguna promoción a disponibilidad general — ver
  `docs/adr/0014-dwg-via-propia-unica.md` para la vía única propia. DXF es
  un subconjunto de texto con pérdidas explícitas; no se promete fidelidad
  universal.
- No existe compatibilidad .NET/VBA, GIS, raster georreferenciado, nubes de
  puntos, IFC ni object storage S3 conectado.
- Sí existen, y por eso ya no se niegan aquí: un modelador sólido B-rep
  facetado (`EXTRUDE`, `REVOLVE`, booleanas, empalmes, propiedades másicas),
  intercambio `IMPORT`/`EXPORT` en STEP e IGES 5.3, y un intérprete AutoLISP en
  sandbox con biblioteca `.lsp` por organización. Sus límites, que sí se
  mantienen: los sólidos son FACETADOS —un intercambio STEP/IGES conserva la
  faceta, no la superficie exacta que la generó—, el importador STEP sólo
  acepta sólidos de caras PLANAS (`PLANE` con lazos de aristas rectas; una
  cara `CYLINDRICAL_SURFACE` u otra superficie curva se rechaza con su número
  de entidad, nunca se ignora en silencio), y el AutoLISP es un subconjunto
  con presupuesto de ejecución y una única puerta de mutación, no el intérprete
  de Autodesk.
- El corpus de 100k usa LOD. Los números actuales no demuestran 60 FPS, tiempo
  real, memoria estabilizada ni detalle completo de 100k entidades.
- “Standalone” describe la identidad, autorización, datos y despliegue del
  producto. El repositorio incluye los ADAPTADORES de correo, de pagos
  (Stripe) y de CIDE, no los servicios: sin las credenciales del operador cada
  uno degrada de forma declarada (el checkout responde
  `checkout_unavailable`, el CFDI es manual, la asistencia responde
  `available:false`). Ya no es cierto que el producto «no capture pagos» —lo
  que sigue siendo cierto es que no los custodia: tarjeta, OXXO y SPEI viven
  en la pasarela.
- Un test unitario, un golden con red simulada o una ruta visible no bastan para
  anunciar una capacidad completa. La matriz competitiva exige evidencia del
  límite relevante y mantiene los gaps abiertos.

Consulta `docs/competitive/autocad-2027-gap-matrix.md` para el estado y los
criterios de promoción de cada categoría.
