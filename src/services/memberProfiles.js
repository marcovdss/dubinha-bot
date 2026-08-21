import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const profilesFilePath = path.join(__dirname, '../../data/members_profiles.json');

import { readJsonSafe, writeJsonAtomic } from '../utils/fileStorage.js';

let cachedProfiles = null;
let saveTimeout = null;

function loadProfiles() {
  cachedProfiles = readJsonSafe(profilesFilePath, { members: {} });
  if (!cachedProfiles.members) cachedProfiles.members = {};
  return cachedProfiles;
}

function scheduleSave() {
  if (saveTimeout) return;
  saveTimeout = setTimeout(() => {
    saveTimeout = null;
    writeJsonAtomic(profilesFilePath, cachedProfiles);
  }, 2000);
  if (saveTimeout && typeof saveTimeout.unref === 'function') {
    saveTimeout.unref();
  }
}

// Carrega na inicialização
loadProfiles();

/**
 * Busca o dossiê do membro pelo nome ou apelido
 * @param {string} nameOrAlias
 * @returns {object|null}
 */
export function getMemberProfile(nameOrAlias) {
  if (!nameOrAlias) return null;
  const data = cachedProfiles || loadProfiles();
  const clean = nameOrAlias.toLowerCase().trim();

  // 1. Match por chave ou alias exato
  for (const [key, profile] of Object.entries(data.members)) {
    if (key.toLowerCase() === clean) return profile;
    if (profile.aliases && profile.aliases.some(a => a.toLowerCase() === clean)) {
      return profile;
    }
  }

  // 2. Match parcial seguro (apenas para termos com mais de 2 caracteres para evitar colisões com letras únicas)
  if (clean.length > 2) {
    for (const [key, profile] of Object.entries(data.members)) {
      const keyLower = key.toLowerCase();
      if (keyLower.length > 2 && (keyLower.includes(clean) || clean.includes(keyLower))) {
        return profile;
      }
      if (profile.aliases && profile.aliases.some(a => a.length > 2 && (a.toLowerCase().includes(clean) || clean.includes(a.toLowerCase())))) {
        return profile;
      }
    }
  }

  return null;
}

/**
 * Adiciona ou atualiza um fato no perfil de um membro
 * @param {string} userName
 * @param {string} fact
 */
export function addMemberFact(userName, fact) {
  if (!userName || !fact) return;
  const data = cachedProfiles || loadProfiles();
  const cleanUser = userName.trim();

  let profile = getMemberProfile(cleanUser);
  if (!profile) {
    profile = {
      name: cleanUser,
      aliases: [cleanUser.toLowerCase()],
      games: [],
      facts: [],
      socialDynamic: 'membro do servidor'
    };
    data.members[cleanUser] = profile;
  }

  if (!profile.facts) profile.facts = [];
  const exists = profile.facts.some(f => f.toLowerCase() === fact.toLowerCase());
  if (!exists) {
    profile.facts.push(fact);
    scheduleSave();
    console.log(`👤 [Dossiê Atualizado] @${profile.name}: novo fato "${fact}"`);
  }
}

/**
 * Adiciona um jogo à lista de jogos do membro
 * @param {string} userName
 * @param {string} gameName
 */
export function addMemberGame(userName, gameName) {
  if (!userName || !gameName) return;
  const data = cachedProfiles || loadProfiles();
  const cleanUser = userName.trim();

  let profile = getMemberProfile(cleanUser);
  if (!profile) {
    profile = {
      name: cleanUser,
      aliases: [cleanUser.toLowerCase()],
      games: [],
      facts: [],
      socialDynamic: 'membro do servidor'
    };
    data.members[cleanUser] = profile;
  }

  if (!profile.games) profile.games = [];
  const cleanGame = gameName.trim();
  const exists = profile.games.some(g => g.toLowerCase() === cleanGame.toLowerCase());
  if (!exists) {
    profile.games.unshift(cleanGame);
    if (profile.games.length > 5) profile.games.pop();
    scheduleSave();
    console.log(`🎮 [Dossiê Atualizado] @${profile.name}: jogando "${cleanGame}"`);
  }
}

/**
 * Retorna uma string formatada com o dossiê do membro para injetar no prompt
 * @param {string} userName
 * @returns {string}
 */
export function formatMemberDossierForPrompt(userName) {
  if (!userName) return '';
  const profile = getMemberProfile(userName);
  if (!profile) return '';

  let text = `[DOSSIÊ DO INTERLOCUTOR @${profile.name}]:\n`;
  if (profile.socialDynamic) text += `• Relação/Dinâmica: ${profile.socialDynamic}\n`;
  if (profile.games && profile.games.length > 0) text += `• Jogos conhecidos: ${profile.games.join(', ')}\n`;
  if (profile.facts && profile.facts.length > 0) text += `• Fatos sobre ele: ${profile.facts.slice(-4).join(' | ')}\n`;

  return text;
}
