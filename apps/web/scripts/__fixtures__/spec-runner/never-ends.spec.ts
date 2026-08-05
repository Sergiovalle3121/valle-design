/** Cuelga MANTENIENDO vivo el event loop: sin timeout bloquea el job entero. */
setInterval(() => {}, 1_000);
console.log("arrancó pero no termina");
