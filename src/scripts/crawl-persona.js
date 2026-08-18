import { Client, GatewayIntentBits, Events } from 'discord.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, validateEnv } from '../config/env.js';

validateEnv();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const token = config.discord.token;
const targetUserId = process.argv[2]?.trim() || config.behavior.learnUserId || '264201832492957698';
// Limite configurável: até 50.000 mensagens totais
const maxTotalMessages = parseInt(process.argv[3] || '50000', 10);
const maxPerChannel = Math.max(Math.floor(maxTotalMessages / 5), 10000);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

client.once(Events.ClientReady, async () => {
  console.log(`\n======================================================`);
  console.log(`🚀 [MEGA CRAWLER 50K] Conectado como: ${client.user.tag}`);
  console.log(`🎯 Alvo de Extração: ID ${targetUserId}`);
  console.log(`📜 Meta Global: até ${maxTotalMessages.toLocaleString()} mensagens do servidor`);
  console.log(`======================================================\n`);

  try {
    let targetUser = null;
    try {
      targetUser = await client.users.fetch(targetUserId);
      console.log(`👤 Alvo confirmado: ${targetUser.tag} (${targetUser.displayName || targetUser.username})`);
    } catch (e) {
      console.log(`⚠️ Alvo ID ${targetUserId}`);
    }

    const dataDir = path.join(__dirname, '../../data');
    const datasetPath = path.join(dataDir, `raw_messages_${targetUserId}.json`);

    // Carrega dados anteriores para merge
    const collectedMessages = new Map();
    const collectedDialogues = [];

    if (fs.existsSync(datasetPath)) {
      try {
        const oldData = JSON.parse(fs.readFileSync(datasetPath, 'utf-8'));
        if (Array.isArray(oldData.messages)) {
          for (const m of oldData.messages) {
            collectedMessages.set(m.id, m);
          }
        }
        if (Array.isArray(oldData.dialogues)) {
          collectedDialogues.push(...oldData.dialogues);
        }
        console.log(`📦 Carregados ${collectedMessages.size} mensagens e ${collectedDialogues.length} diálogos existentes para merge.`);
      } catch (err) {}
    }

    let globalMessagesFetched = 0;
    const guilds = Array.from(client.guilds.cache.values());

    for (const guild of guilds) {
      console.log(`\n📂 Varrendo Servidor: "${guild.name}" (ID: ${guild.id})`);

      // Pega todos os canais de texto e threads
      const channels = guild.channels.cache.filter(c => c.isTextBased() && c.viewable && !c.isVoiceBased());
      console.log(`📋 ${channels.size} canais de texto disponíveis para varredura.`);

      for (const [channelId, channel] of channels) {
        if (globalMessagesFetched >= maxTotalMessages) break;

        console.log(`\n  💬 Varrendo canal: #${channel.name}...`);
        let lastId = null;
        let channelFetchedCount = 0;
        let channelHits = 0;

        while (channelFetchedCount < maxPerChannel && globalMessagesFetched < maxTotalMessages) {
          try {
            const options = { limit: 100 };
            if (lastId) options.before = lastId;

            const messages = await channel.messages.fetch(options);
            if (!messages || messages.size === 0) break;

            const msgsArray = Array.from(messages.values());
            lastId = msgsArray[msgsArray.length - 1].id;
            channelFetchedCount += msgsArray.length;
            globalMessagesFetched += msgsArray.length;

            for (let i = 0; i < msgsArray.length; i++) {
              const msg = msgsArray[i];
              const cleanText = msg.cleanContent?.trim();

              if (msg.author.id === targetUserId && cleanText && cleanText.length > 0) {
                channelHits++;
                collectedMessages.set(msg.id, {
                  id: msg.id,
                  content: cleanText,
                  timestamp: msg.createdAt.toISOString(),
                  channel: channel.name
                });

                // 1. Resposta direta (Reply no Discord)
                if (msg.reference?.messageId) {
                  try {
                    const referenced = await channel.messages.fetch(msg.reference.messageId).catch(() => null);
                    if (referenced && referenced.author.id !== targetUserId && referenced.cleanContent?.trim()) {
                      const exists = collectedDialogues.some(d => d.otherMessage === referenced.cleanContent.trim() && d.targetResponse === cleanText);
                      if (!exists) {
                        collectedDialogues.push({
                          otherUser: referenced.author.displayName || referenced.author.username,
                          otherMessage: referenced.cleanContent.trim(),
                          targetResponse: cleanText,
                          channel: channel.name,
                          type: 'direct_reply'
                        });
                      }
                    }
                  } catch (refErr) {}
                }
                // 2. Diálogo sequencial (mensagem anterior de outro membro no chat)
                else if (i < msgsArray.length - 1) {
                  const prevMsg = msgsArray[i + 1];
                  if (prevMsg.author.id !== targetUserId && prevMsg.cleanContent?.trim()) {
                    const exists = collectedDialogues.some(d => d.otherMessage === prevMsg.cleanContent.trim() && d.targetResponse === cleanText);
                    if (!exists) {
                      collectedDialogues.push({
                        otherUser: prevMsg.author.displayName || prevMsg.author.username,
                        otherMessage: prevMsg.cleanContent.trim(),
                        targetResponse: cleanText,
                        channel: channel.name,
                        type: 'sequential'
                      });
                    }
                  }
                }
              }
            }

            // Log de progresso a cada 1000 mensagens lidas
            if (channelFetchedCount % 1000 === 0) {
              console.log(`    ⏳ [Progresso] ${channelFetchedCount.toLocaleString()} msgs lidas em #${channel.name} | Total Global: ${globalMessagesFetched.toLocaleString()} msgs`);
            }

            await sleep(150); // Evita rate limit
          } catch (fetchErr) {
            console.warn(`    ⚠️ Fim do histórico ou limite atingido em #${channel.name} (${fetchErr.message})`);
            break;
          }
        }

        console.log(`    ✅ Canal #${channel.name}: ${channelFetchedCount.toLocaleString()} mensagens lidas | ${channelHits} do Jinchi.`);
      }
    }

    const messagesArray = Array.from(collectedMessages.values());

    console.log(`\n======================================================`);
    console.log(`🎉 MEGA VARREDURA CONCLUÍDA COM SUCESSO!`);
    console.log(`📊 Mensagens totais do servidor processadas: ${globalMessagesFetched.toLocaleString()}`);
    console.log(`🧠 Total de mensagens autênticas do Jinchi: ${messagesArray.length.toLocaleString()}`);
    console.log(`🗣️ Total de diálogos e interações extraídas: ${collectedDialogues.length.toLocaleString()}`);
    console.log(`======================================================\n`);

    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    fs.writeFileSync(datasetPath, JSON.stringify({
      targetUserId,
      targetUsername: targetUser?.username || 'jinchi',
      total: messagesArray.length,
      totalDialogues: collectedDialogues.length,
      messages: messagesArray,
      dialogues: collectedDialogues
    }, null, 2));

    console.log(`💾 Base de conhecimento consolidada em: ${datasetPath}\n`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Erro durante o crawling:', error);
    process.exit(1);
  }
});

client.login(token);
