# 🤖 Dubinha Bot (Jinchi Discord Persona AI)

Bot para Discord desenvolvido em **Node.js** com **discord.js v14** e **Google Gemini 3.5 Flash** que simula a personalidade, gírias, piadas internas, trejeitos de fala, visão computacional, reprodução de música e memória episódica do **Jinchi** no servidor.

---

## ✨ Principais Funcionalidades

- 🧠 **Cérebro Multicamadas:** Raciocínio cognitivo interno via Gemini com busca semântica (RAG) em 21.000+ mensagens históricas e 347 diálogos reais.
- 👁️ **Visão Multimodal (Fotos e Vídeos):** Enxerga imagens, memes, fotos e vídeos (`.mp4`, `.webm`, `.mov`), reagindo visceralmente em vez de fazer descrições robóticas.
- 💬 **Envio em Rajada Orgânica:** Envia de 1 a 5 mensagens sequenciais com simulação de digitação humana (`mensagem > envia > mensagem > envia`).
- 🧠 **Memória Episódica & Curto Prazo:** Lembra fatos importantes dos membros e tópicos discutidos no dia.
- 🎸 **Módulo de Voz & Música (`/cantar` e `/parar`):** Toca músicas completas do YouTube e rádios web sem interrupções com decodificação contínua FFmpeg.
- 🍕 **Comando de Cobrança (`/pizza`):** Cobra PIX para pizza de amigos no chat com opções de alvo, sabor e valor.

---

## 📁 Estrutura do Projeto

```
dubinha-bot/
├── .env                  # Credenciais e tokens privados (ignorado pelo git)
├── .env.example          # Modelo de configuração
├── package.json          # Dependências e scripts
├── data/
│   ├── episodic_memory.json        # Memória persistente de longo prazo
│   └── raw_messages_*.json         # Dataset do Jinchi minerado do Discord
└── src/
    ├── index.js          # Ponto de entrada
    ├── deploy-commands.js# Registra comandos de barra (/) no Discord
    ├── config/
    │   ├── env.js        # Validação de variáveis de ambiente
    │   └── persona.js    # Personalidade, dialeto, regras e diálogos
    ├── services/
    │   ├── ai.js         # Integração com Google Gemini
    │   ├── rag.js        # Motor de busca semântica RAG
    │   ├── episodicMemory.js # Gerenciador de memória de longo prazo
    │   ├── sessionMemory.js  # Gerenciador de memória de curto prazo
    │   ├── musicPlayer.js    # Player de música em salas de voz
    │   └── randomEvents.js   # Eventos aleatórios de pizza e zoeira
    ├── commands/
    │   └── utility/
    │       ├── cantar.js # /cantar [musica]
    │       ├── parar.js  # /parar
    │       ├── pizza.js  # /pizza [alvo] [sabor] [valor]
    │       ├── aprender.js # /aprender [alvo] [limite]
    │       └── ping.js   # /ping
    └── events/
        ├── ready.js          # Evento de inicialização
        ├── interactionCreate.js # Despacho de comandos de barra
        └── messageCreate.js  # Processamento de chat, fotos e vídeos
```

---

## 🚀 Como Rodar o Projeto

### 1. Instale as Dependências
```bash
npm install
```

### 2. Configure o Arquivo `.env`
Copie `.env.example` para `.env` e preencha suas chaves:
```env
DISCORD_TOKEN=seu_discord_token_aqui
CLIENT_ID=seu_client_id_aqui
TARGET_CHANNEL_ID=
GEMINI_API_KEY=sua_gemini_api_key_aqui
```

### 3. Registre os Comandos de Barra
```bash
npm run deploy
```

### 4. Inicie o Bot
```bash
npm run dev
```
