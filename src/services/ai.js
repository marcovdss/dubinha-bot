import { GoogleGenAI } from '@google/genai';
import { config } from '../config/env.js';
import { buildSystemPrompt, personaConfig } from '../config/persona.js';
import { searchKnowledgeBase } from './rag.js';
import { getEpisodicMemories } from './episodicMemory.js';

let aiClient = null;

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
 * Gera uma resposta na voz e persona do Dubinha com raciocínio cognitivo profundo e visão multimodal (fotos e vídeos)
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

    // 2. Memória Episódica Permanente de Longo Prazo
    const episodicFacts = getEpisodicMemories(targetAuthor, userPrompt);
    let episodicBlock = '';
    if (episodicFacts.length > 0) {
      episodicBlock = `\n[MEMÓRIAS HISTÓRICAS PERMANENTES DESTE SERVIDOR]:\n${episodicFacts.join('\n')}\n\n`;
    }

    // 3. Busca semântica RAG no histórico de mensagens do Jinchi
    const { relevantMessages, relevantDialogues } = searchKnowledgeBase(userPrompt, recentHistory, 6);

    let ragContext = '';
    if (relevantDialogues.length > 0 || relevantMessages.length > 0) {
      ragContext = `\n[MEMÓRIAS, FATOS & HISTÓRICO DA SUA VIDA - INCORPORE EM 1ª PESSOA ("EU")]:\n`;
      if (relevantDialogues.length > 0) {
        ragContext += `Diálogos que você já teve no passado:\n` +
          relevantDialogues.map(d => `- ${d.user}\n  Você (${personaConfig.name}): "${d.duba}"`).join('\n') + '\n\n';
      }
      if (relevantMessages.length > 0) {
        ragContext += `Fatos e coisas que você já viveu ou falou (lembre-se disso em 1ª pessoa):\n` +
          relevantMessages.map(m => `- "${m}"`).join('\n') + '\n\n';
      }
    }

    // 4. Memória de Sessão de Curto Prazo (últimas 6 horas)
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

    // 9. Instrução de Reflexão e Raciocínio Silencioso (Chain-of-Thought)
    const thinkingInstruction = `
[PROCESSO DE RACIOCÍNIO INTERNO ANTES DE FALAR]:
1. Identifique a intenção e tom do que foi dito ou mostrado no vídeo/foto (zoeira, fail, jogada, desabafo, convite, ironia).
2. Lembre-se da sua postura genuína (Jinchi é calmo, direto, preguiçoso, nunca se desculpa, joga BF4/WoW, defende macaxeira).
3. Formule a resposta orgânica em minúsculas com gírias naturais (meu vei, mano, caba, doidera vei).
4. No final, envie APENAS a fala final do Jinchi.
`.trim();

    // 10. Instrução Específica para Mídias (Vídeos e Fotos)
    const hasVideos = mediaBuffers.some(m => m.isVideo || m.mimeType?.startsWith('video/'));
    const hasImages = mediaBuffers.some(m => !m.isVideo && m.mimeType?.startsWith('image/'));

    let mediaInstruction = '';
    if (hasVideos) {
      mediaInstruction = '\n[REGRA DE VÍDEO/CLIPE RECEBIDO]: O usuário enviou um VÍDEO/CLIPE no chat. Você assistiu ao vídeo (áudio e imagens em movimento). NUNCA descreva o vídeo ("no vídeo vemos...", "o vídeo mostra..."). APENAS REAJA de forma direta, visceral e descontraída (rindo do fail, elogiando a jogada, comentando o meme ou zoando a bizarrice no seu estilo seco de sofá).';
    } else if (hasImages) {
      mediaInstruction = '\n[REGRA DE IMAGEM/FOTO RECEBIDA]: O usuário enviou uma foto/imagem no chat. NUNCA descreva ou narre a foto ("tem um homem...", "na imagem vejo..."). APENAS REAJA de forma direta, visceral e zoeira (elogiando, rindo, zoando, criticando ou comentando no seu estilo seco de sofá).';
    }

    const defaultPrompt = hasVideos ? 'olha esse vídeo' : (hasImages ? 'olha essa imagem' : 'olha isso');
    const fullPromptText = `${temporalContext}\n${sessionBlock}${episodicBlock}${urlBlock}${ragContext}${contextText}${repliedBlock}${realJinchiNotice}${thinkingInstruction}${mediaInstruction}\n\nMensagem/Situação atual para responder:\n"${userPrompt || defaultPrompt}"`;

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

    const response = await ai.models.generateContent({
      model: config.gemini.model,
      contents: contentsPayload,
      config: {
        systemInstruction,
        temperature: config.gemini.temperature,
        maxOutputTokens: config.gemini.maxTokens
      }
    });

    const text = response.text?.trim();

    if (!text) {
      return getRandomFallback();
    }

    // Pós-processamento de altíssima fidelidade:
    // 1. Remove eventuais blocos de pensamento <thought>...</thought> ou [pensamento]
    // 2. Remove aspas externas e prefixos
    // 3. Garante minúsculas 100% como o Jinchi real
    // 4. Formata interrogações com espaço antes (" ?")
    let cleaned = text
      .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
      .replace(/\[pensamento\][\s\S]*?\[\/pensamento\]/gi, '')
      .replace(/^["']|["']$/g, '')
      .replace(/^(?:jinchi|dubinha|duba|bot):\s*/i, '')
      .toLowerCase()
      .replace(/\s*\?/g, ' ?')
      .trim();

    return cleaned || getRandomFallback();
  } catch (error) {
    console.error('[AI Service Error]:', error.message || error);
    return getRandomFallback();
  }
}
