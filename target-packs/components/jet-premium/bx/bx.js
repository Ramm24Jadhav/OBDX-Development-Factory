/*
 * The premium Oracle JET pack (obdx-jet). require(['bx/bx']) once, link bx/bx.css, and the bx- elements are ready:
 * bx-button, bx-icon-button, bx-text-field, bx-amount, bx-select, bx-checkbox-group, bx-choice-group, bx-date,
 * bx-dialog, bx-toast, bx-card, bx-tabs and bx-data-grid; the forms wave: bx-text-area, bx-password, bx-number-input,
 * bx-currency-picker, bx-multi-select, bx-switch, bx-date-range, bx-search, bx-autocomplete and bx-document-upload. The look follows classes on an ancestor (the component style):
 * bx-look-<design option>, bx-motion-hover-<x>, bx-motion-click-<x>, bx-motion-scroll-<x>, bx-dark, and --bx-brand. Motion
 * follows motion.json: CSS in bx.css, and bx-motion's play() for a value change; reduced motion shows the end state.
 */
define(['./bx-core', './bx-motion', './bx-fields', './bx-elements', './bx-forms'], function (core, motion) {
  'use strict';
  return {
    version: '0.2.0',
    elements: ['bx-button', 'bx-icon-button', 'bx-text-field', 'bx-amount', 'bx-select', 'bx-checkbox-group', 'bx-choice-group', 'bx-date', 'bx-dialog',
      'bx-toast', 'bx-card', 'bx-tabs', 'bx-data-grid', 'bx-text-area', 'bx-password', 'bx-number-input', 'bx-currency-picker', 'bx-multi-select',
      'bx-switch', 'bx-date-range', 'bx-search', 'bx-autocomplete', 'bx-document-upload'],
    core: core,
    motion: motion
  };
});
