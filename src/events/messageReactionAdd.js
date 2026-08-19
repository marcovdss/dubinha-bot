import { Events } from 'discord.js';
import { reinforceSuccessfulDialogue } from '../services/cognitiveLearning.js';

export const name = Events.MessageReactionAdd;
export const once = false;

const POSITIVE_EMOJIS = new Set(['😂', '🤣', '🔥', '💀', '🤡', '🍕', '❤️', '👍', '👏', '🏆', '💯']);

export async function execute(reaction, user) {
  // Ignora reações de bots ou do próprio bot
  if (user.bot) return;

  try {
    if (reaction.partial) {
      await reaction.fetch().catch(() => null);
    }
    if (reaction.message?.partial) {
      await reaction.message.fetch().catch(() => null);
    }

    const message = reaction.message;
    if (!message || !message.client) return;

    // Verifica se a reação foi em uma mensagem enviada pelo próprio Dubinha
    if (message.author?.id !== message.client.user?.id) return;

    const emojiName = reaction.emoji.name;
    const isPositive = POSITIVE_EMOJIS.has(emojiName) || reaction.count >= 2;

    if (isPositive && message.cleanContent && message.cleanContent.length > 3) {
      let userPrompt = 'resenha do chat';
      if (message.reference?.messageId) {
        const refMsg = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
        if (refMsg) userPrompt = refMsg.cleanContent;
      }

      await reinforceSuccessfulDialogue(
        userPrompt,
        message.cleanContent,
        `Reação ${emojiName} de @${user.displayName || user.username}`
      );
    }
  } catch (err) {
    // Falha silenciosa
  }
}
