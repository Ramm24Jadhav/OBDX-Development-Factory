import { FORMS, FOUNDATION, G1, packGates } from './gates';

packGates('react', 'http://localhost:5181/', [...FOUNDATION, ...FORMS, ...G1]);
