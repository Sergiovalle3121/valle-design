# Identidad de Valle Design

> Si acabas de abrir este repositorio, lee esta página antes que ninguna otra. Son treinta segundos
> y evitan el malentendido que arrastró el proyecto durante meses.

## Qué es

**Valle Design es un CAD 2D general y universal que corre en el navegador y compite con AutoCAD.**

Dibuja planos. Cualquier plano: arquitectónico, mecánico, eléctrico, civil, de instalaciones, de
mobiliario, de terreno. Su dominio es el dibujo de precisión —capas, bloques, cotas asociativas,
referencias a objeto, espacio papel, escalas de ploteo, intercambio DXF— y contra ese dominio se
mide su comportamiento.

## Para quién

Para cualquiera que necesite entregar un plano acotado y a escala:

- el arquitecto que levanta una planta y su cuadro de acabados;
- el ingeniero mecánico que dibuja una pieza con cortes y tolerancias;
- el electricista que traza un diagrama unifilar o un plano de fuerza y alumbrado;
- el ingeniero civil o el topógrafo que levanta un predio con su cuadro de construcción;
- el proyectista de instalaciones que resuelve hidráulica, sanitaria o aire acondicionado;
- el carpintero o herrero que despieza un mueble antes de cortarlo.

Todos ellos son clientes válidos y el producto ya los sirve.

El contenido mexicano —plantillas de casa habitación, consultorio, taquería, tortillería, notaría;
cajetines, normas de acotación y vocabulario de dibujo en español mexicano— es la **fortaleza
inicial** del producto y su mejor diferenciador frente a AutoCAD. **No es su límite.** Lo
arquitectónico es donde el catálogo está más maduro, no la frontera de lo que la herramienta dibuja.

**México es el arranque, no el techo.** El producto sale primero al mercado mexicano porque ahí está
su contenido más fuerte, pero debe servir a un despacho en Bogotá, en Madrid o en Houston sin pedir
permiso: la convención de números y fechas, las unidades, los tamaños de papel y la norma de
acotación son **configuración regional**, no constantes del código. Un `es-MX` incrustado a mano en
un módulo es deuda, no localización.

**Y no es de nicho de ninguna industria.** Lo puede usar un arquitecto de vivienda, un ingeniero
mecánico, un topógrafo o el proyectista de una nave industrial, y ninguno debe encontrarse los
defaults del otro. Que el ejemplo de un bloque diga «celda SMT» o que la búsqueda proponga «AOI,
ESD» convierte una herramienta universal en una que parece de electrónica: eso es residuo de Axos,
no una decisión de producto, y se corrige donde aparezca.

## Contra qué compite

Contra AutoCAD 2D de Autodesk, y contra sus clones de escritorio. La comparación se documenta con
evidencia medida, no con adjetivos: ver `docs/competitive/autocad-2027-gap-matrix.md` y el criterio
de evidencia de [`REPOSITORY_SCOPE.md`](REPOSITORY_SCOPE.md) (UI → motor → persistencia →
prueba; lo que no cumple los cuatro pasos se marca parcial o ausente).

## Lo que Valle Design NO es

Con todas sus letras, para que no vuelva a discutirse:

- **No es un ERP.** No administra compras, ventas, inventarios, nómina ni contabilidad de una
  empresa manufacturera.
- **No es un MES.** No ejecuta ni supervisa manufactura, no emite órdenes de trabajo, no reporta
  avance de producción.
- **No gestiona industrias.** No modela operarios, turnos, capacidades ni supervisión de piso.
- **No balancea líneas de producción.** No calcula takt time, no arma diagramas yamazumi, no reparte
  carga entre estaciones.
- **No administra inventarios.** No hay racks, andenes, surtido, reabasto ni supermercados de
  kitting.
- **No planifica plantas de manufactura.** No optimiza flujo de material, no traza rutas de
  montacargas, no calcula pasillos de holgura por norma industrial.
- **No tiene inteligencia artificial.** Ni copiloto en lenguaje natural, ni visión que adivine
  muros desde una foto, ni sugerencias de un modelo. La que hubo se llamaba **CIDE** y era el motor
  de Axos OS, el ERP del que este producto nació: llegó de polizón en la separación y se retiró
  entera —proveedor, servicios, rutas `/v1/cad/intent` y `/v1/cad/vision`, panel «Copiloto CAD» y
  su fila de rúbrica—. Lo que el producto sí tiene, por decisión explícita del titular, es
  **trabajo en equipo entre personas**: mensajería, videollamada y pantalla compartida.
  Sigue existiendo un **registro local de frases** (`lib/cad/commands/registry.ts`) que convierte
  «coloca una puerta en 3000,2000» en una operación: es un parser determinista, sin modelo y sin
  red, y la paleta lo etiqueta «Frase» justo para que nadie lo confunda con lo que se fue.

Un plano **de** una fábrica sí se dibuja: una nave industrial, una planta embotelladora, un centro
de distribución o una planta de tratamiento de agua son **tipologías de edificio**, y un CAD
universal debe poder dibujarlas. Lo que no existe aquí es el software que **opera** esa fábrica.

Regla para cualquier función nueva: **debe servir a alguien que dibuja un plano.** Si sirve a alguien
que administra una operación industrial, no pertenece a este repositorio.

## De dónde viene (y por qué quedan identificadores `axos`)

Valle Design nació dentro de un ERP industrial —primero llamado **Axos OS**, después **Valle
Enterprise**— que entre muchos otros módulos incluía un planificador de plantas de manufactura. El
editor de dibujo de ese planificador creció hasta volverse un CAD de propósito general, y en 2026 se
separó a este repositorio como producto standalone. Todo lo que quedó del ERP se ha ido retirando en
campañas sucesivas; la última, documentada en `docs/execution/INFORME_CAMPANA_IDENTIDAD_20260822.md`,
borró la funcionalidad industrial que aún se descargaba en el navegador del cliente.

Pero hay una parte que **no se puede retirar y no se va a retirar**: los identificadores que ya se
escribieron en datos de clientes.

| Identificador congelado                       | Dónde vive                                                    | Por qué no se renombra                                                                                           |
| --------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `AXOS-CAD-STUDIO`                             | columna `model` de todos los documentos CAD existentes        | renombrarlo no es un renombre: es una migración de datos de todos los clientes                                   |
| `AXOS_DIM`, `AXOS_MLEADER`, `AXOS_BLOCK`      | dentro de los archivos **DXF que los usuarios ya exportaron** | esos archivos viven en discos de clientes y de terceros; el importador debe seguir leyéndolos o quedan ilegibles |
| `axos_theme`                                  | `localStorage` de cada usuario                                | renombrarlo pierde la preferencia de tema de todo el mundo                                                       |
| `axos_locale`                                 | cookie de idioma                                              | igual                                                                                                            |
| claves de `command-session` y `cad-workspace` | historial de comandos y preferencias de workspace persistidas | igual                                                                                                            |
| marcadores de viewport                        | documentos y preferencias guardadas                           | igual                                                                                                            |
| tipo `"station"` del esquema de documento     | documentos de clientes ya guardados                           | quitarlo exige subir versión de esquema y migrar; hasta entonces se **lee** pero no se **ofrece**                |

**No es descuido. Es compatibilidad.** Los detalles y la condición de retiro de cada uno están en
`packages/contracts/src/legacy/README.md`, y el test-candado
`apps/web/src/lib/cad/persisted-identifiers.spec.ts` falla si alguien los "limpia".

Regla general, y es la que evita el accidente: **si una cadena se escribe en disco, en una cookie, en
`localStorage` o dentro de un archivo que el usuario descarga, no se renombra por estética.** Se
migra, con versión de esquema y plan, o se deja quieta.

Lo mismo vale para `apps/api/src/migration-cli/`: no es residuo del ERP, es la puerta por la que un
cliente del ERP viejo trae sus datos a Valle Design. Es adquisición de clientes, no deuda.

## Cómo se sostiene esto

Cuatro candados ejecutables, no buenas intenciones:

- `scripts/cad/check-no-industrial-domain.mjs` (encadenado en `npm run check:cad`) falla si vuelve a
  aparecer vocabulario o funcionalidad de ERP/MES/planificación industrial en el código de producto.
- `scripts/cad/check-no-line-engineering.mjs` prohíbe reintroducir las rutas HTTP del producto viejo.
- `apps/web/src/lib/cad/persisted-identifiers.spec.ts` afirma que los identificadores congelados de
  arriba siguen exactamente como están.
- `apps/web/src/lib/cad/no-ai-boundary.spec.ts` falla si vuelve la IA: una orden o alias que la
  anuncie, uno de los módulos retirados de vuelta en el árbol, o una ruta de asistencia publicada
  otra vez en el contrato.

Si uno de esos gates te estorba, la respuesta casi nunca es apagarlo. Lee primero
[`REPOSITORY_SCOPE.md`](REPOSITORY_SCOPE.md) y [`AGENTS.md`](AGENTS.md).
