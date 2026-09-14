import { randomBytes, randomInt } from 'node:crypto';

const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function generatePassCredentials() {
  return {
    code: Array.from(
      { length: 8 },
      () => alphabet[randomInt(alphabet.length)],
    ).join(''),
    token: randomBytes(32).toString('base64url'),
  };
}
// Raised only for credential collisions. The caller must retry the whole
// transaction because PostgreSQL aborts transactions after unique violations.
export class PassCredentialCollision extends Error {
  constructor() {
    super('Access pass credential collision');
  }
}
