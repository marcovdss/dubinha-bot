import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config/env.js';
import { addLiveMemory } from './rag.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.join(__dirname, '../../data');
const customMemoryPath = path.join(dataDir, 'custom_memory.json');

/**
 * Lê o arquivo de memórias personalizadas
 */
export function getCustomMemories() {
  try {
    if (fs.existsSync(customMemoryPath)) {
      return JSON.parse(fs.readFileSync(customMemoryPath, 'utf-8'));
    }
  } catch (e) {}
  return { rules: [], lore_and_facts: [], phrases_and_dialogues: [] };
}

/**
 * Registra e aprende uma nova mensagem enviada pelo usuário original em tempo real
 * @param {import('discord.js').Message} message
 */
export async function recordLiveMessage(message) {
  const targetUserId = config.behavior.learnUserId;
  if (!targetUserId || message.author.id !== targetUserId) {
    return;
  }

  const content = message.cleanContent.trim();
  if (!content) return;

  try {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const filePath = path.join(dataDir, `raw_messages_${targetUserId}.json`);
    let dataset = {
      targetUserId,
      targetUsername: message.author.username,
      total: 0,
      messages: [],
      dialogues: []
    };

    if (fs.existsSync(filePath)) {
      try {
        dataset = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      } catch (err) {
        console.warn('[Auto-Learner] Recriando dataset corrompido...');
      }
    }

    // Evita duplicar mesma mensagem
    if (dataset.messages.some(m => m.id === message.id)) {
      return;
    }

    const newMsgEntry = {
      id: message.id,
      content: content,
      timestamp: message.createdAt.toISOString(),
      channel: message.channel.name || 'unknown'
    };

    dataset.messages.unshift(newMsgEntry);
    dataset.total = dataset.messages.length;

    let newDialogue = null;

    if (message.reference?.messageId) {
      try {
        const repliedMsg = await message.channel.messages.fetch(message.reference.messageId);
        if (repliedMsg && repliedMsg.author.id !== targetUserId && repliedMsg.cleanContent.trim()) {
          newDialogue = {
            otherUser: repliedMsg.author.displayName || repliedMsg.author.username,
            otherMessage: repliedMsg.cleanContent.trim(),
            targetResponse: content
          };
          dataset.dialogues.unshift(newDialogue);
        }
      } catch (refErr) {}
    }

    fs.writeFileSync(filePath, JSON.stringify(dataset, null, 2));
    addLiveMemory(newMsgEntry, newDialogue);

    console.log(`🧠 [Auto-Learner] Nova fala aprendida em tempo real de "${message.author.username}": "${content}"`);
  } catch (error) {
    console.error('[Auto-Learner Error]:', error);
  }
}

/**
 * Insere manualmente uma nova regra, fato ou frase no dataset e no custom_memory.json
 * @param {string} input - A instrução, regra comportamental, fato biográfico ou fala
 * @param {string|null} context - O contexto da conversa (opcional)
 * @param {'auto'|'regra'|'fato'|'frase'} explicitType - Tipo explícito selecionado (opcional)
 * @returns {Promise<{ success: boolean, type: string, categoryName: string, item: string }>}
 */
export async function addManualMemory(input, context = null, explicitType = 'auto') {
  const targetUserId = config.behavior.learnUserId || '264201832492957698';
  const cleanInput = input?.trim();
  if (!cleanInput) return { success: false };

  try {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const customMem = getCustomMemories();
    const pLower = cleanInput.toLowerCase();
    let type = explicitType;

    // Se auto, classifica pelo conteúdo semântico
    if (type === 'auto') {
      const isRule = pLower.includes('não') || pLower.includes('nunca') || pLower.includes('evite') ||
                     pLower.includes('sempre que') || pLower.includes('regra') || pLower.includes('seja ') ||
                     pLower.includes('aja ') || pLower.includes('respeitoso') || pLower.includes('proibido') ||
                     pLower.includes('costuma');

      const isLore = pLower.startsWith('o jinchi') || pLower.startsWith('o duba') || pLower.startsWith('ele ') ||
                     pLower.includes('já fez') || pLower.includes('nasceu') || pLower.includes('fato') ||
                     pLower.includes('comprou') || pLower.includes('odeia') || pLower.includes('gosta de') ||
                     pLower.includes('tem medo') || pLower.includes('trabalha');

      if (isRule) {
        type = 'regra';
      } else if (isLore) {
        type = 'fato';
      } else {
        type = 'frase';
      }
    }

    let categoryName = '';

    if (type === 'regra') {
      categoryName = 'Regra de Comportamento';
      if (!customMem.rules.includes(cleanInput)) {
        customMem.rules.push(cleanInput);
      }
    } else if (type === 'fato') {
      categoryName = 'Fato & Memória Biográfica';
      if (!customMem.lore_and_facts.includes(cleanInput)) {
        customMem.lore_and_facts.push(cleanInput);
      }
    } else {
      categoryName = 'Frase & Resposta de Diálogo';
      const exists = customMem.phrases_and_dialogues.some(pd => pd.frase === cleanInput);
      if (!exists) {
        customMem.phrases_and_dialogues.unshift({ frase: cleanInput, contexto: context || null });
      }
    }

    fs.writeFileSync(customMemoryPath, JSON.stringify(customMem, null, 2));

    // 2. Salva também no dataset raw_messages para RAG
    const filePath = path.join(dataDir, `raw_messages_${targetUserId}.json`);
    let dataset = { targetUserId, total: 0, messages: [], dialogues: [] };

    if (fs.existsSync(filePath)) {
      try {
        dataset = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      } catch (err) {}
    }

    const newMsgEntry = {
      id: `manual_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      content: cleanInput,
      timestamp: new Date().toISOString(),
      channel: 'manual-input',
      type
    };

    dataset.messages.unshift(newMsgEntry);
    dataset.total = dataset.messages.length;

    let newDialogue = null;
    if (context && context.trim()) {
      newDialogue = {
        otherUser: 'Amigo',
        otherMessage: context.trim(),
        targetResponse: cleanInput
      };
      dataset.dialogues.unshift(newDialogue);
    }

    fs.writeFileSync(filePath, JSON.stringify(dataset, null, 2));
    addLiveMemory(newMsgEntry, newDialogue);

    console.log(`🧠 [Manual-Memory / Behavior] ${categoryName} registrada: "${cleanInput}"`);
    return {
      success: true,
      type,
      categoryName,
      item: cleanInput
    };
  } catch (error) {
    console.error('[Manual-Memory Error]:', error);
    return { success: false };
  }
}
