import 'dotenv/config';
import { getMemberProfile, addMemberFact, addMemberGame, formatMemberDossierForPrompt } from '../services/memberProfiles.js';
import { reinforceSuccessfulDialogue } from '../services/cognitiveLearning.js';
import { generatePersonaResponse } from '../services/ai.js';

async function testCognitiveSystem() {
  console.log('=== TESTE 1: MEMBER PROFILES & DOSSIÊ ===');
  const profileZanin = getMemberProfile('Zanin');
  console.log('Perfil Zanin encontrado:', profileZanin?.name);
  console.log('Jogos conhecidos:', profileZanin?.games);

  // Adiciona novo fato e jogo ao dossiê
  addMemberFact('Zanin', 'trocou de mousepad e agora usa um gigante');
  addMemberGame('Zanin', 'Helldivers 2');

  const dossierText = formatMemberDossierForPrompt('Zanin');
  console.log('\nDossiê Formatado para o Prompt:\n' + dossierText);

  console.log('=== TESTE 2: SOCIAL REINFORCEMENT ===');
  await reinforceSuccessfulDialogue('o que vc acha do cs2?', 'cs2 tá cheio de cheater meu vei, prefiro meu bf4', 'Risada da galera');
  console.log('Diálogo reforçado e gravado com sucesso!');

  console.log('\n=== TESTE 3: GERAÇÃO DA IA COM DOSSIÊ VIVO ===');
  const response = await generatePersonaResponse('e ai duba oq o zanin anda jogando ultimamente?', [], 'Coyote');
  console.log('Resposta da IA:', response);
}

testCognitiveSystem();
