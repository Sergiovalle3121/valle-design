/**
 * Las rutinas de FÁBRICA, empaquetadas.
 *
 * GENERADO por `scripts/generate-lisp-factory.mjs` a partir de los ficheros
 * `.lsp` de esta carpeta. No se edita a mano: se edita el `.lsp` y se vuelve a
 * generar. `factory.spec.ts` compara los dos y falla si divergen.
 *
 * ## Qué son y por qué vienen puestas
 *
 * Un despacho que estrena un CAD no tiene todavía su biblioteca de rutinas, y
 * «se pueden cargar rutinas» no es una razón para cambiar de programa: la razón
 * es que el primer día ya haya algo que le ahorre una tarde. Estas cuatro
 * resuelven encargos que un arquitecto mexicano reconoce sin que nadie se los
 * explique: el cuadro de áreas, la tabla de puertas y ventanas, el recuento de
 * bloques y la numeración de ejes.
 *
 * Vienen además como CÓDIGO LEGIBLE y no como comandos nativos a propósito: son
 * la plantilla con la que un despacho adapta las suyas. Si esto corre, las suyas
 * corren.
 */
export interface CadLispFactoryRoutine {
  name: string;
  source: string;
}

/** Las rutinas de fábrica, en el mismo orden alfabético en que autocargan. */
export const CAD_LISP_FACTORY_ROUTINES: readonly CadLispFactoryRoutine[] = [
  {
    name: "cuadro-areas.lsp",
    source: `;;; ---------------------------------------------------------------------------
;;; CUADRO-AREAS.LSP — el cuadro de áreas del proyecto, sacado del modelo.
;;;
;;; Dibuja la tabla que se entrega con cada juego de planos: un renglón por
;;; local, con su área a ejes y su área útil. Los números NO se teclean ni se
;;; miden con DIST: salen de \`(vd-areas)\`, que recorre los ejes de los muros y
;;; se queda con las caras cerradas. Mueve un muro, vuelve a lanzar el comando,
;;; y la tabla dice lo que dice el plano.
;;;
;;; UNIDADES. \`vd:factor-area\` convierte el área del dibujo a la unidad de la
;;; tabla. Viene puesto para un dibujo en MILÍMETROS (1.000.000 mm² = 1 m²). Si
;;; tu despacho dibuja en metros, cambia esta única línea a 1.0.
;;; ---------------------------------------------------------------------------

(setq vd:factor-area 0.000001)
(setq vd:capa-cuadro "TEXTOS")
(setq vd:alto-renglon 250.0)
(setq vd:alto-texto 180.0)
(setq vd:columna-1 0.0)
(setq vd:columna-2 3000.0)
(setq vd:columna-3 5200.0)

;; Un renglón son tres textos alineados. Se saca a su propia función porque el
;; encabezado, los locales y el total son EL MISMO renglón con otro contenido:
;; escribirlo tres veces habría garantizado que uno se desalinease.
(defun vd:renglon (x y a b c)
  (entmake (list (cons 0 "MTEXT") (cons 8 vd:capa-cuadro)
                 (list 10 (+ x vd:columna-1) y 0.0)
                 (cons 1 a) (cons 40 vd:alto-texto)))
  (entmake (list (cons 0 "MTEXT") (cons 8 vd:capa-cuadro)
                 (list 10 (+ x vd:columna-2) y 0.0)
                 (cons 1 b) (cons 40 vd:alto-texto)))
  (entmake (list (cons 0 "MTEXT") (cons 8 vd:capa-cuadro)
                 (list 10 (+ x vd:columna-3) y 0.0)
                 (cons 1 c) (cons 40 vd:alto-texto)))
  y)

;; El área útil puede no estar definida —un local con lados paralelos
;; consecutivos no tiene esquina interior— y entonces \`vd-areas\` devuelve nil.
;; Se escribe un guion, que se VE, en vez del área a ejes disfrazada de útil.
(defun vd:medida (valor)
  (if valor (rtos (* valor vd:factor-area) 2 2) "—"))

(defun c:cuadroareas ( / origen locales x y total)
  (setq origen (getpoint "\\nEsquina superior izquierda del cuadro de areas: "))
  (if (null origen)
    (progn (princ "\\nCancelado: el cuadro necesita un punto de insercion.") nil)
    (progn
      (setq locales (vd-areas))
      (if (null locales)
        (progn
          (princ "\\nNingun local cerrado: revisa que los muros se toquen en sus extremos.")
          nil)
        (progn
          (setq x (car origen))
          (setq y (cadr origen))
          (vd:renglon x y "LOCAL" "AREA EJES" "AREA UTIL")
          (setq total 0.0)
          (foreach local locales
            (setq y (- y vd:alto-renglon))
            (setq total (+ total (nth 1 local)))
            (vd:renglon x y (nth 0 local) (vd:medida (nth 1 local)) (vd:medida (nth 2 local))))
          (setq y (- y vd:alto-renglon))
          (vd:renglon x y "TOTAL" (vd:medida total) "")
          (princ (strcat "\\n" (itoa (length locales)) " locales, "
                         (rtos (* total vd:factor-area) 2 2) " de area a ejes."))
          total)))))
`,
  },
  {
    name: "cuenta-bloques.lsp",
    source: `;;; ---------------------------------------------------------------------------
;;; CUENTA-BLOQUES.LSP — cuántas veces está insertado cada bloque.
;;;
;;; El recuento que se hace antes de cada entrega y antes de cada pedido: cuántos
;;; muebles de baño, cuántas luminarias, cuántos registros. Se designa una zona
;;; —o todo el plano con Enter— y sale la lista ordenada por nombre de bloque,
;;; con su total.
;;;
;;; No usa ninguna consulta del producto a propósito: recorre la selección con
;;; \`ssget\`, \`ssname\` y \`entget\` y agrupa con \`assoc\` y \`subst\`. Es el patrón con
;;; el que están escritas las rutinas que un despacho trae de AutoCAD, y sirve
;;; de plantilla para adaptarlas: si esto corre, las suyas corren.
;;; ---------------------------------------------------------------------------

(setq vd:capa-recuento "TEXTOS")
(setq vd:cb-renglon 250.0)
(setq vd:cb-texto 180.0)
(setq vd:cb-columna 3000.0)

;; Acumula (nombre . veces) sin duplicar el nombre. \`subst\` sustituye el par
;; entero: no se muta la celda, se reconstruye. Es el gesto idiomático.
(defun vd:cb-suma (tabla nombre / actual)
  (setq actual (assoc nombre tabla))
  (if actual
    (subst (cons nombre (1+ (cdr actual))) actual tabla)
    (cons (cons nombre 1) tabla)))

(defun vd:cb-recorre (ss / i tabla ed nombre)
  (setq i 0)
  (setq tabla nil)
  (while (< i (sslength ss))
    (setq ed (entget (ssname ss i)))
    (if (= (cdr (assoc 0 ed)) "INSERT")
      (progn
        (setq nombre (cdr (assoc 2 ed)))
        (if nombre (setq tabla (vd:cb-suma tabla nombre)))))
    (setq i (1+ i)))
  ;; Ordenada por nombre: un recuento que sale en distinto orden en cada corrida
  ;; no se puede comparar con el de ayer, que es para lo que se hace.
  (vl-sort tabla '(lambda (a b) (< (car a) (car b)))))

(defun vd:cb-escribe (tabla origen / x y total)
  (setq x (car origen))
  (setq y (cadr origen))
  (setq total 0)
  (entmake (list (cons 0 "MTEXT") (cons 8 vd:capa-recuento)
                 (list 10 x y 0.0) (cons 1 "BLOQUE") (cons 40 vd:cb-texto)))
  (entmake (list (cons 0 "MTEXT") (cons 8 vd:capa-recuento)
                 (list 10 (+ x vd:cb-columna) y 0.0) (cons 1 "CANT") (cons 40 vd:cb-texto)))
  (foreach fila tabla
    (setq y (- y vd:cb-renglon))
    (setq total (+ total (cdr fila)))
    (entmake (list (cons 0 "MTEXT") (cons 8 vd:capa-recuento)
                   (list 10 x y 0.0) (cons 1 (car fila)) (cons 40 vd:cb-texto)))
    (entmake (list (cons 0 "MTEXT") (cons 8 vd:capa-recuento)
                   (list 10 (+ x vd:cb-columna) y 0.0)
                   (cons 1 (itoa (cdr fila))) (cons 40 vd:cb-texto))))
  (setq y (- y vd:cb-renglon))
  (entmake (list (cons 0 "MTEXT") (cons 8 vd:capa-recuento)
                 (list 10 x y 0.0) (cons 1 "TOTAL") (cons 40 vd:cb-texto)))
  (entmake (list (cons 0 "MTEXT") (cons 8 vd:capa-recuento)
                 (list 10 (+ x vd:cb-columna) y 0.0)
                 (cons 1 (itoa total)) (cons 40 vd:cb-texto)))
  total)

(defun c:cuentabloques ( / ss tabla origen)
  (setq ss (ssget))
  (if (null ss)
    (progn (princ "\\nNada designado.") nil)
    (progn
      (setq tabla (vd:cb-recorre ss))
      (if (null tabla)
        (progn (princ "\\nEn lo designado no hay ninguna insercion de bloque.") nil)
        (progn
          (setq origen (getpoint "\\nEsquina superior izquierda del recuento: "))
          (if (null origen)
            (progn (princ "\\nCancelado: el recuento necesita un punto de insercion.") nil)
            (vd:cb-escribe tabla origen)))))))
`,
  },
  {
    name: "numera-ejes.lsp",
    source: `;;; ---------------------------------------------------------------------------
;;; NUMERA-EJES.LSP — burbujas de eje sobre lo designado.
;;;
;;; Se designan los ejes de estructura y la rutina les pone su burbuja: los
;;; VERTICALES llevan letra (A, B, C…) de izquierda a derecha, y los
;;; HORIZONTALES número (1, 2, 3…) de abajo arriba. Es la convención de
;;; cualquier plano de estructura y es lo que un residente busca primero al
;;; abrir el plano en obra.
;;;
;;; El orden NO es el de designación: se ordena por posición, así que da igual en
;;; qué orden se pinchen los ejes. Un plano numerado según el orden en que
;;; alguien hizo clic es un plano que hay que renumerar entero.
;;;
;;; La serie de letras se construye con \`chr\` y \`ascii\` en vez de con una lista
;;; escrita a mano: una planta con más de veintiséis ejes no es rara, y una lista
;;; a mano se rompe en silencio en el eje 27.
;;; ---------------------------------------------------------------------------

(setq vd:capa-ejes "EJES")
(setq vd:radio-burbuja 400.0)
(setq vd:separacion-burbuja 600.0)

;; A, B, … Z, AA, AB… La recursión es la forma corta de la base 26 y además deja
;; el caso de dos letras probado por construcción.
(defun vd:letra (indice)
  (if (< indice 26)
    (chr (+ 65 indice))
    (strcat (vd:letra (1- (/ indice 26))) (chr (+ 65 (rem indice 26))))))

(defun vd:burbuja (x y etiqueta)
  (entmake (list (cons 0 "CIRCLE") (cons 8 vd:capa-ejes)
                 (list 10 x y 0.0) (cons 40 vd:radio-burbuja)))
  (entmake (list (cons 0 "MTEXT") (cons 8 vd:capa-ejes)
                 (list 10 (- x (/ vd:radio-burbuja 2.0)) (+ y (/ vd:radio-burbuja 2.0)) 0.0)
                 (cons 1 etiqueta) (cons 40 vd:radio-burbuja)))
  etiqueta)

;; Un eje se clasifica por la dirección de su segmento, no por su nombre ni por
;; su capa: es lo único que no depende de cómo lo dibujara quien lo dibujó.
(defun vd:vertical-p (a b)
  (> (abs (- (cadr b) (cadr a))) (abs (- (car b) (car a)))))

(defun vd:extremos (ed)
  (list (cdr (assoc 10 ed)) (cdr (assoc 11 ed))))

;; Recoge los ejes designados en dos listas: verticales por su X, horizontales
;; por su Y. Se guarda también el extremo por el que sale la burbuja.
(defun vd:reparte (ss / i ed a b verticales horizontales)
  (setq i 0)
  (setq verticales nil)
  (setq horizontales nil)
  (while (< i (sslength ss))
    (setq ed (entget (ssname ss i)))
    (if (= (cdr (assoc 0 ed)) "LINE")
      (progn
        (setq a (car (vd:extremos ed)))
        (setq b (cadr (vd:extremos ed)))
        (if (vd:vertical-p a b)
          (setq verticales (cons (list (car a) (max (cadr a) (cadr b))) verticales))
          (setq horizontales (cons (list (cadr a) (min (car a) (car b))) horizontales)))))
    (setq i (1+ i)))
  (list (vl-sort verticales '(lambda (p q) (< (car p) (car q))))
        (vl-sort horizontales '(lambda (p q) (< (car p) (car q))))))

(defun c:numejes ( / ss repartido verticales horizontales indice)
  (setq ss (ssget))
  (if (null ss)
    (progn (princ "\\nNada designado.") nil)
    (progn
      (setq repartido (vd:reparte ss))
      (setq verticales (car repartido))
      (setq horizontales (cadr repartido))
      (if (and (null verticales) (null horizontales))
        (progn (princ "\\nEn lo designado no hay ninguna linea que pueda ser un eje.") nil)
        (progn
          (setq indice 0)
          (foreach eje verticales
            (vd:burbuja (car eje) (+ (cadr eje) vd:separacion-burbuja) (vd:letra indice))
            (setq indice (1+ indice)))
          (setq indice 0)
          (foreach eje horizontales
            (vd:burbuja (- (cadr eje) vd:separacion-burbuja) (car eje) (itoa (1+ indice)))
            (setq indice (1+ indice)))
          (princ (strcat "\\n" (itoa (length verticales)) " ejes con letra y "
                         (itoa (length horizontales)) " con numero."))
          (+ (length verticales) (length horizontales)))))))
`,
  },
  {
    name: "tabla-carpinteria.lsp",
    source: `;;; ---------------------------------------------------------------------------
;;; TABLA-CARPINTERIA.LSP — la tabla de puertas y ventanas del proyecto.
;;;
;;; Un renglón por TIPO de carpintería, con su marca (P-090x210, V-120x120), sus
;;; medidas y cuántas unidades hay. Es lo que se manda al carpintero y lo que se
;;; presupuesta, y hoy se cuenta a mano contando símbolos en el plano — que es
;;; exactamente donde aparecen los errores caros.
;;;
;;; Los números salen de \`(vd-carpinteria)\`, que cuenta los huecos ALOJADOS en
;;; los muros. Un hueco que no cabe en su muro no se cuenta y el producto lo
;;; nombra: esta tabla no lo esconde sumándolo igual.
;;;
;;; UNIDADES. Las medidas se escriben en la unidad del dibujo tal cual. Un
;;; despacho que dibuje en metros verá 0.90 donde otro ve 900, que es lo
;;; correcto: la tabla no reinterpreta el plano.
;;; ---------------------------------------------------------------------------

(setq vd:capa-carpinteria "TEXTOS")
(setq vd:carp-alto 250.0)
(setq vd:carp-texto 180.0)
(setq vd:carp-col '(0.0 1800.0 3200.0 4600.0))

(defun vd:carp-celda (x y indice contenido)
  (entmake (list (cons 0 "MTEXT") (cons 8 vd:capa-carpinteria)
                 (list 10 (+ x (nth indice vd:carp-col)) y 0.0)
                 (cons 1 contenido) (cons 40 vd:carp-texto))))

(defun vd:carp-renglon (x y marca ancho alto cantidad)
  (vd:carp-celda x y 0 marca)
  (vd:carp-celda x y 1 ancho)
  (vd:carp-celda x y 2 alto)
  (vd:carp-celda x y 3 cantidad)
  y)

(defun c:tablacarp ( / origen tipos x y total)
  (setq origen (getpoint "\\nEsquina superior izquierda de la tabla de carpinteria: "))
  (if (null origen)
    (progn (princ "\\nCancelado: la tabla necesita un punto de insercion.") nil)
    (progn
      (setq tipos (vd-carpinteria))
      (if (null tipos)
        (progn (princ "\\nNo hay puertas ni ventanas alojadas en ningun muro.") nil)
        (progn
          (setq x (car origen))
          (setq y (cadr origen))
          (vd:carp-renglon x y "MARCA" "ANCHO" "ALTO" "CANT")
          (setq total 0)
          (foreach tipo tipos
            (setq y (- y vd:carp-alto))
            (setq total (+ total (fix (nth 3 tipo))))
            (vd:carp-renglon x y
                             (nth 0 tipo)
                             (rtos (nth 1 tipo) 2 0)
                             (rtos (nth 2 tipo) 2 0)
                             (itoa (fix (nth 3 tipo)))))
          (setq y (- y vd:carp-alto))
          (vd:carp-renglon x y "TOTAL" "" "" (itoa total))
          (princ (strcat "\\n" (itoa (length tipos)) " tipos, " (itoa total) " unidades."))
          total)))))
`,
  },
];
