// Lab: midirain, the Max for Live device, raining in the browser. The rain is the device's own code
// (vendor/midirain: the engine and the drawing, unchanged), run here with small stand-ins for Max.
// Each drop that lands plays its column's note (A minor pentatonic) on synth 06 from sxvnds vol. 1.
// Click the panel to turn the sound on or off; drag a value (or use the arrow keys) to change it.
(() => {
  const stage = document.getElementById('midirain');
  if (!stage) return;
  const cv = stage.querySelector('canvas'), g = cv.getContext('2d');
  const hint = stage.querySelector('.mr-hint');
  const SCALE = 2;          // screen px per rain px: drops keep the thickness they have in the device

  // ── stand-ins for Max: Global (shared state), mgraphics on a canvas, Task
  const globals = {};
  function Global(name) { return globals[name] || (globals[name] = {}); }
  function Task(fn) { this.fn = fn; this.id = null; }
  Task.prototype.schedule = function (ms) { clearTimeout(this.id); this.id = setTimeout(() => this.fn(), ms || 0); };
  Task.prototype.cancel = function () { clearTimeout(this.id); };

  const box = { rect: [0, 0, 300, 169] };
  let dpr = 1, dirty = true, face = 'sans-serif', size = 9, pt = [0, 0];
  const rgba = (r, gg, b, a) => `rgba(${r * 255 | 0},${gg * 255 | 0},${b * 255 | 0},${a})`;
  const mgraphics = {
    relative_coords: 0, autofill: 0,
    init() {}, redraw() { dirty = true; },
    set_source_rgba(r, gg, b, a) { g.fillStyle = g.strokeStyle = rgba(r, gg, b, a); },
    set_source(p) { g.fillStyle = g.strokeStyle = p.gradient; },
    pattern_create_radial(x1, y1, r1, x2, y2, r2) {
      const gradient = g.createRadialGradient(x1, y1, r1, x2, y2, r2);
      return { gradient, add_color_stop_rgba: (o, r, gg, b, a) => gradient.addColorStop(o, rgba(r, gg, b, a)) };
    },
    rectangle(x, y, w, h) { g.rect(x, y, w, h); },
    ellipse(x, y, w, h) { g.moveTo(x + w, y + h / 2); g.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); },
    move_to(x, y) { pt = [x, y]; g.moveTo(x, y); },
    line_to(x, y) { g.lineTo(x, y); },
    arc(x, y, r, a1, a2) { g.arc(x, y, r, a1, a2); },
    fill() { g.fill(); g.beginPath(); },
    stroke() { g.stroke(); g.beginPath(); },
    translate(x, y) { g.translate(x, y); },
    scale(x, y) { g.scale(x, y); },
    save() { g.save(); },
    restore() { g.restore(); },
    set_line_width(w) { g.lineWidth = w; },
    set_line_cap(c) { g.lineCap = c; },
    select_font_face(f) { face = f; g.font = `${size}px "${face}", sans-serif`; },
    set_font_size(s) { size = s; g.font = `${size}px "${face}", sans-serif`; },
    text_measure(s) { return [g.measureText(s).width, size]; },
    show_text(s) { g.fillText(s, pt[0], pt[1]); },
  };

  // the device's scripts, wrapped so their functions (bang, note, paint…) stay private
  const NAMES = ['bang', 'note', 'density', 'fall', 'wind', 'distance', 'mode', 'tonic', 'scale', 'low', 'high', 'draw', 'paint'];
  const load = (src, args, outlet) => new Function('outlet', 'Global', 'jsarguments', 'mgraphics', 'box', 'post', 'Task',
    `var inlets, outlets, autowatch;\n${src}\nreturn {${NAMES.map(n => `${n}: typeof ${n} === "function" ? ${n} : null`).join(',')}};`
  )(outlet, Global, args, mgraphics, box, () => {}, Task);

  let engine = null, ui = null;
  const ready = Promise.all(['vendor/midirain/midirain_engine.js', 'vendor/midirain/midirain_ui.js']
    .map(u => fetch(u).then(r => r.text())))
    .then(([engineSrc, uiSrc]) => {
      ui = load(uiSrc, ['midirain_ui.js'], () => {});
      engine = load(engineSrc, ['midirain_engine.js', 'lab'], (n, ...a) => {
        if (n === 0) play(a[0], a[1]);            // pitch, velocity (the device's note length is ignored here)
        else if (n === 1) ui.draw(a[1]);
      });
      engine.mode(0); engine.tonic(9); engine.scale(8); engine.low(57); engine.high(81);   // A minor pentatonic, A3–A5
      stage.querySelectorAll('[data-k]').forEach(l => engine[l.dataset.k](+l.dataset.v));
      kick();
    });

  // ── sound: synth 06 (a C4, a hair sharp), retuned per note, through a soft hall
  let ac = null, out = null, sample = null, soundOn = false, voices = 0;
  const bytes = () => fetch('media/synths/mxnchv_sxvnds_vol_1_one_shot_synth_06.wav').then(r => r.arrayBuffer());
  function impulse(seconds) {
    const len = Math.floor(ac.sampleRate * seconds), ir = ac.createBuffer(2, len, ac.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch); let lp = 0;
      for (let i = 0; i < len; i++) { lp += (Math.random() * 2 - 1 - lp) * 0.35; d[i] = lp * Math.pow(1 - i / len, 3); }
    }
    return ir;
  }
  function initAudio() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    ac = new (window.AudioContext || window.webkitAudioContext)();
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 4;
    comp.connect(ac.destination);
    out = ac.createGain(); out.gain.value = 0; out.connect(comp);
    const verb = ac.createConvolver(); verb.buffer = impulse(3.5);
    const wet = ac.createGain(); wet.gain.value = 0.5;
    out.connect(verb); verb.connect(wet); wet.connect(comp);
    bytes().then(b => ac && ac.decodeAudioData(b)).then(buf => { sample = buf; }).catch(() => {});
  }
  function play(pitch, vel) {
    if (!soundOn || !sample || voices > 24) return;
    const t = ac.currentTime, v = vel / 127, len = 0.7 + v * 1.6;
    const src = ac.createBufferSource();
    src.buffer = sample;
    src.playbackRate.value = Math.pow(2, (pitch - 60) / 12); src.detune.value = -1;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(700 + v * v * 6000, t);
    const amp = ac.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(0.05 + v * 0.3, t + 0.008);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(lp); lp.connect(amp); amp.connect(out);
    src.start(t); src.stop(t + len + 0.05);
    voices++; src.onended = () => { voices--; };
  }
  function setSound(on) {
    soundOn = on;
    stage.classList.toggle('on', on);
    hint.textContent = on ? 'click to stop' : 'click to hear it rain';
    if (!ac) return;
    out.gain.setTargetAtTime(on ? 0.8 : 0, ac.currentTime, on ? 0.02 : 0.15);
  }
  stage.addEventListener('click', e => {
    if (e.target.closest('[data-k]')) return;
    initAudio(); setSound(!soundOn);
  });
  stage.addEventListener('keydown', e => {
    if (e.target === stage && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); initAudio(); setSound(!soundOn); }
  });
  addEventListener('lab:reset', () => {
    setSound(false);
    if (ac) { ac.close(); ac = null; sample = null; }      // also cuts the reverb tail
  });
  document.addEventListener('visibilitychange', () => { if (ac) document.hidden ? ac.suspend() : ac.resume(); });

  // ── controls: drag a value up/down, or arrow keys
  stage.querySelectorAll('[data-k]').forEach(l => {
    const k = l.dataset.k, lo = +l.dataset.min, hi = +l.dataset.max, unit = l.dataset.unit || '', show = l.querySelector('output');
    let v = +l.dataset.v, y0 = 0, v0 = 0;
    const set = nv => { v = Math.max(lo, Math.min(hi, Math.round(nv))); show.textContent = v + unit; if (engine) engine[k](v); };
    l.addEventListener('pointerdown', e => { e.preventDefault(); l.setPointerCapture(e.pointerId); y0 = e.clientY; v0 = v; });
    l.addEventListener('pointermove', e => { if (l.hasPointerCapture(e.pointerId)) set(v0 + (y0 - e.clientY) * (hi - lo) / 200); });
    l.addEventListener('keydown', e => {
      const d = { ArrowUp: 5, ArrowRight: 5, ArrowDown: -5, ArrowLeft: -5 }[e.key];
      if (d) { e.preventDefault(); set(v + d); }
    });
  });

  // ── size and loop: only runs while the panel is on screen
  function resize() {
    const r = cv.getBoundingClientRect();
    dpr = Math.min(2, devicePixelRatio || 1);
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    box.rect = [0, 0, Math.round(r.width / SCALE), Math.round(r.height / SCALE)];
    dirty = true;
  }
  new ResizeObserver(resize).observe(cv);

  let visible = false, timer = null, running = false;
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (!visible && soundOn) setSound(false);
    kick();
  }).observe(stage);
  function kick() {
    if (!engine || !visible) { clearInterval(timer); timer = null; return; }
    if (!timer) timer = setInterval(() => engine.bang(), 10);
    if (!running) { running = true; requestAnimationFrame(frame); }
  }
  function frame() {
    if (!visible || !engine) { running = false; return; }
    requestAnimationFrame(frame);
    if (!dirty) return;
    dirty = false;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cv.width, cv.height);
    g.setTransform(dpr * SCALE, 0, 0, dpr * SCALE, 0, 0);
    g.beginPath();
    ui.paint();
  }
  ready.catch(() => { hint.textContent = 'the rain could not load'; });
})();
