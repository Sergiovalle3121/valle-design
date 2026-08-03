# ADR-0003: Un kernel canónico y gate de entrada para Rust/WASM

- Estado: aceptado
- Fecha: 2026-08-02

## Contexto

El kernel comprobable es TypeScript: documento canónico, comandos, geometría,
índices, DXF, historia y proyecciones. No hay toolchain Rust ni artefacto WASM.
Introducir otro kernel sin paridad dividiría semántica, serialización,
determinismo, depuración y soporte de navegador.

## Decisión

Mantener un único documento y kernel semántico. Rust/WASM sólo puede entrar como
optimización detrás de una interfaz estable y con fallback TypeScript
worker-compatible. Antes de habilitarlo por defecto son obligatorios:

- perfil que identifique un cuello de botella puro y reproducible;
- benchmark antes/después con hardware, navegador, dataset y memoria;
- mejora material, no sólo una micro-medición favorable;
- toolchain pineado y build reproducible;
- pruebas diferenciales deterministas, goldens y E2E 10k/100k;
- límites de memoria, cancelación y manejo de fallo/carga;
- fallback funcional en los navegadores soportados; y
- ADR focal, SBOM, licencias y revisión de cadena de suministro.

El módulo optimizado no puede definir su propio formato de documento ni una
historia paralela.

## Consecuencias

Se prioriza corrección y observabilidad. Los benchmarks actuales de 100k no
justifican por sí solos una reescritura ni autorizan claims de 60 FPS. Una
diferencia de serialización o geometría bloquea el cambio de implementación por
defecto.

## Alternativas rechazadas

- Reescritura completa.
- Dos documentos canónicos.
- WASM sin fallback, medición de navegador o revisión de licencias.
- Usar una microprueba del índice como evidencia de experiencia interactiva.
