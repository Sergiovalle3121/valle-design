;;; ---------------------------------------------------------------------------
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
;;; La serie de letras se construye con `chr` y `ascii` en vez de con una lista
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
    (progn (princ "\nNada designado.") nil)
    (progn
      (setq repartido (vd:reparte ss))
      (setq verticales (car repartido))
      (setq horizontales (cadr repartido))
      (if (and (null verticales) (null horizontales))
        (progn (princ "\nEn lo designado no hay ninguna linea que pueda ser un eje.") nil)
        (progn
          (setq indice 0)
          (foreach eje verticales
            (vd:burbuja (car eje) (+ (cadr eje) vd:separacion-burbuja) (vd:letra indice))
            (setq indice (1+ indice)))
          (setq indice 0)
          (foreach eje horizontales
            (vd:burbuja (- (cadr eje) vd:separacion-burbuja) (car eje) (itoa (1+ indice)))
            (setq indice (1+ indice)))
          (princ (strcat "\n" (itoa (length verticales)) " ejes con letra y "
                         (itoa (length horizontales)) " con numero."))
          (+ (length verticales) (length horizontales)))))))
