# Alcance del repositorio

## Dentro

Valle Design es un **CAD 2D general y universal** desplegable: frontend Next.js
(`apps/web`), API NestJS (`apps/api`), contratos OpenAPI/AsyncAPI y tipos
compartidos (`packages/contracts`), y cliente generado (`packages/design-sdk`).
Dibuja planos de cualquier disciplina —arquitectónico, mecánico, eléctrico,
civil, de instalaciones, de mobiliario, de terreno—; el contenido mexicano es su
fortaleza inicial, no su límite. Ver [`IDENTITY.md`](IDENTITY.md).

Su dominio comprobado incluye documento CAD canónico con CAS/versiones, bloques,
revisión, publicación PDF, fondo e import/export DXF, intents/vision opcionales y
blobs en PostgreSQL.

## Fuera

**ERP, MES, planificación de plantas y gestión industrial no pertenecen aquí** y
no vuelven a entrar: nada de takt time, balanceo de líneas, órdenes de trabajo,
rutas de material, racks de almacén, transportadores ni montacargas. Un plano
_de_ una fábrica sí se dibuja —una nave industrial es una tipología de edificio—;
el software que _opera_ esa fábrica no existe en este repositorio. El gate
`scripts/cad/check-no-industrial-domain.mjs`, encadenado en `npm run check:cad`,
lo hace cumplir. Office y los datos industriales del producto de origen tampoco
pertenecen aquí.

MinIO está en Compose como reserva, pero el runtime actual no consume sus
variables. DWG tiene un códec experimental interno (`packages/dwg-codec`) que no
está expuesto en el producto. El kernel Rust/WASM existe como crate
(`crates/valle-cad-kernel`), artefacto (`apps/web/public/wasm`) y specs de
paridad, pero todavía no lo consume ningún camino de la aplicación: por el
criterio de evidencia de abajo, es parcial, no soportado.

## Criterio de evidencia

“Soportado” exige UI → motor → persistencia/interoperabilidad → prueba. Código
aislado, fixture moqueado, documento de ejecución o endpoint sin recorrido se
marca parcial; una intención o dependencia futura se marca ausente. La matriz
en `docs/competitive/autocad-2027-gap-matrix.md` aplica este criterio.

## Límites de datos

Los contratos versionados son la única frontera entre productos. La migración
enterprise→Design es una herramienta operativa, no permiso para reintroducir
tablas o módulos enterprise. Los identificadores `legacy/` se conservan por
compatibilidad de datos/archivo, no amplían el alcance.
