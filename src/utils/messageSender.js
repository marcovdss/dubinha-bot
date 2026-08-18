const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Converte menções em texto puro (ex: "@Zanin", "@f") em menções reais clicáveis do Discord ("<@USER_ID>")
 * @param {string} text
 * @param {import('discord.js').Guild | null} guild
 * @returns {string}
 */
export function resolveGuildMentions(text, guild) {
  if (!text || !guild) return text || '';

  return text.replace(/@([a-zA-Z0-9_\-áéíóúãõç]+)/gi, (match, rawName) => {
    const cleanName = rawName.toLowerCase();

    // Busca o membro por displayName, username ou nickname
    const foundMember = guild.members.cache.find(m => {
      const uName = m.user.username.toLowerCase();
      const dName = m.displayName.toLowerCase();
      const nName = (m.nickname || '').toLowerCase();

      return uName === cleanName || dName === cleanName || nName === cleanName ||
             dName.startsWith(cleanName) || uName.startsWith(cleanName);
    });

    if (foundMember && !foundMember.user.bot) {
      return `<@${foundMember.id}>`;
    }

    return match;
  });
}

/**
 * Divide o texto em linhas individuais para envio sequencial (uma mensagem por linha)
 * @param {string} text
 * @returns {string[]}
 */
export function splitMessageIntoChunks(text) {
  if (!text) return [];

  const rawLines = text
    .split(/\n+/)
    .map(line => line.trim())
    .filter(line => line.length > 0);

  if (rawLines.length === 0) return [];

  const finalChunks = [];
  const seen = new Set();

  for (const line of rawLines) {
    const norm = line.toLowerCase();
    if (seen.has(norm)) continue;
    seen.add(norm);

    if (line.length <= 1900) {
      finalChunks.push(line);
    } else {
      let remaining = line;
      while (remaining.length > 0) {
        finalChunks.push(remaining.slice(0, 1900));
        remaining = remaining.slice(1900);
      }
    }
  }

  return finalChunks.length > 0 ? finalChunks : [text.trim()];
}

/**
 * Envia uma resposta parcelada em mensagens simulando digitação humana para um Message do Discord
 * @param {import('discord.js').Message} message
 * @param {string} responseText
 */
export async function sendChunkedReply(message, responseText) {
  const resolvedText = resolveGuildMentions(responseText, message.guild);
  const chunks = splitMessageIntoChunks(resolvedText);
  if (chunks.length === 0) return;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    if (i === 0) {
      await message.reply({
        content: chunk,
        allowedMentions: { repliedUser: false, parse: ['users'] }
      });
    } else {
      await message.channel.sendTyping();
      const typingDelay = Math.min(Math.max(chunk.length * 28, 600), 2000);
      await sleep(typingDelay);

      await message.channel.send({
        content: chunk,
        allowedMentions: { parse: ['users'] }
      });
    }
  }
}

/**
 * Envia uma resposta parcelada para um Slash Command (Interaction)
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {string} responseText
 */
export async function sendChunkedInteraction(interaction, responseText) {
  const resolvedText = resolveGuildMentions(responseText, interaction.guild);
  const chunks = splitMessageIntoChunks(resolvedText);
  if (chunks.length === 0) return;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    if (i === 0) {
      await interaction.editReply({ content: chunk, allowedMentions: { parse: ['users'] } });
    } else {
      const typingDelay = Math.min(Math.max(chunk.length * 25, 500), 1800);
      await sleep(typingDelay);
      await interaction.followUp({ content: chunk, allowedMentions: { parse: ['users'] } });
    }
  }
}
