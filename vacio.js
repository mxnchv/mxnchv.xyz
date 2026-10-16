// Lab: an endless drift through the dark. Point (or drag) where you want to go.
// Forms grow out of origins on roots you can follow; each has its own synthesised voice (A minor),
// placed where the form is. Built from the editor page (vacio-editor.html in mxnchv/q): edit the
// sound there, "copiar ajustes", and paste the result into TUNED below.
(() => {
  const stage = document.getElementById('vacio');
  if (!stage) return;
  const cv = stage.querySelector('canvas'), g = cv.getContext('2d');
  const fb = document.createElement('canvas'), fg = fb.getContext('2d');   // last frame, for the feedback
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── tiny math
  const norm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const clamp01 = v => Math.max(0, Math.min(1, v));
  const UP = [0, 1, 0];
  function rng(seed) { seed >>>= 0; return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; }
  function hash3(x, y, z) {
    let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function noise3(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const s = v => v * v * (3 - 2 * v), u = s(x - xi), v = s(y - yi), w = s(z - zi);
    const L = (a, b, t) => a + (b - a) * t;
    const c = (i, j, k) => hash3(xi + i, yi + j, zi + k);
    return L(L(L(c(0, 0, 0), c(1, 0, 0), u), L(c(0, 1, 0), c(1, 1, 0), u), v),
             L(L(c(0, 0, 1), c(1, 0, 1), u), L(c(0, 1, 1), c(1, 1, 1), u), v), w);
  }
  // how busy each region is: 0 = calm stretch, 1 = thick with forms. Never quite empty.
  const density = p => { const n = noise3(p[0] / 230, p[1] / 230, p[2] / 230); return clamp01((n - 0.3) / 0.4); };

  // ── camera: free orientation, always drifting forward
  const cam = { p: [0, 0, 0], f: [0, 0, 1], r: [1, 0, 0], u: [0, 1, 0], wy: 0, wp: 0 };
  const steer = { x: 0, y: 0, keys: { x: 0, y: 0 } };
  const SPEED = calm ? 5 : 10;
  function turn(dt) {
    const shape = o => { const a = Math.abs(o), dz = 0.06; return a < dz ? 0 : Math.sign(o) * Math.pow((a - dz) / (1 - dz), 1.4); };
    const MAX = calm ? 0.45 : 0.85;
    const tx = shape(steer.x + steer.keys.x) * MAX, ty = shape(steer.y + steer.keys.y) * MAX;
    const k = Math.min(1, dt * 2.2);
    cam.wy += (tx - cam.wy) * k; cam.wp += (ty - cam.wp) * k;
    const a = cam.wy * dt, b = -cam.wp * dt;
    let { f, r, u } = cam, ca = Math.cos(a), sa = Math.sin(a);
    [f, r] = [[f[0] * ca + r[0] * sa, f[1] * ca + r[1] * sa, f[2] * ca + r[2] * sa], [r[0] * ca - f[0] * sa, r[1] * ca - f[1] * sa, r[2] * ca - f[2] * sa]];
    const cb = Math.cos(b), sb = Math.sin(b);
    [f, u] = [[f[0] * cb + u[0] * sb, f[1] * cb + u[1] * sb, f[2] * cb + u[2] * sb], [u[0] * cb - f[0] * sb, u[1] * cb - f[1] * sb, u[2] * cb - f[2] * sb]];
    f = norm(f);
    if (Math.abs(f[1]) < 0.96) {                       // gently level the horizon
      const rt = norm(cross(UP, f)), m = Math.min(1, dt * 0.9);
      r = norm([r[0] + (rt[0] - r[0]) * m, r[1] + (rt[1] - r[1]) * m, r[2] + (rt[2] - r[2]) * m]);
    }
    u = norm(cross(f, r)); r = norm(cross(u, f));
    cam.f = f; cam.r = r; cam.u = u;
    for (let i = 0; i < 3; i++) cam.p[i] += f[i] * SPEED * dt;
  }

  // ── renderer: projected points and lines, batched by brightness
  let W = 0, H = 0, dpr = 1, F = 1;
  const FAR = 160, NEAR = 1.2, LV = 14;
  const ptB = Array.from({ length: LV }, () => []), lnB = Array.from({ length: LV }, () => []);
  const A = [0, 0, 0], B = [0, 0, 0];
  function proj(x, y, z, out) {
    const dx = x - cam.p[0], dy = y - cam.p[1], dz = z - cam.p[2];
    const d = dx * cam.f[0] + dy * cam.f[1] + dz * cam.f[2];
    if (d < NEAR || d > FAR) return false;
    out[0] = W / 2 + (dx * cam.r[0] + dy * cam.r[1] + dz * cam.r[2]) / d * F;
    out[1] = H / 2 - (dx * cam.u[0] + dy * cam.u[1] + dz * cam.u[2]) / d * F;
    out[2] = d;
    return out[0] > -60 && out[0] < W + 60 && out[1] > -60 && out[1] < H + 60;
  }
  const fog = d => Math.pow(1 - d / FAR, 1.6) * Math.min(1, d / 3);
  const fogL = d => Math.pow(Math.max(0, 1 - d / FAR), 1.6) * Math.min(1, 0.35 + d / 4);   // lines stay visible right up close
  function point(q, size = 1, bright = 1) {
    if (!proj(q[0], q[1], q[2], A)) return;
    const a = Math.min(1, fog(A[2]) * bright); if (a < 0.02) return;
    const s = Math.max(0.6, Math.min(3.2, size * 26 / A[2]));
    ptB[Math.min(LV - 1, a * LV | 0)].push(A[0] - s / 2, A[1] - s / 2, s);
  }
  // lines are clipped at the camera instead of dropped, so a form you fly into stays on screen
  function camSpace(q, o) {
    const dx = q[0] - cam.p[0], dy = q[1] - cam.p[1], dz = q[2] - cam.p[2];
    o[0] = dx * cam.r[0] + dy * cam.r[1] + dz * cam.r[2];
    o[1] = dx * cam.u[0] + dy * cam.u[1] + dz * cam.u[2];
    o[2] = dx * cam.f[0] + dy * cam.f[1] + dz * cam.f[2];
  }
  const LN = 0.4;
  function line(p, q, bright = 0.5) {
    camSpace(p, A); camSpace(q, B);
    if ((A[2] < LN && B[2] < LN) || (A[2] > FAR && B[2] > FAR)) return;
    if (A[2] < LN) { const k = (LN - A[2]) / (B[2] - A[2]); A[0] += (B[0] - A[0]) * k; A[1] += (B[1] - A[1]) * k; A[2] = LN; }
    else if (B[2] < LN) { const k = (LN - B[2]) / (A[2] - B[2]); B[0] += (A[0] - B[0]) * k; B[1] += (A[1] - B[1]) * k; B[2] = LN; }
    const a = Math.min(1, fogL(Math.min(A[2], B[2]) * 0.5 + Math.max(A[2], B[2]) * 0.5) * bright); if (a < 0.02) return;
    const x1 = W / 2 + A[0] / A[2] * F, y1 = H / 2 - A[1] / A[2] * F, x2 = W / 2 + B[0] / B[2] * F, y2 = H / 2 - B[1] / B[2] * F;
    if ((x1 < 0 && x2 < 0) || (x1 > W && x2 > W) || (y1 < 0 && y2 < 0) || (y1 > H && y2 > H)) return;
    lnB[Math.min(LV - 1, a * LV | 0)].push(x1, y1, x2, y2);
  }

  // ═══ the world ═══
  // Space is split into big cells. Each cell has one ORIGIN (a pulsing seed) and the forms grow out
  // of it on long roots, so every form can be traced back to where it comes from: sap flows along
  // each root from the origin to its form. Calm cells have few forms; the origin is always there.
  const G = 120;
  const wide = () => Math.max(W, H) / 2 / F * 1.25;
  function inView(c, rad) {
    const x = c[0] - cam.p[0], y = c[1] - cam.p[1], z = c[2] - cam.p[2];
    const d = x * cam.f[0] + y * cam.f[1] + z * cam.f[2];
    if (d < -rad || d > FAR + rad) return false;
    return Math.sqrt(Math.max(0, x * x + y * y + z * z - d * d)) <= Math.max(0, d) * wide() + rad;
  }
  const sway = (q, t, ph, i, amt = 1) => {
    const s = Math.sin(t * 0.45 + ph + i * 0.09) * 1.6 * amt;
    return [q[0] + s, q[1] + Math.cos(t * 0.3 + ph + i * 0.05) * 0.8 * amt, q[2] - s * 0.6];
  };
  // push a point away from the camera when it gets close (things part as you pass)
  function part(q, radius, amount) {
    const dx = q[0] - cam.p[0], dy = q[1] - cam.p[1], dz = q[2] - cam.p[2], d = Math.hypot(dx, dy, dz);
    if (d >= radius || d < 0.001) return q;
    const k = (radius - d) / d * amount;
    return [q[0] + dx * k, q[1] + dy * k, q[2] + dz * k];
  }
  const fib = n => Array.from({ length: n }, (_, i) => {           // evenly spread directions on a sphere
    const y = 1 - (i + 0.5) / n * 2, rr = Math.sqrt(1 - y * y), th = i * 2.39996;
    return [Math.cos(th) * rr, y, Math.sin(th) * rr];
  });
  function rotY(v, a) { const c = Math.cos(a), s = Math.sin(a); return [v[0] * c + v[2] * s, v[1], v[2] * c - v[0] * s]; }
  function rotate(v, ax, ang) {                         // Rodrigues: v turned around axis ax
    const c = Math.cos(ang), s = Math.sin(ang), d = v[0] * ax[0] + v[1] * ax[1] + v[2] * ax[2], x = cross(ax, v);
    return [v[0] * c + x[0] * s + ax[0] * d * (1 - c), v[1] * c + x[1] * s + ax[1] * d * (1 - c), v[2] * c + x[2] * s + ax[2] * d * (1 - c)];
  }
  const madd = (a, v, k) => [a[0] + v[0] * k, a[1] + v[1] * k, a[2] + v[2] * k];

  const NAMES = { thread: 'filamento', cloud: 'nube', coral: 'coral', knot: 'ovillo', bolt: 'rayo', myc: 'micelio', urchin: 'erizo', flock: 'bandada', origin: 'origen' };
  const on = { thread: true, cloud: true, coral: true, knot: true, bolt: true, myc: true, urchin: true, flock: true };

  // ── making each form (P = where its root ends, dir = away from the origin)
  const MAKE = {
    thread(r, P, dir) {
      let p = P.slice(), d = dir.slice(); const pts = [];
      for (let i = 0; i < 46; i++) {
        pts.push(p.slice());
        d = norm([d[0] + (r() - 0.5) * 0.5, d[1] + (r() - 0.5) * 0.5, d[2] + (r() - 0.5) * 0.5]);
        p = madd(p, d, 2.4);
      }
      return { pts, c: pts[16] };
    },
    cloud(r, P) {
      const gauss = () => (r() + r() + r() - 1.5) * 1.4, sz = 6 + r() * 8, flat = r() < 0.5 ? 0.3 : 1, pts = [];
      for (let i = 0; i < 160; i++) pts.push([P[0] + gauss() * sz, P[1] + gauss() * sz * flat, P[2] + gauss() * sz]);
      return { pts, c: P };
    },
    coral(r, P, dir) {
      const segs = [];
      const grow = (p, d, len, depth) => {
        const q = madd(p, d, len);
        segs.push([p, q, depth === 0]);
        if (depth > 0) for (let b = 0; b < 2 + (r() < 0.3); b++)
          grow(q, norm([d[0] + (r() - 0.5) * 1.3, d[1] + (r() - 0.5) * 1.3, d[2] + (r() - 0.5) * 1.3]), len * (0.6 + r() * 0.2), depth - 1);
      };
      grow(P, dir, 8 + r() * 5, 4);
      return { segs, c: madd(P, dir, 12) };
    },
    // ovillo: a scribbled tangle, a random walk kept inside a ball; it unravels as you come close
    knot(r, P) {
      const R = 5 + r() * 5, pts = []; let p = [0, 0, 0], d = norm([r() - 0.5, r() - 0.5, r() - 0.5]);
      for (let i = 0; i < 150; i++) {
        pts.push(p.slice());
        const back = Math.hypot(p[0], p[1], p[2]) > R ? 0.6 : 0;          // pulled back in at the edge
        d = norm([d[0] + (r() - 0.5) * 1.1 - p[0] / R * back, d[1] + (r() - 0.5) * 1.1 - p[1] / R * back, d[2] + (r() - 0.5) * 1.1 - p[2] / R * back]);
        p = madd(p, d, 1.3);
      }
      return { c: P, pts, ax: norm([r() - 0.5, 1, r() - 0.5]), jit: pts.map(() => 0.5 + r()), cullR: 40 };
    },
    // rayo: a slow-motion discharge that branches out, hangs, fades and strikes again, never the same twice
    bolt(r, P, dir) { return { c: madd(P, dir, 10), at0: P, dir, cyc: r() * 6, segs: null, cullR: 50 }; },
    // erizo: a ball of spikes of chaotic lengths; it bristles when you come close
    urchin(r, P) {
      const spikes = fib(40 + (r() * 50 | 0)).map(v => ({
        v: norm([v[0] + (r() - 0.5) * 0.3, v[1] + (r() - 0.5) * 0.3, v[2] + (r() - 0.5) * 0.3]),
        len: 1.5 + Math.pow(r(), 3) * 14, jit: 0.4 + r(), q: r() * 6.28,
      }));
      return { c: P, spikes, ax: norm([r() - 0.5, 1, r() - 0.5]), cullR: 45 };
    },
    flock(r, P) {
      const birds = Array.from({ length: 34 }, () => ({
        rad: 2 + r() * 6, ph: r() * 6.28, sp: (0.5 + r() * 0.9) * (r() < 0.5 ? -1 : 1), ax: norm([r() - 0.5, r() - 0.5, r() - 0.5]), prev: null,
      }));
      birds.forEach(b => { b.ay = norm(cross(b.ax, norm([r() - 0.5, r() - 0.5, r() - 0.5]))); });
      return { birds, c: P.slice(), follow: 0, rest: 0, orbit: 35 + r() * 25 };
    },
  };

  // ── roots: a bent line from the origin to the form, with sap running outwards along it
  function rootPt(fm, s, t) {
    const O = fm.o, P = fm.at, b1 = Math.sin(Math.PI * s), b2 = Math.sin(2 * Math.PI * s), w = 1 + 0.12 * Math.sin(t * 0.35 + fm.ph);
    return [O[0] + (P[0] - O[0]) * s + (fm.n1[0] * fm.A1 * b1 + fm.n2[0] * fm.A2 * b2) * w,
            O[1] + (P[1] - O[1]) * s + (fm.n1[1] * fm.A1 * b1 + fm.n2[1] * fm.A2 * b2) * w,
            O[2] + (P[2] - O[2]) * s + (fm.n1[2] * fm.A1 * b1 + fm.n2[2] * fm.A2 * b2) * w];
  }
  function drawRoot(fm, t) {
    if (!inView(fm.mid, fm.len / 2 + Math.max(fm.A1, fm.A2) + 4)) return;
    const N = 30; let prev = rootPt(fm, 0, t);
    for (let i = 1; i <= N; i++) { const q = rootPt(fm, i / N, t); line(prev, q, 0.38); prev = q; }
    fm.lastS = fm.lastS || [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      const s = (t * fm.flow + k / 3) % 1; point(rootPt(fm, s, t), 0.9, 1.4 * Math.sin(Math.PI * s));
      if (s < fm.lastS[k] && dist(fm.at, cam.p) < 45) sound.drop(fm.at);     // a drop of sap arrives
      fm.lastS[k] = s;
    }
  }

  const DRAW = {
    origin(o, t, dt) {
      const d = dist(o.c, cam.p); o.ex += (clamp01((40 - d) / 25) - o.ex) * Math.min(1, dt * 1.5);
      // a loose, lopsided knot of specks where the roots meet: each one drifts and flickers on its own
      const R = (1 + 0.15 * Math.sin(t * 1.3 + o.ph)) * (1 + o.ex * 1.6);
      o.specks.forEach(s => {
        const v = rotY(s.v, Math.sin(t * s.s * 0.3 + s.f) * 0.8);
        point(madd(o.c, v, s.d * R * (1 + 0.2 * Math.sin(t * s.s + s.f))), 1.1, 0.6 + 0.9 * Math.max(0, Math.sin(t * s.s * 2 + s.f)));
      });
      point(o.c, 1.8, 1.6);
    },
    thread(fm, t) {
      const grow = 0.55 + 0.45 * Math.sin(t * 0.06 + fm.ph);
      const n = Math.max(4, fm.pts.length * grow | 0);
      let prev = null;
      for (let i = 0; i < n; i++) {
        const q = sway(fm.pts[i], t, fm.ph, i, Math.min(1, i / 8));     // fixed at the root, freer towards the tip
        const tail = Math.min(1, (n - i) / 6);
        const run = fm.near * Math.max(0, Math.sin(i * 0.35 - t * 5)) * 1.2;
        const b = (0.7 + run) * tail;
        if (prev) line(prev, q, b * 0.75);
        if (i % 3 === 0 || run > 0.6) point(q, 1 + run, b);
        prev = q;
      }
    },
    cloud(fm, t) {
      const br = 1 + Math.sin(t * 0.6 + fm.ph) * 0.08, c = fm.c;
      for (let i = 0; i < fm.pts.length; i++) {
        const q = fm.pts[i];
        point(part([c[0] + (q[0] - c[0]) * br, c[1] + (q[1] - c[1]) * br, c[2] + (q[2] - c[2]) * br], 14, 0.9), 1.1, 0.85 + fm.near * 0.5);
      }
    },
    coral(fm, t) {
      fm.segs.forEach(([a, b, tip], i) => {
        const p = sway(a, t, fm.ph, i, Math.min(0.6, i * 0.1)), q = part(sway(b, t, fm.ph, i + 1, Math.min(0.6, i * 0.1)), 8, 0.4);
        line(p, q, 0.8);
        if (tip) {
          const fl = clamp01(1 - dist(q, cam.p) / 16); point(q, 1.3 + fl * 2.5, 1 + fl * 2);
          fm.lit = fm.lit || new Set();                                     // brushing a tip plays it (once per pass)
          if (fl > 0.3 && !fm.lit.has(i)) { if (!fm.lit.size) sound.coralPass(); fm.lit.add(i); sound.pluck(q, i + idxSeed(fm)); } else if (fl < 0.05) fm.lit.delete(i);
        }
      });
    },
    knot(fm, t) {
      const loose = fm.near * fm.near, ang = t * 0.12 + fm.ph;
      let prev = null;
      fm.pts.forEach((q0, i) => {
        const s = 1 + loose * 2.2 * fm.jit[i] + Math.sin(t * 0.8 + i * 0.3) * 0.04;
        const w = rotate(q0, fm.ax, ang), q = [fm.c[0] + w[0] * s, fm.c[1] + w[1] * s, fm.c[2] + w[2] * s];
        if (prev) line(prev, q, 0.7 - loose * 0.25);
        if (i % 5 === 0) point(q, 0.9, 0.9);
        prev = q;
      });
    },
    bolt(fm, t, dt) {
      // one cycle: grow 2.4s · hold 1.2s · fade 2s · rest 1–3s; you being near speeds it up
      fm.cyc += dt * (1 + fm.near * 1.5);
      if (!fm.segs || fm.cyc > fm.end) {
        const segs = [];
        const strike = (p, d, n, order, depth) => {
          for (let i = 0; i < n; i++) {
            d = norm([d[0] + (Math.random() - 0.5) * 1.6, d[1] + (Math.random() - 0.5) * 1.6, d[2] + (Math.random() - 0.5) * 1.6]);
            const q = madd(p, d, 1.5 + Math.random() * 2.5);
            segs.push([p, q, order + i]);
            if (depth < 3 && Math.random() < 0.16) strike(q, d.slice(), (n - i) * 0.6 | 0, order + i + 1, depth + 1);
            p = q;
          }
        };
        strike(fm.at0, fm.dir.slice(), 22 + (Math.random() * 14 | 0), 0, 0);
        fm.segs = segs; fm.maxOrder = Math.max(...segs.map(s => s[2])) + 1;
        sound.bolt(fm.c);
        fm.cyc = 0; fm.end = 5.6 + 1 + Math.random() * 2;
      }
      const c = fm.cyc, grow = clamp01(c / 2.4), fade = c < 3.6 ? 1 : clamp01(1 - (c - 3.6) / 2);
      const shown = grow * fm.maxOrder;
      fm.segs.forEach(([p, q, o]) => {
        if (o > shown) return;
        const fresh = clamp01(1 - (shown - o) / 4);                      // the growing tip is brightest
        line(p, q, (0.55 + fresh * 0.9 + fm.near * 0.4) * fade);
        if (fresh > 0.5) point(q, 1.2, 1.4 * fade);
      });
    },
    urchin(fm, t) {
      const ang = t * 0.08 + fm.ph, b = fm.near;
      fm.spikes.forEach((s, i) => {
        const v = rotate(s.v, fm.ax, ang + Math.sin(t * 18 + s.q) * 0.015 * b);
        const len = s.len * (1 + b * 1.4 * s.jit);
        const tip = madd(fm.c, v, len);
        line(madd(fm.c, v, 0.8), tip, 0.75 + b * 0.3);
        point(tip, 0.9 + b * 0.6, 1);
      });
      point(fm.c, 1.4, 1);
    },
    // micelio: hyphae creeping between the forms of a cell, linking them; it starts growing when you
    // first see it (faster while you're near), then sap pulses along the links
    myc(fm, t, dt) {
      fm.grow += dt * (1 + fm.near * 2.5);
      fm.growing = fm.links.some(L => fm.grow > L.delay && fm.grow < L.delay + 9);
      fm.links.forEach(L => {
        const g = clamp01((fm.grow - L.delay) / 9), n = L.pts.length - 1, shown = g * n;
        for (let i = 1; i <= n && i <= shown + 1; i++) {
          const k = Math.min(1, shown - i + 1); if (k <= 0) break;
          const a = L.pts[i - 1], b = L.pts[i], e = k < 1 ? [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k] : b;
          line(a, e, 0.65);
          if (k < 1 || i === (shown | 0)) point(e, 1, 1.3);             // the growing tip
        }
        L.hairs.forEach(h => { if (h.at <= shown) { let p = L.pts[h.at]; h.seg.forEach(q => { line(p, q, 0.45); p = q; }); } });
        if (g >= 1) { const s = (t * 0.06 + L.delay * 0.1) % 1; point(L.pts[s * n | 0], 0.9, 1.2); }
        if (g > 0) point(L.pts[0], 1.2, 1);
      });
    },
    flock(fm, t, dt) {
      const d = dist(fm.c, cam.p);
      if (fm.rest > 0) fm.rest -= dt;
      if (fm.follow > 0) { fm.follow -= dt; if (fm.follow <= 0) fm.rest = 25; }
      else if (fm.rest <= 0 && d < 38) fm.follow = 6 + Math.random() * 5;       // it notices you and tags along a while
      const O = fm.o, R = fm.orbit;                                             // otherwise it circles its origin
      const target = fm.follow > 0
        ? [cam.p[0] + cam.f[0] * 10 + cam.u[0] * 2, cam.p[1] + cam.f[1] * 10 + cam.u[1] * 2, cam.p[2] + cam.f[2] * 10 + cam.u[2] * 2]
        : [O[0] + Math.sin(t * 0.13 + fm.ph) * R, O[1] + Math.sin(t * 0.09 + fm.ph) * R * 0.4, O[2] + Math.cos(t * 0.13 + fm.ph) * R];
      const k = Math.min(1, dt * (fm.follow > 0 ? 0.9 : 0.35));
      for (let i = 0; i < 3; i++) fm.c[i] += (target[i] - fm.c[i]) * k;
      const spread = fm.follow > 0 ? 1.6 : 1;
      fm.birds.forEach(b => {
        const th = b.ph + t * b.sp, ct = Math.cos(th) * b.rad * spread, st = Math.sin(th) * b.rad * spread;
        const q = [fm.c[0] + b.ax[0] * ct + b.ay[0] * st, fm.c[1] + b.ax[1] * ct + b.ay[1] * st, fm.c[2] + b.ax[2] * ct + b.ay[2] * st];
        if (b.prev) line(b.prev, q, 0.6);
        point(q, 1.2, 1);
        b.prev = q;
      });
    },
  };

  // ── cells: generated as you travel, so it never repeats
  const cells = new Map(), followers = new Set();
  function gen(i, j, k) {
    const r = rng(hash3(i, j, k) * 4294967296), mid = [(i + 0.5) * G, (j + 0.5) * G, (k + 0.5) * G];
    const dens = density(mid);
    const O = [mid[0] + (r() - 0.5) * G * 0.4, mid[1] + (r() - 0.5) * G * 0.4, mid[2] + (r() - 0.5) * G * 0.4];
    const origin = { type: 'origin', c: O, ph: r() * 6.28, ex: 0, near: 0, specks: Array.from({ length: 10 + (r() * 22 | 0) }, () => ({ v: norm([r() - 0.5, r() - 0.5, r() - 0.5]), d: Math.pow(r(), 1.8) * (2 + r() * 6), f: r() * 6.28, s: 0.3 + r() * 1.2 })) };
    const forms = [];
    const count = 8 + Math.floor(dens * 14 + r() * 2);
    let flocks = 0;
    for (let n = 0; n < count; n++) {
      const wts = { thread: 0.3 + dens, cloud: 0.2 + dens * 0.7, coral: 0.25 + dens, knot: 0.15 + dens * 0.3, bolt: 0.12 + dens * 0.3, urchin: 0.15 + dens * 0.25, flock: flocks ? 0 : 0.25 };
      let x = r() * Object.values(wts).reduce((a, b) => a + b), type = 'thread';
      for (const key in wts) { x -= wts[key]; if (x <= 0) { type = key; break; } }
      if (type === 'flock') flocks++;
      const dir = norm([r() - 0.5, r() - 0.5, r() - 0.5]), len = 20 + r() * 55, P = madd(O, dir, len);
      const fm = Object.assign({ type, ph: r() * 6.28, near: 0, o: O, at: P, flow: 0.05 + r() * 0.05 }, MAKE[type](r, P, dir));
      if (type !== 'flock') {                              // its root back to the origin
        const n1 = norm(cross(dir, [r() - 0.5, r() - 0.5, r() - 0.5])), n2 = norm(cross(dir, n1));
        Object.assign(fm, { n1, n2, A1: len * (0.1 + r() * 0.25), A2: len * (r() - 0.5) * 0.2, len, mid: madd(O, dir, len / 2), root: true });
      }
      forms.push(fm);
    }
    // mycelium: links each form to its nearest neighbours in the cell with a creeping, hairy thread
    if (r() < 0.35 + dens * 0.5) {
      const nodes = forms.filter(f => f.type !== 'flock'), links = [], seen = new Set();
      nodes.forEach((A, ia) => {
        nodes.map((B, ib) => [dist(A.c, B.c), ib]).filter(([d, ib]) => ib !== ia && d < 85).sort((a, b) => a[0] - b[0]).slice(0, 3).forEach(([d, ib]) => {
          const key = Math.min(ia, ib) + '-' + Math.max(ia, ib); if (seen.has(key) || links.length >= 16) return; seen.add(key);
          const B = nodes[ib], N = Math.max(8, d / 2.2 | 0), walk = [[0, 0, 0]];
          for (let i = 1; i <= N; i++) { const w = walk[i - 1]; walk.push([w[0] + (r() - 0.5) * 3, w[1] + (r() - 0.5) * 3, w[2] + (r() - 0.5) * 3]); }
          const end = walk[N];                               // bend the walk so it lands exactly on B
          const pts = walk.map((w, i) => { const k = i / N; return [A.c[0] + (B.c[0] - A.c[0]) * k + w[0] - end[0] * k, A.c[1] + (B.c[1] - A.c[1]) * k + w[1] - end[1] * k, A.c[2] + (B.c[2] - A.c[2]) * k + w[2] - end[2] * k]; });
          const hairs = [];
          for (let i = 2; i < N - 1; i++) if (r() < 0.4) {
            let p = pts[i], d2 = norm([r() - 0.5, r() - 0.5, r() - 0.5]); const seg = [];
            for (let k = 0; k < 2 + (r() * 3 | 0); k++) { d2 = norm([d2[0] + (r() - 0.5), d2[1] + (r() - 0.5), d2[2] + (r() - 0.5)]); p = madd(p, d2, 1 + r() * 1.5); seg.push(p); }
            hairs.push({ at: i, seg });
          }
          links.push({ pts, hairs, delay: links.length * 0.7 + r() * 1.5 });
        });
      });
      if (links.length) {
        const c = [0, 0, 0]; links.forEach(L => { for (let i = 0; i < 3; i++) c[i] += L.pts[L.pts.length >> 1][i] / links.length; });
        forms.push({ type: 'myc', ph: 0, near: 0, c, links, grow: 0, cullR: 110 });
      }
    }
    return { origin, forms };
  }
  function getCell(i, j, k) {
    const key = i + ',' + j + ',' + k;
    let cell = cells.get(key); if (!cell) { cell = gen(i, j, k); cell.ijk = [i, j, k]; cells.set(key, cell); }
    return cell;
  }
  const idxSeed = fm => Math.floor(fm.ph * 7.3) % 10;
  function visibleCells() {
    const ci = Math.floor(cam.p[0] / G), cj = Math.floor(cam.p[1] / G), ck = Math.floor(cam.p[2] / G), out = [];
    for (let i = ci - 2; i <= ci + 2; i++) for (let j = cj - 2; j <= cj + 2; j++) for (let k = ck - 2; k <= ck + 2; k++) {
      const c = [(i + 0.5) * G, (j + 0.5) * G, (k + 0.5) * G];
      if (!inView(c, G * 0.87 + 90)) continue;
      out.push(getCell(i, j, k));
    }
    if (cells.size > 300) for (const [key, cell] of cells)
      if (Math.max(Math.abs(cell.ijk[0] - ci), Math.abs(cell.ijk[1] - cj), Math.abs(cell.ijk[2] - ck)) > 3) cells.delete(key);
    return out;
  }
  // start a little back from the first origin, looking at it
  { const first = gen(0, 0, 0); first.ijk = [0, 0, 0]; cells.set('0,0,0', first); cam.p = [first.origin.c[0], first.origin.c[1] + 6, first.origin.c[2] - 75]; }

  // dust: always some in the air, so even calm stretches feel like moving through something
  const DUST = (() => { const r = rng(5); return Array.from({ length: 900 }, () => [r() * 110, r() * 110, r() * 110]); })();
  const wrap = v => ((v % 110) + 165) % 110 - 55;

  const labels = [];
  let frameNo = 0;
  function world(t, dt) {
    frameNo++;
    for (const cell of visibleCells()) {
      drawForm(cell.origin, t, dt, 60);
      for (const fm of cell.forms) {
        if (!on[fm.type]) continue;
        if (fm.root) drawRoot(fm, t);
        if (fm.type === 'flock' || inView(fm.c, fm.cullR || 40)) drawForm(fm, t, dt);
      }
    }
    for (const fm of followers) drawForm(fm, t, dt);
    for (const q of DUST) point([cam.p[0] + wrap(q[0] - cam.p[0]), cam.p[1] + wrap(q[1] - cam.p[1]), cam.p[2] + wrap(q[2] - cam.p[2])], 0.9, 0.7);
  }
  function drawForm(fm, t, dt, far = 50) {
    if (fm.drawn === frameNo) return; fm.drawn = frameNo;
    const d = dist(fm.c, cam.p);
    fm.near += (clamp01(1 - d / 26) - fm.near) * Math.min(1, dt * 3);
    DRAW[fm.type](fm, t, dt);
    if (fm.type === 'flock') { if (fm.follow > 0) followers.add(fm); else followers.delete(fm); }
    if (showNames && d < far && proj(fm.c[0], fm.c[1], fm.c[2], A)) labels.push(A[0], A[1], clamp01((far - d) / 25), NAMES[fm.type]);
  }

  // ── compositing: video feedback while turning, then the frame, then the labels.
  // The trail swells quickly when you turn and fades slowly after you stop (attack fast, release slow),
  // and it drags against the turn, so the image smears away from where you are heading.
  let fbAmount = calm ? 0 : 0.8, showNames = false, env = 0, swy = 0, swp = 0;
  function render(t, dt) {
    const cw = cv.width, chh = cv.height;
    const spin = clamp01(Math.hypot(cam.wy, cam.wp) / 0.45);
    env += (spin - env) * Math.min(1, dt * (spin > env ? 5 : 0.6));
    swy += (cam.wy - swy) * Math.min(1, dt * (Math.abs(cam.wy) > Math.abs(swy) ? 5 : 0.6));
    swp += (cam.wp - swp) * Math.min(1, dt * (Math.abs(cam.wp) > Math.abs(swp) ? 5 : 0.6));
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1; g.fillStyle = '#000'; g.fillRect(0, 0, cw, chh);
    const k = fbAmount * env;
    if (k > 0.01) {
      g.globalAlpha = Math.min(0.9, k * 0.95);
      g.translate(cw / 2, chh / 2);
      g.rotate(-swy * 0.02 * k);
      const z = 1 + 0.01 * k; g.scale(z, z);
      // push the old frame further along the way the picture is already moving, so the trail runs ahead of it
      const lead = 2.2 * Math.min(0.05, dt) * F * dpr / z;
      g.translate(-cw / 2 - swy * lead, -chh / 2 - swp * lead);
      g.drawImage(fb, 0, 0);
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1;
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    labels.length = 0;
    world(t, dt);
    g.lineWidth = 0.7;
    for (let i = 0; i < LV; i++) {
      const a = ((i + 0.5) / LV).toFixed(3);
      const L = lnB[i]; if (L.length) {
        g.strokeStyle = `rgba(255,255,255,${a})`; g.beginPath();
        for (let j = 0; j < L.length; j += 4) { g.moveTo(L[j], L[j + 1]); g.lineTo(L[j + 2], L[j + 3]); }
        g.stroke(); L.length = 0;
      }
      const P = ptB[i]; if (P.length) {
        g.fillStyle = `rgba(255,255,255,${a})`; g.beginPath();
        for (let j = 0; j < P.length; j += 3) g.rect(P[j], P[j + 1], P[j + 2], P[j + 2]);
        g.fill(); P.length = 0;
      }
    }
    fg.globalCompositeOperation = 'copy'; fg.drawImage(cv, 0, 0);        // remember this frame (without labels)
    if (labels.length) {
      g.font = '10px "Space Mono", monospace'; g.textBaseline = 'middle';
      for (let i = 0; i < labels.length; i += 4) {
        g.fillStyle = `rgba(255,255,255,${(labels[i + 2] * 0.6).toFixed(3)})`;
        g.fillText(labels[i + 3], labels[i] + 12, labels[i + 1]);
      }
    }
  }

  // ═══ sound ═══
  // All synthesised with Web Audio, in A minor like the rest of the site: short random voices use
  // the pentatonic (nothing can clash), long notes the full scale. Each voice sounds from where its
  // form is (left/right/behind); distance makes it quieter, darker and wetter.
  // Every number a voice uses lives in SCHEMA below, so the mixer panel can edit it live.
  const WAVES = [['sine', 'seno'], ['triangle', 'triángulo'], ['sawtooth', 'sierra'], ['square', 'cuadrada']];
  const NOTE_NAMES = ['La', 'La#', 'Si', 'Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#'];
  const noteName = m => NOTE_NAMES[((m - 21) % 12 + 12) % 12] + Math.floor((m - 12) / 12);
  const RB = true;   // changing this param rebuilds the voice
  // [key, label, min, max, step, default, options]; options: { rb, fmt: 'note' | 'hz' | 's' | 'ms' | 'x', select }
  const common = (range, send = 1) => [['vol', 'volumen', 0, 3, 0.01, 1, { fmt: 'x' }], ['range', 'alcance (distancia)', 10, 250, 1, range], ['send', 'reverb', 0, 3, 0.01, send, { fmt: 'x' }]];
  const SCHEMA = {
    global: { name: 'general', params: [
      ['vol', 'volumen general', 0, 1.5, 0.01, 0.9],
      ['rev', 'reverb', 0, 2, 0.01, 0.9],
      ['revLen', 'largo de la reverb', 0.5, 12, 0.1, 5, { rb: RB, fmt: 's' }],
      ['smear', 'arrastre del giro', 0, 2, 0.01, 0.9],
      ['smearTime', 'tiempo del arrastre', 0.02, 0.9, 0.01, 0.17, { fmt: 's' }],
      ['smearFb', 'realimentación del arrastre', 0, 0.95, 0.01, 0.85],
      ['smearTone', 'tono del arrastre', 200, 10000, 10, 2600, { fmt: 'hz' }],
    ] },
    drone: { name: 'fondo', params: [
      ['vol', 'volumen', 0, 3, 0.01, 1, { fmt: 'x' }],
      ['wave', 'onda principal', 0, 0, 0, 'sawtooth', { select: WAVES, rb: RB }],
      ['root', 'nota raíz (la más grave)', 21, 57, 1, 33, { fmt: 'note', rb: RB }],
      ['detune', 'desafinación', 0, 50, 0.5, 7, { rb: RB, fmt: 'ct' }],
      ['mainCalm', 'onda principal · zona tranquila', 0, 0.2, 0.001, 0.025],
      ['main', 'onda principal · zona densa', 0, 0.2, 0.001, 0.055],
      ['fifthCalm', 'quinta · zona tranquila', 0, 0.2, 0.001, 0.012],
      ['fifth', 'quinta · zona densa', 0, 0.2, 0.001, 0.062],
      ['sub', 'octava (seno)', 0, 0.3, 0.001, 0.05],
      ['high', 'brillo agudo · zona tranquila', 0, 0.06, 0.0005, 0.01],
      ['cutCalm', 'filtro · zona tranquila', 40, 5000, 1, 260, { fmt: 'hz' }],
      ['cutDense', 'filtro · zona densa', 40, 8000, 1, 1160, { fmt: 'hz' }],
      ['q', 'resonancia', 0.1, 20, 0.1, 1.2],
      ['qOrigin', 'resonancia al pasar por un origen', 0.1, 30, 0.1, 20],
      ['qDist', 'distancia del efecto del origen', 5, 120, 1, 35],
      ['drift', 'la nota cambia al pasar corales', 0, 0, 0, 'on', { select: [['on', 'sí'], ['off', 'no']] }],
      ['passMin', 'pasadas por coral para cambiar · mínimo', 1, 10, 1, 2],
      ['passMax', 'pasadas por coral para cambiar · máximo', 1, 10, 1, 3],
      ['step', 'salto máximo (notas de la pentatónica)', 1, 4, 1, 1],
      ['span', 'notas por las que puede moverse', 2, 11, 1, 6],
      ['glide', 'tiempo del cambio de nota', 0.1, 30, 0.1, 8, { fmt: 's' }],
      ['lfoRate', 'respiración · velocidad', 0.005, 1, 0.005, 0.05, { fmt: 'hz' }],
      ['lfoDepth', 'respiración · profundidad', 0, 2000, 1, 120, { fmt: 'hz' }],
      ['send', 'reverb', 0, 1.5, 0.01, 0.35],
    ] },
    origin: { name: 'origen', cont: true, params: [...common(90),
      ['root', 'nota', 21, 57, 1, 33, { fmt: 'note', rb: RB }],
      ['harm', 'octava arriba', 0, 1.5, 0.01, 0.4],
      ['rate', 'velocidad del latido', 0.1, 6, 0.01, 1.3],
      ['sharp', 'dureza del latido', 1, 12, 0.1, 3],
    ] },
    thread: { name: 'filamentos', cont: true, params: [...common(75),
      ['wave', 'onda', 0, 0, 0, 'triangle', { select: WAVES, rb: RB }],
      ['root', 'nota más grave', 33, 81, 1, 57, { fmt: 'note', rb: RB }],
      ['spread', 'notas posibles (La menor)', 1, 14, 1, 7, { rb: RB }],
      ['harm', 'octava arriba', 0, 1.5, 0.01, 0.3],
      ['vibRate', 'vibrato · velocidad', 0, 12, 0.1, 4.5, { fmt: 'hz' }],
      ['vibDepth', 'vibrato · profundidad', 0, 80, 0.5, 7, { fmt: 'ct' }],
      ['far', 'nivel de lejos', 0, 1, 0.01, 0.25],
      ['pulse', 'latido del pulso de luz', 0, 1, 0.01, 0.4],
      ['smooth', 'suavidad de los cambios', 0.01, 2, 0.01, 0.06, { fmt: 's' }],
    ] },
    cloud: { name: 'nubes', cont: true, params: [...common(65),
      ['root', 'nota más grave', 45, 100, 1, 81, { fmt: 'note' }],
      ['spread', 'notas posibles (pentatónica)', 1, 15, 1, 6],
      ['rateMin', 'granos por segundo · de lejos', 0, 60, 0.5, 5],
      ['rateMax', 'granos por segundo · dentro', 0, 200, 1, 60],
      ['lenMin', 'largo del grano · mínimo', 5, 400, 1, 30, { fmt: 'ms' }],
      ['lenMax', 'largo del grano · máximo', 5, 800, 1, 100, { fmt: 'ms' }],
      ['q', 'filtro · estrechez', 0.3, 80, 0.1, 18, { rand: 0.3 }],
      ['velRnd', 'nivel · aleatorio por grano', 0, 1, 0.01, 0.4, { fmt: 'pct' }],
    ] },
    coral: { name: 'corales', params: [...common(45),
      ['wave', 'onda', 0, 0, 0, 'sawtooth', { select: WAVES }],
      ['root', 'nota más grave', 33, 93, 1, 69, { fmt: 'note' }],
      ['spread', 'notas posibles (pentatónica)', 1, 15, 1, 10],
      ['velRnd', 'nivel · aleatorio por nota', 0, 1, 0.01, 0.3, { fmt: 'pct' }],
      ['attack', 'ataque', 1, 300, 1, 5, { fmt: 'ms', rand: 0.3 }],
      ['decay', 'caída', 0.05, 8, 0.01, 1.2, { fmt: 's', rand: 0.3 }],
      ['cutStart', 'filtro · inicio', 100, 16000, 10, 5000, { fmt: 'hz', rand: 0.3 }],
      ['cutEnd', 'filtro · final', 40, 8000, 1, 250, { fmt: 'hz', rand: 0 }],
      ['cutTime', 'filtro · tiempo de cierre', 0.01, 4, 0.01, 0.4, { fmt: 's', rand: 0.2 }],
      ['q', 'resonancia', 0.1, 25, 0.1, 3, { rand: 0 }],
    ] },
    knot: { name: 'ovillos', cont: true, params: [...common(55),
      ['root', 'nota', 33, 81, 1, 52, { fmt: 'note', rb: RB }],
      ['ratio', 'FM · relación', 0.1, 8, 0.01, 1.41],
      ['depthMin', 'FM · profundidad enrollado', 0, 3, 0.01, 0.15],
      ['depthMax', 'FM · profundidad deshilachado', 0, 12, 0.01, 3.15],
      ['wobble', 'temblor', 0, 1, 0.01, 0.25],
      ['far', 'nivel enrollado', 0, 1, 0.01, 0.2],
    ] },
    urchin: { name: 'erizos', cont: true, params: [...common(50),
      ['freq', 'filtro · frecuencia', 300, 16000, 10, 6900, { fmt: 'hz' }],
      ['q', 'filtro · estrechez', 0.3, 40, 0.1, 7],
      ['noise', 'nivel del ruido', 0, 0.5, 0.001, 0.12],
      ['crackle', 'chisporroteo', 0, 1, 0.01, 0.3],
      ['tone', 'tonos agudos (La6, Mi7)', 0, 0.1, 0.001, 0.012],
    ] },
    flock: { name: 'bandadas', cont: true, params: [...common(70),
      ['root', 'nota más grave', 57, 110, 1, 93, { fmt: 'note' }],
      ['spread', 'notas posibles (pentatónica)', 1, 15, 1, 8],
      ['rate', 'chirridos por segundo', 0, 20, 0.1, 1.5],
      ['rateFollow', 'chirridos cuando te sigue', 0, 60, 0.5, 12.5],
      ['len', 'largo del chirrido', 10, 500, 1, 70, { fmt: 'ms', rand: 0.4 }],
      ['drop', 'caída de tono', 0, 1, 0.01, 0.5, { rand: 1 }],
      ['velRnd', 'nivel · aleatorio por chirrido', 0, 1, 0.01, 0.4, { fmt: 'pct' }],
    ] },
    bolt: { name: 'rayos', params: [...common(140),
      ['from', 'barrido · desde', 40, 4000, 1, 180, { fmt: 'hz', rand: 0.3 }],
      ['to', 'barrido · hasta', 100, 14000, 10, 3200, { fmt: 'hz', rand: 0.3 }],
      ['grow', 'tiempo de crecida', 0.2, 6, 0.05, 2.4, { fmt: 's', rand: 0.2 }],
      ['q', 'filtro · estrechez', 0.3, 30, 0.1, 3, { rand: 0.3 }],
      ['crackle', 'crepitar', 0, 1, 0.01, 0.5, { rand: 0 }],
      ['tail', 'cola', 0.1, 10, 0.05, 2, { fmt: 's', rand: 0.3 }],
    ] },
    drop: { name: 'gotas de savia', params: [...common(45),
      ['root', 'nota más grave', 57, 110, 1, 93, { fmt: 'note' }],
      ['spread', 'notas posibles (pentatónica)', 1, 12, 1, 5],
      ['len', 'largo', 0.02, 2, 0.01, 0.18, { fmt: 's', rand: 0.3 }],
      ['glide', 'glissando', 0, 2, 0.01, 0.5, { rand: 0.4 }],
      ['velRnd', 'nivel · aleatorio por gota', 0, 1, 0.01, 0.4, { fmt: 'pct' }],
    ] },
    myc: { name: 'micelio', cont: true, params: [...common(80),
      ['cut', 'filtro', 80, 10000, 10, 900, { fmt: 'hz' }],
      ['q', 'resonancia', 0.1, 20, 0.1, 0.7],
      ['level', 'nivel', 0, 0.3, 0.001, 0.035],
    ] },
  };
  // a param marked { rand } gets a companion "↳ aleatorio por nota": each note picks its own value
  // around the setting (0 % = always the same, 100 % = anywhere from about a third to triple)
  const RANGE = {};
  for (const v in SCHEMA) {
    RANGE[v] = {};
    SCHEMA[v].params = SCHEMA[v].params.flatMap(p => {
      RANGE[v][p[0]] = [p[2], p[3]];
      return p[6] && p[6].rand != null ? [p, [p[0] + 'Rnd', '↳ aleatorio por nota', 0, 1, 0.01, p[6].rand, { fmt: 'pct', sub: true }]] : [p];
    });
  }
  const DEFAULTS = {}; for (const v in SCHEMA) { DEFAULTS[v] = {}; SCHEMA[v].params.forEach(p => { DEFAULTS[v][p[0]] = p[5]; }); }
  const S = JSON.parse(JSON.stringify(DEFAULTS));
  // the sound as tuned in the editor ("copiar ajustes"): anything listed here overrides the defaults
  const TUNED = {};
  for (const v in TUNED) Object.assign(S[v], TUNED[v]);

  const sound = (() => {
    const hz = m => 440 * Math.pow(2, (m - 69) / 12);
    const PENTA = [0, 3, 5, 7, 10], AMIN = [0, 2, 3, 5, 7, 8, 10];
    const note = (sc, base, i) => { i = Math.abs(i | 0); return base + 12 * Math.floor(i / sc.length) + sc[i % sc.length]; };
    const pick = (sc, base, spread, i) => note(sc, base, (i == null ? Math.random() * spread : i) % Math.max(1, spread));
    // the drone's note wanders through the A minor pentatonic: every few coral passes it steps,
    // slowly, to a nearby note (never leaving the scale)
    let droneDeg = 0, passes = 0, passNeed = 2, onDroneNote = () => {};
    function retune() {
      if (!drone) return;
      const f = hz(note(PENTA, S.drone.root, droneDeg));
      drone.tune.forEach(([o, k]) => o.frequency.setTargetAtTime(f * k, ac.currentTime, S.drone.glide / 3));
      onDroneNote(noteName(note(PENTA, S.drone.root, droneDeg)));
    }
    function coralPass() {
      const D = S.drone; if (D.drift !== 'on' || !enabled || !drone) return;
      if (++passes < passNeed) return;
      passes = 0; passNeed = Math.round(Math.min(D.passMin, D.passMax) + Math.random() * Math.abs(D.passMax - D.passMin));
      let next = droneDeg;
      for (let tries = 0; next === droneDeg && tries < 20; tries++) next = Math.max(0, Math.min(D.span - 1, droneDeg + Math.round((Math.random() * 2 - 1) * D.step)));
      droneDeg = next; retune();
    }
    let fadeG = null, sleepT = 0;
    let nowT = 0, ac = null, enabled = false, master, pre, revBus, rev, revOut, smearIn, smearDl, smearLp, smearFb, noise, drone = null, events = 0;
    const voices = new Map(), demos = [];
    const solo = new Set(), mute = new Set();
    const mix = v => (mute.has(v) || (solo.size && !solo.has(v)) ? 0 : 1);
    const P = [0, 0, 0];

    function impulse(sec) {
      const len = Math.floor(ac.sampleRate * sec), ir = ac.createBuffer(2, len, ac.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch); let lp = 0;
        for (let i = 0; i < len; i++) { lp += (Math.random() * 2 - 1 - lp) * 0.3; d[i] = lp * Math.pow(1 - i / len, 2.8); }
      }
      return ir;
    }
    const gainNode = v => { const g = ac.createGain(); g.gain.value = v; return g; };
    const filt = (type, f, q = 0.7) => { const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
    const osc = (type, f) => { const o = ac.createOscillator(); o.type = type; o.frequency.value = f; return o; };
    const noiseSrc = () => { const s = ac.createBufferSource(); s.buffer = noise; s.loop = true; s.loopStart = Math.random(); return s; };
    const set = (param, v, tc = 0.06) => param.setTargetAtTime(v, ac.currentTime, tc);
    // this note's value of a param: the setting, spread at random by its "aleatorio" amount
    const rv = (type, k) => {
      const V = S[type], v = V[k], r = V[k + 'Rnd'] || 0, [lo, hi] = RANGE[type][k];
      if (!r) return v;
      const x = v > 0 ? v * Math.pow(2, (Math.random() * 2 - 1) * r * 1.6) : v + (Math.random() * 2 - 1) * r * (hi - lo) * 0.5;
      return Math.max(lo, Math.min(hi, x));
    };
    const vel = type => 1 - (S[type].velRnd || 0) * Math.random();

    function init() {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      const comp = ac.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3;
      comp.connect(ac.destination);
      master = gainNode(0); fadeG = gainNode(0); master.connect(fadeG); fadeG.connect(comp);
      pre = gainNode(1); pre.connect(master);
      rev = ac.createConvolver(); rev.buffer = impulse(S.global.revLen);
      revBus = gainNode(1); revBus.connect(rev); revOut = gainNode(S.global.rev); rev.connect(revOut); revOut.connect(master);
      // turning smears the sound too: a dark delay that opens with the turn and lets go slowly
      smearIn = gainNode(0); pre.connect(smearIn); revOut.connect(smearIn);
      smearDl = ac.createDelay(1); smearDl.delayTime.value = S.global.smearTime;
      smearLp = filt('lowpass', S.global.smearTone); smearFb = gainNode(0.5);
      smearIn.connect(smearDl); smearDl.connect(smearLp); smearLp.connect(smearFb); smearFb.connect(smearDl);
      const smearOut = gainNode(0.85); smearLp.connect(smearOut); smearOut.connect(master);
      noise = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
      const nd = noise.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      buildDrone(); retune();
      document.addEventListener('visibilitychange', () => { if (!ac) return; document.hidden ? ac.suspend() : enabled && ac.resume(); });
    }

    // fondo: a drone on the root, the fifth comes and goes with how busy the region is
    function buildDrone() {
      if (drone) { const old = drone; set(old.out.gain, 0, 0.3); setTimeout(() => { old.srcs.forEach(s => { s.stop(); s.disconnect(); }); old.out.disconnect(); }, 1500); }
      const D = S.drone, d = { srcs: [], lp: filt('lowpass', D.cutCalm, D.q), main: gainNode(0), fifth: gainNode(0), sub: gainNode(0), high: gainNode(0), out: gainNode(0), send: gainNode(D.send) };
      const f = hz(note(PENTA, D.root, droneDeg));
      // [oscillator, ratio to the current note]: two detuned main waves, octave, fifth, high octave
      d.tune = [[osc(D.wave, f), 1], [osc(D.wave, f), Math.pow(2, D.detune / 1200)], [osc('sine', f), 2], [osc('triangle', f), Math.pow(2, 7 / 12)], [osc('sine', f), 8]];
      d.tune.forEach(([o, k]) => { o.frequency.value = f * k; d.srcs.push(o); });
      const [[o1], [o2], [sub], [e], [hi]] = d.tune;
      o1.connect(d.main); o2.connect(d.main); sub.connect(d.sub); e.connect(d.fifth); hi.connect(d.high);
      d.main.connect(d.lp); d.fifth.connect(d.lp); d.sub.connect(d.lp); d.high.connect(d.out); d.lp.connect(d.out);
      d.lfo = osc('sine', D.lfoRate); d.lfoG = gainNode(D.lfoDepth); d.lfo.connect(d.lfoG); d.lfoG.connect(d.lp.frequency); d.srcs.push(d.lfo);
      d.srcs.forEach(s => s.start());
      d.out.connect(pre); d.out.connect(d.send); d.send.connect(revBus);
      drone = d;
    }

    // a voice's way out: filter (distance) → panner (direction) → dry + reverb send
    function chain() {
      const c = { input: gainNode(1), lp: filt('lowpass', 8000), pan: ac.createPanner(), dry: gainNode(0), send: gainNode(0) };
      c.pan.panningModel = 'equalpower'; c.pan.distanceModel = 'linear'; c.pan.rolloffFactor = 0;
      c.input.connect(c.lp); c.lp.connect(c.pan); c.pan.connect(c.dry); c.pan.connect(c.send);
      c.dry.connect(pre); c.send.connect(revBus);
      c.place = (q, V, now) => {
        camSpace(q, P);
        const d = Math.hypot(P[0], P[1], P[2]) || 1, at = Math.pow(clamp01(1 - d / V.range), 1.6);
        const x = P[0] / d, y = P[1] / d, z = -P[2] / d;
        if (c.pan.positionX) { set(c.pan.positionX, x, 0.05); set(c.pan.positionY, y, 0.05); set(c.pan.positionZ, z, 0.05); } else c.pan.setPosition(x, y, z);
        const tc = now ? 0.005 : 0.1;
        set(c.lp.frequency, 400 + 11000 * at, tc); set(c.dry.gain, at, tc);
        set(c.send.gain, Math.sqrt(at) * (0.25 + 0.5 * (1 - at)) * V.send, tc);
        return at;
      };
      c.free = () => { [c.input, c.lp, c.pan, c.dry, c.send].forEach(n => n.disconnect()); };
      return c;
    }
    const idxOf = fm => Math.floor(fm.ph * 7.3);

    // ── continuous voices, one per nearby form (the closest ones only)
    const VOICE = {
      origin: { make(v, fm, V) {                                        // a soft low heartbeat
        v.g = gainNode(0); v.h = gainNode(V.harm);
        const a = osc('sine', hz(V.root)), b = osc('sine', hz(V.root) * 2); a.connect(v.g); b.connect(v.h); v.h.connect(v.g);
        [a, b].forEach(s => { s.start(); v.srcs.push(s); });
      }, update(v, fm, t, dt, V) {
        set(v.h.gain, V.harm);
        const p = Math.pow(0.5 + 0.5 * Math.sin(t * V.rate + fm.ph), V.sharp); set(v.g.gain, 0.3 * p * (0.5 + 0.5 * (fm.ex || 0)), 0.03);
      } },
      thread: { make(v, fm, V) {                                        // a long note, swelling as you come close
        v.f = hz(pick(AMIN, V.root, V.spread, idxOf(fm)));
        v.o = osc(V.wave, v.f); v.o2 = osc('sine', v.f * 2); v.h = gainNode(V.harm);
        v.vib = osc('sine', V.vibRate); v.vg = gainNode(0); v.vib.connect(v.vg); v.vg.connect(v.o.frequency); v.vg.connect(v.o2.frequency);
        v.g = gainNode(0); v.o.connect(v.g); v.o2.connect(v.h); v.h.connect(v.g); [v.o, v.o2, v.vib].forEach(s => { s.start(); v.srcs.push(s); });
      }, update(v, fm, t, dt, V) {
        set(v.h.gain, V.harm); set(v.vib.frequency, V.vibRate); set(v.vg.gain, v.f * (Math.pow(2, V.vibDepth / 1200) - 1));
        const pulse = 1 - V.pulse + V.pulse * Math.max(0, Math.sin(t * 5 + fm.ph));
        set(v.g.gain, 0.05 * (V.far + fm.near * 1.3 * pulse), V.smooth);
      } },
      cloud: { make(v, fm) { v.g = gainNode(1); v.acc = 0; v.base = idxOf(fm); },
        update(v, fm, t, dt, V) {                                        // granular: bursts of tuned noise, thicker as you go in
          v.acc += dt * (V.rateMin + fm.near * (V.rateMax - V.rateMin));
          while (v.acc >= 1 && events < 48) {
            v.acc -= 1;
            const now = ac.currentTime, len = (V.lenMin + Math.random() * Math.max(0, V.lenMax - V.lenMin)) / 1000, s = ac.createBufferSource(); s.buffer = noise;
            const bp = filt('bandpass', Math.min(20000, hz(pick(PENTA, V.root, V.spread, (v.base % 5) + Math.random() * V.spread))), rv('cloud', 'q')), e = gainNode(0);
            e.gain.setValueAtTime(0, now); e.gain.linearRampToValueAtTime(0.5 * vel('cloud'), now + len * 0.3); e.gain.linearRampToValueAtTime(0, now + len);
            s.connect(bp); bp.connect(e); e.connect(v.g); s.start(now, Math.random() * 1.5, len + 0.01);
            events++; s.onended = () => { events--; s.disconnect(); bp.disconnect(); e.disconnect(); };
          }
          v.acc = Math.min(v.acc, 2);
        } },
      knot: { make(v, fm, V) {                                          // a tangled tone: FM that gets wilder as it unravels
        v.f = hz(V.root); v.car = osc('sine', v.f); v.m = osc('sine', v.f * V.ratio); v.mg = gainNode(0);
        v.m.connect(v.mg); v.mg.connect(v.car.frequency); v.g = gainNode(0); v.car.connect(v.g); [v.car, v.m].forEach(s => { s.start(); v.srcs.push(s); });
      }, update(v, fm, t, dt, V) {
        const u = fm.near * fm.near; set(v.m.frequency, v.f * V.ratio);
        set(v.mg.gain, v.f * (V.depthMin + u * (V.depthMax - V.depthMin)));
        set(v.g.gain, 0.05 * (V.far + u) * (1 - V.wobble + Math.random() * V.wobble), 0.03);
      } },
      urchin: { make(v, fm, V) {                                        // a high shimmer that crackles when it bristles
        const n = noiseSrc(); v.bp = filt('bandpass', V.freq, V.q); v.ng = gainNode(0); n.connect(v.bp); v.bp.connect(v.ng);
        v.g = gainNode(1); v.ng.connect(v.g); n.start(); v.srcs.push(n); v.tg = gainNode(V.tone); v.tg.connect(v.g);
        [93, 100].forEach(m => { const o = osc('sine', hz(m)); o.connect(v.tg); o.start(); v.srcs.push(o); });
      }, update(v, fm, t, dt, V) {
        const b = Math.pow(fm.near, 1.5); set(v.bp.frequency, V.freq); set(v.bp.Q, V.q); set(v.tg.gain, V.tone);
        set(v.ng.gain, 0.01 + b * V.noise * (Math.random() < V.crackle ? 2.2 : 0.4), 0.01); set(v.g.gain, 0.3 + b, 0.1);
      } },
      flock: { make(v) { v.g = gainNode(1); v.acc = 0; },
        update(v, fm, t, dt, V) {                                        // chirps and clicks; a lot more when it follows you
          v.acc += dt * (V.rate + (fm.follow > 0 ? V.rateFollow - V.rate : 0) + fm.near * 4);
          while (v.acc >= 1 && events < 48) {
            v.acc -= 1;
            const now = ac.currentTime, len = rv('flock', 'len') / 1000, f = Math.min(20000, hz(pick(PENTA, V.root, V.spread))), o = osc('sine', f), e = gainNode(0);
            o.frequency.setValueAtTime(f, now); o.frequency.exponentialRampToValueAtTime(Math.max(20, f * (1 - Math.min(0.97, rv('flock', 'drop')))), now + len * 0.7);
            e.gain.setValueAtTime(0, now); e.gain.linearRampToValueAtTime(0.07 * vel('flock'), now + 0.004); e.gain.exponentialRampToValueAtTime(0.0001, now + len);
            o.connect(e); e.connect(v.g); o.start(now); o.stop(now + len + 0.01);
            events++; o.onended = () => { events--; o.disconnect(); e.disconnect(); };
          }
          v.acc = Math.min(v.acc, 2);
        } },
      myc: { make(v, fm, V) { const n = noiseSrc(); v.lp = filt('lowpass', V.cut, V.q); v.g = gainNode(0); n.connect(v.lp); v.lp.connect(v.g); n.start(); v.srcs.push(n); },
        update(v, fm, t, dt, V) { set(v.lp.frequency, V.cut); set(v.lp.Q, V.q); set(v.g.gain, fm.growing ? V.level : 0, 0.3); } },   // a whisper while it grows
    };
    const MAX_VOICES = 9;

    function nearby() {
      const ci = Math.floor(cam.p[0] / G), cj = Math.floor(cam.p[1] / G), ck = Math.floor(cam.p[2] / G), out = [];
      for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) for (let k = ck - 1; k <= ck + 1; k++) {
        const cell = getCell(i, j, k);
        const d0 = dist(cell.origin.c, cam.p); if (d0 < S.origin.range) out.push([d0 / S.origin.range * 0.8, cell.origin]);
        for (const fm of cell.forms) {
          if (!VOICE[fm.type] || !on[fm.type]) continue;
          const d = dist(fm.c, cam.p), R = S[fm.type].range; if (d < R) out.push([d / R, fm]);
        }
      }
      return [...demos, ...out.sort((a, b) => a[0] - b[0]).slice(0, MAX_VOICES).map(x => x[1])];
    }

    let pickT = 0;
    function update(t, dt, spin) {
      nowT = t;
      if (!enabled || !ac || ac.state !== 'running') return;
      const G_ = S.global, D = S.drone, dens = density(cam.p), L = (a, b) => a + (b - a) * dens;
      set(master.gain, G_.vol, 0.1); set(revOut.gain, G_.rev, 0.1);
      set(smearIn.gain, spin * G_.smear, 0.05); set(smearFb.gain, G_.smearFb * (0.53 + 0.47 * spin), 0.1);
      set(smearDl.delayTime, G_.smearTime, 0.2); set(smearLp.frequency, G_.smearTone, 0.1);
      const dm = D.vol * mix('drone');
      set(drone.out.gain, 0.9 * dm, 0.3); set(drone.send.gain, D.send, 0.2);
      // passing through an origin: the drone's filter rings (resonance up to qOrigin)
      let oNear = 0;
      const ci = Math.floor(cam.p[0] / G), cj = Math.floor(cam.p[1] / G), ck = Math.floor(cam.p[2] / G);
      for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) for (let k = ck - 1; k <= ck + 1; k++)
        oNear = Math.max(oNear, clamp01(1 - dist(getCell(i, j, k).origin.c, cam.p) / D.qDist));
      set(drone.lp.frequency, L(D.cutCalm, D.cutDense), 1.5); set(drone.lp.Q, D.q + (D.qOrigin - D.q) * oNear * oNear * (3 - 2 * oNear), 0.25);
      set(drone.main.gain, L(D.mainCalm, D.main), 1.5); set(drone.fifth.gain, L(D.fifthCalm, D.fifth), 2);
      set(drone.sub.gain, D.sub, 0.5); set(drone.high.gain, (1 - dens) * D.high, 2);
      set(drone.lfo.frequency, D.lfoRate, 0.2); set(drone.lfoG.gain, D.lfoDepth, 0.2);
      // demo voices (the "probar" buttons) hover just in front of you and come close, then leave
      for (let i = demos.length - 1; i >= 0; i--) {
        const fm = demos[i], k = (t - fm.t0) / 5;
        if (k > 1) { demos.splice(i, 1); continue; }
        fm.c = madd(madd(cam.p, cam.f, 6), cam.r, Math.sin(t * 0.8) * 3);
        fm.near = fm.ex = Math.sin(Math.PI * k); fm.follow = k > 0.3 && k < 0.7 ? 1 : 0; fm.growing = true;
      }
      if ((pickT -= dt) <= 0) {                                         // re-pick the closest forms a few times a second
        pickT = 0.25;
        const want = new Set(nearby());
        for (const [fm, v] of voices) if (!want.has(fm)) { release(v); voices.delete(fm); }
        for (const fm of want) if (!voices.has(fm)) {
          const v = { c: chain(), srcs: [] }; VOICE[fm.type].make(v, fm, S[fm.type]); v.g.connect(v.c.input); voices.set(fm, v);
        }
      }
      for (const [fm, v] of voices) {
        const V = S[fm.type]; v.c.place(fm.c, V); set(v.c.input.gain, V.vol * mix(fm.type), 0.05);
        VOICE[fm.type].update(v, fm, t, dt, V);
      }
    }
    function release(v) {
      set(v.g.gain, 0, 0.15);
      setTimeout(() => { v.srcs.forEach(s => { try { s.stop(); } catch (e) {} s.disconnect(); }); v.g.disconnect(); v.c.free(); }, 900);
    }
    function rebuild(type) {
      if (!ac) return;
      if (type === 'drone') return buildDrone();
      if (type === 'global') { rev.buffer = impulse(S.global.revLen); return; }
      for (const [fm, v] of voices) if (fm.type === type) { release(v); voices.delete(fm); }
      pickT = 0;
    }

    // ── one-shots
    function shot(type, q, build) {
      if (!enabled || !ac || ac.state !== 'running' || events > 44) return;
      const V = S[type], m = V.vol * mix(type); if (!m) return;
      const c = chain(), at = c.place(q, V, true); if (at < 0.02) { c.free(); return; }
      c.input.gain.value = m;
      const end = build(c.input, ac.currentTime, V); events++;
      setTimeout(() => { events--; c.free(); }, end * 1000 + 300);
    }
    const pluck = (q, i) => shot('coral', q, (out, now, V) => {        // coral tips: a short plucked note
      const c = k => rv('coral', k), cs = c('cutStart'), atk = c('attack') / 1000, dec = c('decay');
      const f = hz(pick(PENTA, V.root, V.spread, i)), o = osc(V.wave, f), lp = filt('lowpass', cs, c('q')), e = gainNode(0);
      lp.frequency.setValueAtTime(cs, now); lp.frequency.exponentialRampToValueAtTime(Math.max(20, c('cutEnd')), now + c('cutTime'));
      e.gain.setValueAtTime(0.0001, now); e.gain.exponentialRampToValueAtTime(0.16 * vel('coral'), now + atk); e.gain.exponentialRampToValueAtTime(0.0001, now + atk + dec);
      const end = atk + dec + 0.05;
      o.connect(lp); lp.connect(e); e.connect(out); o.start(now); o.stop(now + end); return end;
    });
    const drop = q => shot('drop', q, (out, now, V) => {               // sap reaching its form: a tiny drop
      const f = Math.min(20000, hz(pick(PENTA, V.root, V.spread))), o = osc('sine', f), e = gainNode(0), len = rv('drop', 'len');
      o.frequency.setValueAtTime(Math.min(20000, f * (1 + rv('drop', 'glide'))), now); o.frequency.exponentialRampToValueAtTime(f, now + Math.min(0.1, len * 0.2));
      e.gain.setValueAtTime(0.0001, now); e.gain.exponentialRampToValueAtTime(0.05 * vel('drop'), now + 0.004); e.gain.exponentialRampToValueAtTime(0.0001, now + len);
      o.connect(e); e.connect(out); o.start(now); o.stop(now + len + 0.02); return len + 0.05;
    });
    const bolt = q => shot('bolt', q, (out, now, V) => {               // a crackle that grows with the strike, then a tail
      const c = k => rv('bolt', k), grow = c('grow'), tail = c('tail'), cr = c('crackle');
      const n = noiseSrc(), bp = filt('bandpass', c('from'), c('q')), e = gainNode(0);
      bp.frequency.setValueAtTime(bp.frequency.value, now); bp.frequency.exponentialRampToValueAtTime(c('to'), now + grow);
      e.gain.setValueAtTime(0, now);
      const steps = Math.max(4, grow / 0.04 | 0);
      for (let k = 0; k < steps; k++) e.gain.setValueAtTime((k / steps) * (0.35 - cr * 0.25 + Math.random() * cr * 0.6), now + k * grow / steps);
      e.gain.setValueAtTime(0.25, now + grow + 0.05); e.gain.setTargetAtTime(0, now + grow + 1.2, tail / 3.3);
      const end = grow + 1.2 + tail * 1.5;
      n.connect(bp); bp.connect(e); e.connect(out); n.start(now); n.stop(now + end); return end;
    });

    // ── "probar": hear one voice right in front of you
    function audition(type) {
      const front = () => madd(cam.p, cam.f, 4);
      if (type === 'coral') [0, 2, 4, 1, 3, 6].forEach((i, k) => setTimeout(() => pluck(front(), i), k * 380));
      else if (type === 'drop') [0, 1, 2, 3].forEach(k => setTimeout(() => drop(front()), k * 450 + Math.random() * 200));
      else if (type === 'bolt') bolt(madd(cam.p, cam.f, 12));
      else if (VOICE[type]) demos.push({ type, ph: Math.random() * 6.28, near: 0, ex: 0, follow: 0, growing: true, c: front(), t0: nowT });
    }

    return {
      get on() { return enabled; },
      // fade the whole world in (it starts making sound) or out (then it goes to sleep)
      fadeIn(sec = 2.5) {
        if (!ac) init();
        enabled = true; clearTimeout(sleepT); ac.resume().catch(() => {});
        const now = ac.currentTime, v = fadeG.gain.value;
        fadeG.gain.cancelScheduledValues(now); fadeG.gain.setValueAtTime(v, now); fadeG.gain.linearRampToValueAtTime(1, now + sec * (1 - v) + 0.01);
      },
      fadeOut(sec = 1.5) {
        if (!ac || !enabled) return;
        const now = ac.currentTime, v = fadeG.gain.value;
        fadeG.gain.cancelScheduledValues(now); fadeG.gain.setValueAtTime(v, now); fadeG.gain.linearRampToValueAtTime(0, now + sec * v + 0.01);
        clearTimeout(sleepT); sleepT = setTimeout(() => { enabled = false; ac.suspend(); }, sec * 1000 + 150);
      },
      update, pluck, drop, bolt, audition, rebuild, solo, mute, coralPass,
      set onDroneNote(fn) { onDroneNote = fn; fn(noteName(note(PENTA, S.drone.root, droneDeg))); },
    };
  })();

  // ── input: where the pointer is in the frame is where the camera turns (mouse: just hover;
  //    touch: hold and drag). Arrow keys steer while the game has focus.
  const fromEvent = e => { const r = stage.getBoundingClientRect(); steer.x = Math.max(-1, Math.min(1, (e.clientX - r.left) / r.width * 2 - 1)); steer.y = Math.max(-1, Math.min(1, (e.clientY - r.top) / r.height * 2 - 1)); };
  let touching = false;
  stage.addEventListener('pointermove', e => { if (e.pointerType === 'mouse' || touching) fromEvent(e); });
  stage.addEventListener('pointerdown', e => { touching = e.pointerType !== 'mouse'; if (touching) stage.setPointerCapture(e.pointerId); fromEvent(e); });
  const release = e => { if (e.pointerType !== 'mouse') { touching = false; steer.x = steer.y = 0; } };
  stage.addEventListener('pointerup', release); stage.addEventListener('pointercancel', release);
  stage.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') steer.x = steer.y = 0; });
  stage.addEventListener('contextmenu', e => e.preventDefault());
  const KEYS = { ArrowLeft: ['x', -0.7], ArrowRight: ['x', 0.7], ArrowUp: ['y', -0.7], ArrowDown: ['y', 0.7] };
  stage.addEventListener('keydown', e => { const k = KEYS[e.key]; if (k) { steer.keys[k[0]] = k[1]; e.preventDefault(); } });
  stage.addEventListener('keyup', e => { const k = KEYS[e.key]; if (k) steer.keys[k[0]] = 0; });
  stage.addEventListener('blur', () => { steer.keys.x = steer.keys.y = 0; });

  function resize() {
    const r = stage.getBoundingClientRect();
    if (!r.width || !r.height) return;
    dpr = Math.min(1.5, devicePixelRatio || 1);
    W = r.width; H = r.height;
    cv.width = fb.width = Math.round(W * dpr); cv.height = fb.height = Math.round(H * dpr);
    F = Math.max(W, H) * 0.62;
  }
  new ResizeObserver(resize).observe(stage); resize();

  // ── it only runs while you can see it: scroll it into view (or open Lab) and the sound fades in;
  //    scroll away or leave and the sound fades out and the picture stops
  let visible = false, running = false, last = 0, t = 0;
  function frame(now) {
    if (!visible) { running = false; return; }
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    t += dt;
    turn(dt);
    render(t, dt);
    sound.update(t, dt, env);
    requestAnimationFrame(frame);
  }
  // browsers only allow sound after a click or key on the page (the entry screen gives one)
  const mayPlay = () => !navigator.userActivation || navigator.userActivation.hasBeenActive;
  function show() {
    if (!running) { running = true; last = performance.now(); requestAnimationFrame(frame); }
    if (mayPlay()) sound.fadeIn();
  }
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; visible ? show() : sound.fadeOut(); }, { threshold: 0.25 }).observe(stage);
  // no click yet (a reload that skipped the entry screen): the first touch or key anywhere wakes the sound
  ['pointerdown', 'keydown'].forEach(ev => addEventListener(ev, () => { if (visible && !sound.on) sound.fadeIn(); }, true));
  addEventListener('lab:reset', () => sound.fadeOut(0.5));
})();
