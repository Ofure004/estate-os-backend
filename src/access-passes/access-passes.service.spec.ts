import { AccessPassService } from './access-passes.service.js';
import {
  generatePassCredentials,
  PassCredentialCollision,
} from './access-pass-credentials.js';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { AuthorizationService } from '../authorization/authorization.service.js';

const now = new Date('2030-01-01T12:00:00Z');
const from = new Date('2030-01-01T11:00:00Z');
const until = new Date('2030-01-01T13:00:00Z');
const pass = () => ({
  status: 'ACTIVE' as const,
  revokedAt: null,
  validFrom: from,
  validUntil: until,
});
const invitation = () => ({
  estateId: 'a',
  status: 'PENDING' as const,
  validFrom: from,
  validUntil: until,
});
const service = new AccessPassService(
  {} as PrismaService,
  {} as AuthorizationService,
);

describe('Effective pass validity', () => {
  it('allows PENDING and ACTIVE invitations within both windows', () => {
    expect(service.evaluatePass(pass(), invitation(), 'a', now)).toBe('ACTIVE');
    expect(
      service.evaluatePass(
        pass(),
        { ...invitation(), status: 'ACTIVE' },
        'a',
        now,
      ),
    ).toBe('ACTIVE');
  });
  it('includes start and excludes end', () => {
    expect(service.evaluatePass(pass(), invitation(), 'a', from)).toBe(
      'ACTIVE',
    );
    expect(service.evaluatePass(pass(), invitation(), 'a', until)).toBe(
      'EXPIRED',
    );
  });
  it('checks both pass and invitation windows', () => {
    expect(
      service.evaluatePass(
        { ...pass(), validFrom: until },
        invitation(),
        'a',
        now,
      ),
    ).toBe('INVALID');
    expect(
      service.evaluatePass(
        pass(),
        invitation(),
        'a',
        new Date('2030-01-01T10:00:00Z'),
      ),
    ).toBe('NOT_YET_VALID');
    expect(
      service.evaluatePass(
        pass(),
        { ...invitation(), validFrom: new Date('2030-01-01T12:30:00Z') },
        'a',
        now,
      ),
    ).toBe('NOT_YET_VALID');
    expect(
      service.evaluatePass(
        pass(),
        { ...invitation(), validUntil: now },
        'a',
        now,
      ),
    ).toBe('EXPIRED');
    expect(
      service.evaluatePass(
        { ...pass(), validUntil: now },
        invitation(),
        'a',
        now,
      ),
    ).toBe('EXPIRED');
  });
  it.each(['CANCELLED', 'COMPLETED', 'EXPIRED'] as const)(
    'honors invitation %s',
    (status) => {
      expect(
        service.evaluatePass(pass(), { ...invitation(), status }, 'a', now),
      ).toBe(status);
    },
  );
  it('honors revocation status and timestamp independently', () => {
    expect(
      service.evaluatePass(
        { ...pass(), status: 'REVOKED' },
        invitation(),
        'a',
        now,
      ),
    ).toBe('REVOKED');
    expect(
      service.evaluatePass(
        { ...pass(), revokedAt: now },
        invitation(),
        'a',
        now,
      ),
    ).toBe('REVOKED');
  });
  it('rejects used, missing, wrong-estate, and invalid-window passes', () => {
    expect(
      service.evaluatePass(
        { ...pass(), status: 'USED' },
        invitation(),
        'a',
        now,
      ),
    ).toBe('USED');
    expect(service.evaluatePass(null, invitation(), 'a', now)).toBe(
      'NOT_FOUND',
    );
    expect(service.evaluatePass(pass(), null, 'a', now)).toBe('NOT_FOUND');
    expect(service.evaluatePass(pass(), invitation(), 'b', now)).toBe(
      'WRONG_ESTATE',
    );
    expect(
      service.evaluatePass(
        { ...pass(), validUntil: new Date('invalid') },
        invitation(),
        'a',
        now,
      ),
    ).toBe('INVALID');
  });
});

describe('Credentials and collision classification', () => {
  it('generates distinct, URL-safe credentials in the required formats', () => {
    const credentials = Array.from({ length: 100 }, generatePassCredentials);
    for (const value of credentials) {
      expect(value.code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
      expect(value.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(Buffer.from(value.token, 'base64url').length).toBe(32);
    }
    expect(new Set(credentials.map((c) => c.code)).size).toBe(100);
    expect(new Set(credentials.map((c) => c.token)).size).toBe(100);
  });
  it.each(['code', 'token'])(
    'identifies a %s unique collision for transaction retry',
    async (field) => {
      const error = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint',
        { code: 'P2002', clientVersion: '7.10.0', meta: { target: [field] } },
      );
      const tx = {
        accessPass: { create: vi.fn().mockRejectedValue(error) },
      } as unknown as Prisma.TransactionClient;
      await expect(
        service.createForInvitation(tx, {
          id: 'invitation-id',
          validFrom: from,
          validUntil: until,
        }),
      ).rejects.toBeInstanceOf(PassCredentialCollision);
    },
  );
  it('does not retry unrelated uniqueness failures', async () => {
    const error = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint',
      {
        code: 'P2002',
        clientVersion: '7.10.0',
        meta: { target: ['invitationId'] },
      },
    );
    const tx = {
      accessPass: { create: vi.fn().mockRejectedValue(error) },
    } as unknown as Prisma.TransactionClient;
    await expect(
      service.createForInvitation(tx, {
        id: 'invitation-id',
        validFrom: from,
        validUntil: until,
      }),
    ).rejects.toMatchObject({ status: 500 });
  });
});
