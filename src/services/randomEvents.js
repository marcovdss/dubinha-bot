import { config } from '../config/env.js';
import { generatePersonaResponse } from './ai.js';
import { splitMessageIntoChunks } from '../utils/messageSender.js';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const PIZZA_FLAVORS = ['pepperoni', 'quatro queijos', 'calabresa', 'portuguesa', 'frango com catupiry', 'moda da casa'];
const PIZZA_PRICES = ['20 conto', '25 conto', '30 conto', '35 conto', '40 conto'];

/**
 * Executa o evento aleatório de pedir dinheiro de pizza para alguém do servidor
 * @param {import('discord.js').Client} client
 * @param {import('discord.js').User | null} forceTargetUser
 * @param {import('discord.js').TextChannel | null} forceChannel
 * @param {{ sabor?: string, valor?: string }} customOptions
 */
export async function triggerPizzaEvent(client, forceTargetUser = null, forceChannel = null, customOptions = {}) {
  try {
    const targetChannelId = config.discord.targetChannelId;
    let channel = forceChannel;

    if (!channel) {
      if (targetChannelId) {
        channel = await client.channels.fetch(targetChannelId).catch(() => null);
      }
      if (!channel) {
        const guild = client.guilds.cache.first();
        if (guild) {
          channel = guild.channels.cache.find(c => c.isTextBased() && c.viewable && !c.isVoiceBased());
        }
      }
    }

    if (!channel || !channel.isTextBased()) {
      console.warn('[Pizza Event] Nenhum canal de texto encontrado para enviar a mensagem.');
      return;
    }

    const guild = channel.guild;
    let targetMember = null;

    if (forceTargetUser) {
      targetMember = await guild.members.fetch(forceTargetUser.id).catch(() => null);
    }

    if (!targetMember) {
      // Busca membros humanos do servidor
      const members = await guild.members.fetch().catch(() => guild.members.cache);
      const eligibleMembers = members.filter(m => !m.user.bot && m.user.id !== client.user.id);

      if (eligibleMembers.size === 0) {
        console.warn('[Pizza Event] Nenhum membro elegível encontrado.');
        return;
      }

      targetMember = eligibleMembers.random();
    }

    const memberName = targetMember.displayName || targetMember.user.username;
    const memberMention = `<@${targetMember.id}>`;

    const saborFinal = customOptions.sabor || PIZZA_FLAVORS[Math.floor(Math.random() * PIZZA_FLAVORS.length)];
    const valorFinal = customOptions.valor || PIZZA_PRICES[Math.floor(Math.random() * PIZZA_PRICES.length)];

    console.log(`🍕 [Pizza Event] Cobrando ${valorFinal} de PIX para pizza de ${saborFinal} de: ${memberName} (${targetMember.id}) no canal #${channel.name}`);

    const prompt = `Você é o Jinchi. Você está no Discord e, DO NADA, bateu uma fome absurda e você quer comer uma pizza de ${saborFinal} agora.
Você vai cobrar um PIX de ${valorFinal} do seu amigo ${memberMention} pra inteirar o pedido.
Escreva de 2 a 3 linhas curtas separadas, 100% em minúsculas, com o seu jeitão relaxado de sofá (a geladeira tá vazia, fome da desgraça, pedindo na moralzinha pro amigo).
Obrigatoriamente inclua ${memberMention} no início da fala.`;

    const response = await generatePersonaResponse(prompt, [], memberName);

    // Garante que a menção está presente no texto
    let finalResponse = response;
    if (!finalResponse.includes(memberMention) && !finalResponse.includes(`<@`)) {
      finalResponse = `${memberMention} ${finalResponse}`;
    }

    const chunks = splitMessageIntoChunks(finalResponse);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      await channel.sendTyping();
      const typingDelay = Math.min(Math.max(chunk.length * 24, 500), 1600);
      await sleep(typingDelay);
      await channel.send({
        content: chunk,
        allowedMentions: { parse: ['users'] }
      });
    }

    console.log(`🍕 [Pizza Event] Mensagem de pizza enviada com sucesso!`);
    return { targetName: memberName, channelName: channel.name };
  } catch (error) {
    console.error('[Pizza Event Error]:', error);
    return null;
  }
}

/**
 * Inicia o agendamento contínuo de eventos aleatórios de pizza ao longo do dia
 * @param {import('discord.js').Client} client
 */
export function startPizzaScheduler(client) {
  const scheduleNext = () => {
    // Sorteia um intervalo aleatório entre 2.5 e 6 horas (em milissegundos)
    const randomHours = Math.random() * (6 - 2.5) + 2.5;
    const randomMs = Math.round(randomHours * 60 * 60 * 1000);

    console.log(`⏰ [Pizza Scheduler] Próxima cobrança de pizza aleatória agendada para daqui a ${randomHours.toFixed(1)} horas.`);

    setTimeout(async () => {
      try {
        await triggerPizzaEvent(client);
      } catch (err) {
        console.error('[Pizza Scheduler Error]:', err);
      } finally {
        scheduleNext();
      }
    }, randomMs);
  };

  scheduleNext();
}
