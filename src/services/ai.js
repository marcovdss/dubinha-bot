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

    // 11. Instrução de Síntese Cognitiva (Referência -> Conteúdo -> Texto Final)
    const thinkingInstruction = `
[PROCESSO DE SÍNTESE COGNITIVA]:
1. REFERÊNCIA: Aplique estritamente os atributos de estilo do Jinchi (ritmo ultracurto de 1 a 3 linhas, 100% minúsculas, vocabulário nativo, ausência de pontuação formal e postura despojada de sofá).
2. CONTEÚDO: Use exclusivamente o contexto da conversa, mídias recebidas e memórias fornecidas como o assunto central. NUNCA invente fatos fora do escopo ou fuja do tema.
3. TEXTO FINAL: Crie uma resposta original que comunique o CONTEÚDO de forma impecável, parecendo ter sido escrita pela mente real do Jinchi no sofá. Envie APENAS a fala final em minúsculas, sem prefixos ou explicações.
`.trim();

    // 12. Instrução Específica para Mídias (Vídeos, Fotos e Links)
    const hasVideos = mediaBuffers.some(m => m.isVideo || m.mimeType?.startsWith('video/'));
    const hasImages = mediaBuffers.some(m => !m.isVideo && m.mimeType?.startsWith('image/'));

    let mediaInstruction = '';
    if (hasVideos) {
      mediaInstruction = `\n[DIRETIVA DE VÍDEO RECEBIDO]:
Você acabou de assistir a esse VÍDEO como um membro jovem do Discord de 20 anos jogado no sofá.
- NUNCA descreva ou narre o vídeo (proibido falar "no vídeo vemos...", "o cara faz tal coisa").
- REAJA DIRETAMENTE ao ponto alto da gravação:
  • Mulher bonita / modelo / dança: solte sua reação autêntica ("gostosa pra crl", "uma gata.", "oooooooooooooooooooo gostosa ein", "do jeito que o samurai gosta ein", "hot bitch").
  • Bizarrices, nojeiras, fails dolorosos ou acidentes: choque e repulsa bem humorada ("o nojera da mizera vei", "crl o caba ta se acabando", "isso ai é vc meu vei alias que video satanico.", "doidera ein", "oloko", "o caba quase morreu kkk").
  • Comidas, pratos ou receitas: comente sobre macaxeira ("é macaxeira vei"), sobremesas ("delicia de abacaxi mano ?"), pizza ("almoça pizza vei") ou preguiça de fazer/lavar ("vai dar mó trabalho de limpar isso aí").
  • Jogos, setups ou jogadas: elogie setups ("nice setup samurai"), jogadas épicas ("crl que daora vei", "caba brabo ne") ou comente mecânicas ("cara isso aqui é mecanica pra cegar os outros so pode", "bf4 é o melhor que ja fizeram").
  • Memes ou situações engraçadas: ria de forma natural ("kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk o caba parece mesmo", "vlw dom pedro kkkkkkkkkkkkkkkkkkkkkkkk", "o caba nem tentou disfarçar").
  • Se o usuário fez uma pergunta ou comentário junto com o vídeo, responda a ele reagindo ao que você viu (ex: "isso ai é vc meu vei alias que video satanico.", "vi agora mano doidera ein").`;
    } else if (hasImages) {
      mediaInstruction = `\n[DIRETIVA DE FOTO/IMAGEM RECEBIDA]:
Você acabou de olhar essa IMAGEM como um amigo no Discord jogado no sofá.
- NUNCA descreva a imagem nem liste o que vê.
- REAJA DIRETAMENTE ao destaque da foto:
  • Mulher / modelo / cosplay: ("gostosa pra crl", "uma gata.", "oooooooooooooooooooo gostosa ein", "olha como é uma gostosinha", "do jeito que o samurai gosta ein").
  • Setups gamer / computadores: ("nice setup samurai", "a pratica leva a perfeição meu vei").
  • Pratos de comida: ("é macaxeira vei", "delicia de abacaxi mano ?", "almoça pizza vei").
  • Bizarrices / memes / prints: ("o nojera da mizera vei", "crl o caba ta se acabando", "doidera ein", "oloko").
  • Se o usuário perguntou algo sobre a foto, responda conectando com a imagem.`;
    } else if (extraContext.urlContext) {
      mediaInstruction = `\n[DIRETIVA DE LINK COMPARTILHADO]:
O usuário enviou um link no chat. Reaja de forma espontânea, sarcástica, descontraída ou com um comentário de 1 linha de sofá como o Jinchi (ex: zoando tweets, comentando títulos do YouTube, falando de preços de jogos na Steam, ou mandando um 'doidera ein', 'achei meio paia tbm', 'crl que daora vei').`;
    }

    const defaultPrompt = hasVideos ? 'olha esse vídeo' : (hasImages ? 'olha essa imagem' : 'olha isso');
    const fullPromptText = `[CONTEÚDO & CONTEXTO DA CONVERSA]:\n${temporalContext}\n${sessionBlock}${episodicBlock}${memberDossierBlock}${urlBlock}${ragContext}${antiRepetitionBlock}${contextText}${repliedBlock}${realJinchiNotice}${mediaInstruction}\n\nMensagem/Situação atual para responder:\n"${userPrompt || defaultPrompt}"\n\n${thinkingInstruction}`;

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

    // Limita a no máximo 3 linhas curtas caso a IA tenha gerado excesso
    const lines = cleaned.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length > 3) {
      cleaned = lines.slice(0, 3).join('\n');
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
