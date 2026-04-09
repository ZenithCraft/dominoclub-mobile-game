# Roteiro de Vídeo — Telas do Jogo

> **Já gravado:** painel admin completo
> **O que falta gravar:** telas do app mobile

---

## Preparação (não gravar)

Abrir um terminal e rodar:
```bash
cd c:/laragon/www/dominoclub-mobile-game
npm run mobile
```
Aguardar "Metro Bundler ready" e abrir `http://localhost:8081` no browser.

---

## CENA 1 — Login (20 s)

**Mostrar:** tela de login → digitar telefone → tela de OTP → entrar

> "Login via telefone com código OTP."

---

## CENA 2 — Lobby: seleção de sala (30 s)

**Mostrar:** tela de seleção de modo → entrar em **Arena 1v1**

**Apontar os valores de prêmio:**
- Entrada R$10 → Prêmio **R$18**
- Entrada R$25 → Prêmio **R$45**
- Entrada R$50 → Prêmio **R$90**

> "Os prêmios já descontam os 10% de rake do servidor — R$10 de entrada em 1v1 dá R$18 ao vencedor."

---

## CENA 3 — Matchmaking: entrar na fila (30 s)

**Mostrar:** selecionar sala gratuita → tela de "Procurando partida…" → animação de busca

> "O jogador entra na fila e o servidor busca um oponente com aposta compatível."

---

## CENA 4 — Partida encontrada e jogo em andamento (1 min)

**Mostrar:**
1. Notificação / transição "Partida encontrada!"
2. Tela do jogo com o tabuleiro de dominó
3. Mão do jogador com as pedras
4. Jogar uma ou duas peças

> "Quando os dois jogadores estão na fila, o matchmaking os une no mesmo jogo em milissegundos. O tabuleiro atualiza em tempo real via Socket.io."

---

## CENA 5 — Carteira (20 s)

**Mostrar:** aba Carteira → saldo atual → botão Depositar / Sacar

> "A carteira mostra saldo em tempo real e permite depósito via PIX e saque com validação CPF."

---

## CENA 6 — Torneios (20 s)

**Mostrar:** aba Torneios → torneio aberto "Torneio Semanal — Carroça" → tela de detalhes (prize pool, vagas)

> "O sistema de torneios permite inscrição e acompanhamento do bracket em tempo real."

---

## Dica de gravação

Para mostrar a **Cena 4** com partida real funcionando, abra dois abas do browser em `http://localhost:8081` com usuários diferentes, ou use o script no terminal em segundo plano:

```bash
cd apps/backend && npm run test:multiplayer
```

Isso força a criação de uma partida — se o app estiver na tela de espera, ele vai receber o `game:found` e entrar no jogo automaticamente.
