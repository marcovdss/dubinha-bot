import dotenv from 'dotenv';

dotenv.config();

/**
 * Normaliza valores de probabilidade:
 * Aceita decimais (ex: 0.05, 0.25), inteiros/porcentagens (ex: 5, 25, 50, "5%", "50%")
 * Clampa o resultado final entre 0.0 e 1.0.
 *
 * @param {string|number} val
 * @param {number} [defaultVal=0.25]
 * @returns {number}
 */
export function normalizeProbability(val, defaultVal = 0.25) {
  if (val === undefined || val === null || val === '') return defaultVal;
  if (typeof val === 'string') {
    val = val.replace('%', '').trim();
  }
  const parsed = parseFloat(val);
  if (isNaN(parsed)) return defaultVal;
  if (parsed < 0) return 0;
  if (parsed > 1) {
    // Ex: Se o usuário passou 5, 25, 50 -> converte de porcentagem para decimal (0.05, 0.25, 0.50)
    return Math.min(parsed / 100, 1);
  }
  return parsed;
}

/**
 * Configurações centralizadas e validadas da aplicação
 */
export const config = {
  discord: {
    token: process.env.DISCORD_TOKEN?.trim() || '',
    clientId: process.env.CLIENT_ID?.trim() || '',
    guildId: process.env.GUILD_ID?.trim() || '',
    targetChannelId: process.env.TARGET_CHANNEL_ID?.trim() || ''
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY?.trim() || '',
    model: process.env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash-lite',
    temperature: parseFloat(process.env.GEMINI_TEMPERATURE || '0.80'),
    maxTokens: parseInt(process.env.GEMINI_MAX_TOKENS || '300', 10)
  },
  behavior: {
    // ID do usuário original para auto-aprendizado contínuo
    learnUserId: process.env.CRAWL_USER_ID?.trim() || '264201832492957698',
    // Probabilidade de resposta a mensagens soltas não-marcadas (Modo Introsa) (ex: 0.05 = 5%, 0.25 = 25%)
    replyProbability: normalizeProbability(
      process.env.REPLY_PROBABILITY ||
      process.env.MODO_INTROSA_PROBABILITY ||
      process.env.INTROSA_CHANCE ||
      '0.25'
    ),
    // Cooldown em segundos entre respostas automáticas no mesmo canal
    cooldownSeconds: parseInt(process.env.COOLDOWN_SECONDS || '25', 10),
    // Mínimo de mensagens humanas antes de poder responder sozinho
    minHumanMessages: parseInt(process.env.MIN_HUMAN_MESSAGES || '1', 10)
  },
  assets: {
    azminStickerId: process.env.AZMIN_STICKER_ID || '1253160415152836608',
    reactionEmojiId: process.env.REACTION_EMOJI_ID || '1470911490319188255'
  }
};

/**
 * Valida se as variáveis de ambiente obrigatórias estão presentes
 */
export function validateEnv() {
  const missing = [];

  if (!config.discord.token || config.discord.token === 'seu_discord_token_aqui') {
    missing.push('DISCORD_TOKEN');
  }

  if (missing.length > 0) {
    console.error(`\n❌ ERRO DE CONFIGURAÇÃO: Variáveis obrigatórias faltando no .env: ${missing.join(', ')}`);
    console.error('👉 Verifique o arquivo .env e preencha as credenciais necessárias.\n');
    process.exit(1);
  }
}
