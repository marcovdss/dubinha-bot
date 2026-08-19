# Dubinha Bot (Jinchi AI)

Bot pro Discord feito pra imitar a persona, gírias e piadas internas do **Jinchi (Dubinha)** usando a API do Gemini. Ele entra na resenha do chat, reage a fotos/vídeos, lembra de histórias do pessoal e ainda toca música nos canais de voz.

---

## O que ele faz

- **Conversa no chat:** Responde menções, replies ou se intromete nas conversas usando as gírias do Jinchi (*"meu vei"*, *"caba"*, *"é macaxeira vei"*, etc.), mandando mensagens curtas picadas como uma pessoa de verdade.
- **Reage a fotos e vídeos:** Olha os prints, memes e clipes postados no canal e comenta sobre eles em vez de ficar descrevendo a imagem como um robô.
- **Memória e aprendizado:** Guarda fatos sobre o pessoal do servidor e aprende novas mensagens do Jinchi original em tempo real.
- **Toca música no voice:** Suporta YouTube e links diretos usando comandos simples (`/cantar`, `/parar`, `/pular`, `/fila`).
- **Resenha e comandos:** Comandos como `/pizza` pra cobrar os amigos e `/aprender` pra ensinar novas piadas ou regras pra IA.

---

## Pré-requisitos

- **Node.js** (versão 18 ou superior)
- Uma aplicação/bot criada no [Discord Developer Portal](https://discord.com/developers/applications)
- Uma chave de API do [Google Gemini (Google AI Studio)](https://aistudio.google.com/)

---

## Como rodar

### 1. Instalar dependências
```bash
npm install
```

### 2. Configurar o `.env`
Crie um arquivo `.env` na raiz (você pode copiar o `.env.example`) e preencha suas variáveis:

```env
DISCORD_TOKEN=seu_discord_token_aqui
CLIENT_ID=seu_client_id_aqui
TARGET_CHANNEL_ID=id_do_canal_principal
GEMINI_API_KEY=sua_chave_do_gemini
```

### 3. Registrar os comandos de barra (`/`)
Sempre que adicionar ou alterar comandos slash:
```bash
npm run deploy
```

### 4. Iniciar o bot
Modo desenvolvimento (com auto-reload):
```bash
npm run dev
```

Ou modo normal:
```bash
npm start
```

---

## Comandos principais

| Comando | O que faz |
| --- | --- |
| `/cantar <busca ou link>` | Toca uma música na sala de voz |
| `/pausar` / `/retomar` | Pausa ou continua a música |
| `/pular` | Pula para a próxima da fila |
| `/fila` | Mostra as próximas músicas |
| `/parar` | Para a reprodução e sai da call |
| `/introsa [chance] [cooldown]` | Regula ou exibe a chance do bot se intrometer nas conversas (Modo Introsa) |
| `/pizza <alvo> <sabor> <valor>` | Cobra o PIX da pizza da galera |
| `/aprender <instrução>` | Ensina um fato, memória ou regra nova pro bot |
| `/ping` | Mostra a latência do bot |

---

## Organização do código

```
dubinha-bot/
├── data/              # Memória de longo prazo e mensagens salvas
├── src/
│   ├── commands/      # Comandos de barra (slash commands)
│   ├── config/        # Persona, vocabulário e leitura de variáveis
│   ├── events/        # Eventos do Discord (mensagens, interações)
│   ├── services/      # Integração com Gemini, player de áudio e memória
│   └── utils/         # Utilitários (digitação humanizada, URLs)
```
