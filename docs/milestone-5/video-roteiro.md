# Roteiro de Vídeo — Milestones 3, 4 e 5

> **Duração estimada:** 8–12 minutos
> **Formato:** Screen recording com narração
> **Layout de tela:** Terminal + Browser lado a lado

---

## Preparação do ambiente (fazer ANTES de gravar)

### 0. Iniciar Docker Desktop

Abrir o **Docker Desktop** e aguardar o status ficar verde ("Engine running") antes de continuar.

### 1. Abrir 3 janelas de terminal

```
Terminal A  — infra + backend
Terminal B  — admin dashboard (Next.js)
Terminal C  — comandos (curl, scripts, logs)
```

### 2. Terminal A — subir banco de dados e Redis, depois o backend

```bash
cd c:/laragon/www/dominoclub-mobile-game

# Subir Postgres + Redis via Docker
docker compose up -d postgres redis

# Aguardar "healthy" (≈ 10s) e rodar migrações
docker compose exec postgres pg_isready -U dominoclub
cd apps/backend && npx prisma migrate deploy

# Iniciar o servidor em modo dev (hot reload)
cd c:/laragon/www/dominoclub-mobile-game
npm run backend
# Aguardar: "DominoClub backend running on port 3001"
```

### 3. Terminal B — iniciar o admin

```bash
cd c:/laragon/www/dominoclub-mobile-game
npm run admin
# Aguardar: "Ready on http://localhost:3000"
```

### 4. Terminal A — seed (se banco estiver vazio)

```bash
cd apps/backend && npm run db:seed 2>/dev/null || echo "seed opcional"
```

### 5. Abrir browser

- Aba 1: `http://localhost:3000/login` → login: `admin` / `changeme_in_production`
- Aba 2: `http://localhost:8081` (ou `http://localhost:19006`) → mobile em modo web

### 6. Deixar pré-aberto no Terminal C

```bash
cd c:/laragon/www/dominoclub-mobile-game/apps/backend

# Obter token admin e guardar na variável TOKEN
TOKEN=$(curl -s -X POST http://localhost:3001/api/v1/admin/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"changeme_in_production"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
echo "Token: ${TOKEN:0:40}..."
```

---

## CENA 1 — Abertura (30 s)

**Na tela:** Editor de código mostrando a estrutura de pastas (`docs/milestone-3`, `docs/milestone-4`, `docs/milestone-5`)

**Narração:**
> "Neste vídeo vou mostrar as entregas das milestones 3, 4 e 5 do DominoClub.
> A milestone 3 focou em matchmaking e estabilidade.
> A 4 adicionou a camada de segurança e antifraude.
> E a 5 fechou com configuração dinâmica de rake, painel de fraudes e deploy em produção."

---

## CENA 2 — Milestone 3: Matchmaking com variante (1 min)

### O que mostrar

**Terminal C** — rodar o script de integração multiplayer:

```bash
npm run test:multiplayer
```

**Aguardar a saída:**
```
[P1] Conectado
[P2] Conectado
[P1] Na fila... variante: CARROCA
[P2] Na fila... variante: CARROCA
[P1] Partida encontrada: gameId = abc123...
[P2] Partida encontrada: gameId = abc123...  ← mesmo ID
...
══════════════ RESULT ══════════════
  Status:      FINISHED
  WinnerTeam:  1
  MatchScores: {"1":7,"2":3}
  PrizePool:   R$ 0
════════════════════════════════════
```

**Narração:**
> "O script `test-multiplayer` abre duas conexões Socket.io simultâneas, coloca os dois jogadores na fila, e verifica que eles caíram no **mesmo** `gameId` — garantindo que o matchmaking está funcionando.
> Os dois jogam automaticamente até o fim da partida."

**Destacar no terminal:**
- As duas linhas `game:found` com o mesmo gameId
- O bloco `RESULT` ao final

---

## CENA 3 — Milestone 3: Match logs (45 s)

**Terminal C:**

```bash
# Ver os últimos eventos de match no log estruturado
tail -5 logs/matches.log | npx --yes json
```

> Se `json` não estiver instalado, usar:
```bash
tail -5 logs/matches.log
```

**Esperado na saída:**
```json
{ "event": "match_start", "matchId": "...", "variant": "CARROCA", "betAmount": 0, "players": [...] }
{ "event": "round_end",   "matchId": "...", "round": 1, "winnerTeam": 1, "points": 2 }
{ "event": "match_end",   "matchId": "...", "status": "FINISHED", "prizePool": 0, "rounds": 4, "totalMoves": 62 }
```

**Narração:**
> "Cada partida gera 3 eventos no `logs/matches.log`: início, fim de rodada e fim de partida — todos em JSON estruturado. Isso permite auditoria financeira e análise de gameplay sem precisar consultar o banco."

---

## CENA 4 — Milestone 3: Estado sincronizado com `seq` (30 s)

**Terminal C:**

```bash
# Mostrar que o campo seq está presente nos eventos de estado
grep '"seq"' logs/matches.log | head -3
```

**Narração:**
> "Todo evento `game:state` carrega um número de sequência `seq`. O cliente descarta qualquer evento cujo `seq` seja menor ou igual ao último recebido — isso elimina estados duplicados após reconexões."

---

## CENA 5 — Milestone 4: Antifraude — bot score (1 min)

**Browser** → Admin Dashboard → aba **Usuários**

**Narração:**
> "A milestone 4 adicionou a camada de segurança. No painel de usuários podemos ver a coluna **Fraude** com a contagem de registros para cada jogador."

**O que apontar:**
- Coluna "Fraude" com o badge vermelho contando logs
- Coluna "Status" (Ativo / Banido)

**Terminal C** — mostrar como o bot score funciona:

```bash
curl -s -X POST http://localhost:3001/api/v1/admin/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"changeme_in_production"}' | grep -o '"token":"[^"]*"'
```

```bash
# Guardar o token (substituir TOKEN pelo valor)
TOKEN="cole_o_token_aqui"

# Ver usuários com bot_score > 0
curl -s "http://localhost:3001/api/v1/admin/users" \
  -H "Authorization: Bearer $TOKEN" | \
  python3 -c "import sys,json; users=json.load(sys.stdin)['users']; [print(u['name'], u.get('bot_score',0)) for u in users]"
```

**Narração:**
> "O `bot_score` é uma média exponencial de 0 a 1. Jogadores com mais de 50% dos movimentos feitos em menos de 800ms acumulam score — após 3 partidas suspeitas consecutivas ele passa de 0.65 e um registro de fraude é criado automaticamente."

---

## CENA 6 — Milestone 4: Validação de GPS (45 s)

**Terminal C:**

```bash
# Tentar entrar na fila com coordenadas fora do Brasil (Argentina)
# Precisa de um token de usuário normal — usar dev login
USER_TOKEN=$(curl -s -X POST http://localhost:3001/api/v1/auth/dev/login \
  -H "Content-Type: application/json" \
  -d '{}' | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)

echo "Token: $USER_TOKEN"
```

**Narração:**
> "Para jogos pagos, o servidor valida as coordenadas GPS do jogador. Coordenadas fora do bounding box do Brasil retornam `queue:error: Localização fora do Brasil`. Isso é enviado pelo app antes de emitir o evento `queue:join`."

*(Alternativamente, mostrar o código em `apps/backend/src/middleware/antifraud.middleware.ts` onde `validateGpsBounds` é chamada)*

---

## CENA 7 — Milestone 5: Painel de Fraudes (1 min)

**Browser** → Admin Dashboard → aba **Fraudes** (ícone de escudo)

**Narração:**
> "A milestone 5 adicionou o visualizador de fraudes ao admin. Aqui vemos todos os registros gerados pelo sistema de antifraude — bot pattern, multi-conta, conluio por proximidade GPS."

**O que mostrar:**
1. Filtro de tipo → selecionar **Padrão de bot** → tabela filtra
2. Filtro de status → **Pendentes** (padrão) e **Resolvidos**
3. Clicar **Resolver** em um registro → ele desaparece da lista
4. Mudar para **Resolvidos** → registro aparece com badge verde

---

## CENA 8 — Milestone 5: Configuração dinâmica de rake (1 min 30 s)

**Browser** → Admin Dashboard → aba **Configurações** (ícone de sliders)

**Narração:**
> "Antes da milestone 5, o house edge era fixado na variável de ambiente `HOUSE_EDGE_PERCENT` e precisava de restart para mudar. Agora é editável em tempo real pelo admin."

**O que fazer:**
1. Mostrar os 5 campos com valores atuais (House Edge 10%, etc.)
2. Alterar **House Edge** de `10` para `8`
3. Clicar **Salvar configurações**
4. Banner "Salvo com sucesso!" aparece

**Terminal C** — confirmar que a mudança chegou ao banco:

```bash
curl -s "http://localhost:3001/api/v1/admin/config" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

**Esperado:**
```json
{
  "houseEdgePercent": 8,
  "matchmakingBetTolerance": 0.1,
  "botInjectWaitSeconds": 30,
  ...
}
```

**Narração:**
> "A mudança propaga em até 60 segundos — que é o TTL do cache em memória. A próxima partida criada já vai usar 8% de house edge."

**Mostrar o efeito na próxima partida:**

```bash
# Rodar o script de teste novamente
npm run test:multiplayer

# Depois checar o prize_pool no log
tail -1 logs/matches.log
# prize_pool deve ser 0 (aposta gratuita), mas house_fee = 0%
```

**Restaurar para 10%** no admin antes de continuar.

---

## CENA 9 — Milestone 5: Correção dos prêmios no lobby (45 s)

**Browser** → Mobile app (aba 2) → tela de seleção de modo

**Narração:**
> "Encontramos um bug: o lobby exibia prêmios calculados com 5% de house edge enquanto o servidor usava 10%. Para uma aposta de R$10 em 1v1, o app mostrava R$19 mas o jogador recebia R$18."

**O que mostrar:**
- Entrar na tela de seleção de salas
- Sala 1v1 de R$10 → prêmio exibido: **R$18** ✓
- Sala 1v1 de R$25 → prêmio exibido: **R$45** ✓
- Sala 1v1 de R$50 → prêmio exibido: **R$90** ✓

**Mostrar no código** (`apps/mobile/src/screens/ModeSelectScreen.tsx`):
```typescript
const HOUSE_EDGE = 0.10;
function prize1v1(buyIn: number) { return buyIn * 2 * (1 - HOUSE_EDGE); }
```

**Narração:**
> "Agora o cálculo está centralizado em uma constante `HOUSE_EDGE` que espelha o padrão do servidor. Se o admin mudar para 8% no painel, basta atualizar essa constante — sem procurar valores mágicos espalhados."

---

## CENA 10 — Milestone 5: Deploy em produção (1 min)

**Terminal C** — mostrar o deploy.sh com validação de segredos:

```bash
cd c:/laragon/www/dominoclub-mobile-game

# Simular deploy com segredo fraco — deve falhar
JWT_ACCESS_SECRET=dev_access_secret_min_32_chars_here \
ADMIN_PASSWORD=changeme_in_production \
bash deploy.sh
```

**Saída esperada:**
```
[deploy] Validando ambiente…
[deploy] JWT_ACCESS_SECRET is still the default dev value — set a strong secret before deploying.
```

**Narração:**
> "O script `deploy.sh` rejeita explicitamente os valores padrão do `.env.example`. Isso evita o erro clássico de subir pra produção com segredos de desenvolvimento."

**Mostrar o nginx.conf no editor:**

```bash
# Abrir no editor ou mostrar no terminal
head -50 nginx/nginx.conf
```

**Destacar:**
- Bloco de rate limiting (5 req/min no `/auth/`)
- WebSocket upgrade headers
- Comentário de IP allowlist para o admin

**Narração:**
> "O nginx está configurado com rate limiting por zona — 5 requests por minuto nos endpoints de autenticação para dificultar brute force, e upgrade de WebSocket para o Socket.io. O bloco de IP allowlist para o admin está lá, só precisa descomentar e preencher o CIDR da VPN."

---

## CENA 11 — Encerramento (30 s)

**Na tela:** Mostrar a estrutura `docs/milestone-5/` no editor (README, implementation, tests)

**Narração:**
> "Toda a documentação técnica está em `docs/milestone-5/`: o README com o resumo das entregas, o `implementation.md` com as decisões de arquitetura e referências de código, e o `tests.md` com os scripts de verificação manual e os gaps conhecidos para próximas iterações."
>
> "As três milestones fecham o ciclo de: matchmaking robusto, segurança e antifraude, e operações de produção. O jogo está pronto para deploy."

---

## Checklist pré-gravação

- [ ] Backend rodando em `localhost:3001` (Terminal A)
- [ ] Admin rodando em `localhost:3000` (Terminal B)
- [ ] Login no admin feito (token salvo para os curls)
- [ ] `logs/matches.log` tem pelo menos 3 eventos (rodar `npm run test:multiplayer` uma vez antes)
- [ ] Browser com admin aberto na aba Visão Geral
- [ ] Mobile aberto na aba do browser
- [ ] Font size do terminal aumentado (≥ 14px) para facilitar leitura no vídeo
- [ ] Notificações do sistema desativadas
- [ ] Zoom do browser em 110%

---

## Comandos de referência rápida

```bash
# Iniciar tudo
npm run backend    # Terminal A
npm run admin      # Terminal B

# Token admin
TOKEN=$(curl -s -X POST http://localhost:3001/api/v1/admin/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"changeme_in_production"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

# Config atual
curl -s http://localhost:3001/api/v1/admin/config -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

# Fraud logs
curl -s "http://localhost:3001/api/v1/admin/fraud-logs?resolved=false" -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

# Match logs (últimos 3 eventos)
tail -3 apps/backend/logs/matches.log

# Rodar jogo completo entre 2 jogadores
cd apps/backend && npm run test:multiplayer
```
