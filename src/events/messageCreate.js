import { Events } from 'discord.js';
import { config } from '../config/env.js';
import { generatePersonaResponse } from '../services/ai.js';
import { sendChunkedReply } from '../utils/messageSender.js';
import { recordLiveMessage } from '../services/learning.js';
import { trackMemberActivity, getAllActiveSessionSummaries } from '../services/sessionMemory.js';
import { inspectLiveFact } from '../services/episodicMemory.js';
import { extractUrlContext } from '../utils/urlHelper.js';

export const name = Events.MessageCreate;
export const once = false;

// Controle de cooldown e contagem de mensagens por canal (evita spam)
const channelStats = new Map();
const processingMessages = new Set();

export async function execute(message) {
  // Ignora mensagens de outros bots ou do próprio bot
  if (message.author.bot) return;

  // Evita processamento duplo da mesma mensagem
  if (processingMessages.has(message.id)) return;
  processingMessages.add(message.id);

  // Limpa o ID do set após 15 segundos
  setTimeout(() => processingMessages.delete(message.id), 15000);

  const authorName = message.author.displayName || message.author.username;

  // 0. Auto-Learner: grava qualquer nova mensagem do usuário original em tempo real
  await recordLiveMessage(message);

  // 0.1 Memória de Sessão & Extração de Fatos de Longo Prazo
  trackMemberActivity(message.author.id, authorName, message.cleanContent);
  inspectLiveFact(authorName, message.cleanContent);

  const channelId = message.channel.id;
  const targetChannelId = config.discord.targetChannelId;
  const contentLower = message.cleanContent.toLowerCase();

  // Atualiza contador de mensagens humanas no canal
  const stats = channelStats.get(channelId) || { lastReplyTime: 0, messagesSinceLastReply: 0 };
  stats.messagesSinceLastReply += 1;
  channelStats.set(channelId, stats);

  // Identifica se é o Jinchi verdadeiro (Dono original da persona)
  const REAL_JINCHI_ID = config.behavior.learnUserId || '264201832492957698';
  const isRealJinchi = message.author.id === REAL_JINCHI_ID;

  // 1. Menção direta com @ (@Dubinha) -> 100% de resposta imediata
  const isDirectMention = message.mentions.has(message.client.user);

  // 2. Resposta direta a uma mensagem do bot (Reply) -> 100% de resposta
  const isReplyToBot = message.reference && message.mentions.repliedUser?.id === message.client.user.id;

  // 3. Menção textual pelo nome ("jinchi", "dubinha", "duba", "jinchin", "dubao", etc.)
  const aliasRegex = /\b(dubinha[s]?|duba[s]?|dubin[s]?|dub[aã]o|dube[s]?|dubis|jinchi[s]?|jinch[eoa]?|jinchin[s]?|jinch[aã]o|jinsh[io]|ginchi)\b/i;
  const isNameMentioned = aliasRegex.test(contentLower);

  // 4. Detecção de Mídias (Imagens e Vídeos anexados ou links)
  const hasAttachmentImage = message.attachments.some(att => att.contentType?.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif)$/i.test(att.name));
  const hasAttachmentVideo = message.attachments.some(att => att.contentType?.startsWith('video/') || /\.(mp4|webm|mov|mkv)$/i.test(att.name));
  const hasUrlImage = /(https?:\/\/[^\s]+?\.(?:png|jpg|jpeg|webp|gif))/i.test(message.cleanContent);
  const hasUrlVideo = /(https?:\/\/[^\s]+?\.(?:mp4|webm|mov))/i.test(message.cleanContent);
  const hasMedia = hasAttachmentImage || hasAttachmentVideo || hasUrlImage || hasUrlVideo;

  // 5. Verifica se está no canal alvo (ou em qualquer canal se targetChannelId não estiver configurado)
  const isInTargetChannel = !targetChannelId || channelId === targetChannelId;

  // Parâmetros de comportamento configurados no env
  const timeSinceLastReply = Date.now() - stats.lastReplyTime;

  let shouldReply = false;

  if (isRealJinchi && isInTargetChannel) {
    // 👑 TAXA DE 100%: O Jinchi verdadeiro sempre recebe resposta imediata a qualquer mensagem!
    shouldReply = true;
  } else if (isDirectMention || isReplyToBot) {
    // Menção com @ ou Reply sempre responde sem cooldown
    shouldReply = true;
  } else if (hasMedia && isInTargetChannel) {
    // 🎬 Detecção de Foto/Vídeo: 85% de chance de assistir e reagir com cooldown curto de 4s
    if (timeSinceLastReply > 4000) {
      shouldReply = Math.random() < 0.85;
    }
  } else if (isNameMentioned && isInTargetChannel) {
    // Citou o nome ou derivado no chat: 85% de chance com cooldown de apenas 5s
    if (timeSinceLastReply > 5000) {
      shouldReply = Math.random() < 0.85;
    }
  } else if (isInTargetChannel) {
    // Mensagem solta de texto dos outros membros (Modo Intrometido): 35% de chance com cooldown de 15s
    const meetsCooldown = timeSinceLastReply > 15000;
    const meetsActivity = stats.messagesSinceLastReply >= 1;

    if (meetsCooldown && meetsActivity) {
      shouldReply = Math.random() < 0.35;
    }
  }

  if (!shouldReply) return;

  // Atualiza controle de cooldown do canal
  stats.lastReplyTime = Date.now();
  stats.messagesSinceLastReply = 0;
  channelStats.set(channelId, stats);

  try {
    // Simula o bot digitando
    await message.channel.sendTyping();

    // 1. Busca histórico recente ultra-expandido (35 mensagens) com marcadores temporais
    const fetchedMessages = await message.channel.messages.fetch({ limit: 35 }).catch(() => new Map());
    const now = Date.now();
    const recentHistory = Array.from(fetchedMessages.values())
      .reverse()
      .filter(m => m.id !== message.id)
      .map(m => {
        const diffMins = Math.max(0, Math.round((now - m.createdTimestamp) / 60000));
        const timeTag = diffMins > 0 ? `[há ${diffMins} min] ` : '[agora] ';
        return {
          author: m.author.displayName || m.author.username,
          content: `${timeTag}${m.cleanContent}`
        };
      });

    // 2. Resolução de Mensagem Respondida (Discord Reply)
    let repliedContext = '';
    if (message.reference && message.reference.messageId) {
      try {
        const refMsg = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
        if (refMsg) {
          const refAuthor = refMsg.author.displayName || refMsg.author.username;
          repliedContext = `@${refAuthor}: "${refMsg.cleanContent}"`;
        }
      } catch {}
    }

    // 3. Extrai contexto de Links / URLs (se houver)
    const urlContext = await extractUrlContext(message.cleanContent);

    // 4. Memória de Sessão de curto prazo dos membros hoje
    const sessionSummary = getAllActiveSessionSummaries();

    // 5. Limpa a menção do bot do prompt
    const cleanUserPrompt = message.cleanContent
      .replace(new RegExp(`@${message.client.user.username}`, 'gi'), '')
      .trim();

    // 6. Extrai imagens e vídeos anexados na mensagem ou links diretos para IA Multimodal
    const mediaBuffers = [];

    // Anexos do Discord (Imagens e Vídeos)
    if (message.attachments.size > 0) {
      for (const [, att] of message.attachments) {
        const isImage = att.contentType?.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif)$/i.test(att.name);
        const isVideo = att.contentType?.startsWith('video/') || /\.(mp4|webm|mov|mkv)$/i.test(att.name);

        if (isImage || isVideo) {
          try {
            const timeoutMs = isVideo ? 12000 : 6000;
            const res = await fetch(att.url, { signal: AbortSignal.timeout(timeoutMs) });
            if (res.ok) {
              const arrayBuffer = await res.arrayBuffer();
              if (arrayBuffer.byteLength <= 25 * 1024 * 1024) { // Limite seguro de 25MB
                const mimeType = att.contentType || (isVideo ? 'video/mp4' : 'image/jpeg');
                mediaBuffers.push({
                  data: Buffer.from(arrayBuffer).toString('base64'),
                  mimeType,
                  isVideo
                });
                console.log(`🎬 [Visão Multimodal - ${isVideo ? 'Vídeo' : 'Foto'}] Baixado de @${authorName} (${(arrayBuffer.byteLength / 1024 / 1024).toFixed(2)} MB)`);
              }
            }
          } catch (mediaErr) {
            console.warn(`[Visão Multimodal] Erro ao baixar ${isVideo ? 'vídeo' : 'imagem'}:`, mediaErr.message);
          }
        }
      }
    }

    // Links diretos de imagens ou vídeos no texto
    if (mediaBuffers.length === 0 && (hasUrlImage || hasUrlVideo)) {
      const match = message.cleanContent.match(/(https?:\/\/[^\s]+?\.(?:png|jpg|jpeg|webp|gif|mp4|webm|mov))/i);
      if (match && match[1]) {
        const url = match[1];
        const isVideo = /\.(mp4|webm|mov)$/i.test(url);
        try {
          const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
          if (res.ok) {
            const arrayBuffer = await res.arrayBuffer();
            if (arrayBuffer.byteLength <= 25 * 1024 * 1024) {
              const mimeType = res.headers.get('content-type') || (isVideo ? 'video/mp4' : 'image/jpeg');
              mediaBuffers.push({
                data: Buffer.from(arrayBuffer).toString('base64'),
                mimeType,
                isVideo
              });
              console.log(`🎬 [Visão Multimodal - ${isVideo ? 'Vídeo URL' : 'Foto URL'}] Baixado de @${authorName} (${(arrayBuffer.byteLength / 1024 / 1024).toFixed(2)} MB)`);
            }
          }
        } catch (urlErr) {
          console.warn('[Visão Multimodal] Erro ao baixar URL:', urlErr.message);
        }
      }
    }

    // Chance de 12% de adicionar uma reação com emoji espontânea antes de responder
    if (Math.random() < 0.12) {
      const emojis = ['💀', '🥱', '🍕', '🤡', '😂', '🔥'];
      const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
      await message.react(randomEmoji).catch(() => null);
    }

    // 7. Gera a resposta na persona com contexto multicamadas expandido e visão multimodal (fotos + vídeos)
    const hasAnyVideo = mediaBuffers.some(m => m.isVideo);
    const defaultPrompt = hasAnyVideo ? 'olha esse vídeo' : (mediaBuffers.length > 0 ? 'olha essa imagem' : message.cleanContent);

    const response = await generatePersonaResponse(
      cleanUserPrompt || defaultPrompt,
      recentHistory,
      authorName,
      mediaBuffers,
      {
        repliedContext,
        urlContext,
        sessionSummary,
        isRealJinchi
      }
    );

    // Envia parcelado linha a linha com digitação humanizada
    await sendChunkedReply(message, response);
  } catch (error) {
    console.error('[Erro no processamento da mensagem]:', error);
  }
}
