import { FORMS, FOUNDATION, G1, packGates } from './gates';

packGates('angular', 'http://localhost:5182/gallery/', [...FOUNDATION, ...FORMS, ...G1]);
