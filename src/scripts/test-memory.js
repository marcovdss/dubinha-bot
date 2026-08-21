import 'dotenv/config';
import { searchKnowledgeBase } from '../services/rag.js';
import { getEpisodicMemories } from '../services/episodicMemory.js';
import { trackMemberActivity, getMemberSessionSummary, getAllActiveSessionSummaries } from '../services/sessionMemory.js';
import { buildSystemPrompt } from '../config/persona.js';

async function runTests() {
  console.log('=== TESTE 1: RAG SEARCH EXPANDIDO ===');
  const queries = ['vamos jogar delta', 'macaxeira frita', 'teclado mecanico', 'e ai'];
  for (const q of queries) {
    const res = searchKnowledgeBase(q, [], 4);
    console.log(`\nQuery: "${q}"`);
    console.log(`  Messages encontradas: ${res.relevantMessages.length}`);
    console.log(`  Dialogues encontrados: ${res.relevantDialogues.length}`);
    if (res.relevantMessages.length > 0) {
      console.log(`  Exemplo msg: "${res.relevantMessages[0]}"`);
    }
    if (res.relevantDialogues.length > 0) {
      console.log(`  Exemplo dial: "${res.relevantDialogues[0].user}" => "${res.relevantDialogues[0].duba}"`);
    }
  }

  console.log('\n=== TESTE 2: EPISODIC MEMORY ===');
  console.log('Memória sobre Zanin:', getEpisodicMemories('Zanin', 'jogar'));
  console.log('Memória sobre avó:', getEpisodicMemories('amigo', 'sua avo te pediu as horas'));
  console.log('Memória sobre culinaria:', getEpisodicMemories('f', 'curso de gastronomia'));

  console.log('\n=== TESTE 3: SESSION MEMORY ===');
  trackMemberActivity('12345', 'Zanin', 'comprei mais 3 jogos na promoção');
  trackMemberActivity('12345', 'Zanin', 'vou baixar o delta hj a noite');
  console.log('Session Zanin:', getMemberSessionSummary('12345'));
  console.log('All Active Sessions:\n' + getAllActiveSessionSummaries());

  console.log('=== TESTE 4: SYSTEM PROMPT BUILDER ===');
  const prompt = buildSystemPrompt('Zanin');
  console.log(`Prompt gerado com sucesso! Tamanho: ${prompt.length} caracteres.`);
  console.log('Contém regras?', prompt.includes('REGRAS LINGUÍSTICAS'));
  console.log('Contém memórias customizadas?', prompt.includes('FATOS & MEMÓRIAS DA SUA VIDA'));
}

runTests();
