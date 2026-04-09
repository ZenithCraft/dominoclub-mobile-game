# Roteiro de Vídeo — Telas do App Mobile

> **Duração estimada:** 3–4 minutos
> **Já gravado:** painel admin completo

---

## Preparação (não gravar)

1. No terminal, iniciar o app:
   ```
   cd C:\laragon\www\dominoclub-mobile-game\apps\mobile
   npx expo start --web
   ```
2. Quando aparecer o QR code/menu, pressionar **W** para abrir no browser
3. Aguardar o app carregar em `http://localhost:8081`
4. O app já faz login automático (sem precisar digitar nada)

---

## CENA 1 — Splash + Home (20 s)

**Mostrar:** app abrindo → tela de splash com as pedras animadas → tela Home

> "O app abre direto na tela principal — sem precisar logar. Aqui o jogador vê o saldo, as opções de jogo e o acesso à carteira."

**Navegar pela Home:** mostrar os cards de modo de jogo, saldo no topo.

---

## CENA 2 — Lobby: prêmios corretos [M5] (30 s)

**Mostrar:** tocar em **Jogar** ou **Arena 1v1** → tela de seleção de salas

**Apontar os valores:**
- Entrada **R$10** → Prêmio **R$18**
- Entrada **R$25** → Prêmio **R$45**
- Entrada **R$50** → Prêmio **R$90**

> "Os prêmios do lobby agora refletem exatamente os 10% de rake do servidor. Antes mostravam R$19 — o jogador entrava esperando um valor e recebia outro."

---

## CENA 3 — Matchmaking [M3] (40 s)

**Mostrar:**
1. Selecionar a sala **Gratuita** (ou R$10)
2. Tela de "Procurando partida..." com animação
3. Aguardar o match ser encontrado

**Enquanto aguarda**, abrir outro terminal e rodar:
```
cd C:\laragon\www\dominoclub-mobile-game\apps\backend
npm run test:multiplayer
```
Isso força um segundo jogador na fila — o app vai receber o `game:found` e entrar no jogo.

> "O matchmaking une jogadores com a mesma variante e faixa de aposta em milissegundos via Socket.io."

---

## CENA 4 — Jogo em andamento [M3] (1 min)

**Mostrar:**
1. Tela do tabuleiro com as pedras já distribuídas
2. A mão do jogador na parte inferior
3. Tocar em uma pedra para jogá-la
4. Tabuleiro atualizar em tempo real

> "O tabuleiro sincroniza em tempo real — cada jogada é transmitida via Socket.io para o oponente sem delay perceptível."

**Deixar a partida rodar por alguns segundos** mostrando as pedras sendo jogadas.

---

## CENA 5 — Histórico (20 s)

**Mostrar:** voltar para Home → tocar em **Histórico** → lista de partidas com resultado (vitória/derrota, prêmio)

> "O histórico registra todas as partidas com resultado e prêmio recebido."

---

## O que cada milestone aparece aqui

| Cena | Milestone | O que demonstra |
|------|-----------|-----------------|
| 1 | — | App funcionando end-to-end |
| 2 | **M5** | Correção dos prêmios no lobby (era 5%, agora 10% de rake) |
| 3 | **M3** | Fila de matchmaking + variante de jogo |
| 4 | **M3** | Estado sincronizado via Socket.io em tempo real |
| 5 | — | Persistência das partidas |

> **M4 (antifraude)** não tem tela visível no app — GPS, Play Integrity e bot score rodam em background. Foi demonstrado no painel admin (já gravado).
