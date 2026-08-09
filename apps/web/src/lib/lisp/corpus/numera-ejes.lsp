;;; ---------------------------------------------------------------------------
;;; NUMERA-EJES.LSP — numeración de ejes de estructura.
;;;
;;; Coloca una burbuja (círculo + letra o número centrados) sobre cada eje, y
;;; dibuja el eje mismo. Los ejes verticales van con LETRA y los horizontales
;;; con NÚMERO, que es la convención de cualquier plano de estructura.
;;;
;;; Ejercita a propósito:
;;;   · aritmética de caracteres con `chr` y `ascii` para la serie A, B, C…
;;;   · `polar` y `angle`, que es como se dibuja de verdad
;;;   · `mapcar` con un lambda citado, que es como está escrito el código real
;;;   · `command` sobre el motor del producto para la línea del eje
;;; ---------------------------------------------------------------------------

(defun vd:burbuja (x y radio etiqueta capa)
  (entmake (list (cons 0 "CIRCLE") (cons 8 capa) (list 10 x y 0.0) (cons 40 radio)))
  (entmake (list (cons 0 "MTEXT")
                 (cons 8 capa)
                 (list 10 (- x (/ radio 2.0)) (+ y (/ radio 2.0)) 0.0)
                 (cons 1 etiqueta)
                 (cons 40 radio)))
  etiqueta)

;; A, B, C… La serie se construye con el código del carácter, no con una lista
;; escrita a mano: un plano con más de veintiséis ejes no es raro y `(chr (+ 65 n))`
;; se rompería en silencio en el 27.
(defun vd:letra (indice / vuelta)
  (if (< indice 26)
    (chr (+ 65 indice))
    (progn
      (setq vuelta (/ indice 26))
      (strcat (chr (+ 64 vuelta)) (chr (+ 65 (rem indice 26)))))))

(defun vd:ejes-verticales (x0 paso cuantos y0 y1 radio / i x etiquetas)
  (setq i 0 etiquetas nil)
  (while (< i cuantos)
    (setq x (+ x0 (* i paso)))
    (command "LINE" (list x y0) (list x y1) "")
    (setq etiquetas (cons (vd:burbuja x (+ y1 (* 2 radio)) radio (vd:letra i) "EJES") etiquetas))
    (setq i (1+ i)))
  (reverse etiquetas))

(defun vd:ejes-horizontales (y0 paso cuantos x0 x1 radio / i y etiquetas)
  (setq i 0 etiquetas nil)
  (while (< i cuantos)
    (setq y (+ y0 (* i paso)))
    (command "LINE" (list x0 y) (list x1 y) "")
    (setq etiquetas (cons (vd:burbuja (- x0 (* 2 radio)) y radio (itoa (1+ i)) "EJES") etiquetas))
    (setq i (1+ i)))
  (reverse etiquetas))

(defun vd:numera (x0 y0 paso columnas filas radio / ancho alto)
  (setq ancho (* paso (1- columnas)))
  (setq alto (* paso (1- filas)))
  (list (vd:ejes-verticales x0 paso columnas y0 (+ y0 alto) radio)
        (vd:ejes-horizontales y0 paso filas x0 (+ x0 ancho) radio)))

(defun c:ejes ( / p paso columnas filas)
  (setq p (getpoint "\nOrigen de la retícula: "))
  (if (null p)
    (progn (princ "\nCancelado.") nil)
    (progn
      (setq paso (getreal "\nSeparación entre ejes: "))
      (setq columnas (getint "\nEjes verticales: "))
      (setq filas (getint "\nEjes horizontales: "))
      (vd:numera (car p) (cadr p) paso columnas filas 250.0))))
