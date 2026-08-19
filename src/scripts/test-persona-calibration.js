import 'dotenv/config';
import { generatePersonaResponse } from '../services/ai.js';
import { splitMessageIntoChunks } from '../utils/messageSender.js';

const testCases = [
  { author: 'Zanin', prompt: 'eae blz' },
  { author: 'Coyote', prompt: 'bora jogar delta hoje a noite?' },
  { author: 'Zanin', prompt: 'qual o melhor battlefield já feito?' },
  { author: 'f', prompt: 'mandioca frita é a melhor comida do mundo' },
  { author: 'Samurai', prompt: 'olha esse setup novo com teclado mecânico que montei' },
  { author: 'Zanin', prompt: 'vc falou tudo errado seu burro kkkk' },
  { author: 'Anderson', prompt: 'ta trabalhando com o que hj em dia?' },
  { author: 'vinion', prompt: 'o que você acha da situação da política agora?' },
  { author: 'f', prompt: 'olha essa foto dessa mina que o zanin mandou' },
  { author: 'Duds', prompt: 'se ta vivo ainda jinchi?' },
  { author: 'Gabus', prompt: 'me explica porque tu nao baixa o delta force de uma vez' },
  { author: 'Coyote', prompt: 'qual sobremesa tu recomenda fazer pro almoço?' }
];

async function run() {
  console.log('=== TESTE DE CALIBRAÇÃO & TRIMMING DA PERSONA DO JINCHI ===\n');
  let totalChars = 0;
  let totalMsgs = 0;

  for (const t of testCases) {
    const res = await generatePersonaResponse(t.prompt, [], t.author);
    const chunks = splitMessageIntoChunks(res);
    totalChars += res.length;
    totalMsgs += chunks.length;

    console.log(`👤 @${t.author}: "${t.prompt}"`);
    console.log(`💬 Jinchi (${res.length} chars, ${chunks.length} msg): "${res}"`);
    chunks.forEach((c, idx) => console.log(`   [Msg ${idx+1}] > ${c}`));
    console.log('--------------------------------------------------');
  }

  console.log(`\n📊 MÉTRICAS GERAIS:`);
  console.log(`Média de caracteres por resposta: ${(totalChars / testCases.length).toFixed(1)} chars`);
  console.log(`Média de mensagens geradas: ${(totalMsgs / testCases.length).toFixed(1)} msgs por turno`);
}

run();
