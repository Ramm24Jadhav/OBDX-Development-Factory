/*
 * Style variants of the feedback and status elements (variants.json, wave V3): each takes variant and its root gets
 * " bx-v-<id>"; 'default' (or empty) is the look the element had before variants and adds nothing. The Material variants are drawn by
 * bx.css. The thinking orb (bx-spinner variant orbs) is painted by bx-orbs-engine.js, thinking-orbs (MIT).
 */
define(['./bx-core', './bx-orbs-engine'], function (bx, orbs) {
  'use strict';
  var ko = bx.ko;
  /** A variant's class with its leading space, " bx-v-filled"; nothing for the default look. */
  var vx = bx.variantClass;
  /** A view model's variant class, following its variant property. */
  var vclass = function (self) { return ko.pureComputed(function () { return vx(self.props.variant); }); };
  /** A ring's dash offset for a share (0 to 1) of a circle of radius r. */
  var ringOffset = function (share, r) { return Math.round(2 * Math.PI * r * (1 - Math.max(0, Math.min(1, share))) * 10) / 10; };
  /** The faces of the emoji rating, very poor to very good. */
  var FACES = ['😞', '🙁', '😐', '🙂', '😄'];
  var STATES = ['working', 'searching', 'solving', 'listening', 'connecting', 'weaving', 'composing', 'breathing', 'shaping'];

  /** Paints an orb on a canvas until the returned stop is called; reduced motion paints one still frame. */
  var paintOrb = function (canvas, state, px) {
    var ratio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(px * ratio);
    canvas.height = Math.round(px * ratio);
    var ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) { return function () {}; }
    var preset = orbs.resolvePreset(STATES.indexOf(state) >= 0 ? state : 'working', px);
    var draw = orbs.MODE_DRAWS[preset.mode];
    var dark = !!(canvas.closest && canvas.closest('.bx-dark'));
    var frame = function (t) { ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, px, px); draw(ctx, px, t, dark, preset.opts); };
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { frame(0.6); return function () {}; }
    var raf = 0;
    var loop = function () { frame(performance.now() / 1000 * preset.speed); raf = window.requestAnimationFrame(loop); };
    loop();
    return function () { window.cancelAnimationFrame(raf); };
  };

  /** Keeps the orb of a spinner view model painted while it is connected and its variant is orbs. */
  var orbLifecycle = function (self) {
    var stop = function () {};
    var watch = null;
    self.connected = function () {
      watch = ko.computed(function () {
        var on = self.props.variant === 'orbs';
        var state = self.props.orbState;
        var px = self.props.size === 'lg' ? 64 : 20;
        stop();
        stop = function () {};
        if (on) {
          window.setTimeout(function () { var c = self.element.querySelector('canvas.bx-orb'); stop(); stop = c ? paintOrb(c, state, px) : function () {}; }, 0);
        }
      });
    };
    self.disconnected = function () { stop(); if (watch) { watch.dispose(); } };
  };

  return { vx: vx, vclass: vclass, ringOffset: ringOffset, FACES: FACES, paintOrb: paintOrb, orbLifecycle: orbLifecycle };
});
