import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataPath = path.join(__dirname, '../../data/raw_messages_264201832492957698.json');
const dataset = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

console.log('==============================================');
console.log(`📊 TOTAL MENSAGENS REAIS: ${dataset.messages.length}`);
console.log(`🗣️ TOTAL DIÁLOGOS CAPTURADOS: ${dataset.dialogues.length}`);
console.log('==============================================\n');

// 1. Contagem de palavras e expressões mais frequentes
const wordFreq = {};
dataset.messages.forEach(m => {
  const clean = m.content.toLowerCase().replace(/[^\w\s]/g, ' ');
  clean.split(/\s+/).forEach(w => {
    if (w.length > 2) {
      wordFreq[w] = (wordFreq[w] || 0) + 1;
    }
  });
});

const topWords = Object.entries(wordFreq)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 40);

console.log('🔥 TOP 40 PALAVRAS MAIS USADAS PELO JINCHI:');
topWords.forEach(([w, count], i) => {
  console.log(`  ${(i + 1).toString().padStart(2, ' ')}. "${w}" (${count}x)`);
});

// 2. Interações por pessoa (com quem ele mais fala)
const userInteractions = {};
dataset.dialogues.forEach(d => {
  userInteractions[d.otherUser] = (userInteractions[d.otherUser] || 0) + 1;
});

console.log('\n👥 COM QUEM ELE MAIS INTERAGE:');
Object.entries(userInteractions)
  .sort((a, b) => b[1] - a[1])
  .forEach(([user, count]) => {
    console.log(`  • ${user}: ${count} diálogos`);
  });

// 3. Amostra de 25 diálogos reais em temas variados
console.log('\n💬 AMOSTRA DE DIÁLOGOS VARIADOS:');
dataset.dialogues.slice(0, 30).forEach((d, i) => {
  console.log(`\n--- [Diálogo ${i + 1}] (${d.channel || 'chat'}) ---`);
  console.log(`[${d.otherUser}]: "${d.otherMessage}"`);
  console.log(`[JINCHI]: "${d.targetResponse}"`);
});
