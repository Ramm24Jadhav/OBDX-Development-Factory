import { FORMS, FOUNDATION, G1, G2, G3, G4, G5, G6, G7, V6, packGates } from './gates';

// The premium JET pack in a real Oracle JET app, at both ends of the range it supports
packGates('jet6', 'http://localhost:5183/gates/jet-gallery.html', [...FOUNDATION, ...FORMS, ...G1, ...G2, ...G3, ...G4, ...G5, ...G6, ...G7, ...V6], 'jet=6');
packGates('jet21', 'http://localhost:5183/gates/jet-gallery.html', [...FOUNDATION, ...FORMS, ...G1, ...G2, ...G3, ...G4, ...G5, ...G6, ...G7, ...V6], 'jet=21');
