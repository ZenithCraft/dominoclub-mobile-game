/**
 * seed-demo.ts — popula o banco com dados realistas para gravação do vídeo
 * Milestones 3, 4 e 5
 *
 * Uso:
 *   npx ts-node scripts/seed-demo.ts
 */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

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

  // ── SystemConfig (M5) ──────────────────────────────────────────────────
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

  // ── Usuários ───────────────────────────────────────────────────────────
  console.log('👤 Criando usuários...');
  const hash = await bcrypt.hash('password123', 10);

  const [gabriel, marina, carlos, suspeito, banido] = await Promise.all([
    prisma.user.create({
      data: {
        phone: '+5511999990001',
        name: 'Gabriel Valenço',
        cpf: '11144477735',
        cpf_verified: true,
        phone_verified: true,
        bot_score: 0.05,
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
        wallet: { create: { real_balance: 75, bonus_balance: 0 } },
      },
    }),
    prisma.user.create({
      data: {
        phone: '+5511999990004',
        name: 'Roberto Suspeito',
        cpf_verified: false,
        phone_verified: true,
        bot_score: 0.82, // alto — suspeito de bot
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

  // ── Partidas finalizadas ───────────────────────────────────────────────
  console.log('🎲 Criando partidas...');
  const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000);

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
          { userId: gabriel.id,  team: 1, seat: 0, final_score: 0,  is_bot: false },
          { userId: marina.id,   team: 2, seat: 1, final_score: 14, is_bot: false },
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
          { userId: carlos.id, team: 1, seat: 0, final_score: 8,  is_bot: false },
          { userId: marina.id, team: 2, seat: 1, final_score: 0,  is_bot: false },
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
          { userId: gabriel.id,   team: 1, seat: 0, final_score: 0,  is_bot: false },
          { userId: suspeito.id,  team: 2, seat: 1, final_score: 22, is_bot: false },
        ],
      },
    },
  });

  // Partida em andamento
  await prisma.game.create({
    data: {
      mode: 'RECREATIONAL_2V2',
      variant: 'CRUZADA',
      status: 'PLAYING',
      bet_amount: 0,
      prize_pool: 0,
      house_fee: 0,
      created_at: ago(5),
      players: {
        create: [
          { userId: gabriel.id, team: 1, seat: 0, is_bot: false },
          { userId: marina.id,  team: 2, seat: 1, is_bot: false },
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
      { walletId: carlosWallet!.id,  type: 'DEPOSIT',    amount: 100,  status: 'COMPLETED', created_at: ago(90)  },
      { walletId: carlosWallet!.id,  type: 'BET',        amount: -25,  status: 'COMPLETED', created_at: ago(60)  },
    ],
  });

  // ── Fraud Logs (M4 + M5) ───────────────────────────────────────────────
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
      starts_at: new Date(Date.now() + 2 * 60 * 60 * 1000), // em 2h
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
  console.log('─────────────────────────────────────────');
  console.log('👥 Usuários criados:');
  console.log('   Gabriel Valenço  | +5511999990001 | saldo: R$150');
  console.log('   Marina Souza     | +5511999990002 | saldo: R$320');
  console.log('   Carlos Mendes    | +5511999990003 | saldo: R$75');
  console.log('   Roberto Suspeito | +5511999990004 | bot_score: 0.82 🤖');
  console.log('   Conta Banida     | +5511999990005 | banida ❌');
  console.log('');
  console.log('🎲 Partidas: 3 finalizadas + 1 em andamento');
  console.log('💰 Transações: 2 saques PENDENTES aguardando aprovação');
  console.log('🚨 Fraud logs: 5 registros (3 pendentes, 1 resolvido)');
  console.log('⚙️  SystemConfig: houseEdgePercent=10');
  console.log('─────────────────────────────────────────');
  console.log('\n🔐 Admin: http://localhost:3000/login');
  console.log('   Usuário: admin');
  console.log('   Senha:   changeme_in_production\n');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
