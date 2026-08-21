import { GoogleGenAI } from '@google/genai';
import { config } from '../config/env.js';
import { recordEpisodicFact } from './episodicMemory.js';
import { addMemberFact, addMemberGame } from './memberProfiles.js';
import { addManualMemory } from './learning.js';

let aiClient = null;

function getAIClient() {
  const apiKey = config.gemini.apiKey;
  if (!apiKey || apiKey === 'seu_gemini_api_key_aqui') return null;
  if (!aiClient) aiClient = new GoogleGenAI({ apiKey });
  return aiClient;
}

// Fila de processamento assíncrono em background (não atrasa respostas do Discord)
const messageQueue = [];
let isProcessingQueue = false;
let lastExtractionTime = 0;

/**
 * Enfileira uma mensagem para análise cognitiva e extração de memórias em segundo plano
 * @param {{ authorName: string, content: string, channelName: string }} msgInfo
 */
export function enqueueCognitiveInspection(msgInfo) {
  if (!msgInfo || !msgInfo.content || msgInfo.content.length < 8) return;

  // Ignora mensagens que são comandos (/...)
  if (msgInfo.content.startsWith('/')) return;

  messageQueue.push({
    authorName: msgInfo.authorName,
    content: msgInfo.content,
    timestamp: Date.now()
  });

  // Limita o tamanho da fila
  if (messageQueue.length > 20) messageQueue.shift();

  // Dispara processamento se não estiver ativo
  processQueueDebounced();
}

function processQueueDebounced() {
  if (isProcessingQueue) return;
  const now = Date.now();
  if (now - lastExtractionTime < 5000) {
    setTimeout(processQueueDebounced, 5000);
    return;
  }

  isProcessingQueue = true;
  setTimeout(async () => {
    try {
      await processNextBatch();
    } catch (err) {
      console.warn('[Cognitive Learning Queue Error]:', err.message);
    } finally {
      isProcessingQueue = false;
      lastExtractionTime = Date.now();
      if (messageQueue.length > 0) {
        setTimeout(processQueueDebounced, 4000);
      }
    }
  }, 1000);
}

async function processNextBatch() {
  const ai = getAIClient();
  if (!ai || messageQueue.length === 0) return;

  // Pega até 3 mensagens acumuladas
  const batch = messageQueue.splice(0, 3);
  const conversationSnippet = batch
    .map(m => `@${m.authorName}: "${m.content}"`)
    .join('\n');

  const prompt = `Você é um extrator cognitivo de memórias para um bot de Discord que simula um amigo chamado Jinchi/Dubinha.
Analise a conversa recente e extraia APENAS se houver novidades reais e relevantes:

Conversa:
${conversationSnippet}

Responda em formato JSON estrito:
{
  "hasNewInfo": boolean,
  "isPersonaCorrection": boolean,
  "personaCorrectionRule": "regra de como o Dubinha deve agir caso alguém o tenha corrigido sobre gostos/fatos dele, ou null",
  "memberFact": {
    "userName": "nome do usuário sobre quem o fato fala (ou Jinchi/Dubinha)",
    "fact": "fato objetivo e curto revelado (ex: comprou um fone novo, começou a faculdade, etc.)",
    "game": "nome do jogo se tiver sido mencionado que está jogando, ou null"
  } ou null
}
Se não houver nenhum fato ou correção relevante (apenas zoeira comum, risadas, saudações rápidas), retorne "hasNewInfo": false.`;

  try {
    let response = null;
    try {
      response = await ai.models.generateContent({
        model: config.gemini.model || 'gemini-3.5-flash',
        contents: [prompt],
        config: {
          responseMimeType: 'application/json',
          temperature: 0.1
        }
      });
    } catch (primaryErr) {
      if (config.gemini.fallbackModel) {
        response = await ai.models.generateContent({
          model: config.gemini.fallbackModel,
          contents: [prompt],
          config: {
            responseMimeType: 'application/json',
            temperature: 0.1
          }
        });
      } else {
        throw primaryErr;
      }
    }

    const text = response.text?.trim();
    if (!text) return;

    const data = JSON.parse(text);
    if (!data || !data.hasNewInfo) return;

    // 1. Caso seja uma correção sobre o comportamento/gostos do Dubinha
    if (data.isPersonaCorrection && data.personaCorrectionRule) {
      console.log(`🧠 [Auto-Learning / Correção de Persona]: "${data.personaCorrectionRule}"`);
      await addManualMemory(data.personaCorrectionRule, null, 'regra');
    }

    // 2. Caso seja um fato relevante sobre algum membro
    if (data.memberFact && data.memberFact.userName && data.memberFact.fact) {
      const user = data.memberFact.userName;
      const fact = data.memberFact.fact;
      const game = data.memberFact.game;

      recordEpisodicFact(user, fact, game ? 'games' : 'social');
      addMemberFact(user, fact);

      if (game) {
        addMemberGame(user, game);
      }
    }
  } catch (err) {
    // Falha silenciosa para não poluir log
  }
}

/**
 * Registra um diálogo de alto sucesso quando o bot recebe risadas ou reações positivas
 * @param {string} originalPrompt
 * @param {string} botReply
 * @param {string} reason
 */
export async function reinforceSuccessfulDialogue(originalPrompt, botReply, reason = 'reação social') {
  if (!originalPrompt || !botReply || botReply.length < 5) return;

  try {
    const cleanPrompt = originalPrompt.replace(/@\S+/g, '').trim();
    const cleanReply = botReply.trim();

    console.log(`⭐ [Reforço Social - Diálogo Vitorioso]: "${cleanReply}" (Motivo: ${reason})`);

    // Grava no custom_memory e RAG como diálogo de referência
    await addManualMemory(cleanReply, cleanPrompt || 'resenha do chat', 'frase');
  } catch (err) {
    console.warn('[Reinforcement Error]:', err.message);
  }
}
