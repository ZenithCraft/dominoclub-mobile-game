// Prisma client mock — replaces real DB calls in unit tests.
// Each method is a jest.fn() so tests can do:
//   prisma.wallet.findUnique.mockResolvedValue({ ... })

const makeMock = () => ({
  findUnique: jest.fn(),
  findFirst: jest.fn(),
  findMany: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  updateMany: jest.fn(),
  delete: jest.fn(),
  deleteMany: jest.fn(),
  count: jest.fn(),
  aggregate: jest.fn(),
  upsert: jest.fn(),
});

export const prisma = {
  user: makeMock(),
  wallet: makeMock(),
  transaction: makeMock(),
  game: makeMock(),
  gamePlayer: makeMock(),
  tournament: makeMock(),
  tournamentPlayer: makeMock(),
  fraudLog: makeMock(),
  $transaction: jest.fn((ops: any) => {
    // If array — resolve each mock; if callback — call it with prisma
    if (Array.isArray(ops)) return Promise.all(ops);
    return Promise.resolve(ops(prisma));
  }),
  $connect: jest.fn(),
  $disconnect: jest.fn(),
};

// Reset all mocks between tests
beforeEach(() => {
  Object.values(prisma).forEach((model) => {
    if (model && typeof model === 'object') {
      Object.values(model).forEach((fn) => {
        if (jest.isMockFunction(fn)) fn.mockReset();
      });
    }
  });
  // Restore $transaction default behaviour after reset
  (prisma.$transaction as jest.Mock).mockImplementation((ops: any) => {
    if (Array.isArray(ops)) return Promise.all(ops);
    return Promise.resolve(ops(prisma));
  });
});
