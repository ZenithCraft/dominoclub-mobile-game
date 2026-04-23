/**
 * create-superuser.ts — cria um usuário com acesso total ao sistema
 *
 * Uso:
 *   npx ts-node scripts/create-superuser.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SUPERUSER_PHONE = process.env.SUPERUSER_PHONE || '+5599999999999';
const SUPERUSER_NAME = process.env.SUPERUSER_NAME || 'Super Admin';
const SUPERUSER_CPF = process.env.SUPERUSER_CPF || '11144477735';

async function main() {
  console.log('🔑 Criando superusuário...\n');

  // Verifica se já existe
  const existing = await prisma.user.findUnique({
    where: { phone: SUPERUSER_PHONE },
    include: { wallet: true },
  });

  if (existing) {
    console.log('⚠️  Usuário já existe com este telefone:', SUPERUSER_PHONE);
    console.log('   ID:', existing.id);
    console.log('   Nome:', existing.name);
    console.log('   Saldo real: R$', existing.wallet?.real_balance.toString() || '0');
    console.log('\n✅ Usuário pronto para uso!');
    return;
  }

  // Cria superusuário com acesso total (usando strings literais para compatibilidade)
  const superuser = await prisma.user.create({
    data: {
      phone: SUPERUSER_PHONE,
      name: SUPERUSER_NAME,
      cpf: SUPERUSER_CPF,
      email: 'superadmin@dominoclub.com',
      cpf_verified: true,
      phone_verified: true,
      trust_score: 1.0,          // Confiança máxima
      bot_score: 0,              // Nenhuma suspeita de bot
      is_banned: false,          // Sem banimento
      league_points: 9999,       // Pontuação máxima
      previous_rank: 'DIAMOND' as any,
      previous_rank_month: new Date().toISOString().slice(0, 7),
      
      // KYC completo
      kyc_document_type: 'RG' as any,
      kyc_document_status: 'APPROVED' as any,
      kyc_submitted_at: new Date(),
      kyc_reviewed_at: new Date(),
      kyc_review_notes: 'Superusuário - acesso irrestrito',
      
      // Carteira com saldo alto
      wallet: {
        create: {
          real_balance: 10000.00,   // R$ 10.000
          bonus_balance: 5000.00,   // R$ 5.000 bônus
          rollover_remaining: 0,    // Sem rollover pendente
        },
      },
    },
    include: { wallet: true },
  });

  // Cria algumas transações de histórico
  await prisma.transaction.createMany({
    data: [
      {
        walletId: superuser.wallet!.id,
        type: 'DEPOSIT' as any,
        amount: 10000,
        status: 'COMPLETED' as any,
        description: 'Depósito inicial superusuário',
        balance_after: 10000,
      },
      {
        walletId: superuser.wallet!.id,
        type: 'BONUS' as any,
        amount: 5000,
        status: 'COMPLETED' as any,
        description: 'Bônus de boas-vindas superusuário',
        balance_after: 15000,
      },
    ],
  });

  console.log('✅ Superusuário criado com sucesso!\n');
  console.log('─────────────────────────────────────────');
  console.log('📱 Dados de acesso:');
  console.log('   ID:', superuser.id);
  console.log('   Telefone:', superuser.phone);
  console.log('   Nome:', superuser.name);
  console.log('   CPF:', superuser.cpf);
  console.log('   Email:', superuser.email);
  console.log('');
  console.log('💰 Carteira:');
  console.log('   Saldo real: R$', superuser.wallet!.real_balance.toString());
  console.log('   Saldo bônus: R$', superuser.wallet!.bonus_balance.toString());
  console.log('');
  console.log('🔐 Verificações:');
  console.log('   CPF verificado:', superuser.cpf_verified ? '✅' : '❌');
  console.log('   Telefone verificado:', superuser.phone_verified ? '✅' : '❌');
  console.log('   KYC:', superuser.kyc_document_status);
  console.log('   Trust score:', superuser.trust_score);
  console.log('   Rank:', superuser.previous_rank);
  console.log('─────────────────────────────────────────');
  console.log('');
  console.log('🚀 Para login automático em desenvolvimento:');
  console.log('   1. Defina no .env: DEV_AUTH_BYPASS=true');
  console.log('   2. Use o endpoint: POST /auth/dev-login');
  console.log('   3. Ou use o telefone:', SUPERUSER_PHONE);
  console.log('');
}

main()
  .catch((err) => {
    console.error('❌ Erro:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
