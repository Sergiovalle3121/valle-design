# Alcance de los gates de texto CAD

`visible-copy.spec.mjs` y `essential-properties.spec.mjs` ya estaban en la rama
de propiedades humanas. Esta revisión los refuerza; no crea un par paralelo.
Ambos corren dentro de `npm run check:cad` cuando se integra esa rama.

El primero inspecciona el texto JSX y los rótulos literales de los componentes
CAD en Esencial y Pro. Ahora lee también plantillas interpoladas y veta las
frases observadas «curvas nativas» y «geometría canónica». Conserva una única
excepción: el contenido de `CadDiagnosticsReadout`, montado para diagnóstico
explícito y fuera de la vista normal. La prueba inyecta jerga en la cabecera
real de selección y exige un fallo.

El segundo exige que la ficha humana use `field.label`, que el panel nativo
salga antes de construir la tabla técnica en Esencial y que la selección
histórica monte sólo su ficha humana en ese modo. Revisa tanto llamadas a
`field()` como objetos con `key` y `label`. La excepción exacta `color` →
«Color» existe porque ésa es la palabra común en español, no una clave cruda
ilegible. Las pruebas inyectan claves crudas y una tabla técnica en copias de
los componentes reales.

Son defensas de código fuente, no una medición de lo que ve un estudiante.
Una prueba exploratoria con las palabras adicionales `grips`, `snaps` y
`bounds` encontró siete coincidencias visibles todavía sin resolver en
`Layout3DEditor.tsx`, `CadLayoutManager.tsx` y `CadPropertiesPalette.tsx`.
También siguen textos ingleses de preparación en `CadLayoutManager.tsx`.
Se dejaron fuera de este cambio porque requieren revisar esos flujos y sus
pruebas de Pro. La puerta de salida «cero cadenas de desarrollador visibles»
requiere corregirlos y medir de nuevo la interfaz en ambos modos; un gate
verde aquí no equivale a esa meta.
