# ADR-0015: M4 no estaba bloqueado — la fuente permitida era la especificación, y el hecho se resolvió midiendo

- Estado: Aceptada
- Fecha: 2026-08-31
- Decide sobre: el bloqueo `BLOCKED_BY_SOURCE_GATE` que congeló las versiones
  DWG modernas (AC1024/AC1027/AC1032) desde el 2026-08-23
- Relacionadas: ADR-0004, ADR-0007, ADR-0009 (§7 nombra M4 como no
  autorizado por adelantado), ADR-0012, ADR-0014
- No promueve: ninguna capacidad. `readR2004Database` sigue fallando cerrado
  para las tres versiones y `DWG_PROMOTION_GATES` no cambia un bit.

## Contexto

El 2026-08-23 el laboratorio dejó la codificación del tipo de objeto R2010+
marcada `BLOCKED_BY_SOURCE_GATE`. El informe de cierre del 2026-08-24 (§11.7)
elevó ese bloqueo a la categoría de imposibilidad externa con este
razonamiento:

> «La única fuente que resolvería esto de verdad es la especificación de
> ODA/RealDWG/LibreDWG — exactamente lo que la política clean-room de este
> laboratorio excluye por nombre.»

Ese razonamiento tenía dos errores, y conviene separarlos porque se corrigen
de forma distinta.

**Error 1 — conflación de especificación con implementación.** ADR-0007 y
`CLEAN_ROOM_POLICY.md` prohíben *«copiar, traducir, portar o adaptar
implementaciones, headers, bindings, tablas, comentarios o tests»* de ODA SDK,
RealDWG, Autodesk o LibreDWG. Eso son **implementaciones**. Un documento de
especificación cae en la categoría de fuentes permitidas «documentación
pública cuyos términos permitan extraer los hechos técnicos mínimos
registrados», y hay una vigente: `ODA-ODS-DWG-5.4.1-PUBLIC`, `status: allowed`
desde el 2026-08-14, con sus términos («facts only, no redistribution») y sus
hechos anotados uno a uno. De ella salieron los **54 archivos derivados** que
son el laboratorio entero. §11.7 declaró prohibida en bloque la fuente que
había construido todo lo que ese mismo informe celebraba.

**Error 2 — el bloqueo no hacía falta.** §11.7 terminaba nombrando ella misma
la salida: *«hacen falta más identificaciones independientes (más tipos, no
sólo LINE) para acotar el espacio de hipótesis sin adivinar»*. Esas
identificaciones ya estaban en el corpus admitido. Los cinco bundles
fundacionales son **los mismos ocho dibujos** convertidos a cinco contenedores
desde un DXF fuente byte-idéntico, y AC1015 ya se decodifica con cero
discrepancias: su gemelo da el tipo esperado de **cada** handle. No una
entidad conocida: 2893 objetos con la respuesta conocida de antemano.

## Decisión

1. **Se corrige la política, sin cambiar ninguna prohibición.**
   `CLEAN_ROOM_POLICY.md` gana una sección, «Especificación consultada vs.
   implementación prohibida», que escribe la distinción que su texto ya
   implicaba y que §11.7 no supo leer. Lo prohibido sigue siendo exactamente
   lo mismo; lo que se añade es la pregunta correcta ante una fuente: **¿qué
   es —documento o implementación— y sus términos permiten la actividad
   concreta?**, en vez de «¿lleva el nombre de un codec ajeno?».
2. **Se registra como hecho medido**, no documental, la estructura del
   encabezado de objeto R2010+ (`VALLE-CORPUS-R2010-OBJECT-HEADER` en
   `SOURCE_REGISTER.json`): `MS` tamaño · `UMC` tamaño EN BITS del flujo de
   handles · `BOT` tipo · `H` handle propio. No se consultó ninguna fuente
   nueva, documental ni de implementación, para derivarlo.
3. **Se acepta la falsación como suficiente para el laboratorio**, y se
   escribe cuál es: el handle propio viaja pegado detrás del campo de tipo y
   el mapa de handles ya dice cuál debe ser, así que un ancho equivocado en
   cualquiera de los tres campos previos lo desalinearía. Sale **exacto en
   2893/2893** objetos de los 24 fixtures AC1024/AC1027/AC1032. La segunda
   comprobación, independiente de la primera, compara el tipo con el del
   gemelo AC1015: **1353/1413** de tipo fijo, con **AC1027 351/351** y
   **AC1032 351/351** sin una sola discrepancia.
4. **Se declara capacidad ausente, no hueco olvidado**, para los selectores 2
   y 3 del `BOT`: no aparecen ni una vez en los 2893 objetos, así que su ancho
   y su orden de bytes quedan sin observar y `readBOT` falla cerrado ante
   ambos. Inventarles un ancho daría un tipo plausible y equivocado que además
   desalinea todo lo que viene detrás — el peor modo de fallo disponible aquí.
   Ampliarlo exige corpus que los ejercite.
5. **Se autoriza continuar M4** —la decodificación del CUERPO de objeto
   R2010+— bajo la misma disciplina de siempre: hecho registrado antes de
   derivar, evidencia falsable, `CAPABILITIES.md` como única fuente de claims,
   flag propio apagado por defecto y su propia sección de ADR-0009 antes de
   tocar el producto. Esta ADR **no** autoriza por adelantado ninguna
   promoción a producto.

## Lo que esta ADR NO hace

- **No promueve nada.** `readR2004Database` sigue lanzando
  `DWG_VERSION_DECODER_UNSUPPORTED` para AC1024/AC1027/AC1032;
  `DWG_VERSION_REGISTRY` las mantiene en `decoderStatus: "unsupported"`;
  `productionAvailable` y `legalReviewCleared` siguen `false`.
- **No dice que M4 esté resuelto.** Decodificar el ENCABEZADO no es
  decodificar el CUERPO, y el cuerpo es la parte grande: el flujo de datos
  R2010+ manda las cadenas a un flujo propio y su cabecera común de entidad
  difiere de la R2000. Se probó reconstruir la forma R2000 y reusar los
  decodificadores existentes barriendo **todos** los `bitsize` posibles:
  ninguno hace decodificar una LINE real. La frontera se movió y se estrechó;
  no desapareció.
- **No reescribe historia.** §11.7 se queda donde está, con su fecha; la
  corrección vive en §12 del mismo informe, nombrando el error.

## Consecuencias

- La ruta a AC1032 —el formato en que AutoCAD 2018–2026 guarda por defecto, y
  por tanto el mayor hueco comercial del DWG— deja de estar declarada
  imposible y pasa a ser trabajo acotado con su siguiente paso nombrado.
- Queda un precedente incómodo y útil: un bloqueo declarado por escrito, con
  su cadena de razonamiento, sobrevivió una semana sin que nadie contrastara
  su premisa contra `SOURCE_REGISTER.json`. La lección operativa es que un
  «bloqueado por falta de fuente» debe citar la entrada del registro que lo
  sostiene, o no es una conclusión: es una suposición con formato de
  conclusión.
- El corpus demuestra otra vez que vale más de lo que costó: los mismos ocho
  dibujos en cinco contenedores resultaron ser un oráculo diferencial que
  resolvió gratis lo que se había declarado irresoluble.
