/*
 * The motion layer's script part, the same as motion.ts in the React and Angular packs. Most motion is CSS in bx.css
 * (the bx-m-<phase>-<name> classes of the motion library and each kind's own); this plays a preset on an element with the
 * Web Animations API (a number that rolls, a chip that pops, a panel that leaves) and resolves an effect variant's
 * settings. Under reduced motion, or where the API is missing (old browsers on JET 6), nothing plays and the element shows
 * its end state. Presets, durations and easing come from bx-presets.js, generated from motion.json and the design tokens.
 */
define(['./bx-presets'], function (presets) {
  'use strict';

  /** Neutral frames (opacity, x, y, scale, blur, rotate) as Web Animations keyframes; keys missing from a frame are at rest. */
  function keyframes(frames) {
    var keys = {};
    frames.forEach(function (f) { Object.keys(f).forEach(function (key) { keys[key] = true; }); });
    var moves = keys.x || keys.y || keys.scale || keys.rotate;
    return frames.map(function (f) {
      var k = {};
      if (keys.opacity) { k.opacity = f.opacity === undefined ? 1 : f.opacity; }
      if (moves) {
        var t = [f.x || f.y ? 'translate(' + (f.x || 0) + 'px, ' + (f.y || 0) + 'px)' : '', f.scale !== undefined ? 'scale(' + f.scale + ')' : '', f.rotate ? 'rotate(' + f.rotate + 'deg)' : '']
          .filter(Boolean);
        k.transform = t.length ? t.join(' ') : 'none';
      }
      if (keys.blur) { k.filter = f.blur ? 'blur(' + f.blur + 'px)' : 'none'; }
      return k;
    });
  }

  function timed(phase, name) {
    var p = presets.PRESETS[phase] && presets.PRESETS[phase][name];
    return p && p.frames ? { frames: keyframes(p.frames), duration: presets.DURATION[p.duration], easing: presets.EASING[p.easing] } : null;
  }

  /** The value-change effects the components play, from the motion library's change presets. */
  var EFFECTS = {};
  ['roll', 'pop', 'shake', 'settle', 'pulse'].forEach(function (e) { EFFECTS[e] = timed('change', e); });

  /** True when the customer asked for less motion. */
  function reducedMotion() {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /** Plays a preset (a change effect unless another phase is named) on an element once; returns the animation, or null when nothing plays. */
  function play(element, effect, phase) {
    var ph = phase || 'change';
    var e = timed(ph, effect);
    if (!element || !e || typeof element.animate !== 'function' || reducedMotion()) { return null; }
    return element.animate(e.frames, { duration: e.duration, easing: e.easing, fill: ph === 'exit' ? 'forwards' : 'none' });
  }

  /** Plays an exit preset and resolves when it ends (at once when nothing plays), so the caller can then remove the element. */
  function leave(element, preset) {
    var a = play(element, preset || 'fade', 'exit');
    return a && a.finished ? a.finished.then(function () { return undefined; }, function () { return undefined; }) : Promise.resolve();
  }

  /** An effect variant's settings (variants.json), with the defaults for any it leaves out; an unknown variant is the default. */
  function fx(component, variant) {
    var p = variant && presets.FX[component] ? presets.FX[component][variant] : undefined;
    var out = { speed: 1, intensity: 1, density: 1, sensitivity: 1, css: p && variant !== 'default' ? ' bx-v-' + variant : '' };
    Object.keys(p || {}).forEach(function (key) { out[key] = p[key]; });
    return out;
  }

  return { EFFECTS: EFFECTS, PRESETS: presets.PRESETS, FX: presets.FX, keyframes: keyframes, reducedMotion: reducedMotion, play: play, leave: leave, fx: fx };
});
