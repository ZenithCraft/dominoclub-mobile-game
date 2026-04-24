/**
 * seed-demo.ts — popula o banco com dados realistas para desenvolvimento
 *
 * Uso:
 *   npx ts-node scripts/seed-demo.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Rank thresholds: SILVER 200, GOLD 700, PLATINUM 1200, DIAMOND 1700
const RANK_PLAYERS = [
  // BRONZE (0–199)
  { phone: '+5511999990010', name: 'Ana Ribeiro',     league_points: 45,   real_balance: 30,    bonus_balance: 0,    cpf_verified: true,  bot_score: 0.04 },
  { phone: '+5511999990011', name: 'Pedro Costa',     league_points: 170,  real_balance: 120,   bonus_balance: 10,   cpf_verified: true,  bot_score: 0.07 },
  // SILVER (200–699)
  { phone: '+5511999990012', name: 'Juliana Lima',    league_points: 260,  real_balance: 350,   bonus_balance: 15,   cpf_verified: true,  bot_score: 0.05 },
  { phone: '+5511999990013', name: 'Marcelo Alves',   league_points: 580,  real_balance: 520,   bonus_balance: 0,    cpf_verified: true,  bot_score: 0.09 },
  // GOLD (700–1199)
  { phone: '+5511999990014', name: 'Fernanda Santos', league_points: 730,  real_balance: 890,   bonus_balance: 50,   cpf_verified: true,  bot_score: 0.03 },
  { phone: '+5511999990015', name: 'Lucas Ferreira',  league_points: 1080, real_balance: 1200,  bonus_balance: 100,  cpf_verified: true,  bot_score: 0.06 },
  // PLATINUM (1200–1699)
  { phone: '+5511999990016', name: 'Camila Rocha',    league_points: 1310, real_balance: 2100,  bonus_balance: 200,  cpf_verified: true,  bot_score: 0.02 },
  { phone: '+5511999990017', name: 'Rafael Gomes',    league_points: 1590, real_balance: 3500,  bonus_balance: 0,    cpf_verified: true,  bot_score: 0.04 },
  // DIAMOND (1700+)
  { phone: '+5511999990018', name: 'Beatriz Nunes',   league_points: 1760, real_balance: 5200,  bonus_balance: 500,  cpf_verified: true,  bot_score: 0.01 },
  { phone: '+5511999990019', name: 'Diego Carvalho',  league_points: 2250, real_balance: 8900,  bonus_balance: 1000, cpf_verified: true,  bot_score: 0.02 },
];

function rankForPoints(pts: number): string {
  if (pts >= 1700) return 'DIAMOND';
  if (pts >= 1200) return 'PLATINUM';
  if (pts >= 700)  return 'GOLD';
  if (pts >= 200)  return 'SILVER';
  return 'BRONZE';
}

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000);
const currentMonth = new Date().toISOString().slice(0, 7);

async function main() {
  console.log('🌱 Iniciando seed para demonstração...\n');

  // ── Limpar dados antigos ────────────────────────────────────────────────
  await prisma.fraudLog.deleteMany();
  await prisma.gamePlayer.deleteMany();
  await prisma.game.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.wallet.deleteMany();
  await prisma.tournamentPlayer.deleteMany();
  await prisma.tournament.deleteMany();
  await prisma.user.deleteMany();
  await prisma.systemConfig.deleteMany();

  // ── SystemConfig ───────────────────────────────────────────────────────
  console.log('⚙️  Criando SystemConfig...');
  await prisma.systemConfig.createMany({
    data: [
      { key: 'houseEdgePercent',        value: '10'   },
      { key: 'matchmakingBetTolerance', value: '0.10' },
      { key: 'botInjectWaitSeconds',    value: '30'   },
      { key: 'turnTimeoutSeconds',      value: '30'   },
      { key: 'disconnectGraceSeconds',  value: '15'   },
    ],
  });

  // ── Usuários principais ────────────────────────────────────────────────
  console.log('👤 Criando usuários principais...');

  const [gabriel, marina, carlos, suspeito, banido] = await Promise.all([
    prisma.user.create({
      data: {
        phone: '+5511999990001',
        name: 'Gabriel Valenço',
        cpf: '11144477735',
        cpf_verified: true,
        phone_verified: true,
        bot_score: 0.05,
        league_points: 420,
        previous_rank: 'SILVER' as any,
        previous_rank_month: currentMonth,
        wallet: { create: { real_balance: 150, bonus_balance: 0 } },
      },
    }),
    prisma.user.create({
      data: {
        phone: '+5511999990002',
        name: 'Marina Souza',
        cpf: '22233344456',
        cpf_verified: true,
        phone_verified: true,
        bot_score: 0.08,
        league_points: 950,
        previous_rank: 'GOLD' as any,
        previous_rank_month: currentMonth,
        wallet: { create: { real_balance: 320, bonus_balance: 10 } },
      },
    }),
    prisma.user.create({
      data: {
        phone: '+5511999990003',
        name: 'Carlos Mendes',
        cpf: '33344455568',
        cpf_verified: true,
        phone_verified: true,
        bot_score: 0.12,
        league_points: 130,
        previous_rank: 'BRONZE' as any,
        previous_rank_month: currentMonth,
        wallet: { create: { real_balance: 75, bonus_balance: 0 } },
      },
    }),
    prisma.user.create({
      data: {
        phone: '+5511999990004',
        name: 'Roberto Suspeito',
        cpf_verified: false,
        phone_verified: true,
        bot_score: 0.82,
        league_points: 60,
        device_id: 'device-abc-123',
        ip_address: '177.22.33.44',
        wallet: { create: { real_balance: 10, bonus_balance: 0 } },
      },
    }),
    prisma.user.create({
      data: {
        phone: '+5511999990005',
        name: 'Conta Banida',
        cpf_verified: false,
        phone_verified: true,
        is_banned: true,
        ban_reason: 'Padrão de bot detectado — 3 partidas suspeitas consecutivas',
        bot_score: 0.95,
        device_id: 'device-banned-999',
        wallet: { create: { real_balance: 0, bonus_balance: 0 } },
      },
    }),
  ]);

  // ── Jogadores com ranks diversificados ────────────────────────────────
  console.log('👥 Criando jogadores com ranks diversificados...');
  const rankPlayers = await Promise.all(
    RANK_PLAYERS.map((p) =>
      prisma.user.create({
        data: {
          phone: p.phone,
          name: p.name,
          cpf_verified: p.cpf_verified,
          phone_verified: true,
          bot_score: p.bot_score,
          league_points: p.league_points,
          previous_rank: rankForPoints(p.league_points) as any,
          previous_rank_month: currentMonth,
          wallet: {
            create: {
              real_balance: p.real_balance,
              bonus_balance: p.bonus_balance,
            },
          },
        },
      })
    )
  );

  // ── Usuário Demo KYC ──────────────────────────────────────────────────
  console.log('📋 Criando usuário Demo KYC...');
  await prisma.user.create({
    data: {
      phone: '+5511900000001',
      name: 'Demo KYC',
      cpf_verified: false,
      phone_verified: true,
      bot_score: 0.02,
      league_points: 0,
      wallet: { create: { real_balance: 200, bonus_balance: 0 } },
    },
  });

  // ── Super Admin ────────────────────────────────────────────────────────
  console.log('🔑 Criando Super Admin...');
  const superAdmin = await prisma.user.create({
    data: {
      phone: '+5599999999999',
      name: 'Super Admin',
      cpf: '00000000000',
      email: 'superadmin@dominoclub.com',
      cpf_verified: true,
      phone_verified: true,
      trust_score: 1.0,
      bot_score: 0,
      is_banned: false,
      league_points: 9999,
      previous_rank: 'DIAMOND' as any,
      previous_rank_month: currentMonth,
      kyc_document_type: 'RG' as any,
      kyc_document_status: 'APPROVED' as any,
      kyc_submitted_at: new Date(),
      kyc_reviewed_at: new Date(),
      kyc_review_notes: 'Superusuário — acesso irrestrito',
      wallet: {
        create: {
          real_balance: 10000,
          bonus_balance: 5000,
          rollover_remaining: 0,
        },
      },
    },
    include: { wallet: true },
  });

  await prisma.transaction.createMany({
    data: [
      {
        walletId: superAdmin.wallet!.id,
        type: 'DEPOSIT' as any,
        amount: 10000,
        status: 'COMPLETED' as any,
        description: 'Depósito inicial superusuário',
        balance_after: 10000,
      },
      {
        walletId: superAdmin.wallet!.id,
        type: 'BONUS' as any,
        amount: 5000,
        status: 'COMPLETED' as any,
        description: 'Bônus de boas-vindas superusuário',
        balance_after: 15000,
      },
    ],
  });

  // ── Histórico de partidas do Super Admin ──────────────────────────────
  console.log('🎲 Criando histórico do Super Admin...');
  const saHistory: Array<{ opp: any; bet: number; saWins: boolean; minutesAgo: number; variant: string }> = [
    { opp: gabriel,           bet: 10,  saWins: true,  minutesAgo: 300, variant: 'CARROCA' },
    { opp: marina,            bet: 25,  saWins: false, minutesAgo: 240, variant: 'L_E_L'   },
    { opp: rankPlayers[4],    bet: 10,  saWins: true,  minutesAgo: 180, variant: 'CARROCA' }, // Fernanda GOLD
    { opp: rankPlayers[6],    bet: 50,  saWins: true,  minutesAgo: 120, variant: 'CRUZADA' }, // Camila PLATINUM
    { opp: rankPlayers[8],    bet: 25,  saWins: true,  minutesAgo: 60,  variant: 'L_E_L'   }, // Beatriz DIAMOND
    { opp: rankPlayers[9],    bet: 100, saWins: true,  minutesAgo: 30,  variant: 'CARROCA' }, // Diego DIAMOND
  ];

  for (const g of saHistory) {
    const prize = parseFloat((g.bet * 2 * 0.9).toFixed(2));
    const fee   = parseFloat((g.bet * 2 * 0.1).toFixed(2));
    await prisma.game.create({
      data: {
        mode: 'ARENA_1V1',
        variant: g.variant as any,
        status: 'FINISHED',
        bet_amount: g.bet,
        prize_pool: prize,
        house_fee: fee,
        winner_id: g.saWins ? superAdmin.id : g.opp.id,
        winning_team: g.saWins ? 1 : 2,
        created_at: ago(g.minutesAgo + 18),
        finished_at: ago(g.minutesAgo),
        replay_data: { moves: 28 + Math.floor(g.minutesAgo % 15), rounds: 3 },
        players: {
          create: [
            { userId: superAdmin.id, team: 1, seat: 0, final_score: g.saWins ? 0 : 12, is_bot: false },
            { userId: g.opp.id,      team: 2, seat: 1, final_score: g.saWins ? 8 : 0,  is_bot: false },
          ],
        },
      },
    });
    const txns: any[] = [
      { walletId: superAdmin.wallet!.id, type: 'BET', amount: -g.bet,  status: 'COMPLETED', created_at: ago(g.minutesAgo + 18) },
    ];
    if (g.saWins) {
      txns.push({ walletId: superAdmin.wallet!.id, type: 'WIN', amount: prize, status: 'COMPLETED', created_at: ago(g.minutesAgo) });
    }
    await prisma.transaction.createMany({ data: txns });
  }

  // ── Partidas finalizadas ───────────────────────────────────────────────
  console.log('🎲 Criando partidas...');

  const game1 = await prisma.game.create({
    data: {
      mode: 'ARENA_1V1',
      variant: 'CARROCA',
      status: 'FINISHED',
      bet_amount: 10,
      prize_pool: 18,
      house_fee: 2,
      winner_id: gabriel.id,
      winning_team: 1,
      created_at: ago(120),
      finished_at: ago(100),
      replay_data: { moves: 32, rounds: 3 },
      players: {
        create: [
          { userId: gabriel.id, team: 1, seat: 0, final_score: 0,  is_bot: false },
          { userId: marina.id,  team: 2, seat: 1, final_score: 14, is_bot: false },
        ],
      },
    },
  });

  const game2 = await prisma.game.create({
    data: {
      mode: 'ARENA_1V1',
      variant: 'L_E_L',
      status: 'FINISHED',
      bet_amount: 25,
      prize_pool: 45,
      house_fee: 5,
      winner_id: marina.id,
      winning_team: 2,
      created_at: ago(60),
      finished_at: ago(42),
      replay_data: { moves: 48, rounds: 4 },
      players: {
        create: [
          { userId: carlos.id, team: 1, seat: 0, final_score: 8, is_bot: false },
          { userId: marina.id, team: 2, seat: 1, final_score: 0, is_bot: false },
        ],
      },
    },
  });

  const game3 = await prisma.game.create({
    data: {
      mode: 'ARENA_1V1',
      variant: 'CARROCA',
      status: 'FINISHED',
      bet_amount: 10,
      prize_pool: 18,
      house_fee: 2,
      winner_id: gabriel.id,
      winning_team: 1,
      created_at: ago(30),
      finished_at: ago(15),
      replay_data: { moves: 27, rounds: 2 },
      players: {
        create: [
          { userId: gabriel.id,  team: 1, seat: 0, final_score: 0,  is_bot: false },
          { userId: suspeito.id, team: 2, seat: 1, final_score: 22, is_bot: false },
        ],
      },
    },
  });

  // ── Transações ─────────────────────────────────────────────────────────
  console.log('💰 Criando transações...');
  const gabrielWallet = await prisma.wallet.findUnique({ where: { userId: gabriel.id } });
  const marinaWallet  = await prisma.wallet.findUnique({ where: { userId: marina.id } });
  const carlosWallet  = await prisma.wallet.findUnique({ where: { userId: carlos.id } });

  await prisma.transaction.createMany({
    data: [
      // Gabriel
      { walletId: gabrielWallet!.id, type: 'DEPOSIT',    amount: 100,  status: 'COMPLETED', created_at: ago(200), description: 'Depósito PIX' },
      { walletId: gabrielWallet!.id, type: 'BET',        amount: -10,  status: 'COMPLETED', created_at: ago(120) },
      { walletId: gabrielWallet!.id, type: 'WIN',        amount: 18,   status: 'COMPLETED', created_at: ago(100) },
      { walletId: gabrielWallet!.id, type: 'BET',        amount: -10,  status: 'COMPLETED', created_at: ago(30)  },
      { walletId: gabrielWallet!.id, type: 'WIN',        amount: 18,   status: 'COMPLETED', created_at: ago(15)  },
      { walletId: gabrielWallet!.id, type: 'WITHDRAWAL', amount: -50,  status: 'PENDING',   created_at: ago(2),  pix_key: 'gabriel@pix.com', description: 'Saque PIX' },
      // Marina
      { walletId: marinaWallet!.id,  type: 'DEPOSIT',    amount: 300,  status: 'COMPLETED', created_at: ago(180) },
      { walletId: marinaWallet!.id,  type: 'BET',        amount: -25,  status: 'COMPLETED', created_at: ago(60)  },
      { walletId: marinaWallet!.id,  type: 'WIN',        amount: 45,   status: 'COMPLETED', created_at: ago(42)  },
      { walletId: marinaWallet!.id,  type: 'WITHDRAWAL', amount: -100, status: 'PENDING',   created_at: ago(1),  pix_key: '11999990002', description: 'Saque PIX' },
      // Carlos
      { walletId: carlosWallet!.id,  type: 'DEPOSIT',    amount: 100,  status: 'COMPLETED', created_at: ago(90) },
      { walletId: carlosWallet!.id,  type: 'BET',        amount: -25,  status: 'COMPLETED', created_at: ago(60) },
    ],
  });

  // ── Fraud Logs ─────────────────────────────────────────────────────────
  console.log('🚨 Criando registros de fraude...');
  await prisma.fraudLog.createMany({
    data: [
      {
        userId:     suspeito.id,
        type:       'BOT_PATTERN',
        details:    { gameId: game3.id, fastRatio: 0.78, avgMoveMs: 312, sampleSize: 23, botScore: 0.82 },
        ip_address: '177.22.33.44',
        device_id:  'device-abc-123',
        resolved:   false,
        created_at: ago(15),
      },
      {
        userId:     banido.id,
        type:       'BOT_PATTERN',
        details:    { gameId: game1.id, fastRatio: 0.92, avgMoveMs: 188, sampleSize: 31, botScore: 0.95 },
        ip_address: '189.55.66.77',
        device_id:  'device-banned-999',
        resolved:   true,
        created_at: ago(90),
      },
      {
        userId:     suspeito.id,
        type:       'MULTI_ACCOUNT_IP',
        details:    { matchingUserIds: [banido.id], ipAddress: '177.22.33.44', threshold: 3 },
        ip_address: '177.22.33.44',
        resolved:   false,
        created_at: ago(60),
      },
      {
        userId:     gabriel.id,
        type:       'COLLUSION_SUSPECTED',
        details:    { gameId: game3.id, distanceMetres: 42, pairedWith: suspeito.id },
        resolved:   false,
        created_at: ago(15),
      },
      {
        userId:     suspeito.id,
        type:       'COLLUSION_SUSPECTED',
        details:    { gameId: game3.id, distanceMetres: 42, pairedWith: gabriel.id },
        resolved:   false,
        created_at: ago(15),
      },
    ],
  });

  // ── Torneio ────────────────────────────────────────────────────────────
  console.log('🏆 Criando torneio...');
  const tournament = await prisma.tournament.create({
    data: {
      name: 'Torneio Semanal — Carroça',
      mode: 'TOURNAMENT_2V2',
      variant: 'CARROCA',
      status: 'OPEN',
      entry_fee: 10,
      prize_pool: 120,
      max_players: 16,
      current_players: 3,
      starts_at: new Date(Date.now() + 2 * 60 * 60 * 1000),
    },
  });

  await prisma.tournamentPlayer.createMany({
    data: [
      { tournamentId: tournament.id, userId: gabriel.id },
      { tournamentId: tournament.id, userId: marina.id  },
      { tournamentId: tournament.id, userId: carlos.id  },
    ],
  });

  // ── Resumo ─────────────────────────────────────────────────────────────
  console.log('\n✅ Seed concluído!\n');
  console.log('─────────────────────────────────────────────────────────────');
  console.log('👥 Usuários principais:');
  console.log('   Gabriel Valenço  | +5511999990001 | SILVER (420pts) | R$150');
  console.log('   Marina Souza     | +5511999990002 | GOLD   (950pts) | R$320');
  console.log('   Carlos Mendes    | +5511999990003 | BRONZE (130pts) | R$75');
  console.log('   Roberto Suspeito | +5511999990004 | bot_score: 0.82 🤖');
  console.log('   Conta Banida     | +5511999990005 | banida ❌');
  console.log('');
  console.log('👥 Jogadores por rank:');
  console.log('   BRONZE  | Ana Ribeiro     (45pts)   | R$30');
  console.log('   BRONZE  | Pedro Costa     (170pts)  | R$120');
  console.log('   SILVER  | Juliana Lima    (260pts)  | R$350');
  console.log('   SILVER  | Marcelo Alves   (580pts)  | R$520');
  console.log('   GOLD    | Fernanda Santos (730pts)  | R$890');
  console.log('   GOLD    | Lucas Ferreira  (1080pts) | R$1.200');
  console.log('   PLATINUM| Camila Rocha    (1310pts) | R$2.100');
  console.log('   PLATINUM| Rafael Gomes    (1590pts) | R$3.500');
  console.log('   DIAMOND | Beatriz Nunes   (1760pts) | R$5.200');
  console.log('   DIAMOND | Diego Carvalho  (2250pts) | R$8.900');
  console.log('');
  console.log('🔑 Super Admin:');
  console.log('   Telefone: +5599999999999  (auto-login no app)');
  console.log('   Saldo: R$10.000 real + R$5.000 bônus | Rank: DIAMOND (9999pts)');
  console.log('   Histórico: 6 partidas (5 vitórias, 1 derrota)');
  console.log('');
  console.log('📋 Demo KYC (sem verificação):');
  console.log('   Telefone: +5511900000001');
  console.log('   → Faça logout do Super Admin e digite (11) 90000-0001 no login');
  console.log('');
  console.log('🎲 Partidas: 3 finalizadas');
  console.log('💰 Transações: 2 saques PENDENTES aguardando aprovação');
  console.log('🚨 Fraud logs: 5 registros (4 pendentes, 1 resolvido)');
  console.log('─────────────────────────────────────────────────────────────');
  console.log('\n🔐 Admin: http://localhost:3000/login');
  console.log('   Usuário: admin  |  Senha: admin123');
  console.log('\n📱 Super Admin mobile: +5599999999999 (botão na tela de login)\n');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
