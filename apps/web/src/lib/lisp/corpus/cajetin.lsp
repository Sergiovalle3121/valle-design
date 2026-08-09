;;; ---------------------------------------------------------------------------
;;; CAJETIN.LSP — cajetín de plano parametrizado.
;;;
;;; Es la rutina que TODO estudio tiene escrita y que nadie quiere volver a
;;; escribir: recuadro exterior, una rejilla de casillas, y las etiquetas fijas
;;; del proyecto. La versión de este corpus está escrita como se escriben las de
;;; verdad —con `entmake`, división entera para repartir alturas y una función
;;; interactiva `c:` encima de otra parametrizada—, y no como se escribiría un
;;; ejemplo de manual.
;;;
;;; Ejercita a propósito:
;;;   · la división ENTERA repartiendo la altura entre las filas
;;;   · `entmake` de LWPOLYLINE cerrada, LINE y MTEXT
;;;   · locales tras la barra, para no ensuciar el espacio global
;;;   · `c:` que pregunta con getpoint/getreal y llama a la parametrizada
;;; ---------------------------------------------------------------------------

(defun vd:rect (x1 y1 x2 y2 capa)
  (entmake (list (cons 0 "LWPOLYLINE")
                 (cons 90 4)
                 (cons 70 1)
                 (cons 8 capa)
                 (list 10 x1 y1)
                 (list 10 x2 y1)
                 (list 10 x2 y2)
                 (list 10 x1 y2))))

(defun vd:linea (x1 y1 x2 y2 capa)
  (entmake (list (cons 0 "LINE")
                 (cons 8 capa)
                 (list 10 x1 y1 0.0)
                 (list 11 x2 y2 0.0))))

(defun vd:texto (x y altura txt capa)
  (entmake (list (cons 0 "MTEXT")
                 (cons 8 capa)
                 (list 10 x y 0.0)
                 (cons 1 txt)
                 (cons 40 altura))))

;; `alto` y `filas` son ENTEROS y el reparto es entero: cada fila mide lo mismo
;; y la suma cierra exactamente contra el borde. Con división real cada fila
;; arrastraría decimales y la última no llegaría al marco.
(defun vd:cajetin (x0 y0 ancho alto filas rotulo / paso i y)
  (setq paso (/ alto filas))
  (vd:rect x0 y0 (+ x0 ancho) (+ y0 alto) "CAJETIN")
  (setq i 1)
  (while (< i filas)
    (setq y (+ y0 (* i paso)))
    (vd:linea x0 y (+ x0 ancho) y "CAJETIN")
    (setq i (1+ i)))
  (vd:texto (+ x0 5) (+ y0 (/ paso 2)) 3.5 rotulo "TEXTOS")
  (list (list x0 y0) ancho alto paso))

(defun c:cajetin ( / p ancho rotulo)
  (setq p (getpoint "\nEsquina inferior izquierda del cajetín: "))
  (if (null p)
    (progn (princ "\nCancelado.") nil)
    (progn
      (setq ancho (getreal "\nAncho del cajetín: "))
      (setq rotulo (getstring "\nRótulo: "))
      (vd:cajetin (car p) (cadr p) (fix ancho) 40 4 rotulo))))
