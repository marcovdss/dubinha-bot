import { GoogleGenAI } from '@google/genai';
import { config } from '../config/env.js';
import { buildSystemPrompt, personaConfig } from '../config/persona.js';
import { searchKnowledgeBase } from './rag.js';
import { getEpisodicMemories } from './episodicMemory.js';
import { formatMemberDossierForPrompt } from './memberProfiles.js';

let aiClient = null;

// Buffer em memória com as últimas falas geradas pelo bot para evitar repetições consecutivas
const recentBotResponses = [];
const MAX_RECENT_BOT_RESPONSES = 8;

function recordBotResponse(text) {
  if (!text) return;
  recentBotResponses.unshift(text);
  if (recentBotResponses.length > MAX_RECENT_BOT_RESPONSES) {
    recentBotResponses.pop();
  }
}

function getAIClient() {
  const apiKey = config.gemini.apiKey;
  if (!apiKey || apiKey === 'seu_gemini_api_key_aqui') {
    return null;
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
}

/**
 * Retorna uma resposta pré-programada de fallback
 * @returns {string}
 */
function getRandomFallback() {
  const fallbacks = personaConfig.fallbackResponses;
  return fallbacks[Math.floor(Math.random() * fallbacks.length)];
}

/**
 * Gera o contexto temporal em tempo real (horário, dia da semana e período)
 * @returns {string}
 */
function getTemporalContext() {
  const now = new Date();
  const days = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
  const dayName = days[now.getDay()];
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');

  let period = 'noite';
  if (now.getHours() >= 0 && now.getHours() < 6) period = 'madrugada';
  else if (now.getHours() >= 6 && now.getHours() < 12) period = 'manhã';
  else if (now.getHours() >= 12 && now.getHours() < 18) period = 'tarde';

  return `[HORÁRIO & CONTEXTO TEMPORAL AO VIVO]:\nHoje é ${dayName}, exatamente ${hours}:${minutes} (${period}).`;
}

/**
 * Gera uma resposta na voz e persona do Dubinha com raciocínio cognitivo profundo, anti-repetição e visão multimodal
 * @param {string} userPrompt - Mensagem do usuário
 * @param {Array<{author: string, content: string}>} recentHistory - Histórico recente de mensagens do canal
 * @param {string} authorName - Nome do autor da mensagem (opcional)
 * @param {Array<{data: string, mimeType: string, isVideo?: boolean}>} mediaBuffers - Imagens ou Vídeos em base64 (opcional)
 * @param {{ repliedContext?: string, urlContext?: string, sessionSummary?: string, isRealJinchi?: boolean }} extraContext - Camadas extras de contexto
 * @returns {Promise<string>}
 */
export async function generatePersonaResponse(
  userPrompt,
  recentHistory = [],
  authorName = '',
  mediaBuffers = [],
  extraContext = {}
) {
  const ai = getAIClient();

  if (!ai) {
    console.warn('[AI Service] GEMINI_API_KEY não configurada. Usando resposta padrão.');
    return getRandomFallback();
  }

  try {
    const targetAuthor = authorName || (recentHistory.length > 0 ? recentHistory[recentHistory.length - 1].author : '');
    const systemInstruction = buildSystemPrompt(targetAuthor);

    // 1. Contexto Temporal em Tempo Real
    const temporalContext = getTemporalContext();

    // 2. Memória Episódica Permanente de Longo Prazo (sobre membros e a vida do Jinchi)
    const episodicFacts = getEpisodicMemories(targetAuthor, userPrompt);
    let episodicBlock = '';
    if (episodicFacts.length > 0) {
      episodicBlock = `\n[MEMÓRIAS HISTÓRICAS PERMANENTES DESTE SERVIDOR & DA SUA VIDA]:\n${episodicFacts.join('\n')}\n\n`;
    }

    // 3. Busca semântica RAG rica no histórico real de mensagens do Jinchi
    const { relevantMessages, relevantDialogues } = searchKnowledgeBase(userPrompt, recentHistory, 8);

    let ragContext = '';
    if (relevantDialogues.length > 0 || relevantMessages.length > 0) {
      ragContext = `\n[MEMÓRIAS, FATOS & HISTÓRICO DA SUA VIDA - USE EM 1ª PESSOA ("EU")]:\n`;
      if (relevantDialogues.length > 0) {
        ragContext += `Diálogos que você já teve no passado (exemplos de estilo):\n` +
          relevantDialogues.map(d => `- ${d.user}\n  Você (${personaConfig.name}): "${d.duba}"`).join('\n') + '\n\n';
      }
      if (relevantMessages.length > 0) {
        ragContext += `Coisas reais que você já falou ou viveu:\n` +
          relevantMessages.map(m => `- "${m}"`).join('\n') + '\n\n';
      }
    }

    // 4. Memória de Sessão de Curto Prazo persistida
    const sessionBlock = extraContext.sessionSummary ? `${extraContext.sessionSummary}\n` : '';

    // 5. Contexto de Links/URLs (se houver)
    const urlBlock = extraContext.urlContext ? `${extraContext.urlContext}\n` : '';

    // 6. Contexto de Mensagem Respondida / Citação (se houver)
    const repliedBlock = extraContext.repliedContext ? `[MENSAGEM ORIGINAL SENDO RESPONDIDA/CITADA]:\n${extraContext.repliedContext}\n\n` : '';

    // 7. Aviso especial se estiver conversando com o Jinchi verdadeiro
    const realJinchiNotice = extraContext.isRealJinchi ? `[ATENÇÃO]: Você está conversando diretamente com o Jinchi original (@${authorName}), a pessoa real na qual você foi clonado. Converse com ele como seu gêmeo/cópia original.\n\n` : '';

    // 8. Histórico Expandido do Canal
    let contextText = '';
    if (recentHistory.length > 0) {
      contextText = recentHistory
        .map(msg => `${msg.author}: ${msg.content}`)
        .join('\n');
      contextText = `\n[HISTÓRICO RECENTE DA CONVERSA NO CANAL]\n${contextText}\n\n`;
    }

    // 9. DIRETIVA ANTI-REPETIÇÃO E HISTÓRICO DE RESPOSTAS DO PRÓPRIO BOT
    let antiRepetitionBlock = '';
    if (recentBotResponses.length > 0) {
      antiRepetitionBlock = `\n[SUAS ÚLTIMAS RESPOSTAS RECENTES NO CHAT (NÃO REPITA)]:
${recentBotResponses.slice(0, 5).map(r => `• "${r}"`).join('\n')}
[REGRA CRÍTICA DE VARIEDADE]: É PROIBIDO começar a nova mensagem com a mesma frase/gíria das respostas acima ou repetir a mesma piada! Traga um vocabulário novo, outra observação ou um ângulo diferente para enriquecer o diálogo.\n\n`;
    }

    // 10. Dossiê do Interlocutor (jogos, hábitos e fatos conhecidos sobre a pessoa que está falando)
    const memberDossierText = formatMemberDossierForPrompt(targetAuthor);
    const memberDossierBlock = memberDossierText ? `\n${memberDossierText}\n` : '';

    // 11. Instrução de Reflexão e Raciocínio Silencioso (Chain-of-Thought)
    const thinkingInstruction = `
[PROCESSO DE RACIOCÍNIO]:
1. Identifique o tom do que foi dito ou mostrado no vídeo/foto.
2. Formule uma resposta espontânea, autêntica e curta em minúsculas (1 única linha curta, estilo relaxado de Discord).
3. NUNCA mande parágrafos longos, listas ou várias mensagens. Seja breve e despretensioso.
4. Envie APENAS a fala final do Jinchi.
`.trim();

    // 12. Instrução Específica para Mídias (Vídeos e Fotos)
    const hasVideos = mediaBuffers.some(m => m.isVideo || m.mimeType?.startsWith('video/'));
    const hasImages = mediaBuffers.some(m => !m.isVideo && m.mimeType?.startsWith('image/'));

    let mediaInstruction = '';
    if (hasVideos) {
      mediaInstruction = '\n[REGRA DE VÍDEO/CLIPE RECEBIDO]: O usuário enviou um VÍDEO no chat. NUNCA descreva o vídeo. APENAS REAJA em 1 linha de forma direta e descontraída (rindo do fail, elogiando a jogada, comentando o meme ou zoando no seu estilo de sofá).';
    } else if (hasImages) {
      mediaInstruction = '\n[REGRA DE IMAGEM/FOTO RECEBIDA]: O usuário enviou uma foto no chat. NUNCA descreva a foto. APENAS REAJA em 1 linha de forma direta (elogiando, rindo, zoando ou comentando no seu estilo de sofá).';
    }

    const defaultPrompt = hasVideos ? 'olha esse vídeo' : (hasImages ? 'olha essa imagem' : 'olha isso');
    const fullPromptText = `${temporalContext}\n${sessionBlock}${episodicBlock}${memberDossierBlock}${urlBlock}${ragContext}${antiRepetitionBlock}${contextText}${repliedBlock}${realJinchiNotice}${thinkingInstruction}${mediaInstruction}\n\nMensagem/Situação atual para responder:\n"${userPrompt || defaultPrompt}"`;

    // Monta o payload multimodal se houver imagens ou vídeos
    const contentsPayload = [];
    if (Array.isArray(mediaBuffers) && mediaBuffers.length > 0) {
      for (const media of mediaBuffers) {
        contentsPayload.push({
          inlineData: {
            data: media.data,
            mimeType: media.mimeType || 'image/jpeg'
          }
        });
      }
    }
    contentsPayload.push(fullPromptText);

    const temperature = typeof config.gemini.temperature === 'number' ? config.gemini.temperature : 0.80;

    const response = await ai.models.generateContent({
      model: config.gemini.model,
      contents: contentsPayload,
      config: {
        systemInstruction,
        temperature,
        topP: 0.90,
        topK: 40,
        maxOutputTokens: config.gemini.maxTokens
      }
    });

    const text = response.text?.trim();

    if (!text) {
      return getRandomFallback();
    }

    // Pós-processamento de altíssima fidelidade:
    let cleaned = text
      .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
      .replace(/\[pensamento\][\s\S]*?\[\/pensamento\]/gi, '')
      .replace(/^["']|["']$/g, '')
      .replace(/^(?:jinchi|dubinha|duba|bot):\s*/i, '')
      .toLowerCase()
      .replace(/\s*\?/g, ' ?')
      .trim();

    // Limita a no máximo 2 linhas caso a IA tenha gerado mais
    const lines = cleaned.split('\n').filter(l => l.trim().length > 0);
    if (lines.length > 2) {
      cleaned = lines.slice(0, 2).join('\n');
    }

    const finalResponse = cleaned || getRandomFallback();

    // Registra no buffer anti-repetição
    recordBotResponse(finalResponse);

    return finalResponse;
  } catch (error) {
    console.error('[AI Service Error]:', error.message || error);
    return getRandomFallback();
  }
}
