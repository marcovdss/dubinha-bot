import 'dotenv/config';
import { generatePersonaResponse } from '../services/ai.js';
import { extractUrlContext, extractMediaUrlsFromText, isMediaUrl } from '../utils/urlHelper.js';
import { splitMessageIntoChunks } from '../utils/messageSender.js';

// Amostra de imagem 1x1 GIF / PNG em base64 válida para testar o pipeline multimodal
const SAMPLE_IMAGE_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const testScenarios = [
  {
    name: '1. Vídeo de Mulher Bonita / Dança',
    author: 'Zanin',
    prompt: 'olha esse vídeo que mandaram no grupo',
    mediaBuffers: [{ data: SAMPLE_IMAGE_BASE64, mimeType: 'image/png', isVideo: true }],
    extraContext: {}
  },
  {
    name: '2. Pergunta com Vídeo Bizarro / Satânico',
    author: 'Zanin',
    prompt: 'falaram que voce é esse cara aqui @jinchi, procede?',
    mediaBuffers: [{ data: SAMPLE_IMAGE_BASE64, mimeType: 'image/png', isVideo: true }],
    extraContext: {}
  },
  {
    name: '3. Foto de Prato / Comida (Mandioca)',
    author: 'f',
    prompt: 'mandioca frita no almoço hoje',
    mediaBuffers: [{ data: SAMPLE_IMAGE_BASE64, mimeType: 'image/png', isVideo: false }],
    extraContext: {}
  },
  {
    name: '4. Foto de Setup Gamer / Periféricos',
    author: 'Samurai',
    prompt: 'olha como ficou meu setup novo com o teclado mecânico',
    mediaBuffers: [{ data: SAMPLE_IMAGE_BASE64, mimeType: 'image/png', isVideo: false }],
    extraContext: {}
  },
  {
    name: '5. Link do Twitter/X (vxtwitter / fixvx)',
    author: 'Duds',
    prompt: 'olha isso',
    mediaBuffers: [],
    extraContext: {
      urlContext: '[CONTEÚDO DO(S) LINK(S) ENVIADO(S)]:\n- Post do Twitter/X de @AdamKinzinger (https://fixvx.com/AdamKinzinger/status/2060052409276121501): "Vídeo de meme engraçado dos caras caindo da cadeira" [Contém Vídeo/Clipe]\n'
    }
  },
  {
    name: '6. Link do YouTube (Vídeo de Gameplay / Música)',
    author: 'Coyote',
    prompt: 'https://www.youtube.com/watch?v=3Es1P_PFA7Y',
    mediaBuffers: [],
    extraContext: {
      urlContext: '[CONTEÚDO DO(S) LINK(S) ENVIADO(S)]:\n- Vídeo do YouTube (https://www.youtube.com/watch?v=3Es1P_PFA7Y): Título: "Battlefield 4 - Epic Sniper Montage 2026" (Canal: BF4Legends)\n'
    }
  }
];

async function runTests() {
  console.log('🎬 === TESTE DE REAÇÕES PERSONALIZADAS A VÍDEOS, FOTOS E LINKS ===\n');

  // Teste 1: urlHelper
  console.log('🔍 Testando Detecção e Extração de URLs:');
  const testUrls = [
    'https://www.youtube.com/watch?v=NX_wjLFR1MA',
    'https://fixvx.com/_osamm/status/2085343689744781775/video/1',
    'https://example.com/video.mp4?token=abc',
    'https://tenor.com/view/foghorn-leghorn-spank-gif-24573738'
  ];

  for (const u of testUrls) {
    console.log(`- isMediaUrl("${u}"):`, isMediaUrl(u));
  }

  console.log('\n--------------------------------------------------\n');

  // Teste 2: Respostas do Gemini
  for (const s of testScenarios) {
    console.log(`📌 Cenário: ${s.name}`);
    console.log(`👤 @${s.author}: "${s.prompt}"`);

    const res = await generatePersonaResponse(
      s.prompt,
      [],
      s.author,
      s.mediaBuffers,
      s.extraContext
    );

    const chunks = splitMessageIntoChunks(res);
    console.log(`💬 Jinchi: "${res}" (${res.length} chars, ${chunks.length} msgs)`);
    chunks.forEach((c, idx) => console.log(`   [Msg ${idx+1}] > ${c}`));
    console.log('--------------------------------------------------');
  }

  console.log('\n✅ Teste de mídia concluído com sucesso!');
}

runTests();
