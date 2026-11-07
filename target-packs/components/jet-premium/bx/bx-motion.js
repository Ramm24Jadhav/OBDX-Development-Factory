/*
 * The motion layer's script part, the same as motion.ts in the React and Angular packs. Most motion is CSS in bx.css;
 * this plays the effects a value change needs (a number that rolls, a chip that pops) with the Web Animations API.
 * Under reduced motion, or where the API is missing (old browsers on JET 6), nothing plays and the element shows its
 * end state. Durations and easing follow the --bx-dur-* and --bx-ease-* tokens. See target-packs/components/motion.json.
 */
define([], function () {
  'use strict';
  var STANDARD = 'cubic-bezier(0.2, 0, 0, 1)';
  var SPRING = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
  var EFFECTS = {
    roll: { frames: [{ transform: 'translateY(40%)', opacity: 0 }, { transform: 'none', opacity: 1 }], duration: 200, easing: STANDARD },
    pop: { frames: [{ transform: 'scale(0.85)' }, { transform: 'scale(1.06)' }, { transform: 'none' }], duration: 320, easing: SPRING },
    shake: { frames: [{ transform: 'none' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(-3px)' }, { transform: 'none' }],
      duration: 320, easing: STANDARD },
    settle: { frames: [{ transform: 'translateY(-6px)', opacity: 0 }, { transform: 'none', opacity: 1 }], duration: 200, easing: STANDARD },
    pulse: { frames: [{ transform: 'none' }, { transform: 'scale(1.04)' }, { transform: 'none' }], duration: 320, easing: STANDARD }
  };

  /** True when the customer asked for less motion. */
  function reducedMotion() {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /** Plays an effect on an element once; returns the animation, or null when nothing plays. */
  function play(element, effect) {
    var e = EFFECTS[effect];
    if (!element || !e || typeof element.animate !== 'function' || reducedMotion()) { return null; }
    return element.animate(e.frames, { duration: e.duration, easing: e.easing });
  }

  return { EFFECTS: EFFECTS, reducedMotion: reducedMotion, play: play };
});
