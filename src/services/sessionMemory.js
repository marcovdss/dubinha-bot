import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sessionFilePath = path.join(__dirname, '../../data/session_memory.json');

/**
 * Memória de Sessão & Trabalho de Curto Prazo (Working Memory)
 * Rastreia tópicos recentes, desabafos, jogos e comentários de cada membro no servidor
 * com persistência automática em disco para não esquecer após reinicializações.
 */

import { readJsonSafe, writeJsonAtomic } from '../utils/fileStorage.js';

const memberSessions = new Map();

// Expiração de memória de curto prazo após 12 horas
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

let saveTimeout = null;

function loadSessionsFromFile() {
  const data = readJsonSafe(sessionFilePath, { sessions: [] });
  const now = Date.now();
  if (Array.isArray(data.sessions)) {
    for (const s of data.sessions) {
      if (s.userId && s.lastActive && now - s.lastActive < SESSION_TTL_MS * 2) {
        memberSessions.set(s.userId, {
          authorName: s.authorName,
          topics: Array.isArray(s.topics) ? s.topics.filter(t => now - t.timestamp < SESSION_TTL_MS) : [],
          lastActive: s.lastActive
        });
      }
    }
  }
}

function scheduleSave() {
  if (saveTimeout) return;
  saveTimeout = setTimeout(() => {
    saveTimeout = null;
    const now = Date.now();
    const sessions = [];
    for (const [userId, session] of memberSessions.entries()) {
      if (now - session.lastActive < SESSION_TTL_MS * 2) {
        sessions.push({
          userId,
          authorName: session.authorName,
          topics: session.topics.filter(t => now - t.timestamp < SESSION_TTL_MS),
          lastActive: session.lastActive
        });
      }
    }
    writeJsonAtomic(sessionFilePath, { sessions, updatedAt: new Date().toISOString() });
  }, 3000);
  if (saveTimeout && typeof saveTimeout.unref === 'function') {
    saveTimeout.unref();
  }
}

// Carrega na inicialização
loadSessionsFromFile();

/**
 * Registra atividade relevante de um membro na memória de sessão
 * @param {string} userId
 * @param {string} authorName
 * @param {string} text
 */
export function trackMemberActivity(userId, authorName, text) {
  if (!userId || !text) return;

  const now = Date.now();
  const clean = text.trim();
  if (clean.length < 3) return;

  // Filtra risadas puras e saudações/monossílabos secos para não poluir a memória
  const isPureLaughter = /^[khrsa\s.,!?]+$/i.test(clean);
  const isGenericGreeting = /^(oi|ola|salve|eai|e ai|eae|blz|opa|flw|vlw|sim|nao|não|aham)$/i.test(clean);
  if (isPureLaughter || isGenericGreeting) return;

  let session = memberSessions.get(userId);
  if (!session) {
    session = {
      authorName,
      topics: [],
      lastActive: now
    };
  }

  session.authorName = authorName;
  session.lastActive = now;

  // Adiciona a fala recente (mantém até 12 falas por membro para mais profundidade)
  session.topics.push({
    text: clean,
    timestamp: now
  });

  if (session.topics.length > 12) {
    session.topics.shift();
  }

  memberSessions.set(userId, session);
  scheduleSave();
}

/**
 * Retorna o resumo da memória de sessão para um membro específico
 * @param {string} userId
 * @returns {string}
 */
export function getMemberSessionSummary(userId) {
  if (!userId) return '';
  const now = Date.now();
  const session = memberSessions.get(userId);
  if (!session) return '';

  const recentTopics = session.topics.filter(t => now - t.timestamp < SESSION_TTL_MS);
  if (recentTopics.length === 0) return '';

  return recentTopics
    .slice(-5)
    .map(t => `"${t.text}"`)
    .join(' | ');
}

/**
 * Retorna o contexto de sessão de todos os membros ativos recentemente
 * @returns {string}
 */
export function getAllActiveSessionSummaries() {
  const now = Date.now();
  const activeEntries = [];

  for (const [userId, session] of memberSessions.entries()) {
    if (now - session.lastActive > SESSION_TTL_MS * 2) {
      memberSessions.delete(userId);
      continue;
    }

    if (now - session.lastActive < SESSION_TTL_MS) {
      const recent = session.topics.filter(t => now - t.timestamp < SESSION_TTL_MS);
      if (recent.length > 0) {
        const lastFew = recent.slice(-4).map(t => `"${t.text}"`).join(', ');
        activeEntries.push(`- @${session.authorName} comentou hoje: ${lastFew}`);
      }
    }
  }

  if (activeEntries.length === 0) return '';

  return `[MEMÓRIA DE CURTO PRAZO DOS MEMBROS HOJE]:\n${activeEntries.join('\n')}\n`;
}
