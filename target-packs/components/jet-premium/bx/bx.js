/*
 * The premium Oracle JET pack (obdx-jet). require(['bx/bx']) once, link bx/bx.css, and the bx- elements are ready:
 * bx-button, bx-icon-button, bx-text-field, bx-amount, bx-select, bx-checkbox-group, bx-choice-group, bx-date,
 * bx-dialog, bx-toast, bx-card, bx-tabs and bx-data-grid; the forms wave: bx-text-area, bx-password, bx-number-input,
 * bx-currency-picker, bx-multi-select, bx-switch, bx-date-range, bx-search, bx-autocomplete and bx-document-upload; then the
 * catalogue groups, one module each (bx-g1: foundation, layout, data, feedback; bx-g2: accounts, payments, deposits; bx-g3: loans, cards, security; bx-g4: insights, approvals, liquidity, settings; bx-g5: service, documents, onboarding, calculators, help; bx-g6: dashboard widgets; bx-g7: text effects, motion, showcase, backdrops and micro interactions). The look follows classes on an ancestor (the component style):
 * bx-look-<design option>, bx-motion-hover-<x>, bx-motion-click-<x>, bx-motion-scroll-<x>, bx-dark, and --bx-brand. Motion
 * follows motion.json: CSS in bx.css, and bx-motion's play() for a value change; reduced motion shows the end state.
 */
define(['./bx-core', './bx-motion', './bx-g1', './bx-g2', './bx-g3', './bx-g4', './bx-g5', './bx-g6', './bx-g7', './bx-fields', './bx-elements', './bx-forms'], function (core, motion, g1, g2, g3, g4, g5, g6, g7) {
  'use strict';
  return {
    version: '1.0.0',
    elements: ['bx-button', 'bx-icon-button', 'bx-text-field', 'bx-amount', 'bx-select', 'bx-checkbox-group', 'bx-choice-group', 'bx-date', 'bx-dialog',
      'bx-toast', 'bx-card', 'bx-tabs', 'bx-data-grid', 'bx-text-area', 'bx-password', 'bx-number-input', 'bx-currency-picker', 'bx-multi-select',
      'bx-switch', 'bx-date-range', 'bx-search', 'bx-autocomplete', 'bx-document-upload'].concat(g1.elements, g2.elements, g3.elements, g4.elements, g5.elements, g6.elements, g7.elements),
    core: core,
    motion: motion
  };
});
