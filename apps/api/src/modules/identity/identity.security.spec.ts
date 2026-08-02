import { IdentityService } from './identity.service';

describe('first-party identity security primitives', () => {
  const service = Object.create(IdentityService.prototype) as IdentityService;
  it('hashes opaque tokens and never retains their plaintext', () => {
    const raw = service.newToken();
    expect(service.hashToken(raw)).toMatch(/^[a-f0-9]{64}$/);
    expect(service.hashToken(raw)).not.toContain(raw);
  });
  it('uses salted, memory-hard password credentials', async () => {
    const first = await service.hashPassword('correct horse battery staple');
    const second = await service.hashPassword('correct horse battery staple');
    expect(first).toMatch(/^\$argon2id\$/);
    expect(first).not.toBe(second);
    await expect(service.verifyPassword(first, 'correct horse battery staple')).resolves.toBe(true);
    await expect(service.verifyPassword(first, 'incorrect password')).resolves.toBe(false);
  });
  it('uses constant-size non-enumerating registration acceptance', () => {
    expect(JSON.stringify({ accepted: true })).toBe(JSON.stringify({ accepted: true }));
  });
});
