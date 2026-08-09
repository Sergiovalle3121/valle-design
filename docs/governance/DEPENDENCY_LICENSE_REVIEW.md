# Revisión pendiente de licencias de dependencias

El SBOM completo del lockfile actual no contiene licencias desconocidas ni
familias bloqueadas. Cinco componentes tienen términos conocidos que requieren
una decisión humana antes de declarar la cadena “limpia” para distribución:

| Componente                           | Superficie observada en el lockfile   | Expresión reportada                      | Estado    |
| ------------------------------------ | ------------------------------------- | ---------------------------------------- | --------- |
| `@img/sharp-wasm32@0.35.3`           | runtime/opcional de `sharp`           | Apache-2.0 AND LGPL-3.0-or-later AND MIT | pendiente |
| `@img/sharp-win32-x64@0.35.3`        | runtime/opcional de `sharp`           | Apache-2.0 AND LGPL-3.0-or-later         | pendiente |
| `axe-core@4.12.1`                    | desarrollo, vía lint web              | MPL-2.0                                  | pendiente |
| `lightningcss@1.32.0`                | desarrollo, toolchain CSS web         | MPL-2.0                                  | pendiente |
| `lightningcss-win32-x64-msvc@1.32.0` | desarrollo, binario CSS de plataforma | MPL-2.0                                  | pendiente |

La presencia en esta tabla no es aprobación jurídica. El segundo revisor debe
confirmar para cada componente si sus términos y modo real de uso permiten el
build propietario, si se necesitan notices/oferta de fuente correspondiente, o
si debe reemplazarse. La decisión final debe registrar versión exacta,
plataforma, artefactos distribuidos, obligaciones y revisor.

`npm run check:licenses` mantiene estas entradas visibles y falla ante cualquier
licencia bloqueada o desconocida. Un upgrade que deje de declarar licencia no
hereda una excepción por nombre: las verificaciones manuales del gate están
fijadas a versión exacta.
