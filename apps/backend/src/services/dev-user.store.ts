import { v4 as uuidv4 } from 'uuid';

type DevWallet = {
  id: string;
  userId: string;
  real_balance: number;
  bonus_balance: number;
};

export type DevUser = {
  id: string;
  phone: string;
  name: string;
  avatar: string | null;
  is_banned: boolean;
  wallet: DevWallet;
  cpf_verified: boolean;
  phone_verified: boolean;
};

const usersById = new Map<string, DevUser>();
const usersByPhone = new Map<string, DevUser>();
const refreshByUserId = new Map<string, string | null>();

export function getOrCreateDevUser(phone: string, name: string): DevUser {
  const existing = usersByPhone.get(phone);
  if (existing) return existing;

  const id = uuidv4();
  const user: DevUser = {
    id,
    phone,
    name,
    avatar: null,
    is_banned: false,
    cpf_verified: true,
    phone_verified: true,
    wallet: {
      id: uuidv4(),
      userId: id,
      real_balance: 1000,
      bonus_balance: 0,
    },
  };
  usersById.set(id, user);
  usersByPhone.set(phone, user);
  refreshByUserId.set(id, null);
  return user;
}

export function getDevUserById(id: string): DevUser | null {
  return usersById.get(id) ?? null;
}

export function setDevRefreshToken(userId: string, refreshToken: string | null) {
  refreshByUserId.set(userId, refreshToken);
}

export function getDevRefreshToken(userId: string): string | null {
  return refreshByUserId.get(userId) ?? null;
}

