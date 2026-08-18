import { config } from '../config/env.js';
import { generatePersonaResponse } from './ai.js';
import { splitMessageIntoChunks } from '../utils/messageSender.js';
import { fetchImageAttachment } from '../utils/mediaHelper.js';
import { getCurrentGame } from './presenceManager.js';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const PIZZA_FLAVORS = [
  'pepperoni',
  'quatro queijos',
  'calabresa',
  'portuguesa',
  'frango com catupiry',
  'moda da casa'
];

const PIZZA_PRICES = ['20 conto', '25 conto', '30 conto', '35 conto', '40 conto'];

const PHOTO_THEMES = [
  'cuscuz quentinho com manteiga e ovo',
  'prato de macaxeira com manteiga de garrafa',
  'gato gordo dormindo folgado no teclado',
  'setup gamer gambiarra com ventilador',
  'gabinete pc cheio de poeira',
  'monge budista careca com cajado',
  'hamburguer podrao com batata frita',
  'cachorro dormindo esparramado no chao',
  'pizza calabresa saindo fumaca',
  'copo de cafe coado simples',
  'cadeira de plastico na frente do pc',
  'meme macaco reflexivo pensando'
];

const THOUGHT_TOPICS = [
  'calor absurdo hoje e ventilador fraco',
  'preguiça infinita de levantar do sofa',
  'vontade de comer um cuscuz reforçado ou macaxeira',
  'dor na lombar de passar horas jogando',
  'reflexao preguicosa sobre como o tempo passa rapido',
  'fome da desgraça e geladeira completamente vazia',
  'sono eterno que nao vai embora',
  'saudade dos servidores antigos de bf4 e wow'
];

/**
 * Encontra o canal de texto padrão para envio dos eventos autônomos
 * @param {import('discord.js').Client} client
 * @param {import('discord.js').TextChannel | null} forceChannel
 * @returns {Promise<import('discord.js').TextChannel | null>}
 */
export async function getTargetChannel(client, forceChannel = null) {
  if (forceChannel && forceChannel.isTextBased()) return forceChannel;

  const targetChannelId = config.discord.targetChannelId;
  if (targetChannelId) {
    const channel = await client.channels.fetch(targetChannelId).catch(() => null);
    if (channel && channel.isTextBased()) return channel;
  }

  for (const guild of client.guilds.cache.values()) {
    const channel = guild.channels.cache.find(c => c.isTextBased() && c.viewable && !c.isVoiceBased());
    if (channel) return channel;
  }

  return null;
}

/**
 * Busca um membro humano aleatório do servidor (excluindo bots e o próprio Jinchi)
 * @param {import('discord.js').Guild} guild
 * @param {string} botUserId
 * @returns {Promise<import('discord.js').GuildMember | null>}
 */
async function getRandomHumanMember(guild, botUserId) {
  try {
    const members = await guild.members.fetch().catch(() => guild.members.cache);
    const eligible = members.filter(m => !m.user.bot && m.user.id !== botUserId);
    if (eligible.size === 0) return null;
    return eligible.random();
  } catch (err) {
    console.warn('[Random Events] Erro ao buscar membros humanos:', err.message);
    return null;
  }
}

/**
 * Executa o evento aleatório de pedir dinheiro de pizza para alguém do servidor
 * @param {import('discord.js').Client} client
 * @param {import('discord.js').User | null} forceTargetUser
 * @param {import('discord.js').TextChannel | null} forceChannel
 * @param {{ sabor?: string, valor?: string }} customOptions
 */
export async function triggerPizzaEvent(client, forceTargetUser = null, forceChannel = null, customOptions = {}) {
  try {
    const channel = await getTargetChannel(client, forceChannel);
    if (!channel) {
      console.warn('[Pizza Event] Nenhum canal de texto encontrado para enviar a mensagem.');
      return null;
    }

    const guild = channel.guild;
    let targetMember = null;

    if (forceTargetUser) {
      targetMember = await guild.members.fetch(forceTargetUser.id).catch(() => null);
    }

    if (!targetMember) {
      targetMember = await getRandomHumanMember(guild, client.user.id);
    }

    if (!targetMember) {
      console.warn('[Pizza Event] Nenhum membro elegível encontrado.');
      return null;
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

    let finalResponse = response;
    if (!finalResponse.includes(memberMention) && !finalResponse.includes('<@')) {
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
    return { type: 'pizza', targetName: memberName, channelName: channel.name };
  } catch (error) {
    console.error('[Pizza Event Error]:', error);
    return null;
  }
}

/**
 * Executa o evento autônomo de postar uma foto/meme aleatório com legenda do Jinchi
 * @param {import('discord.js').Client} client
 * @param {import('discord.js').TextChannel | null} forceChannel
 */
export async function triggerRandomPhotoEvent(client, forceChannel = null) {
  try {
    const channel = await getTargetChannel(client, forceChannel);
    if (!channel) {
      console.warn('[Photo Event] Nenhum canal de texto encontrado.');
      return null;
    }

    const theme = PHOTO_THEMES[Math.floor(Math.random() * PHOTO_THEMES.length)];
    console.log(`📸 [Photo Event] Buscando foto com o tema: "${theme}"...`);

    const imageAttachment = await fetchImageAttachment(theme);
    if (!imageAttachment) {
      console.warn('[Photo Event] Não foi possível obter imagem. Fazendo fallback para pensamento.');
      return triggerRandomThoughtEvent(client, channel);
    }

    const prompt = `Você é o Jinchi no Discord. Você está no chat dos seus amigos e acabou de enviar uma FOTO REAL no chat sobre "${theme}".
Escreva apenas uma legenda curta (1 ou 2 linhas), autêntica, em minúsculas, com humor despojado (ex: elogiando a comida, rindo da gambiarra, comentando a preguiça ou zoando no seu estilo seco).
IMPORTANTE: NÃO invente links de internet ou URLs, pois a foto real já está anexada. Não use prefixos.`;

    let responseText = await generatePersonaResponse(prompt);
    responseText = responseText.replace(/https?:\/\/\S+/gi, '').trim() || 'olha ai';

    const chunks = splitMessageIntoChunks(responseText);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      await channel.sendTyping();
      const typingDelay = Math.min(Math.max(chunk.length * 20, 400), 1400);
      await sleep(typingDelay);

      if (i === chunks.length - 1) {
        await channel.send({
          content: chunk,
          files: [imageAttachment]
        });
      } else {
        await channel.send({ content: chunk });
      }
    }

    console.log(`📸 [Photo Event] Foto postada com sucesso no #${channel.name}!`);
    return { type: 'photo', theme, channelName: channel.name };
  } catch (error) {
    console.error('[Photo Event Error]:', error);
    return null;
  }
}

/**
 * Executa o evento autônomo de soltar um pensamento/desabafo de sofá no canal
 * @param {import('discord.js').Client} client
 * @param {import('discord.js').TextChannel | null} forceChannel
 */
export async function triggerRandomThoughtEvent(client, forceChannel = null) {
  try {
    const channel = await getTargetChannel(client, forceChannel);
    if (!channel) return null;

    const topic = THOUGHT_TOPICS[Math.floor(Math.random() * THOUGHT_TOPICS.length)];
    console.log(`🛋️ [Thought Event] Soltando pensamento de sofá sobre: "${topic}" no canal #${channel.name}...`);

    const prompt = `Você é o Jinchi no Discord. Você está deitado no sofá e, do nada, resolveu mandar uma mensagem rápida no chat do servidor.
Assunto/Pensamento: "${topic}".
Escreva de 1 a 2 linhas curtas, 100% em minúsculas, com tom preguiçoso, descontraído e autêntico, usando suas gírias naturais (vei, mano, caba, doidera). Não use prefixos.`;

    const responseText = await generatePersonaResponse(prompt);
    const chunks = splitMessageIntoChunks(responseText);

    for (const chunk of chunks) {
      await channel.sendTyping();
      const typingDelay = Math.min(Math.max(chunk.length * 22, 500), 1500);
      await sleep(typingDelay);
      await channel.send({ content: chunk });
    }

    console.log(`🛋️ [Thought Event] Pensamento enviado com sucesso!`);
    return { type: 'thought', topic, channelName: channel.name };
  } catch (error) {
    console.error('[Thought Event Error]:', error);
    return null;
  }
}

/**
 * Executa o evento autônomo do momento gamer (comentando sobre o jogo atual no Rich Presence)
 * @param {import('discord.js').Client} client
 * @param {import('discord.js').TextChannel | null} forceChannel
 */
export async function triggerGamerMomentEvent(client, forceChannel = null) {
  try {
    const channel = await getTargetChannel(client, forceChannel);
    if (!channel) return null;

    const currentGame = getCurrentGame();
    console.log(`🎮 [Gamer Moment Event] Comentando sobre a partida de "${currentGame}" no canal #${channel.name}...`);

    const prompt = `Você é o Jinchi no Discord. Você está no meio de uma partida de "${currentGame}" e deu uma pausa de 10 segundos pra desabafar/comentar no chat com os amigos.
Pode ser: reclamando de sniper/camper, rindo de um fail, reclamando de lag/ping, comemorando uma jogada cagada, ou falando que vai desinstalar.
Escreva de 1 a 2 frases curtas, 100% em minúsculas, com humor cômico e despojado de gamer relaxado. Não use prefixos.`;

    const responseText = await generatePersonaResponse(prompt);
    const chunks = splitMessageIntoChunks(responseText);

    for (const chunk of chunks) {
      await channel.sendTyping();
      const typingDelay = Math.min(Math.max(chunk.length * 22, 500), 1500);
      await sleep(typingDelay);
      await channel.send({ content: chunk });
    }

    console.log(`🎮 [Gamer Moment Event] Comentário gamer enviado com sucesso!`);
    return { type: 'gamer_moment', game: currentGame, channelName: channel.name };
  } catch (error) {
    console.error('[Gamer Moment Error]:', error);
    return null;
  }
}

/**
 * Executa o evento autônomo de puxar assunto ou zoar um membro aleatório
 * @param {import('discord.js').Client} client
 * @param {import('discord.js').TextChannel | null} forceChannel
 */
export async function triggerRandomInteractionEvent(client, forceChannel = null) {
  try {
    const channel = await getTargetChannel(client, forceChannel);
    if (!channel) return null;

    const guild = channel.guild;
    const targetMember = await getRandomHumanMember(guild, client.user.id);
    if (!targetMember) {
      return triggerRandomThoughtEvent(client, channel);
    }

    const memberName = targetMember.displayName || targetMember.user.username;
    const memberMention = `<@${targetMember.id}>`;

    console.log(`👀 [Interaction Event] Puxando papo com ${memberName} (${targetMember.id}) no #${channel.name}...`);

    const prompt = `Você é o Jinchi no Discord. Do nada você resolveu puxar assunto ou fazer uma pergunta rápida/zoeira com o seu amigo ${memberMention}.
Escreva 1 a 2 frases curtas, 100% em minúsculas, estilo descontraído de sofá (ex: perguntando o que tá jogando, se tá vivo, zoando algo leve).
Obrigatoriamente inclua ${memberMention} no início da fala.`;

    let responseText = await generatePersonaResponse(prompt, [], memberName);
    if (!responseText.includes(memberMention) && !responseText.includes('<@')) {
      responseText = `${memberMention} ${responseText}`;
    }

    const chunks = splitMessageIntoChunks(responseText);

    for (const chunk of chunks) {
      await channel.sendTyping();
      const typingDelay = Math.min(Math.max(chunk.length * 24, 500), 1600);
      await sleep(typingDelay);
      await channel.send({
        content: chunk,
        allowedMentions: { parse: ['users'] }
      });
    }

    console.log(`👀 [Interaction Event] Mensagem enviada com sucesso!`);
    return { type: 'interaction', targetName: memberName, channelName: channel.name };
  } catch (error) {
    console.error('[Interaction Event Error]:', error);
    return null;
  }
}

/**
 * Roleta Unificada: Sorteia e executa UMA única ação autônoma
 * @param {import('discord.js').Client} client
 */
export async function triggerRandomAutonomousEvent(client) {
  const roll = Math.random();

  console.log(`🎲 [Autonomous Decision] Sorteando evento autônomo (Roll: ${roll.toFixed(3)})...`);

  // Distribuição de probabilidades:
  // 0.00 - 0.25 (25%): Foto / Meme aleatório
  // 0.25 - 0.50 (25%): Pensamento de sofá
  // 0.50 - 0.70 (20%): Momento Gamer
  // 0.70 - 0.85 (15%): Cobrança de Pizza
  // 0.85 - 1.00 (15%): Puxar assunto com membro
  if (roll < 0.25) {
    return triggerRandomPhotoEvent(client);
  } else if (roll < 0.50) {
    return triggerRandomThoughtEvent(client);
  } else if (roll < 0.70) {
    return triggerGamerMomentEvent(client);
  } else if (roll < 0.85) {
    return triggerPizzaEvent(client);
  } else {
    return triggerRandomInteractionEvent(client);
  }
}

/**
 * Inicia o agendador unificado de eventos autônomos periódicos
 * @param {import('discord.js').Client} client
 */
export function startAutonomousScheduler(client) {
  const scheduleNext = () => {
    // Sorteia um intervalo aleatório entre 2.5 e 6 horas (em milissegundos)
    const randomHours = Math.random() * (6 - 2.5) + 2.5;
    const randomMs = Math.round(randomHours * 60 * 60 * 1000);

    console.log(`⏰ [Autonomous Scheduler] Próxima ação autônoma agendada para daqui a ${randomHours.toFixed(1)} horas.`);

    setTimeout(async () => {
      try {
        await triggerRandomAutonomousEvent(client);
      } catch (err) {
        console.error('[Autonomous Scheduler Error]:', err);
      } finally {
        scheduleNext();
      }
    }, randomMs);
  };

  scheduleNext();
}

// Alias para manter compatibilidade com eventuais imports legados
export const startPizzaScheduler = startAutonomousScheduler;
