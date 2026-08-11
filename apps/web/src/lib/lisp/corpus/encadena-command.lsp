;;; ---------------------------------------------------------------------------
;;; ENCADENA-COMMAND.LSP — el puente hacia los comandos NATIVOS del producto.
;;;
;;; Media biblioteca de estudio no llama a `entmake`: llama a `command`. Se
;;; escribió así porque en AutoCAD `entmake` no dispara los automatismos
;;; —asociatividad, estilos, capas por objeto— y `command` sí. Una rutina de
;;; 1998 que reparte pilares con `(command "CIRCLE" p 25.0)` tiene que funcionar
;;; sin tocarle una coma.
;;;
;;; Lo que esta rutina demuestra es que ese puente existe DE VERDAD: cada
;;; `command` hace avanzar la máquina de estados del comando nativo del registro
;;; —el mismo LINE que se teclea— y el resultado entra en el MISMO lote. Cuatro
;;; `command` encadenados siguen siendo UN paso de deshacer.
;;;
;;; Ejercita a propósito:
;;;   · `command` con puntos citados y el `""` final que cierra la designación
;;;   · encadenar comandos de dibujo distintos en una sola rutina
;;;   · `polar` para calcular el reparto, que es como se escribe de verdad
;;;   · aritmética de enteros repartiendo, con `1+` y `while`
;;;
;;; LÍMITE DECLARADO: aquí `command` no deja el comando ACTIVO esperando al
;;; usuario, como sí hace AutoCAD. Un `command` sin argumentos suficientes se
;;; cancela y da error diciendo qué pedía. Está explicado en
;;; `builtins/interaction.ts`, y es la diferencia que un veterano notará.
;;; ---------------------------------------------------------------------------

;; Un tramo recto entre dos puntos, por el LINE nativo. El `""` final es el
;; Enter que en AutoCAD termina la orden; el motor lo acepta igual.
(defun vd:tramo (p1 p2) (command "LINE" p1 p2 ""))

;; Marco cerrado. Cuatro llamadas al mismo comando nativo, encadenadas.
(defun vd:marco (x1 y1 x2 y2 / a b c d)
  (setq a (list x1 y1) b (list x2 y1) c (list x2 y2) d (list x1 y2))
  (vd:tramo a b)
  (vd:tramo b c)
  (vd:tramo c d)
  (vd:tramo d a)
  4)

;; Marcas de eje repartidas sobre la base, por el CIRCLE nativo. El reparto se
;; calcula con `polar`, no con una suma acumulada: acumular arrastra el error de
;; coma flotante y la última marca acaba fuera del marco.
(defun vd:marcas (x1 y1 x2 radio cuantas / paso i)
  (setq paso (/ (- x2 x1) (float (1+ cuantas))))
  (setq i 1)
  (while (<= i cuantas)
    (command "CIRCLE" (polar (list x1 y1) 0.0 (* paso i)) radio)
    (setq i (1+ i)))
  cuantas)

;; La parametrizada: marco + marcas. Devuelve cuántas entidades pidió.
(defun vd:retícula (x1 y1 x2 y2 radio cuantas)
  (+ (vd:marco x1 y1 x2 y2) (vd:marcas x1 y1 x2 radio cuantas)))

(defun c:RETICULA ( / esquina opuesta cuantas)
  (setq esquina (getpoint "Primera esquina"))
  (if (null esquina) (progn (princ "\ncancelado") (exit)))
  (setq opuesta (getcorner esquina "Esquina opuesta"))
  (if (null opuesta) (progn (princ "\ncancelado") (exit)))
  (initget 1)
  (setq cuantas (getint "Cuántas marcas de eje"))
  (vd:retícula (car esquina) (cadr esquina) (car opuesta) (cadr opuesta) 50.0 cuantas)
  (princ (strcat "\nretícula con " (itoa cuantas) " marcas"))
  (princ))
