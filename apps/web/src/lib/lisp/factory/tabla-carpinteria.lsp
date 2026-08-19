;;; ---------------------------------------------------------------------------
;;; TABLA-CARPINTERIA.LSP — la tabla de puertas y ventanas del proyecto.
;;;
;;; Un renglón por TIPO de carpintería, con su marca (P-090x210, V-120x120), sus
;;; medidas y cuántas unidades hay. Es lo que se manda al carpintero y lo que se
;;; presupuesta, y hoy se cuenta a mano contando símbolos en el plano — que es
;;; exactamente donde aparecen los errores caros.
;;;
;;; Los números salen de `(vd-carpinteria)`, que cuenta los huecos ALOJADOS en
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
  (setq origen (getpoint "\nEsquina superior izquierda de la tabla de carpinteria: "))
  (if (null origen)
    (progn (princ "\nCancelado: la tabla necesita un punto de insercion.") nil)
    (progn
      (setq tipos (vd-carpinteria))
      (if (null tipos)
        (progn (princ "\nNo hay puertas ni ventanas alojadas en ningun muro.") nil)
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
          (princ (strcat "\n" (itoa (length tipos)) " tipos, " (itoa total) " unidades."))
          total)))))
