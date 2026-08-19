import readline from 'node:readline';
import { config, normalizeProbability } from '../config/env.js';
import { generatePersonaResponse } from './ai.js';
import { splitMessageIntoChunks } from '../utils/messageSender.js';
import { triggerPizzaEvent } from './randomEvents.js';
import { addManualMemory } from './learning.js';
import { fetchImageAttachment } from '../utils/mediaHelper.js';
import { setBotGame } from './presenceManager.js';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Encontra o canal padrão para envio das mensagens do terminal
 * @param {import('discord.js').Client} client
 * @returns {Promise<import('discord.js').TextChannel | null>}
 */
async function getTargetChannel(client) {
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
 * Inicia a interface interativa no terminal para controle direto do Jinchi
 * @param {import('discord.js').Client} client
 */
export function startTerminalInput(client) {
  if (!process.stdin.isTTY) return;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '💬 jinchi> '
  });

  console.log(`💬 [Terminal God Mode] Online • /introsa <chance>, /pizza, /aprender <frase> ou digite para enviar.`);
  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();
    if (!input) {
      rl.prompt();
      return;
    }

    try {
      const channel = await getTargetChannel(client);
      if (!channel) {
        console.error('❌ Nenhum canal de texto encontrado para enviar a mensagem.');
        rl.prompt();
        return;
      }

      // 0. Comando interno: /introsa ou /chance <valor>
      if (input.toLowerCase().startsWith('/introsa') || input.toLowerCase().startsWith('/chance')) {
        const parts = input.split(/\s+/);
        if (parts.length > 1) {
          const val = parts.slice(1).join(' ');
          config.behavior.replyProbability = normalizeProbability(val, config.behavior.replyProbability);
          console.log(`🎲 [Modo Introsa Atualizado] Chance de resposta espontânea: ${(config.behavior.replyProbability * 100).toFixed(1)}%`);
        } else {
          console.log(`🎲 [Modo Introsa] Chance atual: ${(config.behavior.replyProbability * 100).toFixed(1)}% | Cooldown: ${config.behavior.cooldownSeconds}s`);
        }
        rl.prompt();
        return;
      }

      // 1. Comando interno: /pizza
      if (input.toLowerCase() === '/pizza') {
        console.log('🍕 Disparando evento de cobrança de pizza...');
        await triggerPizzaEvent(client, null, channel);
        rl.prompt();
        return;
      }

      // 2. Comando interno: /aprender <frase>
      if (input.toLowerCase().startsWith('/aprender ')) {
        const phrase = input.slice(10).trim();
        const res = await addManualMemory(phrase);
        if (res.success) {
          console.log(`🧠 [Sucesso] Jinchi aprendeu (${res.categoryName}): "${res.item}"`);
        } else {
          console.error('❌ Erro ao salvar memória.');
        }
        rl.prompt();
        return;
      }

      // 3. Comando interno: /jogar <jogo>
      if (input.toLowerCase().startsWith('/jogar ') || input.toLowerCase().startsWith('jogar ')) {
        const gameName = input.replace(/^\/?jogar\s+/i, '').trim();
        setBotGame(client, gameName);
        console.log(`🎮 [Rich Presence Atualizado] Jinchi agora está jogando: "${gameName}"`);
        rl.prompt();
        return;
      }

      // 4. Detecta se a instrução pede especificamente para mandar foto / imagem
      const mediaMatch = input.match(/^(?:mande|manda|envie|posta|enviar)?\s*(?:uma\s+)?(?:foto|imagem|pic)\s+(?:de\s+|do\s+|da\s+|sobre\s+)(.+)$/i);
      let imageAttachment = null;
      let subject = '';

      if (mediaMatch) {
        subject = mediaMatch[1]?.trim() || '';
        console.log(`🔍 [Media Search] Buscando e baixando imagem real de: "${subject}"...`);
        imageAttachment = await fetchImageAttachment(subject);
      }

      // 4. Instrução para o Gemini gerar a legenda na persona do Jinchi
      console.log(`⏳ Processando fala na persona do Jinchi: "${input}"...`);

      let directivePrompt = '';
      if (imageAttachment) {
        directivePrompt = `Você é o Jinchi no Discord. Você está enviando uma FOTO REAL de "${subject}" em anexo no chat para os amigos.
Escreva apenas a mensagem/legenda autêntica que você mandaria junto com essa foto (ex: elogiando, zoando, comentando sobre o assunto, etc.).
IMPORTANTE: NÃO invente links de internet nem URLs no seu texto, pois o arquivo da foto já está sendo anexado diretamente.
Envie tudo em minúsculas, no seu estilo informal descontraído.`;
      } else {
        directivePrompt = `Você é o Jinchi no Discord. O seu operador/amigo te deu a seguinte ordem direta para falar no chat:
"${input}"

Diretrizes:
- Execute a instrução com sua voz autêntica, em minúsculas, com humor despojado e gírias reais do Jinchi.
- Não coloque prefixos como "jinchi:".`;
      }

      let responseText = await generatePersonaResponse(directivePrompt);
      // Limpa qualquer URL fictícia que o modelo possa ter gerado
      responseText = responseText.replace(/https?:\/\/\S+/gi, '').trim();

      const chunks = splitMessageIntoChunks(responseText || 'olha ai');

      console.log(`\n💬 [Enviando no canal #${channel.name}]:`);
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        console.log(`  > ${chunk}`);

        await channel.sendTyping();
        const delay = Math.min(Math.max(chunk.length * 20, 400), 1500);
        await sleep(delay);

        // Se tiver imagem real baixada, anexa na última mensagem como upload direto
        if (imageAttachment && i === chunks.length - 1) {
          await channel.send({
            content: chunk,
            files: [imageAttachment]
          });
          console.log(`📸 [Discord] Imagem anexada e renderizada com sucesso!`);
        } else {
          await channel.send({ content: chunk });
        }
      }

      console.log(`✅ Concluído com sucesso!\n`);
    } catch (error) {
      console.error('❌ Erro ao processar comando do terminal:', error);
    }

    rl.prompt();
  });

  rl.on('close', () => {
    console.log('\n[Terminal Interactor encerrado]');
  });
}
