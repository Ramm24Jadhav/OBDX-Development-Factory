/*
 * <<Module>> services of OBDX, used by the <<module>> screens. Paths and field names as in the bank's OBDX REST services.
 */
import { api } from './client';

/** <<What is sent>>. */
export interface <<Name>>Request {
  <<field>>: string;
}

/** <<What comes back>>. */
export interface <<Name>>Response {
  <<field>>: string;
}

/** <<What the call does>>: <<METHOD and path of the OBDX service>>. */
export function <<name>>(request: <<Name>>Request): Promise<<<Name>>Response> {
  return api.post<<<Name>>Response>('<<path>>', request);
}
