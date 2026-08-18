import dotenv from 'dotenv';
import { generatePersonaResponse } from '../services/ai.js';

dotenv.config();

const testPrompt = `Você é o Jinchi no Discord. O seu operador te deu a seguinte ordem para falar no chat: "Mande foto de uma pizza e cobre 30 conto do Zanin". Execute na sua persona autêntica.`;

const res = await generatePersonaResponse(testPrompt);
console.log('--- Resposta do Jinchi para a instrução do Terminal ---');
console.log(res);
