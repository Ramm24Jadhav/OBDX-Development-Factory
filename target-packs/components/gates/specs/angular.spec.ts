import { FORMS, FOUNDATION, packGates } from './gates';

packGates('angular', 'http://localhost:5182/gallery/', [...FOUNDATION, ...FORMS]);
