# Bypasses & Mocks — Checklist de Remoção antes de Produção

Levantamento de todos os atalhos de desenvolvimento (bypasses, mocks, fallbacks in-memory) que existem no projeto e devem ser removidos ou configurados corretamente antes do deploy em produção.

Data do levantamento: 2026-06-25
Última revisão: 2026-07-13 — itens abaixo corrigidos no código; ver nota final sobre o que ainda depende de configuração do servidor/build.

---

## Legenda de risco

| Nível | Critério |
|-------|---------|
| 🔴 CRÍTICO | Pode vazar para produção mesmo sem querer — rota exposta, fallback silencioso, default perigoso |
| 🟠 ALTO | Controlado por variável de ambiente, mas se a var for omitida no deploy a brecha abre |
| 🟢 OK | Corretamente gated por `NODE_ENV` ou env var — não requer ação antes de prod |
| ✅ RESOLVIDO | Corrigido no código nesta revisão |

---

## Backend

### ✅ RESOLVIDO — POST /auth/dev/login registrado incondicionalmente

**Arquivo:** `apps/backend/src/routes/auth.routes.ts`

A rota agora só é registrada quando `config.env !== 'production'`. Em produção o endpoint não existe (404), independentemente de proxy/IP.

---

### ✅ RESOLVIDO — devLogin() cria usuário in-memory quando o DB falha

**Arquivo:** `apps/backend/src/services/auth.service.ts`

Removido o `catch` de fallback. Falha de DB agora propaga como erro real. `dev-user.store.ts` (agora órfão) foi deletado.

---

### ✅ RESOLVIDO — authMiddleware aprova JWT sem verificar ban quando DB falha

**Arquivo:** `apps/backend/src/middleware/auth.middleware.ts`

Removido o fallback. Falha na consulta ao usuário sempre retorna 401, em qualquer ambiente.

**Achado adicional (não estava neste documento):** o mesmo padrão existia em mais dois lugares e foi corrigido junto:
- `apps/backend/src/socket/index.ts` (middleware de auth do Socket.io) — pior ainda: a condição original (`!config.devAuthBypass && config.env === 'production'`) permitia o bypass mesmo em produção se `DEV_AUTH_BYPASS=true` estivesse ativo.
- `apps/backend/src/controllers/auth.controller.ts` (`getMeHandler`) — mesmo padrão.

---

### ✅ RESOLVIDO — ensureDevWalletBalance adiciona R$1.000 em qualquer env não-production

**Arquivo:** `apps/backend/src/services/auth.service.ts`

Condição invertida para `if (process.env.NODE_ENV !== 'development') return;` — agora só roda em dev local.

---

### 🟠 AÇÃO NECESSÁRIA (config, não código) — SMS_PROVIDER default é 'mock'

**Arquivo:** `apps/backend/src/config/index.ts`

O default `'mock'` continua existindo (conveniência para dev local), mas agora há uma **checagem fatal de startup**: se `NODE_ENV=production` e `SMS_PROVIDER` for `mock` (ou as credenciais do provider escolhido estiverem incompletas), o servidor **recusa iniciar** com um erro claro. Isso vale também para os itens abaixo (SERPRO_MOCK_MODE, INTEGRITY_MOCK_MODE, DEV_AUTH_BYPASS, PIX_MOCK_AUTO_CONFIRM — ver novo achado).

Isso não substitui configurar o provider real (Zenvia/Twilio) com uma chave de API válida — só garante que o servidor não vai subir "quebrado silenciosamente" se isso for esquecido.

---

### 🔴 NOVO ACHADO CRÍTICO — PIX_MOCK_AUTO_CONFIRM não passava pela validação de config

**Arquivo:** `apps/backend/src/services/pix.service.ts`

Não estava neste documento. Lido diretamente de `process.env.PIX_MOCK_AUTO_CONFIRM` (não via `config`), confirmava depósitos PIX automaticamente 3s após a criação **sem checar `NODE_ENV`** — ou seja, se essa var vazasse para produção, qualquer depósito seria creditado como saldo real sem nenhum pagamento de fato ocorrer. É o bypass de maior risco financeiro do projeto.

**Corrigido:** movido para `config.pix.mockAutoConfirm`, incluído na checagem fatal de startup em produção, e adicionado um guard redundante (`config.env !== 'production'`) direto no ponto de uso.

---

### 🟠 ALTO — OTP store agora usa Redis quando disponível

**Arquivo:** `apps/backend/src/services/otp.service.ts`

Migrado para o mesmo padrão do `nonce.service.ts`: usa Redis quando `REDIS_URL` está configurado (sobrevive a restart e funciona com múltiplas instâncias atrás de load balancer); cai para um Map in-memory só quando Redis não está disponível (modo single-server). `verifyOtp`/`sendOtp` passaram a ser assíncronos — call sites e testes atualizados.

---

### 🟠 ALTO — SERPRO_MOCK_MODE aceita qualquer CPF sem chamada à API real

Sem mudança de código (já era corretamente gated). Agora coberto pela checagem fatal de startup em produção — ver acima.

---

### 🟠 ALTO — INTEGRITY_MOCK_MODE bypassa Play Integrity e App Attest

Sem mudança de código (já era corretamente gated). Agora coberto pela checagem fatal de startup em produção — ver acima.

---

### ✅ RESOLVIDO — refreshTokens e logout com fallback in-memory

**Arquivo:** `apps/backend/src/services/auth.service.ts`

Removidos ambos os blocos `catch`. Havia um problema mais sério do que o descrito originalmente: o `catch` de `refreshTokens` capturava **qualquer** erro dentro do bloco `try`, incluindo rejeições legítimas de segurança (`Invalid refresh token`, `Account suspended`) — ou seja, um token roubado/reaproveitado ou uma conta banida podia cair no fallback in-memory e ainda assim renovar a sessão. Removido por completo.

---

### 🟢 OK — Validação de secrets em startup

Sem mudança — já funcionava corretamente.

---

## Mobile

### 🔴 NOVO ACHADO CRÍTICO — EXPO_PUBLIC_DEV_AUTH_BYPASS / FORCE_DEV_LOGIN ativos no perfil "production" do EAS

**Arquivo:** `apps/mobile/eas.json`

Não estava neste documento e é muito provavelmente **a causa direta do cliente não conseguir registrar/logar**: o perfil `production` (o build que o cliente está testando) tinha `EXPO_PUBLIC_DEV_AUTH_BYPASS=true` e `EXPO_PUBLIC_FORCE_DEV_LOGIN=true`.

Com isso ativo:
- `LoginScreen.tsx`: ao apertar "Entrar", chama `POST /auth/dev/login` em vez do fluxo real (`/auth/otp/send` → OTP → `/auth/otp/verify`). Nenhuma tela de registro real é alcançada.
- `SplashScreen.tsx` / `auth.store.ts`: tenta logar automaticamente como "Dev User" / "Super Admin" assim que o app abre.

Antes desta revisão, o backend não bloqueava `/auth/dev/login` de forma confiável em produção — então esse auto-login podia até "funcionar" (logando como um usuário fake), ou falhar silenciosamente e mostrar um erro genérico, dependendo da configuração exata do servidor. De qualquer forma, o fluxo real de cadastro nunca era alcançado.

**Corrigido:** as duas variáveis foram removidas dos perfis `preview` e `production` do `eas.json`.

**⚠️ Ação necessária que só você pode fazer:** essas variáveis são inseridas no bundle JS **no momento do build** (EAS), não em runtime. A correção no `eas.json` só terá efeito a partir do **próximo build** (`eas build --profile production`). O app que o cliente já tem instalado continua com o bypass ativo até que um novo build seja gerado e instalado.

---

### 🟠 ALTO — Arquivos de mock entram no bundle de produção

**Arquivos:** `apps/mobile/src/mocks/{fakeSocket,interceptors,data}.ts`

**Corrigido:** `metro.config.js` agora redireciona qualquer `require()` que resolva para `src/mocks/*` para um módulo vazio quando `EAS_BUILD_PROFILE=production` (ou `NODE_ENV=production`). Os pontos de uso (`api.ts`, `socket.ts`) já eram gated por `EXPO_PUBLIC_MOCK_MODE` em runtime, então o comportamento não muda — só para de existir fisicamente no bundle de produção.

---

### ✅ JÁ RESOLVIDO (antes desta revisão) — IP hardcoded 192.168.1.1 no fallback de API

**Arquivo:** `apps/mobile/src/services/api.ts`

A função `getLocalIp()` descrita neste item não existe mais no arquivo — já foi removida em uma revisão anterior. Nenhuma ação necessária.

---

### 🟢 OK — EXPO_PUBLIC_MOCK_MODE (fakeSocket + interceptors)

Sem mudanças — já corretamente gated. Confirmado ausente/`false` nos perfis `preview` e `production` do `eas.json`.

---

### 🟢 OK — mockGame URL param e window.__MOCK_GAME__

Sem mudanças — já corretamente gated por `NODE_ENV !== 'production'`.

---

## Variáveis de ambiente — checklist de produção

| Variável | Dev (atual) | Produção (obrigatório) | Validado no boot? |
|----------|-------------|------------------------|---------------------|
| `SMS_PROVIDER` | `mock` (default) | `zenvia` ou `twilio` | ✅ sim (fatal) |
| `SMS_API_KEY` | vazio | chave real do provider | ✅ sim, se provider=zenvia (fatal) |
| `TWILIO_ACCOUNT_SID/AUTH_TOKEN/FROM_NUMBER` | vazio | credenciais reais | ✅ sim, se provider=twilio (fatal) |
| `SERPRO_API_KEY` | vazio | chave real da Serpro | ⚠️ não validado (só o mock mode é) |
| `SERPRO_MOCK_MODE` | `true` | ausente ou `false` | ✅ sim (fatal) |
| `INTEGRITY_MOCK_MODE` | `true` | ausente ou `false` | ✅ sim (fatal) |
| `PIX_MOCK_AUTO_CONFIRM` | `true` | ausente ou `false` | ✅ sim (fatal) — novo |
| `DEV_AUTH_BYPASS` | `true` | ausente ou `false` | ✅ sim (fatal) |
| `JWT_ACCESS_SECRET` | default fraco | string aleatória ≥ 32 chars | ✅ sim (fatal) |
| `JWT_REFRESH_SECRET` | default fraco | string aleatória ≥ 32 chars | ✅ sim (fatal) |
| `ADMIN_PASSWORD` | `changeme_in_production` | senha forte | ✅ sim (fatal) |
| `ADMIN_JWT_SECRET` | default fraco | string aleatória ≥ 32 chars | ✅ sim (fatal) |
| `REDIS_URL` | vazio (fallback in-memory) | URL do Redis real | ⚠️ não validado — recomendado para OTP/nonce em múltiplas instâncias |
| `EXPO_PUBLIC_MOCK_MODE` | `true` | ausente ou `false` | n/a (build-time) |
| `EXPO_PUBLIC_MOCK_GAME` | `true` | ausente ou `false` | n/a (build-time) |
| `EXPO_PUBLIC_DEV_AUTH_BYPASS` | — | **removido dos perfis preview/production do eas.json** | n/a (build-time) |
| `EXPO_PUBLIC_FORCE_DEV_LOGIN` | — | **removido dos perfis preview/production do eas.json** | n/a (build-time) |
| `EXPO_PUBLIC_API_URL` | URL local | URL da API de produção | n/a |
| `EXPO_PUBLIC_SOCKET_URL` | URL local | URL do socket de produção | n/a |

**Importante sobre `docker-compose.yml`:** o serviço `backend` carrega `env_file: ./apps/backend/.env` (o arquivo de dev local), não `.env.production` (que é só um template com `${VAR}` — docker compose não expande esses placeholders ao ler um `env_file`, então usá-lo diretamente faria todo secret virar a string literal do placeholder). Isso significa que o arquivo `.env` real usado no deploy do servidor **precisa ser um arquivo separado, preenchido com valores de produção, mantido fora do git** — se o servidor em `34.233.108.8` está de fato usando uma cópia do `.env` de desenvolvimento deste repositório, a checagem fatal de startup adicionada nesta revisão vai impedir o servidor de subir até isso ser corrigido (em vez de rodar silenciosamente em modo mock).

---

## Arquivos que devem ser deletados ou excluídos do bundle de prod

| Arquivo | Motivo | Status |
|---------|--------|--------|
| ~~`apps/backend/src/services/dev-user.store.ts`~~ | Store in-memory de usuários fake — sem uso em prod | ✅ Deletado |
| `apps/mobile/src/mocks/fakeSocket.ts` | Motor de jogo fake com bots — entra no bundle | ✅ Excluído do bundle de produção via metro.config.js |
| `apps/mobile/src/mocks/interceptors.ts` | Interceptors que retornam dados mockados | ✅ Excluído do bundle de produção via metro.config.js |
| `apps/mobile/src/mocks/data.ts` | Tokens demo e dados de usuário fictício | ✅ Excluído do bundle de produção via metro.config.js |

Os arquivos de `__tests__/` e `__mocks__/` são excluídos automaticamente pelo Jest e não entram no bundle de produção — não precisam de ação.
