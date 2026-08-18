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
 * Busca memórias de longo prazo sobre o interlocutor ou o assunto
 * @param {string} userName - Nome do interlocutor
 * @param {string} query - Mensagem atual
 * @returns {string[]}
 */
export function getEpisodicMemories(userName = '', query = '') {
  const data = cachedEpisodic || loadMemoryFile();
  const events = data.episodic_events || [];

  if (events.length === 0) return [];

  const cleanUser = userName.toLowerCase().trim();
  const cleanQuery = query.toLowerCase().trim();

  const matches = [];

  for (const item of events) {
    const itemUser = (item.user || '').toLowerCase();
    const itemFact = (item.fact || '').toLowerCase();

    // Match por usuário
    if (cleanUser && itemUser && (itemUser === cleanUser || itemUser.includes(cleanUser) || cleanUser.includes(itemUser))) {
      matches.push(`[Sobre @${item.user}]: ${item.fact}`);
      continue;
    }

    // Match por palavra-chave no assunto
    if (cleanQuery && itemFact.split(/\s+/).some(w => w.length > 3 && cleanQuery.includes(w))) {
      matches.push(`[Fato Histórico sobre @${item.user}]: ${item.fact}`);
    }
  }

  // Retorna até 4 memórias mais relevantes
  return matches.slice(0, 4);
}

/**
 * Grava uma nova memória episódica permanente no arquivo
 * @param {string} user - Nome do usuário
 * @param {string} fact - O acontecimento ou fato
 * @param {string} topic - Categoria (ex: 'vida', 'games', 'hardware', 'trabalho')
 */
export function recordEpisodicFact(user, fact, topic = 'geral') {
  const data = cachedEpisodic || loadMemoryFile();
  if (!data.episodic_events) data.episodic_events = [];

  // Evita duplicatas exatas
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
 * Analisador heurístico leve para identificar fatos relevantes em mensagens do chat
 * @param {string} userName
 * @param {string} content
 */
export function inspectLiveFact(userName, content) {
  if (!content || content.length < 15 || !userName) return;

  const text = content.toLowerCase();

  // Padrões de fatos cotidianos revelados por membros
  if (/comprei\s+(?:um|uma|o|a)\s+([a-zA-Z0-9\s]{4,30})/i.test(text)) {
    const match = text.match(/comprei\s+(?:um|uma|o|a)\s+([a-zA-Z0-9\s]{4,30})/i);
    if (match) recordEpisodicFact(userName, `comprou ${match[1].trim()}`, 'compras');
  } else if (/meu\s+(pc|computador|fone|mouse|teclado|carro)\s+(queimou|estragou|parou|quebrou)/i.test(text)) {
    const match = text.match(/meu\s+(pc|computador|fone|mouse|teclado|carro)\s+(queimou|estragou|parou|quebrou)/i);
    if (match) recordEpisodicFact(userName, `o ${match[1]} dele ${match[2]}`, 'hardware');
  } else if (/vou\s+(viajar|mudar|trabalhar|sair|dormir)/i.test(text)) {
    const match = text.match(/vou\s+(viajar|mudar|trabalhar|sair|dormir)\s*([^.,!]{0,25})/i);
    if (match) recordEpisodicFact(userName, `comentou que vai ${match[1]} ${match[2] || ''}`.trim(), 'vida');
  }
}
