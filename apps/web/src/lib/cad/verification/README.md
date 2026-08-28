# Verificación numérica — la matemática al cien

Un CAD es una calculadora que dibuja. Si un número sale mal, todo lo demás da
igual: la interfaz más pulida del mundo no compensa un muro que mide 3.47 m
cuando el arquitecto lo dibujó de 3.50.

Esta carpeta es el gate que impide eso. Lo que la distingue del resto de las
suites del repositorio —que también son buenas y también prueban geometría— es
**contra qué se compara**.

## La regla: oráculo INDEPENDIENTE

Ningún caso de esta carpeta se valida contra el código que prueba. Cada
afirmación numérica se contrasta con una de estas dos cosas, y sólo con una de
estas dos:

1. **Un resultado analítico conocido en papel.** Dos circunferencias de radio 5
   con centros a distancia 8 se cortan en dos puntos cuyas coordenadas exactas
   se calculan a mano: la semicuerda es `√(25 − 16) = 3`. El número que exige
   el test lo escribió una persona resolviendo el triángulo, no una corrida
   anterior del producto.

2. **Una implementación de referencia por fuerza bruta**, escrita aparte en
   `oracle.ts`, que resuelve el mismo problema por un camino DISTINTO —muestreo
   denso y refinamiento numérico donde el producto usa álgebra cerrada. Nunca
   importa el módulo bajo prueba.

Lo que esta carpeta prohíbe explícitamente es el *golden* de regresión: fijar
como verdad lo que el programa devolvió ayer. Eso detecta cambios, que también
sirve, pero no detecta que ayer ya estuviera mal. Aquí se prueba que el número
es **correcto**, no que sea **el mismo**.

## Tolerancias declaradas

Toda comparación lleva su tolerancia escrita al lado y con su razón. No hay un
`EPS` global: la tolerancia de una intersección analítica (1e-9, límite del
doble) no es la de una bisección (1e-7, límite del método), y confundirlas es
cómo un gate deja de detectar un error real.

## Qué corre esto

`npm run check:cad-math`, encadenado en `npm run check:cad`.
