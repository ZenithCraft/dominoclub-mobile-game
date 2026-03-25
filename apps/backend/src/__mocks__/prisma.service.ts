// Prisma client mock — replaces real DB calls in unit tests.
// Each method is a jest.fn() so tests can do:
//   prisma.wallet.findUnique.mockResolvedValue({ ... })
//
// Default resolved values (null / [] / 0) prevent `undefined` being awaited
// which could cause misleading TypeErrors in integration tests.

const makeMock = () => ({
  findUnique:  jest.fn().mockResolvedValue(null),
  findFirst:   jest.fn().mockResolvedValue(null),
  findMany:    jest.fn().mockResolvedValue([]),
  create:      jest.fn().mockResolvedValue(null),
  update:      jest.fn().mockResolvedValue(null),
  updateMany:  jest.fn().mockResolvedValue({ count: 0 }),
  delete:      jest.fn().mockResolvedValue(null),
  deleteMany:  jest.fn().mockResolvedValue({ count: 0 }),
  count:       jest.fn().mockResolvedValue(0),
  aggregate:   jest.fn().mockResolvedValue({ _sum: { amount: null }, _count: 0 }),
  upsert:      jest.fn().mockResolvedValue(null),
});

export const prisma = {
  user:              makeMock(),
  wallet:            makeMock(),
  transaction:       makeMock(),
  game:              makeMock(),
  gamePlayer:        makeMock(),
  tournament:        makeMock(),
  tournamentPlayer:  makeMock(),
  fraudLog:          makeMock(),
  $transaction: jest.fn((ops: any): Promise<any> => {
    // If array — resolve each mock; if callback — call it with prisma
    if (Array.isArray(ops)) return Promise.all(ops);
    return Promise.resolve(ops(prisma));
  }),
  $queryRaw:    jest.fn().mockResolvedValue([]),
  $connect:     jest.fn(),
  $disconnect:  jest.fn(),
  $on:          jest.fn(),
};

// ─── Reset helpers ─────────────────────────────────────────────────────────────

const MODEL_KEYS = [
  'user', 'wallet', 'transaction', 'game', 'gamePlayer',
  'tournament', 'tournamentPlayer', 'fraudLog',
] as const;

function restoreModelDefaults() {
  for (const key of MODEL_KEYS) {
    const m = prisma[key] as any;
    m.findUnique.mockResolvedValue(null);
    m.findFirst.mockResolvedValue(null);
    m.findMany.mockResolvedValue([]);
    m.create.mockResolvedValue(null);
    m.update.mockResolvedValue(null);
    m.updateMany.mockResolvedValue({ count: 0 });
    m.delete.mockResolvedValue(null);
    m.deleteMany.mockResolvedValue({ count: 0 });
    m.count.mockResolvedValue(0);
    m.aggregate.mockResolvedValue({ _sum: { amount: null }, _count: 0 });
    m.upsert.mockResolvedValue(null);
  }
}

// Reset all mocks between tests, then restore safe defaults so that
// `await prisma.model.method()` never resolves to raw `undefined`.
beforeEach(() => {
  // Reset every mock function on the prisma object
  Object.values(prisma).forEach((value) => {
    if (value && typeof value === 'object') {
      Object.values(value).forEach((fn) => {
        if (jest.isMockFunction(fn)) fn.mockReset();
      });
    } else if (jest.isMockFunction(value)) {
      (value as jest.Mock).mockReset();
    }
  });

  // Re-apply default resolved values
  restoreModelDefaults();

  (prisma.$transaction as jest.Mock).mockImplementation((ops: any) => {
    if (Array.isArray(ops)) return Promise.all(ops);
    return Promise.resolve(ops(prisma));
  });
  (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);
});
