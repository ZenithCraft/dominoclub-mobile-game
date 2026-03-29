/**
 * Dev-only script: runs the full CPF/OTP → PIX QR → webhook → balance flow.
 * Signs the JWT directly (bypasses OTP) so it can run unattended.
 *
 * Usage: npx ts-node scripts/test-pix-flow.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import axios from 'axios';

const prisma = new PrismaClient();
const BASE   = 'http://localhost:3001/api/v1';
const PHONE  = '+5511999999999';
const CPF    = '52998224725';
const AMOUNT = 20;

async function main() {
  console.log('\n══════════════════════════════════════════════');
  console.log('  DominoClub — PIX Flow Test');
  console.log('══════════════════════════════════════════════\n');

  // ── 1. Ensure user + wallet exist ────────────────────────────────
  let user = await prisma.user.findUnique({
    where: { phone: PHONE },
    include: { wallet: true },
  });

  if (!user) {
    user = await prisma.user.create({
      data: { phone: PHONE, wallet: { create: {} } },
      include: { wallet: true },
    });
    console.log(`[1] New user created — ${user.id}`);
  } else {
    console.log(`[1] User found       — ${user.id}`);
  }

  // ── 2. Sign JWT directly (simulate OTP verified) ─────────────────
  const secret = process.env.JWT_ACCESS_SECRET!;
  const token  = jwt.sign({ userId: user.id, phone: user.phone }, secret, { expiresIn: '15m' });
  console.log('[2] JWT issued       — (OTP bypassed for dev)');

  const headers = { Authorization: `Bearer ${token}` };

  // ── 3. Verify CPF (Serpro mock mode) ─────────────────────────────
  const cpfRes = await axios.post(`${BASE}/auth/cpf/verify`, { cpf: CPF }, { headers });
  console.log(`[3] CPF verified     — ${cpfRes.data.situacao}`);

  // ── 4. Generate PIX QR code (sandbox mock) ───────────────────────
  const depositRes = await axios.post(`${BASE}/wallet/deposit`, { amount: AMOUNT }, { headers });
  const { txid, qrCode, transactionId } = depositRes.data;
  console.log(`[4] PIX QR generated — txid: ${txid}`);
  console.log(`    QR string: ${qrCode.slice(0, 60)}…`);
  console.log(`    Transaction ID: ${transactionId}`);

  // ── 5. Simulate Banco Inter webhook ──────────────────────────────
  await axios.post(`${BASE}/wallet/pix/webhook`, { pix: [{ txid }] });
  console.log(`[5] Webhook fired    — deposit confirmed`);

  // ── 6. Read updated wallet balance ───────────────────────────────
  const walletRes = await axios.get(`${BASE}/wallet`, { headers });
  const { real_balance, transactions } = walletRes.data;
  const tx = transactions.find((t: any) => t.id === transactionId);

  console.log(`\n══════════════════════════════════════════════`);
  console.log(`  real_balance : R$ ${real_balance.toFixed(2)}`);
  console.log(`  tx status    : ${tx?.status}`);
  console.log(`  tx amount    : R$ ${tx?.amount.toFixed(2)}`);
  console.log(`══════════════════════════════════════════════\n`);
}

main()
  .catch((err) => {
    console.error('\n[ERROR]', err.response?.data ?? err.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
