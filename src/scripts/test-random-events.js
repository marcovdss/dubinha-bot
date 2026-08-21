import 'dotenv/config';
import { generatePersonaResponse } from '../services/ai.js';
import { fetchImageAttachment } from '../utils/mediaHelper.js';
import { getCurrentGame } from '../services/presenceManager.js';

console.log('🧪 === TESTANDO GERAÇÃO DE EVENTOS AUTÔNOMOS ===\n');

async function testEvents() {
  // 1. Teste de Pensamento de Sofá
  console.log('--- 1. Teste: Pensamento de Sofá ---');
  const thoughtPrompt = `Você é o Jinchi no Discord. Você está deitado no sofá e, do nada, resolveu mandar uma mensagem rápida no chat do servidor.
Assunto/Pensamento: "calor absurdo hoje e ventilador fraco".
Escreva de 1 a 2 linhas curtas, 100% em minúsculas, com tom preguiçoso, descontraído e autêntico, usando suas gírias naturais (vei, mano, caba, doidera). Não use prefixos.`;
  const thoughtRes = await generatePersonaResponse(thoughtPrompt);
  console.log('Resposta do Jinchi:');
  console.log(`> ${thoughtRes}\n`);

  // 2. Teste de Momento Gamer
  console.log('--- 2. Teste: Momento Gamer ---');
  const currentGame = getCurrentGame();
  const gamerPrompt = `Você é o Jinchi no Discord. Você está no meio de uma partida de "${currentGame}" e deu uma pausa de 10 segundos pra desabafar/comentar no chat com os amigos.
Pode ser: reclamando de sniper/camper, rindo de um fail, reclamando de lag/ping, comemorando uma jogada cagada, ou falando que vai desinstalar.
Escreva de 1 a 2 frases curtas, 100% em minúsculas, com humor cômico e despojado de gamer relaxado. Não use prefixos.`;
  const gamerRes = await generatePersonaResponse(gamerPrompt);
  console.log(`Jogo atual: ${currentGame}`);
  console.log('Resposta do Jinchi:');
  console.log(`> ${gamerRes}\n`);

  // 3. Teste de Foto com Legenda
  console.log('--- 3. Teste: Foto com Legenda ---');
  const theme = 'cuscuz quentinho com manteiga e ovo';
  console.log(`Buscando imagem de: "${theme}"...`);
  const attachment = await fetchImageAttachment(theme);
  console.log(`Attachment gerado:`, attachment ? 'Sucesso (Buffer baixado)' : 'Falhou');

  const photoPrompt = `Você é o Jinchi no Discord. Você está no chat dos seus amigos e acabou de enviar uma FOTO REAL no chat sobre "${theme}".
Escreva apenas uma legenda curta (1 ou 2 linhas), autêntica, em minúsculas, com humor despojado (ex: elogiando a comida, rindo da gambiarra, comentando a preguiça ou zoando no seu estilo seco).
IMPORTANTE: NÃO invente links de internet ou URLs, pois a foto real já está anexada. Não use prefixos.`;
  const photoRes = await generatePersonaResponse(photoPrompt);
  console.log('Legenda do Jinchi:');
  console.log(`> ${photoRes}\n`);

  // 4. Teste de Cobrança de Pizza
  console.log('--- 4. Teste: Cobrança de Pizza ---');
  const memberMention = '<@123456789>';
  const pizzaPrompt = `Você é o Jinchi. Você está no Discord e, DO NADA, bateu uma fome absurda e você quer comer uma pizza de pepperoni agora.
Você vai cobrar um PIX de 25 conto do seu amigo ${memberMention} pra inteirar o pedido.
Escreva de 2 a 3 linhas curtas separadas, 100% em minúsculas, com o seu jeitão relaxado de sofá (a geladeira tá vazia, fome da desgraça, pedindo na moralzinha pro amigo).
Obrigatoriamente inclua ${memberMention} no início da fala.`;
  const pizzaRes = await generatePersonaResponse(pizzaPrompt, [], 'Fulano');
  console.log('Resposta do Jinchi:');
  console.log(`> ${pizzaRes}\n`);

  console.log('✅ Todos os testes de eventos autônomos passaram com sucesso!');
}

testEvents().catch(err => {
  console.error('❌ Erro no teste:', err);
});
