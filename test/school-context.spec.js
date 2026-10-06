const { SchoolContextService } = require('../src/prisma/school-context.service');

describe('single-school deployment', () => {
  const school = { id: 'one', name: 'Our school' };
  test('uses the sole school without a client selection', async () => {
    const service = new SchoolContextService({ school: { findMany: async () => [school] } }, { get: () => undefined });
    await service.onModuleInit();
    expect(service.current).toEqual(school);
    expect(service.id).toBe('one');
  });
  test.each([[], [school, { id: 'other' }]])('fails startup for an ambiguous or empty database: %j', async rows => {
    const service = new SchoolContextService({ school: { findMany: async () => rows } }, { get: () => undefined });
    await expect(service.onModuleInit()).rejects.toThrow('Seed one school');
  });
  test('uses only the configured existing school and rejects a missing ID', async () => {
    const findUnique = jest.fn().mockResolvedValueOnce(school).mockResolvedValueOnce(null);
    const service = new SchoolContextService({ school: { findUnique } }, { get: () => 'one' });
    await service.onModuleInit();
    expect(findUnique).toHaveBeenCalledWith({ where: { id: 'one' } });
    expect(service.id).toBe('one');
    await expect(service.onModuleInit()).rejects.toThrow('APP_SCHOOL_ID');
  });
});
