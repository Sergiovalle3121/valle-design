# ADR-0003: Kernel nativo y entrada de Rust/WASM

- Estado: aceptado
- Fecha: 2026-08-02

## Contexto

El kernel comprobado es TypeScript: documento canónico, command bus, geometría,
índice, DXF y adaptadores. No existe manifest Rust ni WASM. Introducir otro
kernel sin paridad dividiría semántica, determinismo y soporte.

## Decisión

Mantener un solo kernel semántico. Rust/WASM solo puede ser una optimización
detrás de una interfaz estable y fallback TypeScript; nunca una segunda fuente
del documento. Se aplica el gate completo de `AGENTS.md`: ADR focal, toolchain
fijado, fmt/clippy/test, build reproducible, paridad/goldens, E2E 100k,
mediciones, fallback y supply chain. Hasta cumplirlo, Rust/WASM está ausente.

## Consecuencias

Se prioriza corrección sobre benchmarks aislados. La salida serializada debe
ser determinista y compatible; cualquier diferencia conocida se documenta y
bloquea el reemplazo por defecto.

## Alternativas rechazadas

Reescritura completa, dos documentos canónicos y módulo WASM sin fallback o
sin pruebas de navegador.
