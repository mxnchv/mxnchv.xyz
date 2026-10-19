# midirain (rain engine and drawing)

`midirain_engine.js` and `midirain_ui.js` are copied unchanged from the Max for Live device
[mxnchv/midirain](https://github.com/mxnchv/midirain) (commit a768c13). In the device they run inside
Max's `[js]` and `[jsui]`; on the site, `midirain.js` (at the root) loads them with small stand-ins for
Max (`outlet`, `Global`, `mgraphics` on a canvas), so the Lab demo rains exactly like the device.

Change how the rain behaves (physics, notes, velocities, drawing) in the midirain repo, then copy the
two files here again. Everything that only concerns the site (the panel, the sound, the controls,
the texts) lives in `midirain.js` and `index.html`.
