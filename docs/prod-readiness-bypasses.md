# Bypasses & Mocks — Checklist de Remoção antes de Produção

Levantamento de todos os atalhos de desenvolvimento (bypasses, mocks, fallbacks in-memory) que existem no projeto e devem ser removidos ou configurados corretamente antes do deploy em produção.

Data do levantamento: 2026-06-25

---

## Legenda de risco

| Nível | Critério |
|-------|---------|
| 🔴 CRÍTICO | Pode vazar para produção mesmo sem querer — rota exposta, fallback silencioso, default perigoso |
| 🟠 ALTO | Controlado por variável de ambiente, mas se a var for omitida no deploy a brecha abre |
| 🟢 OK | Corretamente gated por `NODE_ENV` ou env var — não requer ação antes de prod |

---

## Backend

### 🔴 CRÍTICO — POST /auth/dev/login registrado incondicionalmente

**Arquivo:** `apps/backend/src/routes/auth.routes.ts:23`

```ts
router.post('/dev/login', devLoginHandler);  // ← esta linha existe em produção
```

A rota está registrada sem nenhuma condição de ambiente. A proteção atual é apenas um check de IP local + `DEV_AUTH_BYPASS` dentro do handler, que pode ser contornado por proxy reverso mal configurado ou spoofing.

**Ação:** Remover a rota completamente em produção. Opção mais segura:

```ts
if (config.env !== 'production') {
  router.post('/dev/login', devLoginHandler);
}
```

Ou deletar `devLoginHandler`, `devLogin()` e `dev-user.store.ts` inteiramente antes de publicar.

---

### 🔴 CRÍTICO — devLogin() cria usuário in-memory quando o DB falha

**Arquivo:** `apps/backend/src/services/auth.service.ts:144–154`

```ts
export async function devLogin(phone: string, name: string, ...) {
  try {
    // ... tenta criar no Prisma
  } catch {
    // ← Fallback silencioso: cria usuário fake em memória
    const user = getOrCreateDevUser(phone, name);
    // ... emite JWT válido para usuário completamente fictício
  }
}
```

Se o banco estiver instável em produção e essa rota existir, qualquer pessoa pode obter um JWT válido para uma conta inexistente, com `cpf_verified: true` e saldo R$1.000.

**Ação:** Remover o bloco `catch` inteiro. Falha de DB deve propagar como erro 500.

---

### 🔴 CRÍTICO — authMiddleware aprova JWT sem verificar ban quando DB falha

**Arquivo:** `apps/backend/src/middleware/auth.middleware.ts:37–41`

```ts
} catch {
  if (config.env === 'production') {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  // ← Em não-produção: aceita o token sem checar is_banned no DB
  req.user = { userId: payload.userId, phone: payload.phone };
}
```

Em staging (que não é `production`), um usuário banido continua autenticado se o DB estiver indisponível.

**Ação:** Remover o bloco `catch` por completo. Erro de DB deve sempre retornar 401/503 — sem fallback.

---

### 🔴 CRÍTICO — ensureDevWalletBalance adiciona R$1.000 em qualquer env não-production

**Arquivo:** `apps/backend/src/services/auth.service.ts:8–38`

```ts
async function ensureDevWalletBalance(userId: string, minBalance: number) {
  if (process.env.NODE_ENV === 'production') return;  // ← só bloqueia 'production'
  // staging, homologação, preview envs recebem top-up de R$1.000 a cada login
}
```

É chamada a cada `loginWithOtp()` e `devLogin()`. Qualquer ambiente que não se chame `production` distribui saldo gratuito.

**Ação:** Restringir explicitamente a `development`:

```ts
if (process.env.NODE_ENV !== 'development') return;
```

Ou remover a função inteiramente antes do lançamento.

---

### 🔴 CRÍTICO — SMS_PROVIDER default é 'mock' — OTP nunca chega ao usuário real

**Arquivo:** `apps/backend/src/config/index.ts:42`

```ts
provider: (process.env.SMS_PROVIDER || 'mock') as 'mock' | 'zenvia' | 'twilio',
```

Se `SMS_PROVIDER` não estiver definido no `.env` de produção, o OTP é apenas logado no console — nenhum SMS é enviado.

**Ação:** Remover o fallback `'mock'` e lançar erro de startup se não configurado em produção:

```ts
provider: process.env.SMS_PROVIDER as 'zenvia' | 'twilio',
// adicionar ao _secretChecks: checar que SMS_PROVIDER está definido em production
```

---

### 🟠 ALTO — OTP store in-memory não sobrevive a restart

**Arquivo:** `apps/backend/src/services/otp.service.ts:18`

```ts
// In-memory for development. In production replace with Redis
const otpStore = new Map<string, OtpEntry>();
```

Reinício do processo invalida todos os OTPs pendentes. Em produção com múltiplas instâncias (load balancer), cada instância tem um store diferente — OTP enviado pela instância A não é validado pela instância B.

**Ação:** Migrar para Redis (`SET phone:otp:<phone> <json> EX 300`) antes de escalar horizontalmente. O comentário no código já aponta isso.

---

### 🟠 ALTO — SERPRO_MOCK_MODE aceita qualquer CPF sem chamada à API real

**Arquivo:** `apps/backend/src/services/cpf.service.ts:97–100`

```ts
if (config.serpro.mockMode) {
  logger.info('[CPF MOCK] Accepted CPF (mock mode)', { cpf: cpf.slice(0, 3) + '***' });
  return { verified: true, name: null, situacao: 'Regular (mock)' };
}
```

Se `SERPRO_MOCK_MODE=true` vazar para o `.env` de produção, qualquer CPF matematicamente válido é aceito sem consulta.

**Ação:** Garantir `SERPRO_MOCK_MODE` ausente ou `false` no `.env.production`. Adicionar ao checklist de deploy.

---

### 🟠 ALTO — INTEGRITY_MOCK_MODE bypassa Play Integrity e App Attest

**Arquivo:** `apps/backend/src/config/index.ts:79`

```ts
mockMode: process.env.INTEGRITY_MOCK_MODE === 'true',
mockToken: process.env.INTEGRITY_MOCK_TOKEN || 'dev-integrity-token',
```

Com `INTEGRITY_MOCK_MODE=true`, qualquer token igual a `INTEGRITY_MOCK_TOKEN` é aceito sem verificação real no Google/Apple. Bots e emuladores passam livremente.

**Ação:** Garantir `INTEGRITY_MOCK_MODE` ausente ou `false` no `.env.production`.

---

### 🟠 ALTO — refreshTokens e logout com fallback in-memory

**Arquivo:** `apps/backend/src/services/auth.service.ts:175–183, 202–204`

```ts
// refreshTokens:
} catch {
  const stored = getDevRefreshToken(payload.userId); // ← in-memory DevUserStore
  ...
}

// logout:
} catch {
  setDevRefreshToken(userId, null); // ← não invalida nada no DB real
}
```

Se o DB cair momentaneamente em produção, tokens podem ser renovados (ou não invalidados no logout) usando o store in-memory, que não reflete o estado real do banco.

**Ação:** Remover ambos os blocos `catch` fallback. Erro de DB deve propagar.

---

### 🟢 OK — Validação de secrets em startup

**Arquivo:** `apps/backend/src/config/index.ts:141–162`

JWT secrets, ADMIN_PASSWORD e ADMIN_JWT_SECRET já têm validação que faz `throw` fatal em produção se os valores padrão de dev forem usados. Nenhuma ação necessária — já funciona corretamente.

---

## Mobile

### 🟠 ALTO — Arquivos de mock entram no bundle de produção

**Arquivos:**
- `apps/mobile/src/mocks/fakeSocket.ts`
- `apps/mobile/src/mocks/interceptors.ts`
- `apps/mobile/src/mocks/data.ts`

Mesmo que nunca sejam ativados em produção (os caminhos estão corretamente gated por `EXPO_PUBLIC_MOCK_MODE`), os arquivos são incluídos no bundle pelo Metro bundler. Tokens demo (`demo.access.token`, `demo.refresh.token`) e dados de usuário fictício ficam visíveis via reverse engineering do APK/IPA.

**Ação:** Excluir os arquivos via `metro.config.js` em builds de produção:

```js
// metro.config.js
config.resolver.blacklistRE = /src\/mocks\/.*/;
// ou usar blocklist condicional baseado em process.env.NODE_ENV
```

Ou mover toda a pasta `mocks/` para fora do `src/` e importar apenas via `__tests__`.

---

### 🟠 BAIXO — IP hardcoded 192.168.1.1 no fallback de API

**Arquivo:** `apps/mobile/src/services/api.ts:13`

```ts
const getLocalIp = () => {
  return '192.168.1.1'; // Fallback - será substituído pelo env ou detectado
};
```

A função existe mas nunca é chamada (o fallback real usa `localhost:3001`). Não tem impacto funcional, mas polui o bundle e pode confundir futuras manutenções.

**Ação:** Remover a função `getLocalIp()` e substituir o fallback por um `throw` claro:

```ts
if (!envBaseUrl && !__DEV__) {
  throw new Error('EXPO_PUBLIC_API_URL must be set in production builds');
}
```

---

### 🟢 OK — EXPO_PUBLIC_MOCK_MODE (fakeSocket + interceptors)

**Arquivos:** `apps/mobile/src/services/api.ts:35`, `apps/mobile/src/services/socket.ts:24`

```ts
const IS_MOCK = process.env.EXPO_PUBLIC_MOCK_MODE === 'true';
if (IS_MOCK) { installMockInterceptors(api); }

function isMockMode(): boolean {
  return process.env.EXPO_PUBLIC_MOCK_MODE === 'true' || ...
}
```

Corretamente gated por variável de ambiente. Em builds de produção sem a var, o código nunca executa. Nenhuma ação necessária além de garantir que `EXPO_PUBLIC_MOCK_MODE` não esteja no `.env.production`.

---

### 🟢 OK — mockGame URL param e window.__MOCK_GAME__

**Arquivo:** `apps/mobile/src/navigation/index.tsx:162`

```ts
const allowDirect = process.env.NODE_ENV !== 'production';
if (mockGame && allowDirect ...) { ... }
```

Gated por `NODE_ENV !== 'production'`. Em builds de prod, `allowDirect` é `false` e todo o bloco é dead code eliminável pelo bundler. Nenhuma ação necessária.

---

## Variáveis de ambiente — checklist de produção

| Variável | Dev (atual) | Produção (obrigatório) |
|----------|-------------|------------------------|
| `SMS_PROVIDER` | `mock` (default) | `zenvia` ou `twilio` |
| `SMS_API_KEY` | vazio | chave real do provider |
| `SERPRO_API_KEY` | vazio | chave real da Serpro |
| `SERPRO_MOCK_MODE` | `true` | ausente ou `false` |
| `INTEGRITY_MOCK_MODE` | `true` | ausente ou `false` |
| `DEV_AUTH_BYPASS` | `true` | ausente ou `false` |
| `JWT_ACCESS_SECRET` | default fraco | string aleatória ≥ 32 chars |
| `JWT_REFRESH_SECRET` | default fraco | string aleatória ≥ 32 chars |
| `ADMIN_PASSWORD` | `changeme_in_production` | senha forte |
| `ADMIN_JWT_SECRET` | default fraco | string aleatória ≥ 32 chars |
| `REDIS_URL` | vazio (fallback in-memory) | URL do Redis real |
| `EXPO_PUBLIC_MOCK_MODE` | `true` | ausente ou `false` |
| `EXPO_PUBLIC_MOCK_GAME` | `true` | ausente ou `false` |
| `EXPO_PUBLIC_API_URL` | URL local | URL da API de produção |
| `EXPO_PUBLIC_SOCKET_URL` | URL local | URL do socket de produção |

---

## Arquivos que devem ser deletados ou excluídos do bundle de prod

| Arquivo | Motivo |
|---------|--------|
| `apps/backend/src/services/dev-user.store.ts` | Store in-memory de usuários fake — sem uso em prod |
| `apps/mobile/src/mocks/fakeSocket.ts` | Motor de jogo fake com bots — entra no bundle |
| `apps/mobile/src/mocks/interceptors.ts` | Interceptors que retornam dados mockados |
| `apps/mobile/src/mocks/data.ts` | Tokens demo e dados de usuário fictício |

Os arquivos de `__tests__/` e `__mocks__/` são excluídos automaticamente pelo Jest e não entram no bundle de produção — não precisam de ação.
