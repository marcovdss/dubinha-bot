import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataPath = path.join(__dirname, '../../data/raw_messages_264201832492957698.json');

const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const msgs = (data.messages || []).map(m => typeof m === 'string' ? m : m.content).filter(Boolean);
const dialogues = data.dialogues || [];

console.log(`\n======================================================`);
console.log(`📊 ANÁLISE COMPLETA DO CORPUS DO JINCHI (${msgs.length} mensagens, ${dialogues.length} diálogos)`);
console.log(`======================================================\n`);

// 1. Tipos de reações curtas
const ultraShort = msgs.filter(m => m.length <= 15);
console.log(`🔹 REAÇÕES ULTRA-CURTAS (${ultraShort.length} msgs):`);
console.log(Array.from(new Set(ultraShort)).slice(0, 25).map(m => `  • "${m}"`).join('\n'));

// 2. Opiniões e julgamentos de coisas/links
const opinions = msgs.filter(m => /acho|achei|pra mim|pior que|melhor|foda|paia|pica|bosta|ruim/i.test(m));
console.log(`\n🔹 OPINIÕES & AVALIAÇÕES (${opinions.length} msgs):`);
console.log(opinions.slice(0, 15).map(m => `  • "${m}"`).join('\n'));

// 3. Menções a jogos e hardware
const games = msgs.filter(m => /wow|bf|battlefield|delta|cs|warframe|runescape|pc|steam|ssd|gpu|placa|jogo|jogar/i.test(m));
console.log(`\n🔹 JOGOS & HARDWARE (${games.length} msgs):`);
console.log(games.slice(0, 15).map(m => `  • "${m}"`).join('\n'));

// 4. Reações a fotos e memes de mulheres
const women = msgs.filter(m => /gostosa|mulher|amiga|gata|casar|namorada/i.test(m));
console.log(`\n🔹 REAÇÕES A MULHERES / MEMES (${women.length} msgs):`);
console.log(women.slice(0, 10).map(m => `  • "${m}"`).join('\n'));

// 5. Vocabulário de "caba", "vei", "mano"
const slang = msgs.filter(m => /caba|vei|mano|poha|crl|vsf/i.test(m));
console.log(`\n🔹 FRASES COM GÍRIAS NATURAIS (${slang.length} msgs):`);
console.log(slang.slice(0, 15).map(m => `  • "${m}"`).join('\n'));

// 6. Análise de padrões de diálogos reais (pergunta -> resposta real do Jinchi)
console.log(`\n🔹 AMOSTRA DE DIÁLOGOS DIRETOS (${dialogues.length} pares):`);
dialogues.slice(0, 15).forEach((d, idx) => {
  console.log(`  [${idx+1}] ${d.otherUser}: "${d.otherMessage}" ➔ JINCHI: "${d.targetResponse}"`);
});
