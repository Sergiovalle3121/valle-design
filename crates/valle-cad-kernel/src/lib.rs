//! Teselado de curvas del CAD: arco, elipse y B-spline por De Boor.
//!
//! # Por qué existe este núcleo y por qué es ÉSTE
//!
//! Dibujar un plano de despacho es, en el fondo, convertir curvas en cadenas de
//! puntos: cada arco, cada elipse y cada spline del documento pasa por el
//! teselador antes de llegar a la pantalla, y a 100.000 entidades eso son
//! millones de senos y cosenos por cuadro de replanificación. Es el bucle
//! caliente más acotado del producto y —esto es lo que decide— el más
//! VERIFICABLE: su salida son números, no píxeles. Un kernel de render se
//! compara con capturas y las capturas discuten; una lista de coordenadas no.
//!
//! # La regla que gobierna cada línea de este archivo
//!
//! Cada función replica el ORDEN DE OPERACIONES de su gemela en
//! `apps/web/src/lib/cad/curve-tessellate.ts`, no sólo su fórmula. En coma
//! flotante `(a + b) + c` y `a + (b + c)` son resultados distintos, así que
//! reordenar "porque queda más limpio" rompería la paridad sin cambiar ninguna
//! matemática. Si aquella cambia, ésta cambia con ella y se vuelve a medir la
//! tolerancia.
//!
//! # Dónde SÍ se diverge, y por qué es inevitable
//!
//! `sin` y `cos`. V8 los resuelve con su port de fdlibm y Rust con la libm que
//! trae su `std`; ambos son fieles a IEEE-754 pero no bit a bit iguales. La
//! divergencia se MIDE en vez de negarse, y se publica como tolerancia en
//! `docs/cad/evidence/wasm-parity.json`. La spline no usa trascendentes: ahí la
//! exigencia es igualdad exacta y el artefacto la comprueba como tal.
//!
//! # ABI
//!
//! `extern "C"` sobre la memoria lineal, sin pegamento generado. El llamador
//! reserva con `valle_alloc`, escribe los `f64` de entrada, llama, lee la
//! salida y libera con `valle_free`. Todo entero que cruza la frontera es `u32`
//! (un desplazamiento en la memoria lineal de wasm32) y todo retorno de trabajo
//! es `i32`: no negativo es «cuántos `f64` he escrito», negativo es un código de
//! error tipado. Fallo cerrado: ante cualquier argumento que no se pueda
//! honrar, se devuelve error y NO se escribe nada.

use std::alloc::{alloc, dealloc, Layout};
use std::f64::consts::PI;

/// Versión de la ABI. El cargador la comprueba y se niega a usar un binario que
/// no la declare: un .wasm de otra versión escribiría en un formato distinto y
/// el error saldría más tarde, convertido en coordenadas absurdas.
const ABI_VERSION: u32 = 1;

/// Argumentos imposibles de honrar (punteros nulos, `steps` a cero, cuentas
/// que desbordan el direccionamiento).
const ERR_ARGS: i32 = -1;
/// La salida no cabe en la capacidad ofrecida. Nunca se escribe a medias.
const ERR_CAPACITY: i32 = -2;
/// El asignador de la memoria lineal no pudo crecer.
const ERR_ALLOC: i32 = -3;

/// Alineación de todas las reservas. Los tres tipos que cruzan la frontera
/// (`f64`, `u32`) caben alineados a 8, así que una sola alineación sirve para
/// todo y el llamador no tiene que llevar la cuenta.
const ALIGN: usize = 8;

// ---------------------------------------------------------------------------
// Memoria lineal
// ---------------------------------------------------------------------------

/// Reserva `len` bytes alineados a 8 y devuelve su desplazamiento.
///
/// Devuelve 0 si no hay memoria. El desplazamiento 0 nunca es una reserva
/// válida en wasm32-unknown-unknown (ahí vive el bloque nulo), así que puede
/// usarse como sentinela sin ambigüedad.
#[no_mangle]
pub extern "C" fn valle_alloc(len: u32) -> u32 {
    if len == 0 {
        return 0;
    }
    let Ok(layout) = Layout::from_size_align(len as usize, ALIGN) else {
        return 0;
    };
    // SAFETY: `layout` tiene tamaño distinto de cero y alineación potencia de
    // dos; el puntero devuelto se comprueba contra nulo antes de publicarlo.
    let ptr = unsafe { alloc(layout) };
    ptr as u32
}

/// Libera una reserva hecha con `valle_alloc`. `len` debe ser el mismo.
#[no_mangle]
pub extern "C" fn valle_free(ptr: u32, len: u32) {
    if ptr == 0 || len == 0 {
        return;
    }
    let Ok(layout) = Layout::from_size_align(len as usize, ALIGN) else {
        return;
    };
    // SAFETY: contrato del llamador — `ptr` salió de `valle_alloc` con este
    // mismo `len`, y el módulo no lo ha liberado antes.
    unsafe { dealloc(ptr as *mut u8, layout) };
}

/// Versión de la ABI que implementa este binario.
#[no_mangle]
pub extern "C" fn valle_kernel_abi() -> u32 {
    ABI_VERSION
}

/// Sonda de diagnóstico: el `sin` de la libm de Rust, sin nada alrededor.
///
/// No la usa el producto. Existe para que el artefacto de paridad pueda medir
/// —y no suponer— de dónde viene la única divergencia real entre los dos
/// motores. Sin esto, la frase «se separan porque V8 y Rust usan libm
/// distintas» sería una explicación plausible sin número detrás, que es
/// exactamente lo que este repositorio no publica.
#[no_mangle]
pub extern "C" fn valle_probe_sin(x: f64) -> f64 {
    x.sin()
}

/// Ídem para el coseno.
#[no_mangle]
pub extern "C" fn valle_probe_cos(x: f64) -> f64 {
    x.cos()
}

// ---------------------------------------------------------------------------
// Vistas seguras sobre la memoria lineal
// ---------------------------------------------------------------------------

/// Comprueba que `[ptr, ptr + count * size)` está alineado y no desborda `u32`.
fn addressable(ptr: u32, count: usize, size: usize) -> bool {
    if ptr == 0 || ptr as usize % ALIGN != 0 {
        return false;
    }
    match count.checked_mul(size) {
        Some(bytes) => (ptr as usize).checked_add(bytes).is_some_and(|end| end <= u32::MAX as usize),
        None => false,
    }
}

/// SAFETY: sólo se llama tras `addressable`, y el llamador garantiza que la
/// región pertenece a una reserva viva de `valle_alloc`.
unsafe fn f64s<'a>(ptr: u32, count: usize) -> &'a [f64] {
    std::slice::from_raw_parts(ptr as *const f64, count)
}

/// SAFETY: ídem, y además nadie más tiene una vista viva de esta región — las
/// entradas y las salidas son reservas distintas por contrato de la ABI.
unsafe fn f64s_mut<'a>(ptr: u32, count: usize) -> &'a mut [f64] {
    std::slice::from_raw_parts_mut(ptr as *mut f64, count)
}

/// SAFETY: ídem para el vector de cuentas por curva.
unsafe fn u32s_mut<'a>(ptr: u32, count: usize) -> &'a mut [u32] {
    std::slice::from_raw_parts_mut(ptr as *mut u32, count)
}

// ---------------------------------------------------------------------------
// Núcleo escalar: las mismas cuentas, en el mismo orden, que el TypeScript
// ---------------------------------------------------------------------------

/// Cuántos puntos produce un barrido. Réplica de
/// `Math.max(2, Math.ceil((sweep / 360) * steps))` más el `+1` del bucle
/// cerrado (`for i in 0..=n`), que es por lo que un arco de 24 pasos completo
/// devuelve 25 puntos y no 24.
fn sweep_segments(sweep: f64, steps: u32) -> usize {
    let raw = ((sweep / 360.0) * steps as f64).ceil();
    if raw > 2.0 {
        raw as usize
    } else {
        2
    }
}

/// Normaliza el barrido a positivo sumando vueltas, convención DXF (siempre
/// CCW). Se hace con el mismo `while` que el TypeScript: un `rem_euclid` daría
/// otro número en los casos límite —barrido exactamente 0 o múltiplo de 360— y
/// esos casos son justamente los que un plano real trae.
///
/// DIVERGENCIA DELIBERADA, declarada en el artefacto de paridad: con un ángulo
/// no finito (`NaN`, `±Infinity`) el bucle del TypeScript no termina nunca —
/// `-Infinity + 360` sigue siendo `-Infinity`—. En JavaScript eso cuelga una
/// pestaña, que ya es malo; en wasm cuelga el módulo sin posibilidad de
/// interrumpirlo. Aquí se corta y la curva sale con cero puntos. Fallo cerrado
/// antes que fallo colgado.
fn normalized_sweep(start_deg: f64, end_deg: f64) -> f64 {
    let mut sweep = end_deg - start_deg;
    if !sweep.is_finite() {
        return f64::NAN;
    }
    while sweep <= 0.0 {
        sweep += 360.0;
    }
    sweep
}

/// Arco circular. Escribe pares `x, y` en `out` y devuelve cuántos PUNTOS ha
/// escrito, o `None` si no caben.
fn arc_into(
    center_x: f64,
    center_y: f64,
    radius: f64,
    start_deg: f64,
    end_deg: f64,
    steps: u32,
    out: &mut [f64],
) -> Option<usize> {
    if !(radius > 0.0) || steps < 1 {
        return Some(0);
    }
    let sweep = normalized_sweep(start_deg, end_deg);
    if sweep.is_nan() {
        return Some(0);
    }
    let n = sweep_segments(sweep, steps);
    let points = n + 1;
    if out.len() < points * 2 {
        return None;
    }
    for i in 0..=n {
        let angle = ((start_deg + (sweep * i as f64) / n as f64) * PI) / 180.0;
        out[i * 2] = center_x + radius * angle.cos();
        out[i * 2 + 1] = center_y + radius * angle.sin();
    }
    Some(points)
}

/// Elipse paramétrica: `P(t) = C + cos(t)·M + sin(t)·(razón·M⊥)`, con `M`
/// RELATIVO al centro. La rotación va implícita en `M`.
#[allow(clippy::too_many_arguments)]
fn ellipse_into(
    center_x: f64,
    center_y: f64,
    major_x: f64,
    major_y: f64,
    axis_ratio: f64,
    start_deg: f64,
    end_deg: f64,
    steps: u32,
    out: &mut [f64],
) -> Option<usize> {
    let major_len = major_x.hypot(major_y);
    if !(major_len > 0.0) || !(axis_ratio > 0.0) || steps < 1 {
        return Some(0);
    }
    let sweep = normalized_sweep(start_deg, end_deg);
    if sweep.is_nan() {
        return Some(0);
    }
    let minor_x = -major_y * axis_ratio;
    let minor_y = major_x * axis_ratio;
    let n = sweep_segments(sweep, steps);
    let points = n + 1;
    if out.len() < points * 2 {
        return None;
    }
    for i in 0..=n {
        let t = ((start_deg + (sweep * i as f64) / n as f64) * PI) / 180.0;
        out[i * 2] = center_x + t.cos() * major_x + t.sin() * minor_x;
        out[i * 2 + 1] = center_y + t.cos() * major_y + t.sin() * minor_y;
    }
    Some(points)
}

/// Nudos clamped uniformes: `n + grado + 1`, misma regla que el export DXF.
fn clamped_knots(control_count: usize, degree: usize, out: &mut Vec<f64>) {
    out.clear();
    let spans = control_count - degree;
    for _ in 0..=degree {
        out.push(0.0);
    }
    for i in 1..spans {
        out.push(i as f64 / spans as f64);
    }
    for _ in 0..=degree {
        out.push(1.0);
    }
}

/// ¿Es este vector de nudos USABLE, no sólo del tamaño correcto?
///
/// Réplica de `usableKnots` en `curve-tessellate.ts`, y la razón de que exista
/// es la misma allí que aquí: la comprobación de LONGITUD por sí sola deja
/// pasar basura con la forma adecuada. Un DXF ajeno trae vectores con `NaN`
/// —grupo 40 vacío, o un `1.#QNAN` escrito literalmente— y también vectores
/// constantes; los dos cumplen `len == n + grado + 1`. Con ellos De Boor
/// calcula `denom = 0` en cada nivel, toma `alpha = 0` y devuelve SIEMPRE el
/// primer punto de control: la spline se colapsa en un punto.
///
/// Y ése es el peor desenlace posible, porque no hay error ni hueco. El
/// arquitecto ve un punto donde había una curva, con la caja envolvente
/// mintiendo, y el número de puntos teselados es el correcto — así que ni
/// siquiera una comprobación de forma lo delata. La salida correcta ya existía
/// para el vector de longitud equivocada: sintetizar nudos clamped, que es lo
/// que el export DXF escribe.
///
/// Se exige: todo finito, no decreciente y con dominio de longitud POSITIVA.
/// Un dominio nulo (`u_min == u_max`) pondría todas las muestras en el mismo
/// parámetro, que es el mismo colapso por otro camino.
fn usable_knots(knots: &[f64], degree: usize) -> bool {
    for i in 0..knots.len() {
        if !knots[i].is_finite() {
            return false;
        }
        if i > 0 && knots[i] < knots[i - 1] {
            return false;
        }
    }
    knots[knots.len() - 1 - degree] > knots[degree]
}

/// De Boor en el parámetro `u`. Sin trascendentes: aquí la paridad con el
/// TypeScript debe ser EXACTA, y el artefacto de evidencia lo comprueba como
/// igualdad bit a bit, no como tolerancia.
fn de_boor(
    u: f64,
    degree: usize,
    control: &[f64],
    knots: &[f64],
    scratch: &mut Vec<(f64, f64)>,
) -> (f64, f64) {
    let n = control.len() / 2 - 1;
    let mut k = degree;
    for i in degree..=n {
        if u >= knots[i] && u <= knots[i + 1] {
            k = i;
            break;
        }
        if i == n {
            k = n;
        }
    }
    scratch.clear();
    for j in 0..=degree {
        let index = j + k - degree;
        scratch.push((control[index * 2], control[index * 2 + 1]));
    }
    for r in 1..=degree {
        let mut j = degree;
        while j >= r {
            let denom = knots[j + 1 + k - r] - knots[j + k - degree];
            let alpha = if denom > 0.0 {
                (u - knots[j + k - degree]) / denom
            } else {
                0.0
            };
            scratch[j] = (
                (1.0 - alpha) * scratch[j - 1].0 + alpha * scratch[j].0,
                (1.0 - alpha) * scratch[j - 1].1 + alpha * scratch[j].1,
            );
            j -= 1;
        }
    }
    scratch[degree]
}

// ---------------------------------------------------------------------------
// ABI exportada
// ---------------------------------------------------------------------------

/// Tesela un LOTE de arcos.
///
/// - `in_ptr`: `f64[count * 5]` = `cx, cy, r, inicioGrados, finGrados`.
/// - `counts_ptr`: `u32[count]`, puntos escritos por cada arco.
/// - `out_ptr`: `f64[out_cap]`, pares `x, y` concatenados en orden de entrada.
///
/// Devuelve cuántos `f64` se han escrito en `out_ptr`, o un código negativo.
///
/// El lote existe porque el coste de cruzar la frontera JS↔wasm por CADA arco
/// se come la ventaja del kernel: a 100.000 entidades son 100.000 llamadas y
/// 100.000 copias. Con una sola llamada la frontera se paga una vez.
#[no_mangle]
pub extern "C" fn valle_tessellate_arcs(
    in_ptr: u32,
    count: u32,
    steps: u32,
    counts_ptr: u32,
    out_ptr: u32,
    out_cap: u32,
) -> i32 {
    const STRIDE: usize = 5;
    let count = count as usize;
    if count == 0 {
        return 0;
    }
    if !addressable(in_ptr, count * STRIDE, 8)
        || !addressable(counts_ptr, count, 4)
        || !addressable(out_ptr, out_cap as usize, 8)
    {
        return ERR_ARGS;
    }
    // SAFETY: las tres regiones han pasado `addressable` y son reservas vivas
    // distintas por contrato de la ABI.
    let input = unsafe { f64s(in_ptr, count * STRIDE) };
    let counts = unsafe { u32s_mut(counts_ptr, count) };
    let out = unsafe { f64s_mut(out_ptr, out_cap as usize) };

    let mut written = 0usize;
    for curve in 0..count {
        let base = curve * STRIDE;
        let Some(points) = arc_into(
            input[base],
            input[base + 1],
            input[base + 2],
            input[base + 3],
            input[base + 4],
            steps,
            &mut out[written..],
        ) else {
            return ERR_CAPACITY;
        };
        counts[curve] = points as u32;
        written += points * 2;
    }
    written as i32
}

/// Tesela un LOTE de elipses.
///
/// `in_ptr`: `f64[count * 7]` = `cx, cy, mx, my, razón, inicioGrados,
/// finGrados`, con `mx, my` RELATIVOS al centro.
#[no_mangle]
pub extern "C" fn valle_tessellate_ellipses(
    in_ptr: u32,
    count: u32,
    steps: u32,
    counts_ptr: u32,
    out_ptr: u32,
    out_cap: u32,
) -> i32 {
    const STRIDE: usize = 7;
    let count = count as usize;
    if count == 0 {
        return 0;
    }
    if !addressable(in_ptr, count * STRIDE, 8)
        || !addressable(counts_ptr, count, 4)
        || !addressable(out_ptr, out_cap as usize, 8)
    {
        return ERR_ARGS;
    }
    // SAFETY: ver `valle_tessellate_arcs`.
    let input = unsafe { f64s(in_ptr, count * STRIDE) };
    let counts = unsafe { u32s_mut(counts_ptr, count) };
    let out = unsafe { f64s_mut(out_ptr, out_cap as usize) };

    let mut written = 0usize;
    for curve in 0..count {
        let base = curve * STRIDE;
        let Some(points) = ellipse_into(
            input[base],
            input[base + 1],
            input[base + 2],
            input[base + 3],
            input[base + 4],
            input[base + 5],
            input[base + 6],
            steps,
            &mut out[written..],
        ) else {
            return ERR_CAPACITY;
        };
        counts[curve] = points as u32;
        written += points * 2;
    }
    written as i32
}

/// Tesela UNA B-spline por De Boor.
///
/// - `ctrl_ptr`: `f64[ctrl_count * 2]`, puntos de control.
/// - `degree`: se recibe como `f64` para poder replicar el `Math.floor` del
///   TypeScript sin que el llamador tenga que hacerlo antes; si lo hiciera él,
///   un grado fraccionario divergiría y la paridad dejaría de medir el kernel.
/// - `knots_ptr`: `f64[knots_count]`, o 0 para sintetizarlos clamped.
///
/// No hay versión por lotes porque las splines de un plano real son decenas,
/// no decenas de miles, y cada una trae un número distinto de puntos de control
/// — un lote exigiría un descriptor de longitudes variables cuyo coste de
/// empaquetado superaría al de las llamadas que ahorra.
#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub extern "C" fn valle_tessellate_spline(
    ctrl_ptr: u32,
    ctrl_count: u32,
    degree: f64,
    knots_ptr: u32,
    knots_count: u32,
    steps: u32,
    out_ptr: u32,
    out_cap: u32,
) -> i32 {
    let ctrl_count = ctrl_count as usize;
    if ctrl_count < 2 || steps < 1 {
        return 0;
    }
    if !addressable(ctrl_ptr, ctrl_count * 2, 8) || !addressable(out_ptr, out_cap as usize, 8) {
        return ERR_ARGS;
    }
    // SAFETY: regiones comprobadas y vivas; ver `valle_tessellate_arcs`.
    let control = unsafe { f64s(ctrl_ptr, ctrl_count * 2) };

    // `Math.max(1, Math.min(Math.floor(degree), controlPoints.length - 1))`.
    let floored = degree.floor();
    if floored.is_nan() {
        return ERR_ARGS;
    }
    let capped = if floored > (ctrl_count - 1) as f64 {
        (ctrl_count - 1) as f64
    } else {
        floored
    };
    let deg = if capped > 1.0 { capped as usize } else { 1 };

    let expected = ctrl_count + deg + 1;
    // Se acepta el vector del llamador sólo si mide lo que debe Y sirve para
    // algo. Que midiera lo que debe era la única condición hasta ahora, y por
    // eso este kernel colapsaba en su primer punto de control las splines que
    // el teselador del producto sí dibujaba: la longitud es una propiedad de la
    // forma del dato, no de su contenido.
    let supplied: Option<&[f64]> = if knots_ptr != 0 && knots_count as usize == expected {
        if !addressable(knots_ptr, expected, 8) {
            return ERR_ARGS;
        }
        // SAFETY: región comprobada y viva.
        let candidate = unsafe { f64s(knots_ptr, expected) };
        if usable_knots(candidate, deg) {
            Some(candidate)
        } else {
            None
        }
    } else {
        None
    };
    let mut synthesized: Vec<f64> = Vec::new();
    let knots: &[f64] = match supplied {
        Some(candidate) => candidate,
        None => {
            if synthesized.try_reserve(expected).is_err() {
                return ERR_ALLOC;
            }
            clamped_knots(ctrl_count, deg, &mut synthesized);
            &synthesized
        }
    };

    let points = steps as usize + 1;
    if (out_cap as usize) < points * 2 {
        return ERR_CAPACITY;
    }
    // SAFETY: capacidad ya comprobada contra lo que se va a escribir.
    let out = unsafe { f64s_mut(out_ptr, points * 2) };

    let u_min = knots[deg];
    let u_max = knots[knots.len() - 1 - deg];
    let mut scratch: Vec<(f64, f64)> = Vec::new();
    if scratch.try_reserve(deg + 1).is_err() {
        return ERR_ALLOC;
    }
    for i in 0..=steps as usize {
        let u = u_min + ((u_max - u_min) * i as f64) / steps as f64;
        let (x, y) = de_boor(u, deg, control, knots, &mut scratch);
        out[i * 2] = x;
        out[i * 2 + 1] = y;
    }
    (points * 2) as i32
}
