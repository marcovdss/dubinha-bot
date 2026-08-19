import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const memoryFilePath = path.join(__dirname, '../../data/episodic_memory.json');

let cachedEpisodic = null;

function loadMemoryFile() {
  try {
    if (fs.existsSync(memoryFilePath)) {
      cachedEpisodic = JSON.parse(fs.readFileSync(memoryFilePath, 'utf-8'));
    } else {
      cachedEpisodic = { episodic_events: [] };
    }
  } catch (err) {
    console.error('[Episodic Memory] Erro ao carregar arquivo:', err.message);
    cachedEpisodic = { episodic_events: [] };
  }
  return cachedEpisodic;
}

function saveMemoryFile() {
  try {
    if (!cachedEpisodic) return;
    const dir = path.dirname(memoryFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(memoryFilePath, JSON.stringify(cachedEpisodic, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Episodic Memory] Erro ao salvar arquivo:', err.message);
  }
}

/**
 * Busca memórias de longo prazo sobre o interlocutor, outros membros ou sobre a vida do Jinchi
 * @param {string} userName - Nome do interlocutor
 * @param {string} query - Mensagem atual
 * @returns {string[]}
 */
export function getEpisodicMemories(userName = '', query = '') {
  const data = cachedEpisodic || loadMemoryFile();
  const events = data.episodic_events || [];

  if (events.length === 0) return [];

  const cleanUser = userName.toLowerCase().trim();
  const cleanQuery = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const queryTokens = cleanQuery.split(/[^\w]+/).filter(w => w.length >= 3);

  const matchedSet = new Set();
  const results = [];

  for (const item of events) {
    const itemUser = (item.user || '').toLowerCase();
    const itemFact = (item.fact || '').toLowerCase();
    const itemNormalized = itemFact.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    // 1. Match direto pelo usuário que está conversando
    if (cleanUser && itemUser && (itemUser === cleanUser || itemUser.includes(cleanUser) || cleanUser.includes(itemUser))) {
      const entry = `[Memória sobre @${item.user}]: ${item.fact}`;
      if (!matchedSet.has(entry)) {
        matchedSet.add(entry);
        results.push(entry);
      }
      continue;
    }

    // 2. Se a conversa citar outro membro pelo nome (ex: Zanin, Coyote, f, etc.)
    if (itemUser && cleanQuery.includes(itemUser)) {
      const entry = `[Memória Histórica sobre @${item.user}]: ${item.fact}`;
      if (!matchedSet.has(entry)) {
        matchedSet.add(entry);
        results.push(entry);
      }
      continue;
    }

    // 3. Match por palavras-chave relevantes no assunto (jogos, teclado, culinária, avó, comida, setup, etc.)
    const matchesKeyword = queryTokens.some(token => itemNormalized.includes(token));
    if (matchesKeyword) {
      const isJinchiSelf = itemUser === 'jinchi' || itemUser === 'dubinha';
      const label = isJinchiSelf ? `[Lembrança da sua própria vida (${item.topic || 'história'})]` : `[Fato sobre @${item.user}]`;
      const entry = `${label}: ${item.fact}`;
      if (!matchedSet.has(entry)) {
        matchedSet.add(entry);
        results.push(entry);
      }
    }
  }

  // Retorna até 6 memórias relevantes
  return results.slice(0, 6);
}

/**
 * Grava uma nova memória episódica permanente no arquivo
 * @param {string} user - Nome do usuário
 * @param {string} fact - O acontecimento ou fato
 * @param {string} topic - Categoria (ex: 'vida', 'games', 'hardware', 'trabalho', 'culinaria')
 */
export function recordEpisodicFact(user, fact, topic = 'geral') {
  const data = cachedEpisodic || loadMemoryFile();
  if (!data.episodic_events) data.episodic_events = [];

  const exists = data.episodic_events.some(
    e => e.user.toLowerCase() === user.toLowerCase() && e.fact.toLowerCase() === fact.toLowerCase()
  );

  if (exists) return;

  const newEvent = {
    user,
    fact,
    date: new Date().toISOString().split('T')[0],
    topic
  };

  data.episodic_events.push(newEvent);
  saveMemoryFile();
  console.log(`💾 [Memória Permanente Gravada] @${user}: "${fact}" (${topic})`);
}

/**
 * Analisador heurístico expandido para identificar fatos e preferências relevantes em mensagens do chat
 * @param {string} userName
 * @param {string} content
 */
export function inspectLiveFact(userName, content) {
  if (!content || content.length < 8 || !userName) return;

  const text = content.toLowerCase().trim();

  // 1. Compras e aquisições
  if (/comprei\s+(?:um|uma|o|a)\s+([a-zA-Z0-9\s]{3,35})/i.test(text)) {
    const match = text.match(/comprei\s+(?:um|uma|o|a)\s+([a-zA-Z0-9\s]{3,35})/i);
    if (match) recordEpisodicFact(userName, `comprou ${match[1].trim()}`, 'compras');
  }
  // 2. Hardware ou periféricos com problemas / novos
  else if (/(?:meu|minha)\s+(pc|computador|placa|gpu|fone|headset|mouse|teclado|carro|celular)\s+(queimou|estragou|parou|quebrou|chegou|novo|nova)/i.test(text)) {
    const match = text.match(/(?:meu|minha)\s+(pc|computador|placa|gpu|fone|headset|mouse|teclado|carro|celular)\s+(queimou|estragou|parou|quebrou|chegou|novo|nova)/i);
    if (match) recordEpisodicFact(userName, `o/a ${match[1]} dele(a) ${match[2]}`, 'hardware');
  }
  // 3. Planos e vida pessoal
  else if (/(?:vou|to indo|pretendo)\s+(viajar|mudar|trabalhar|sair|dormir|estudar|casar|treinar)/i.test(text)) {
    const match = text.match(/(?:vou|to indo|pretendo)\s+(viajar|mudar|trabalhar|sair|dormir|estudar|casar|treinar)\s*([^.,!]{0,30})/i);
    if (match) recordEpisodicFact(userName, `comentou que vai ${match[1]} ${match[2] || ''}`.trim(), 'vida');
  }
  // 4. Jogos que a pessoa está jogando
  else if (/(?:to jogando|baixei|viciado em|jogando|instalou)\s+([a-zA-Z0-9\s]{3,25})/i.test(text)) {
    const match = text.match(/(?:to jogando|baixei|viciado em|jogando|instalou)\s+([a-zA-Z0-9\s]{3,25})/i);
    if (match && !['nada', 'aqui', 'agora', 'com'].includes(match[1].trim())) {
      recordEpisodicFact(userName, `está jogando ${match[1].trim()}`, 'games');
    }
  }
  // 5. Preferências marcantes de comida / gostos
  else if (/(?:meu prato favorito|comida favorita|amo|adoro|odeio|detesto)\s+([a-zA-Z0-9\s]{3,25})/i.test(text)) {
    const match = text.match(/(?:meu prato favorito|comida favorita|amo|adoro|odeio|detesto)\s+([a-zA-Z0-9\s]{3,25})/i);
    if (match) recordEpisodicFact(userName, `gosto/opinião: ${match[0].trim()}`, 'culinaria');
  }
}
