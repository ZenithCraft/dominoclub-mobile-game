export const MOCK_USER = {
  id: 'demo-001',
  phone: '+5511999999999',
  name: 'Gabriel Silva',
  cpf_verified: true,
  phone_verified: true,
  isNewUser: false,
  wallet: {
    real_balance: 125.5,
    bonus_balance: 20.0,
    rollover_remaining: 0,
  },
};

export const MOCK_ACCESS_TOKEN  = 'demo.access.token';
export const MOCK_REFRESH_TOKEN = 'demo.refresh.token';

export const MOCK_TRANSACTIONS = [
  { id: 'tx1', type: 'DEPOSIT',    amount: 100,   balance_after: 100,   status: 'COMPLETED', created_at: new Date(Date.now() - 7 * 86400000).toISOString() },
  { id: 'tx2', type: 'BET',        amount: -10,   balance_after: 90,    status: 'COMPLETED', created_at: new Date(Date.now() - 6 * 86400000).toISOString() },
  { id: 'tx3', type: 'WIN',        amount: 19,    balance_after: 109,   status: 'COMPLETED', created_at: new Date(Date.now() - 5 * 86400000).toISOString() },
  { id: 'tx4', type: 'DEPOSIT',    amount: 50,    balance_after: 159,   status: 'COMPLETED', created_at: new Date(Date.now() - 3 * 86400000).toISOString() },
  { id: 'tx5', type: 'BET',        amount: -25,   balance_after: 134,   status: 'COMPLETED', created_at: new Date(Date.now() - 2 * 86400000).toISOString() },
  { id: 'tx6', type: 'WIN',        amount: 47.5,  balance_after: 181.5, status: 'COMPLETED', created_at: new Date(Date.now() - 86400000).toISOString() },
  { id: 'tx7', type: 'WITHDRAWAL', amount: -56,   balance_after: 125.5, status: 'COMPLETED', created_at: new Date().toISOString() },
];

export const MOCK_TOURNAMENTS = [
  {
    id: 't1', name: 'Torneio Noturno', status: 'OPEN',
    entry_fee: 10, prize_pool: 500, max_players: 64, current_players: 38,
    starts_at: new Date(Date.now() + 45 * 60000).toISOString(),
  },
  {
    id: 't2', name: 'Grand Slam', status: 'OPEN',
    entry_fee: 50, prize_pool: 5000, max_players: 128, current_players: 72,
    starts_at: new Date(Date.now() + 120 * 60000).toISOString(),
  },
  {
    id: 't3', name: 'Torneio Bronze', status: 'OPEN',
    entry_fee: 2, prize_pool: 50, max_players: 32, current_players: 12,
    starts_at: new Date(Date.now() + 8 * 60000).toISOString(),
  },
];
