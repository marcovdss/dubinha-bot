/**
 * Memória de Sessão & Trabalho de Curto Prazo (Working Memory)
 * Rastreia tópicos recentes, desabafos, jogos e comentários de cada membro no servidor
 */

const memberSessions = new Map();

// Expiração de memória de curto prazo após 6 horas
const SESSION_TTL_MS = 6 * 60 * 60 * 1000;

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
  if (clean.length < 5) return;

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

  // Adiciona a fala recente (mantém até 8 falas por membro)
  session.topics.push({
    text: clean,
    timestamp: now
  });

  if (session.topics.length > 8) {
    session.topics.shift();
  }

  memberSessions.set(userId, session);
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

  // Limpa tópicos expirados
  const recentTopics = session.topics.filter(t => now - t.timestamp < SESSION_TTL_MS);
  if (recentTopics.length === 0) return '';

  return recentTopics
    .slice(-4)
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
    // Remove sessões antigas para liberar memória
    if (now - session.lastActive > SESSION_TTL_MS * 2) {
      memberSessions.delete(userId);
      continue;
    }

    if (now - session.lastActive < SESSION_TTL_MS) {
      const recent = session.topics.filter(t => now - t.timestamp < SESSION_TTL_MS);
      if (recent.length > 0) {
        const lastFew = recent.slice(-3).map(t => `"${t.text}"`).join(', ');
        activeEntries.push(`- @${session.authorName} comentou recentemente: ${lastFew}`);
      }
    }
  }

  if (activeEntries.length === 0) return '';

  return `[MEMÓRIA DE CURTO PRAZO DOS MEMBROS HOJE]:\n${activeEntries.join('\n')}\n`;
}
