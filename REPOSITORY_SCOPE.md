# Alcance del repositorio

## Dentro

Valle Design es un producto CAD desplegable: frontend Next.js (`apps/web`),
API NestJS (`apps/api`), contratos OpenAPI/AsyncAPI y tipos compartidos
(`packages/contracts`), y cliente generado (`packages/design-sdk`). Su dominio
comprobado incluye documento CAD canónico con CAS/versiones, bloques, revisión,
publicación PDF, fondo e import/export DXF, intents/vision opcionales y blobs en
PostgreSQL.

## Fuera

Identidad/registro de usuarios, cobro, ERP/MES, Office y datos industriales no
pertenecen aquí. Platform firma la identidad y decide `design.cad`; Design solo
valida el JWT y, en modo configurado, consulta el entitlement. MinIO está en
Compose como reserva, pero el runtime actual no consume sus variables. DWG no
está implementado. Tampoco hay kernel Rust/WASM.

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
