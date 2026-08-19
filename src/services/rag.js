import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.join(__dirname, '../../data');
const customMemoryPath = path.join(dataDir, 'custom_memory.json');

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
  'estar', 'aqui', 'ai', 'aí', 'la', 'lá', 'ja', 'já', 'so', 'só', 'ne', 'né',
  'tipo', 'bem', 'mais', 'menos', 'muito', 'pouco', 'tambem', 'tbm'
]);

// Clusters semânticos de tópicos amplamente expandidos
const TOPIC_CLUSTERS = {
  culinaria: [
    'comida', 'cozinhar', 'culinaria', 'gastronomia', 'receita', 'janta', 'almoco',
    'fome', 'panela', 'curso', 'mocas', 'moças', 'restaurante', 'prato', 'miojo',
    'salsicha', 'lanche', 'pizza', 'abacaxi', 'macaxeira', 'mandioca', 'confeitaria',
    'bolo', 'doce', 'farinha', 'salgado', 'comer'
  ],
  games: [
    'jogo', 'jogar', 'game', 'steam', 'wow', 'warframe', 'delta', 'bf', 'bf4', 'bf6',
    'fps', 'nerf', 'patch', 'update', 'blizz', 'blizzard', 'grind', 'aura', 'arma',
    'runescape', 'osrs', 'cs', 'cs2', 'mirage', 'setup', 'rgb', 'quest', 'quests',
    'dropou', 'baixou', 'desinstalou', 'viciar', 'zombie', 'army'
  ],
  hardware: [
    'pc', 'computador', 'placa', 'video', 'gpu', 'processador', 'cooler', 'fonte',
    'gabinete', 'teclado', 'mouse', 'monitor', 'bios', 'driver', 'carcaca', 'carcaça',
    'derreter', 'esquentar', 'mecanico', 'barulhento', 'ssd', 'nvme', 'hd', 'setup',
    'rgb', 'memoria', 'marretada'
  ],
  economia: [
    'dinheiro', 'comprar', 'comprou', 'preco', 'preço', 'caro', 'barato', 'pix',
    'reais', 'conto', 'gratis', 'reembolso', 'rasgando', 'tostao', 'tostão', 'furado',
    'liso', 'steam', 'promocao', 'promoção', 'gastar', 'emprestimo', 'empresta'
  ],
  familia_e_vida: [
    'avo', 'avó', 'horas', 'relogio', 'relógio', 'mae', 'mãe', 'casa', 'dormir',
    'sono', 'preguiça', 'preguica', 'cansado', 'rotina', 'acordar', 'cedo', 'tarde'
  ],
  humor_e_memes: [
    'lothlorien', 'senhor dos aneis', 'lotr', 'meme', 'mod', 'gif', 'video',
    'palhaco', 'palhaço', 'farinha', 'tapa', 'bunda', 'nadege', 'zoeira', 'corno',
    'doidera', 'loucura'
  ],
  social_e_mulheres: [
    'mulher', 'mina', 'gostosa', 'amiga', 'namorada', 'moca', 'moça', 'fofoca',
    'bikini', 'foto', 'instagram', 'tiktok', 'gostosa pra crl'
  ],
  politica: [
    'politica', 'lula', 'voto', 'eleicao', 'eleição', 'pais', 'brasil', 'governo',
    'imposto', 'baba', 'justificar'
  ]
};

/**
 * Carrega todos os datasets de mensagens brutas e memória customizada da pasta data/
 */
export function loadDatasets() {
  try {
    if (!fs.existsSync(dataDir)) {
      return { messages: [], dialogues: [] };
    }

    const files = fs.readdirSync(dataDir).filter(f => f.startsWith('raw_messages_') && f.endsWith('.json'));
    const allMsgs = [];
    const allDialogues = [];

    // 1. Mensagens reais do histórico escaneado
    for (const file of files) {
      const filePath = path.join(dataDir, file);
      try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        if (Array.isArray(data.messages)) {
          allMsgs.push(...data.messages);
        }
        if (Array.isArray(data.dialogues)) {
          allDialogues.push(...data.dialogues);
        }
      } catch (e) {}
    }

    // 2. Diálogos e frases de custom_memory.json
    if (fs.existsSync(customMemoryPath)) {
      try {
        const customData = JSON.parse(fs.readFileSync(customMemoryPath, 'utf-8'));
        if (Array.isArray(customData.phrases_and_dialogues)) {
          for (const item of customData.phrases_and_dialogues) {
            if (item.frase) {
              allMsgs.unshift({ id: `custom_${item.frase}`, content: item.frase, channel: 'custom' });
              if (item.contexto) {
                allDialogues.unshift({
                  otherUser: 'Amigo',
                  otherMessage: item.contexto,
                  targetResponse: item.frase
                });
              }
            }
          }
        }
      } catch (e) {}
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
 * Extrai palavras-chave limpas e expandidas por clusters semânticos
 */
function extractKeywords(text) {
  if (!text) return [];
  const tokens = text
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length >= 3 && !STOPWORDS.has(word));

  const expanded = new Set(tokens);

  for (const token of tokens) {
    for (const cluster of Object.values(TOPIC_CLUSTERS)) {
      if (cluster.some(item => item === token || item.includes(token) || token.includes(item))) {
        cluster.forEach(syn => expanded.add(syn));
      }
    }
  }

  return Array.from(expanded);
}

/**
 * Retorna uma amostra pseudo-aleatória e rotativa de diálogos e mensagens reais do dataset
 * para garantir que a IA NUNCA fique sem repertório autêntico no prompt.
 */
function getDiverseFallbackSample(limit = 6) {
  const sampleDialogues = [];
  const sampleMessages = [];

  // Filtra mensagens ricas (> 12 caracteres, excluindo risadas puras)
  const isPureLaughter = (str) => /^[khrsa\s.,!?]+$/i.test(str);

  const richMessages = cachedMessages.filter(m => {
    const c = (m.content || '').trim().toLowerCase();
    return c.length > 12 && !isPureLaughter(c);
  });

  const richDialogues = cachedDialogues.filter(d => {
    const c = (d.targetResponse || '').trim().toLowerCase();
    return c.length > 10 && !isPureLaughter(c);
  });

  // Embaralha aleatoriamente
  const shuffledDialogues = [...richDialogues].sort(() => 0.5 - Math.random());
  const shuffledMessages = [...richMessages].sort(() => 0.5 - Math.random());

  sampleDialogues.push(...shuffledDialogues.slice(0, Math.min(limit, 4)).map(d => ({
    user: `${d.otherUser}: ${d.otherMessage}`,
    duba: d.targetResponse
  })));

  sampleMessages.push(...shuffledMessages.slice(0, Math.min(limit, 5)).map(m => m.content));

  return {
    relevantMessages: sampleMessages,
    relevantDialogues: sampleDialogues
  };
}

/**
 * Busca memórias e diálogos contextualmente relevantes usando pontuação flexível
 * e garantia de fallback variado se não houver match direto.
 * @param {string} query - Mensagem atual do usuário
 * @param {Array<{author: string, content: string}>} recentHistory - Contexto recente do canal
 * @param {number} limit - Quantidade máxima de exemplos
 * @returns {{ relevantMessages: string[], relevantDialogues: Array<{user: string, duba: string}> }}
 */
export function searchKnowledgeBase(query, recentHistory = [], limit = 8) {
  if (cachedMessages.length === 0 || Date.now() - lastLoadedTime > 300000) {
    loadDatasets();
  }

  if (cachedMessages.length === 0 && cachedDialogues.length === 0) {
    return { relevantMessages: [], relevantDialogues: [] };
  }

  // Combina query atual + últimas 6 mensagens do canal para contexto rico
  const historySnippet = recentHistory.slice(-6).map(h => h.content).join(' ');
  const fullSearchText = `${query} ${historySnippet}`;
  const queryTokens = extractKeywords(fullSearchText);

  if (queryTokens.length === 0) {
    // Se não há palavras-chave específicas (ex: "oi", "e aí", "kkk"), fornece repertório variado do Jinchi
    return getDiverseFallbackSample(limit);
  }

  // 1. Pontuação de diálogos
  const scoredDialogues = cachedDialogues.map(d => {
    let score = 0;
    const otherTokens = extractKeywords(d.otherMessage || '');
    const targetTokens = extractKeywords(d.targetResponse || '');

    for (const token of queryTokens) {
      if (otherTokens.includes(token)) score += 4;
      if (targetTokens.includes(token)) score += 2;
    }

    return {
      dialogue: { user: `${d.otherUser}: ${d.otherMessage}`, duba: d.targetResponse },
      score
    };
  }).filter(item => item.score >= 2)
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
  }).filter(item => item.score >= 2)
    .sort((a, b) => b.score - a.score);

  let topDialogues = scoredDialogues.slice(0, limit).map(d => d.dialogue);
  let topMessages = scoredMessages.slice(0, limit).map(m => m.content);

  // Se tiver poucos matches (< 2), complementa com amostra diversificada para não faltar vocabulário
  if (topDialogues.length < 2 && topMessages.length < 2) {
    const fallbackSample = getDiverseFallbackSample(limit);
    topDialogues = [...topDialogues, ...fallbackSample.relevantDialogues].slice(0, limit);
    topMessages = [...topMessages, ...fallbackSample.relevantMessages].slice(0, limit);
  }

  return {
    relevantMessages: topMessages,
    relevantDialogues: topDialogues
  };
}
