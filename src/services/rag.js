import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.join(__dirname, '../../data');

let cachedMessages = [];
let cachedDialogues = [];
let lastLoadedTime = 0;

// Palavras comuns para ignorar na busca
const STOPWORDS = new Set([
  'a', 'o', 'as', 'os', 'um', 'uma', 'uns', 'umas', 'de', 'do', 'da', 'dos', 'das',
  'em', 'no', 'na', 'nos', 'nas', 'por', 'pelo', 'pela', 'pelos', 'pelas', 'para',
  'pra', 'com', 'sem', 'sob', 'sobre', 'que', 'se', 'eu', 'tu', 'ele', 'ela', 'nos',
  'vos', 'eles', 'elas', 'me', 'te', 'lhe', 'nos', 'vos', 'lhes', 'meu', 'minha',
  'teu', 'tua', 'seu', 'sua', 'nosso', 'nossa', 'dele', 'dela', 'deles', 'delas',
  'este', 'esta', 'esse', 'essa', 'aquele', 'aquela', 'isto', 'isso', 'aquilo',
  'e', 'ou', 'mas', 'porque', 'pq', 'como', 'quando', 'onde', 'quem', 'qual',
  'foi', 'era', 'vai', 'vou', 'ta', 'tá', 'to', 'tô', 'tem', 'temos', 'ter', 'ser',
  'estar', 'aqui', 'ai', 'aí', 'la', 'lá', 'ja', 'já', 'so', 'só'
]);

// Clusters semânticos de tópicos para expansão de busca contextual
const TOPIC_CLUSTERS = {
  culinaria: ['comida', 'cozinhar', 'culinaria', 'gastronomia', 'receita', 'janta', 'almoco', 'fome', 'panela', 'curso', 'mocas', 'moças', 'restaurante', 'prato', 'miojo', 'salsicha', 'lanche', 'pizza', 'abacaxi', 'macaxeira', 'mandioca'],
  games: ['jogo', 'jogar', 'game', 'steam', 'wow', 'warframe', 'delta', 'bf', 'bf4', 'bf6', 'fps', 'nerf', 'patch', 'update', 'blizz', 'blizzard', 'grind', 'aura', 'arma', 'runescape', 'osrs', 'cs', 'cs2', 'mirage', 'setup', 'rgb'],
  hardware: ['pc', 'computador', 'placa', 'video', 'gpu', 'processador', 'cooler', 'fonte', 'gabinete', 'teclado', 'mouse', 'monitor', 'bios', 'driver', 'carcaca', 'carcaça', 'derreter', 'esquentar', 'mecanico', 'barulhento'],
  economia: ['dinheiro', 'comprar', 'comprou', 'preco', 'preço', 'caro', 'barato', 'pix', 'reais', 'conto', 'gratis', 'reembolso', 'rasgando', 'tostao', 'tostão', 'furado'],
  mulheres_relacoes: ['mulher', 'mina', 'gostosa', 'amiga', 'namorada', 'moca', 'moça', 'fofoca', 'bikini', 'foto', 'instagram', 'tiktok'],
  cultura_e_memes: ['lothlorien', 'senhor dos aneis', 'lotr', 'meme', 'mod', 'gif', 'video', 'politica', 'lula', 'voto', 'eleicao', 'eleição', 'pais', 'brasil']
};

/**
 * Carrega todos os datasets de mensagens brutas da pasta data/
 */
export function loadDatasets() {
  try {
    if (!fs.existsSync(dataDir)) {
      return { messages: [], dialogues: [] };
    }

    const files = fs.readdirSync(dataDir).filter(f => f.startsWith('raw_messages_') && f.endsWith('.json'));
    const allMsgs = [];
    const allDialogues = [];

    for (const file of files) {
      const filePath = path.join(dataDir, file);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      if (Array.isArray(data.messages)) {
        allMsgs.push(...data.messages);
      }
      if (Array.isArray(data.dialogues)) {
        allDialogues.push(...data.dialogues);
      }
    }

    cachedMessages = allMsgs;
    cachedDialogues = allDialogues;
    lastLoadedTime = Date.now();
    return { messages: cachedMessages, dialogues: cachedDialogues };
  } catch (error) {
    console.error('[RAG] Erro ao carregar dataset de mensagens:', error);
    return { messages: [], dialogues: [] };
  }
}

/**
 * Adiciona uma nova mensagem/diálogo diretamente na memória do RAG em tempo de execução
 * @param {{ id: string, content: string, timestamp: any, channel: string }} msg
 * @param {{ otherUser: string, otherMessage: string, targetResponse: string } | null} dialogue
 */
export function addLiveMemory(msg, dialogue = null) {
  if (msg && !cachedMessages.some(m => m.id === msg.id)) {
    cachedMessages.unshift(msg);
  }
  if (dialogue) {
    cachedDialogues.unshift(dialogue);
  }
}

/**
 * Extrai palavras-chave limpas de um texto
 */
function extractKeywords(text) {
  if (!text) return [];
  const tokens = text
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length >= 3 && !STOPWORDS.has(word));

  const expanded = new Set(tokens);

  // Expande com sinônimos de clusters se houver correspondência
  for (const token of tokens) {
    for (const cluster of Object.values(TOPIC_CLUSTERS)) {
      if (cluster.includes(token)) {
        cluster.forEach(syn => expanded.add(syn));
      }
    }
  }

  return Array.from(expanded);
}

/**
 * Busca memórias e diálogos contextualmente relevantes usando pontuação estrita e expansão multiturn
 * @param {string} query - Mensagem atual do usuário
 * @param {Array<{author: string, content: string}>} recentHistory - Contexto recente do canal
 * @param {number} limit - Quantidade máxima de exemplos
 * @returns {{ relevantMessages: string[], relevantDialogues: Array<{user: string, duba: string}> }}
 */
export function searchKnowledgeBase(query, recentHistory = [], limit = 6) {
  if (cachedMessages.length === 0 || Date.now() - lastLoadedTime > 600000) {
    loadDatasets();
  }

  if (cachedMessages.length === 0 && cachedDialogues.length === 0) {
    return { relevantMessages: [], relevantDialogues: [] };
  }

  // Combina a query atual com as últimas 6 mensagens do histórico para entender o assunto completo
  const historySnippet = recentHistory.slice(-6).map(h => h.content).join(' ');
  const fullSearchText = `${query} ${historySnippet}`;
  const queryTokens = extractKeywords(fullSearchText);

  if (queryTokens.length === 0) {
    return { relevantMessages: [], relevantDialogues: [] };
  }

  // 1. Pontuação de diálogos com peso contextual
  const scoredDialogues = cachedDialogues.map(d => {
    let score = 0;
    const otherTokens = extractKeywords(d.otherMessage || '');
    const targetTokens = extractKeywords(d.targetResponse || '');

    for (const token of queryTokens) {
      if (otherTokens.includes(token)) score += 4; // Match direto na pergunta/gatilho
      if (targetTokens.includes(token)) score += 2; // Match na resposta
    }

    return {
      dialogue: { user: `${d.otherUser}: ${d.otherMessage}`, duba: d.targetResponse },
      score
    };
  }).filter(item => item.score >= 4) // Requer relevância mínima
    .sort((a, b) => b.score - a.score);

  // 2. Pontuação de mensagens individuais reais / fatos
  const scoredMessages = cachedMessages.map(m => {
    let score = 0;
    const msgTokens = extractKeywords(m.content || '');

    for (const token of queryTokens) {
      if (msgTokens.includes(token)) score += 3;
    }

    return {
      content: m.content,
      score
    };
  }).filter(item => item.score >= 3) // Requer relevância mínima
    .sort((a, b) => b.score - a.score);

  // Seleciona apenas os itens com relevância comprovada
  const topDialogues = scoredDialogues.slice(0, limit).map(d => d.dialogue);
  const topMessages = scoredMessages.slice(0, limit).map(m => m.content);

  return {
    relevantMessages: topMessages,
    relevantDialogues: topDialogues
  };
}
