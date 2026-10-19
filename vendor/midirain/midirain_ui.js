// midirain_ui.js
// Visualización de midirain en [jsui] con mgraphics. Solo dibuja: lee el estado
// que el motor publica en un Global y repinta cuando recibe "draw <nombreGlobal>".
// Ninguna nota depende de este archivo. ES5.
//
// Estética de mxnchv.xyz: negro puro, blanco con transparencia, líneas de 1 px
// y scanlines.

mgraphics.init();
mgraphics.relative_coords = 0;
mgraphics.autofill = 0;

inlets = 1;
outlets = 0;

var GROUND = 5;          // margen bajo la línea del suelo, para que se vea la salpicadura
var FONT = "Ableton Sans Medium";   // la de Live, como el resto del dispositivo
var FLASH_LIFE = 400;
var SPLASH_LIFE = 450;
var MAX_EXTRAPOLATE = 0.05;  // s
var WIND_SLOPE = 0.6;    // igual que en el motor

var gname = null;
var G = null;

function draw(name) {
    name = String(name);
    if (name !== gname) {
        gname = name;
        G = new Global(name);
    }
    mgraphics.redraw();
}

function bang() {
    mgraphics.redraw();
}

// ---------------------------------------------------------------------------

function rnd(seed, i) {
    var v = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
    return v - Math.floor(v);
}

function size() {
    var sz = mgraphics.size;
    if (sz && sz.length >= 2) return [sz[0], sz[1]];
    return [box.rect[2] - box.rect[0], box.rect[3] - box.rect[1]];
}

function paint() {
    var sz = size();
    var W = sz[0];
    var H = sz[1];
    var RH = H - GROUND;
    var t = Date.now();
    var S = G ? G.state : null;
    var segs = [];

    mgraphics.set_source_rgba(0, 0, 0, 1);
    mgraphics.rectangle(0, 0, W, H);
    mgraphics.fill();

    if (S) {
        segs = dropSegments(S, W, RH, t);
        drawFlashGlow(S, W, RH, t);
        drawDrops(segs);
        drawSplashes(S, W, RH, t);
        drawGround(S, W, RH, t);
    } else {
        drawGround({ cols: [], mode: 0 }, W, RH, t);
    }


    // scanlines
    mgraphics.set_source_rgba(0, 0, 0, 0.14);
    for (var y = 3; y < H; y += 4) mgraphics.rectangle(0, y, W, 1);
    mgraphics.fill();
}

// ---------------------------------------------------------------------------
// gotas

// Posición de cada gota en este instante: el motor da la del último paso y la
// velocidad, y aquí se extrapola hasta ahora para que el movimiento sea continuo
// aunque los repintados no caigan justo detrás de cada paso.
function dropSegments(S, W, RH, t) {
    var drops = S.drops;
    var out = [];
    var dt, i, d, x, y, s, L, dx, dy, len, b;
    if (!drops) return out;
    dt = S.stepT ? (t - S.stepT) / 1000 : 0;
    dt = dt < 0 ? 0 : (dt > MAX_EXTRAPOLATE ? MAX_EXTRAPOLATE : dt);

    // dirección del trazo en píxeles
    dx = S.windN * WIND_SLOPE * W;
    dy = RH;
    len = Math.sqrt(dx * dx + dy * dy) || 1;
    dx /= len;
    dy /= len;

    for (i = 0; i < drops.length; i++) {
        d = drops[i];
        if (!d) continue;
        y = d.y + d.vy * dt;
        if (y > 1) y = 1;
        x = d.x + S.windN * WIND_SLOPE * d.vy * dt;
        x -= Math.floor(x);
        s = d.s;
        L = 4 + 10 * s + 8 * S.fallN;
        x *= W;
        y *= RH;
        b = Math.min(3, Math.floor(s * 4));
        out.push({
            x1: x - dx * L, y1: y - dy * L, x2: x, y2: y,
            b: b
        });
    }
    return out;
}

function bucketWidth(b) {
    return 0.6 + 1.4 * (b + 0.5) / 4;
}

function strokeSegs(segs, b) {
    var i, g;
    for (i = 0; i < segs.length; i++) {
        g = segs[i];
        if (g.b !== b) continue;
        mgraphics.move_to(g.x1, g.y1);
        mgraphics.line_to(g.x2, g.y2);
    }
    mgraphics.stroke();
}

function drawDrops(segs) {
    var b;
    mgraphics.set_line_cap("round");
    for (b = 0; b < 4; b++) {
        mgraphics.set_line_width(bucketWidth(b));
        mgraphics.set_source_rgba(1, 1, 1, 0.22 + 0.6 * (b + 0.5) / 4);
        strokeSegs(segs, b);
    }
}

function drawSplashes(S, W, RH, t) {
    var sp = S.splashes;
    var i, j, p, age, k, x, r, n, a, v, ts, px, py;
    if (!sp) return;
    for (i = 0; i < sp.length; i++) {
        p = sp[i];
        if (!p) continue;
        age = t - p.t;
        if (age < 0 || age >= SPLASH_LIFE) continue;
        k = age / SPLASH_LIFE;
        x = p.x * W;

        // arco: media elipse que se abre hacia arriba
        r = 3 + (8 + 14 * p.s) * Math.sqrt(k);
        mgraphics.save();
        mgraphics.translate(x, RH);
        mgraphics.scale(1, 0.4);
        mgraphics.move_to(-r, 0);
        mgraphics.arc(0, 0, r, Math.PI, 2 * Math.PI);
        mgraphics.restore();
        mgraphics.set_line_width(1);
        mgraphics.set_source_rgba(1, 1, 1, 0.55 * (1 - k));
        mgraphics.stroke();

        // gotitas en parábola
        n = 2 + Math.round(p.s * 4);
        ts = age / 1000;
        mgraphics.set_source_rgba(1, 1, 1, 0.8 * (1 - k));
        for (j = 0; j < n; j++) {
            a = Math.PI * (0.18 + 0.64 * (j + 0.5) / n) + (rnd(p.seed, j) - 0.5) * 0.35;
            v = (28 + 50 * p.s) * (0.7 + 0.6 * rnd(p.seed, j + 9));
            px = x + Math.cos(a) * v * ts + S.windN * 14 * ts;
            py = RH - Math.sin(a) * v * ts + 0.5 * 420 * ts * ts;
            if (py > RH) continue;
            mgraphics.ellipse(px - 0.9, py - 0.9, 1.8, 1.8);
            mgraphics.fill();
        }
    }
}

function flashAmount(S, c, t) {
    var age = t - (S.flashT[c] || 0);
    if (age < 0 || age >= FLASH_LIFE) return 0;
    return (1 - age / FLASH_LIFE) * (0.55 + 0.45 * (S.flashV[c] || 0) / 127);
}

// destello: un charco de luz en el suelo, centrado en la columna que suena.
// Las columnas no se dibujan: solo se intuyen por dónde se encienden.
function drawFlashGlow(S, W, RH, t) {
    var n = S.cols ? S.cols.length : 0;
    var cw, c, a, x, R, pat;
    if (!n) return;
    cw = W / n;
    R = Math.max(14, Math.min(40, cw * 0.9));
    for (c = 0; c < n; c++) {
        a = flashAmount(S, c, t);
        if (a <= 0) continue;
        x = (c + 0.5) * cw;
        pat = mgraphics.pattern_create_radial(x, RH, 0, x, RH, R);
        pat.add_color_stop_rgba(0, 1, 1, 1, 0.32 * a);
        pat.add_color_stop_rgba(1, 1, 1, 1, 0);
        mgraphics.set_source(pat);
        mgraphics.rectangle(x - R, RH - R, 2 * R, R + 1);
        mgraphics.fill();
    }
}

function drawGround(S, W, RH, t) {
    var n = S.cols ? S.cols.length : 0;
    var msg, tw;

    mgraphics.set_line_width(1);
    mgraphics.set_source_rgba(1, 1, 1, 0.22);
    mgraphics.move_to(0, RH + 0.5);
    mgraphics.line_to(W, RH + 0.5);
    mgraphics.stroke();

    if (!n) {
        msg = (S.mode === 1) ? "Play notes" : "No notes in range";
        mgraphics.select_font_face(FONT);
        mgraphics.set_font_size(8);
        tw = mgraphics.text_measure(msg)[0];
        mgraphics.set_source_rgba(1, 1, 1, 0.45 + 0.2 * Math.sin(t / 420));
        mgraphics.move_to((W - tw) / 2, RH - 8);
        mgraphics.show_text(msg);
    }
}
