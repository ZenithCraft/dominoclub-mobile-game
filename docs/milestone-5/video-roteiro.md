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

## CENA 3 — Matchmaking e regras de fila (45 s)

**Mostrar:**
1. Selecionar uma sala **Gratuita**
2. Tela de "Procurando partida..." (animação)
3. Aguardar o match ser encontrado

**Narrar pontos importantes:**
- "Bots só existem na mesa gratuita."
- "Em jogos pagos, o pareamento exige a mesma aposta (sem tolerância)."

**Enquanto aguarda**, abrir outro terminal e rodar:
```
cd C:\laragon\www\dominoclub-mobile-game\apps\backend
npm run test:multiplayer
```
Isso força um segundo jogador na fila — o app vai receber o `game:found` e entrar no jogo.

> "O matchmaking une jogadores com a mesma variante e o mesmo valor de aposta em milissegundos via Socket.io."

---

## CENA 4 — Jogo em andamento: visual + motion + regras (1 min 20 s)

**Mostrar:**
1. Tela do tabuleiro com as pedras já distribuídas
2. **Textura de feltro** na mesa (não é mais cor chapada)
3. A mão do jogador na parte inferior
4. **Arrastar e soltar** uma pedra (long press → drag → drop)
5. Mostrar as **zonas laterais** (esquerda/direita) como área de drop
6. Mostrar um exemplo de **carroça em pé** (dobrada vertical)
7. Mostrar o **timer 15s** e (se possível) deixar estourar para ver **jogada automática**

**Narrar regras:**
- "A primeira jogada é obrigatoriamente a maior carroça disponível (6-6, depois 5-5...). Se ninguém tiver carroça, começa com a maior pedra (6-5...)."
- "Tempo por jogada: 15 segundos. Se não jogar, o servidor faz uma jogada automática."
- "A partida termina ao atingir **6 pontos**."

> "O tabuleiro sincroniza em tempo real — cada jogada é transmitida via Socket.io para o oponente sem delay perceptível."

**Deixar a partida rodar por alguns segundos** mostrando as pedras sendo jogadas.

---

## CENA 5 — Histórico + alerta de conluio (30 s)

**Mostrar:** voltar para Home → tocar em **Histórico** → lista de partidas

**Apontar:**
- Lista com apostas e prêmios
- Seção de **confrontos 1v1 pagos** (vitórias/jogos/% por oponente)
- Explicar que win-rate muito alto com o mesmo oponente pode gerar **alerta** e o sistema evita parear os dois novamente

> "O histórico registra todas as partidas com resultado e prêmio recebido."

---

## CENA 6 — Admin (rápido, se precisar regravar) (40 s)

**Mostrar (se ainda não foi gravado ou se quiser atualizar):**
1. Admin → **Torneios** → botão **Ver** para visualizar inscritos e partidas
2. Admin → botão **Cancelar** como botão de emergência (reembolso dos ativos + cancelamento das partidas)
3. Admin → aba **Bônus** → criar um cupom (valor, limite, rollover) e mostrar a lista

> "O painel permite gerenciar torneios, cancelar em emergência com reembolso e criar cupons de bônus com rollover."

---

## O que cada milestone aparece aqui

| Cena | Milestone | O que demonstra |
|------|-----------|-----------------|
| 1 | — | App funcionando end-to-end |
| 2 | **M5** | Correção dos prêmios no lobby (era 5%, agora 10% de rake) |
| 3 | **M3** | Fila de matchmaking + regras (bots só grátis, aposta igual) |
| 4 | **M3** | Jogo ao vivo + sincronização Socket.io + UX (drag/drop, timer 15s, jogada automática) |
| 5 | — | Histórico + alerta de conluio |
| 6 | **M5** | Admin: torneios (ver bracket/cancelar) + bônus/cupom |

> **M4 (antifraude)** não tem tela visível no app — GPS, Play Integrity e bot score rodam em background. Foi demonstrado no painel admin (já gravado).
