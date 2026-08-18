import 'dotenv/config';
import { generatePersonaResponse } from '../services/ai.js';
import { splitMessageIntoChunks } from '../utils/messageSender.js';

const testCases = [
  { author: 'Coyote', prompt: 'Tu pode jogar e ficar aqui com a gente' },
  { author: 'Zé Cisterna', prompt: 'baixa ai o zombie army 4' },
  { author: 'Zanin', prompt: 'qual o melhor battlefield?' },
  { author: 'Anderson', prompt: 'conta ai como que foi aquele curso de culinária que você fez com as moças' }
];

async function run() {
  console.log('=== TESTE DE VARIAÇÃO DE 1 ATÉ 5 MENSAGENS ===\n');
  for (const t of testCases) {
    const res = await generatePersonaResponse(t.prompt, [], t.author);
    const chunks = splitMessageIntoChunks(res);
    console.log(`👤 ${t.author}: "${t.prompt}"`);
    console.log(`📦 Quantidade de mensagens que serão enviadas: ${chunks.length}`);
    chunks.forEach((c, idx) => console.log(`   [Msg ${idx+1}] > ${c}`));
    console.log('--------------------------------------------------');
  }
}

run();
