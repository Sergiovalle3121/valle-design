# El puente .NET / VBA / ObjectARX: por qué no va a existir

La respuesta corta, para que nadie la busque entre párrafos: **aquí no vas a
poder cargar un `.dll` de .NET, ni un módulo VBA, ni un `.arx`.** No es que
esté en cola. Es una decisión, y esta página dice por qué se tomó, cuál es el
camino que sí existe para cada familia de código y qué cuesta de verdad
recorrerlo.

Se publica porque la alternativa —callarlo, o escribir «próximamente»— se
descubre en la primera conversación técnica seria, y quien descubre eso deja de
creer también lo que sí era cierto. La cobertura real del lenguaje que **sí**
está, función por función, se genera de la tabla del intérprete y vive en
`docs/api/autolisp-cobertura.json`; la guía del desarrollador es
`docs/api/EXTENSIBILIDAD.md`.

## Por qué no

### Esto corre en un navegador, y ahí no hay CLR

Una extensión de .NET para AutoCAD es un ensamblado que el ejecutable carga en
su propio proceso y ejecuta sobre el CLR de Windows. En una pestaña de navegador
no hay proceso de AutoCAD, no hay CLR y no hay cargador de ensamblados. Se puede
poner a correr un runtime de .NET compilado a WebAssembly —eso existe—, pero eso
resolvería la mitad que no es el problema.

### El problema no es el runtime: es el modelo de objetos de otro fabricante

Una rutina .NET no llama a «AutoCAD»: llama a `AcDbDatabase`,
`BlockTableRecord`, `Transaction`, `ObjectId`, `Editor.GetEntity` —el modelo de
objetos de Autodesk, con su semántica de transacciones, sus identificadores
persistentes y sus tablas de símbolos—. Aunque el CLR estuviera dentro del
navegador, ese ensamblado buscaría unas bibliotecas que no existen aquí y que no
podemos escribir: reimplementarlas sería **mantener un clon del modelo de datos
de otro fabricante**, versión a versión, con su comportamiento en cada caso
extremo, para que el código compilado contra ellas no se rompa. Ese es el
trabajo real, y no lo hace un puente: lo hace reescribir el producto de otro.

### VBA no es un lenguaje que se pueda implementar y ya

El VBA de AutoCAD es un runtime licenciado que Microsoft dejó de vender por
separado; en AutoCAD llega como un módulo aparte que hay que instalar y que
Autodesk mantiene por compatibilidad, no como una apuesta. Escribir un
intérprete de Visual Basic para poder ejecutar macros de despacho sería un
proyecto entero —el lenguaje, sus formularios, su modelo de eventos— para
alcanzar una superficie que su propio fabricante está dejando morir.

### ObjectARX es C++ compilado contra las cabeceras de una versión concreta

Un `.arx` es código nativo que se enlaza con las bibliotecas internas de una
versión exacta de AutoCAD; ni siquiera es portable entre versiones del propio
AutoCAD sin recompilar. Cargarlo aquí exigiría, además de todo lo anterior, un
cargador de código nativo dentro del navegador y las mismas cabeceras
propietarias. No hay puente posible; hay reescritura.

### Y una razón que no es técnica

Aunque las tres barreras se pudieran pagar, el resultado sería una promesa de
compatibilidad **con el producto de un competidor**, que se rompe cada vez que
él cambia algo, y que este proyecto tendría que perseguir para siempre. Poner
ese esfuerzo en que las rutinas AutoLISP de un despacho corran de verdad —que es
donde está la biblioteca que la gente escribió con sus manos— rinde mucho más
por hora de trabajo.

### La condición para reabrirlo

No se escribe «nunca»: se escribe la condición. Esta decisión se reabre si
aparece un runtime del modelo de objetos de AutoCAD, publicado por su fabricante
o con licencia que permita empotrarlo, que se pueda ejecutar sin el ejecutable
de escritorio. Mientras eso no exista, lo que hay debajo es el camino.

## El camino que sí existe, familia por familia

| De dónde vienes | A dónde vas | Qué tipo de trabajo es |
| --- | --- | --- |
| VBA / Visual LISP con ActiveX | AutoLISP con el puente `vlax-*`/`vla-*` | Traducción, casi renglón a renglón |
| .NET (`[CommandMethod]`) | Plugin del estudio en TypeScript | Reescritura del acceso, se conserva el algoritmo |
| ObjectARX (C++) | Plugin del estudio, o la API HTTP | Reescritura completa |

### VBA → AutoLISP: el mismo modelo de objetos, otra sintaxis

Es el caso afortunado, y no por casualidad: una macro VBA de AutoCAD y una
rutina Visual LISP hablan del **mismo** modelo de objetos ActiveX. Por eso este
producto construyó el puente de entidades entero —`vlax-ename->vla-object`, las
propiedades `vla-get-*`/`vla-put-*`, `vlax-curve-*`— y por eso una macro que
dibuja, mide y cambia propiedades se traduce renglón a renglón.

El original, tal cual sale del editor de VBA:

```vb
Sub Marca()
  Dim centro(0 To 2) As Double
  Dim circulo As AcadCircle
  Dim rotulo As AcadMText
  centro(0) = 1200#: centro(1) = 800#: centro(2) = 0#
  Set circulo = ThisDrawing.ModelSpace.AddCircle(centro, 25#)
  circulo.Layer = "EJES"
  Set rotulo = ThisDrawing.ModelSpace.AddMText(centro, 0, "R25")
  rotulo.Layer = "TEXTOS"
End Sub
```

Y su traducción, que **este repositorio ejecuta** cada vez que corre
`apps/web/src/lib/lisp/cobertura.spec.ts`: el bloque se extrae de este mismo
documento, se corre contra un dibujo y se comprueba que deja el círculo en
`EJES` con su radio y el rótulo en `TEXTOS`. Si alguien lo edita y lo rompe, el
gate se pone rojo — un ejemplo de migración que no se ejecuta es una captura de
pantalla de una migración.

<!-- se-ejecuta: migracion-vba -->
```lisp
(defun c:marca (/ centro radio)
  (setq centro '(1200.0 800.0 0.0))
  (setq radio 25.0)
  (entmake (list (cons 0 "CIRCLE") (cons 8 "EJES") (cons 10 centro) (cons 40 radio)))
  (entmake
    (list (cons 0 "MTEXT") (cons 8 "TEXTOS")
          (cons 10 (polar centro 0.0 (* radio 1.5)))
          (cons 40 2.5)
          (cons 1 (strcat "R" (rtos radio 2 0)))))
  (princ))
```

La misma macro escrita con objetos ActiveX —que es como está la mitad de las
bibliotecas publicadas— también corre, porque el puente contesta con el
documento canónico detrás:

```lisp
(vl-load-com)
(setq obj (vlax-ename->vla-object (car (entsel "Designe el círculo: "))))
(vla-put-Layer obj "EJES")
(vlax-put-property obj 'Radius 25.0)
```

**Dónde se acaba la traducción, y hay que rediseñar:**

- `ThisDrawing.Utility.GetEntity` cuando se usa para designar **dentro de un
  bloque**: la designación anidada es una de las entradas «todavía no» de la
  matriz, con su motivo.
- Los `UserForm`: aquí el diálogo se escribe en DCL y es de un viaje —se piden
  los datos y se acepta—, sin validación en vivo ni campos que se habiliten
  según otro.
- Cualquier cosa que salga del dibujo por COM —escribir una hoja de Excel,
  abrir un fichero del disco—: el intérprete no tiene sistema de ficheros y lo
  dice en vez de fingir que escribió. Los datos salen del producto por sus
  propias exportaciones o por la API HTTP.
- El objeto de **aplicación** (`vlax-get-acad-object` y compañía): declarado
  fuera de alcance con su motivo, porque devolver un objeto que acepta
  propiedades y no cambia nada sería el «éxito sin efecto» que este proyecto
  tiene prohibido por gate.

**El coste real**: una rutina de despacho que dibuja, mide, lee y escribe
propiedades y cambia capas se traduce en una sesión de trabajo, leyendo la
matriz de cobertura al lado. Una que abre formularios y exporta a Excel no se
traduce: se parte en dos —la parte que toca el dibujo, que sí pasa; y la que
sale de él, que se rehace contra otra puerta—.

### .NET → plugin del estudio: se conserva el algoritmo, se reescribe el acceso

Un comando .NET típico declara su nombre con un atributo, abre una transacción,
recorre la base de datos y escribe:

```csharp
[CommandMethod("RECUENTOCAPAS")]
public void RecuentoCapas()
{
    var doc = Application.DocumentManager.MdiActiveDocument;
    using (var tr = doc.Database.TransactionManager.StartTransaction())
    {
        var btr = (BlockTableRecord)tr.GetObject(doc.Database.CurrentSpaceId, OpenMode.ForRead);
        foreach (ObjectId id in btr) { /* … contar por capa … */ }
        tr.Commit();
    }
}
```

El equivalente aquí es un plugin: el mismo algoritmo, con el acceso al modelo
cambiado y —esto es lo que no tiene el original— **permisos declarados**. El
ejemplo completo y probado está en
`apps/web/src/lib/lisp/plugins/examples/recuento-capas.ts`, y su forma es ésta:

```ts
export const RECUENTO_CAPAS_PLUGIN: CadPlugin = {
  manifiesto: 1,
  id: "recuento-capas",
  // Sin `documento:escritura`: este plugin cuenta, no dibuja. Y el motor se lo
  // hace cumplir, no es una declaración de intenciones.
  permisos: ["documento:lectura", "comandos:registro", "ui:panel"],
  commands: [/* descriptor de máquina de estados, como los nativos */],
  panels: [/* el panel que publica el recuento */],
};
```

Lo que cambia respecto de .NET, y conviene saber antes de empezar:

- No hay transacción explícita: se acumula un lote de comandos canónicos y el
  editor lo confirma en un solo paso de deshacer.
- No hay `ObjectId` de base de datos abierta en modo lectura o escritura: se lee
  el documento y se escribe por `apply`.
- El comando es una **máquina de estados pura**, no un método que bloquea
  pidiendo datos al usuario. Es lo que permite que el mismo comando se pruebe
  sin editor.

**El coste real**: la lógica de negocio —la que ordena, cuenta, calcula, decide
dónde va cada cosa— se conserva casi entera, porque es aritmética y listas. Lo
que se reescribe es el acceso al modelo y la interacción, que en una rutina de
despacho suelen ser la parte corta. Y hay un límite que hay que decir en voz
alta antes de que alguien empiece: **el SDK de plugins todavía no está cableado
al editor**, así que hoy se puede escribir un plugin y probarlo, pero no
instalarlo desde fuera del producto. Está declarado así en
`docs/api/EXTENSIBILIDAD.md` y el diseño de lo que falta, en
`docs/execution/frentes/ext-peticiones.md`.

### ObjectARX → no hay traducción

Si tu extensión es C++ contra las bibliotecas internas de AutoCAD, no hay
camino corto y no vamos a fingir que lo hay. Lo que se puede recuperar es el
**algoritmo**, no el código: se reescribe como plugin del estudio si necesita
correr dentro del editor, o como proceso propio contra la API HTTP si lo que
hace es procesar dibujos en lote. La API y su SDK generado están en
`packages/contracts/specs/design-api.v1.yaml`.

**El coste real**: es un proyecto de reescritura, no una migración. Quien tenga
un `.arx` grande debería empezar por preguntarse qué parte de él sigue siendo
necesaria: mucho código ObjectARX existe para rodear límites de AutoLISP que
aquí no están puestos en el mismo sitio.

## Resumen honesto

- **No habrá** carga de `.dll`, `.arx` ni módulos VBA. La condición para
  reabrirlo está escrita arriba.
- **Sí hay** un intérprete AutoLISP con su puente Visual LISP de entidades, y su
  cobertura exacta —con los límites y lo que todavía no está— se publica
  generada de la tabla viva en `docs/api/autolisp-cobertura.json`.
- **Sí hay** un contrato de plugins en TypeScript con permisos que se hacen
  cumplir, pendiente de cablear al editor.
- **Sí hay** una API HTTP con SDK generado para todo lo que no necesita correr
  dentro del navegador del dibujante.
