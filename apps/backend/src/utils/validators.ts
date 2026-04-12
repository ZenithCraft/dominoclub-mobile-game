import { z } from 'zod';

export const phoneSchema = z.string().regex(/^\+?55\d{10,11}$/, 'Invalid Brazilian phone number');

export const cpfSchema = z.string().regex(/^\d{11}$/, 'CPF must be 11 digits').refine(validateCPF, 'Invalid CPF');

export const pixKeySchema = z.union([
  z.string().email(),
  z.string().regex(/^\d{11}$/).refine(validateCPF),
  z.string().regex(/^\+?55\d{10,11}$/),
  z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
  z.string().regex(/^\d{14}$/),
]);

function validateCPF(cpf: string): boolean {
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(cpf[i]) * (10 - i);
  let rest = (sum * 10) % 11;
  if (rest === 10 || rest === 11) rest = 0;
  if (rest !== parseInt(cpf[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(cpf[i]) * (11 - i);
  rest = (sum * 10) % 11;
  if (rest === 10 || rest === 11) rest = 0;
  return rest === parseInt(cpf[10]);
}

export const registerSchema = z.object({
  phone: phoneSchema,
  name: z.string().min(3).max(100),
  cpf: cpfSchema.optional(),
});

export const loginSchema = z.object({
  phone: phoneSchema,
});

export const verifyOtpSchema = z.object({
  phone: phoneSchema,
  otp: z.string().length(6),
});

export const depositSchema = z.object({
  amount: z.number().min(20, 'Minimum deposit is R$20').max(10000),
});

export const withdrawSchema = z.object({
  amount: z.number().min(20, 'Minimum withdrawal is R$20').max(5000),
  pixKey: pixKeySchema,
});

export const couponRedeemSchema = z.object({
  code: z.string().min(3).max(32),
});

export const createGameSchema = z.object({
  mode: z.enum(['ARENA_1V1', 'CUP_1V1', 'TOURNAMENT_2V2', 'RECREATIONAL_2V2']),
  betAmount: z.number().min(1).max(1000),
  variant: z.enum(['CARROCA', 'L_E_L', 'CRUZADA']).default('CARROCA'),
});
