# Candidato ValleCAD — 21 de septiembre de 2026

Registro de integración de PR224 sobre `main` `4232e1d2`, con prioridad en
integridad del dibujo, legibilidad del estudio y recorrido DWG. La autorización
del propietario comprende integrar y publicar el avance verificado. No equivale
a aceptación visual humana, evaluación con profesionales externos ni certificación.

## Cambios que deben viajar juntos

- La cinta distribuye los comandos según su ancho real, conserva rótulos completos
  y deja visibles las diez pestañas. Los paneles laterales se abren explícitamente.
- CLAYER se resuelve a la identidad persistente de la capa; renombrar conserva
  esa identidad. Reasignar una capa actualiza entidades, bloques, datos opacos y
  ventanas en el lote canónico. Panel, comandos y estado comparten la capa activa.
- El importador DWG evita aplanar geometría no representable silenciosamente,
  separa papel/modelo y rechaza resultados vacíos. Conserva el manifiesto de pérdidas.
- Las afirmaciones públicas DWG siguen las banderas de la build. CI ejercita las
  cinco versiones de importación habilitadas; wireframe 3D permanece deshabilitado.
- El comentario DXF queda fuera de HEADER para que lectores independientes no
  confundan su texto con INSUNITS. No cambia las coordenadas del exportador.
- Se integra el trabajo local previo de alias del propietario, preservando su
  checkout y stash; nueve entradas ya declaradas completan la tabla actual.
- El seed valida su documento antes de escribir, usa UUID y organización válidos
  y sólo recupera su propia fila vacía CAS0. No crea credenciales ni acceso web.
- Portada, acceso, precios y FAQ presentan el producto real; las imágenes del
  estudio proceden del editor. Lighthouse puede ejecutarse también en Windows.

## Evidencia y límites

El corpus independiente se mantiene en su repositorio separado y fijado a
`0688fb9c395b9cac4169d1ee9c23a7370cc28cf3`. No se alteraron admisiones, oráculos,
hashes ni firmas. Su [CI del pin](https://github.com/Sergiovalle3121/valle-design-dwg-conformance/actions/runs/33322811365)
y la [CI del HEAD auditado](https://github.com/Sergiovalle3121/valle-design-dwg-conformance/actions/runs/33450183431)
ejecutan las 35 pruebas, incluida la defensa contra symlinks, en Linux.
La creación de ese symlink está restringida en el Windows local; no se omite la prueba.

Los nuevos recorridos `e2e/real/release-*.spec.ts` usan API y PostgreSQL reales,
cuentas sintéticas y comandos visibles. Los JSON, DXF, PDF y capturas de esos
recorridos son muestras sin validez constructiva. Los tests de rendimiento y
las capturas de marketing identifican por separado sus fixtures y condiciones.

Una restauración local sintética verificó 42 tablas, 31 migraciones y 85 filas
idénticas, con RTO de 22,27 s. Ese resultado no acredita backups de producción.
Pagos/correos de proveedores reales, validación con profesionales y aceptación
del propietario requieren evidencia propia; no se deducen de los tests locales.

El estado final de cada SHA lo determinan los seis gates locales y los checks
requeridos del [PR224](https://github.com/Sergiovalle3121/valle-design/pull/224).
El despliegue se verifica después de la fusión por su SHA y por el dominio público.
Este registro no sustituye esos resultados ni declara compatibilidad DWG universal.
