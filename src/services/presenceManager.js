import { ActivityType } from 'discord.js';

// Mapeamento das chaves de assets de arte cadastrados no Discord Developer Portal
export const GAME_ASSET_KEYS = {
  'world of warcraft': 'wow',
  'wow': 'wow',
  'wow classic': 'wow',
  'world of warcraft classic': 'wow',
  'battlefield 4': 'bf4',
  'bf4': 'bf4',
  'battlefield': 'bf4',
  'counter-strike 2': 'cs2',
  'cs2': 'cs2',
  'cs:go': 'cs2',
  'cs': 'cs2',
  'warframe': 'warframe',
  'runescape': 'runescape',
  'old school runescape': 'runescape',
  'osrs': 'runescape',
  'delta force': 'delta',
  'steam': 'steam'
};

// Mapeamento dos Application IDs Oficiais registrados pelos estúdios no Discord
export const OFFICIAL_GAME_IDS = {
  'world of warcraft': '356869127241072640',
  'wow': '356869127241072640',
  'wow classic': '614948060853501952',
  'world of warcraft classic': '614948060853501952',
  'battlefield 4': '383389028919148544',
  'bf4': '383389028919148544',
  'battlefield': '383389028919148544',
  'counter-strike 2': '1159934375990263889',
  'cs2': '1159934375990263889',
  'cs:go': '1159934375990263889',
  'cs': '1159934375990263889',
  'warframe': '361254341857902592',
  'runescape': '451877995129667584',
  'old school runescape': '376044738735898624',
  'osrs': '376044738735898624',
  'league of legends': '401518687463948290',
  'lol': '401518687463948290',
  'delta force': '1257418933513359360',
  'grand theft auto v': '356875501861732352',
  'gta v': '356875501861732352',
  'gta 5': '356875501861732352',
  'elden ring': '941257521873133608',
  'visual studio code': '383226320970055681',
  'vscode': '383226320970055681',
  'steam': '382977461870100480'
};

// Lista de jogos e detalhes autênticos do Jinchi para rotação realista
const JINCHI_ACTIVITIES = [
  { name: 'World of Warcraft', assetKey: 'wow', state: '⚔️ Farmando em Azeroth', type: ActivityType.Playing },
  { name: 'Battlefield 4', assetKey: 'bf4', state: '💥 Conquista de Xangai (Servidor BR)', type: ActivityType.Playing },
  { name: 'Delta Force', assetKey: 'delta', state: '🎯 Modo Extração / Operações', type: ActivityType.Playing },
  { name: 'Warframe', assetKey: 'warframe', state: '🪐 Farmando aura no Void', type: ActivityType.Playing },
  { name: 'Counter-Strike 2', assetKey: 'cs2', state: '💣 Competitivo Mirage (12-10)', type: ActivityType.Playing },
  { name: 'RuneScape', assetKey: 'runescape', state: '🌲 Cortando lenha em Lumbridge', type: ActivityType.Playing }
];

let currentActivityIndex = 0;
let rotationInterval = null;

/**
 * Retorna o nome do jogo atual do bot
 * @returns {string}
 */
export function getCurrentGame() {
  const act = JINCHI_ACTIVITIES[currentActivityIndex];
  return act?.name || 'World of Warcraft';
}

/**
 * Encontra a chave de asset de arte correspondente ao nome do jogo
 * @param {string} gameName
 * @returns {string|null}
 */
export function getGameAssetKey(gameName) {
  if (!gameName) return null;
  const clean = gameName.toLowerCase().trim();

  if (GAME_ASSET_KEYS[clean]) return GAME_ASSET_KEYS[clean];

  for (const [key, asset] of Object.entries(GAME_ASSET_KEYS)) {
    if (clean.includes(key) || key.includes(clean)) {
      return asset;
    }
  }

  return null;
}

/**
 * Define o jogo com Rich Presence oficial, timestamps e assets visuais
 * @param {import('discord.js').Client} client
 * @param {string} gameName - Nome do jogo (ex: 'World of Warcraft', 'Battlefield 4')
 * @param {string} state - Detalhe ou estado da partida (opcional)
 * @param {ActivityType} type - Tipo de atividade (padrão: Playing)
 */
export function setBotGame(client, gameName, state = '', type = ActivityType.Playing) {
  if (!client?.user) return;

  const assetKey = getGameAssetKey(gameName) || 'wow';
  const elapsedMinutes = Math.floor(Math.random() * 35) + 12;
  const startTimestamp = Date.now() - elapsedMinutes * 60 * 1000;
  const defaultState = state || `🎮 Em partida há ${elapsedMinutes} min`;

  // 1. Atualização padrão Discord.js
  client.user.setPresence({
    activities: [
      {
        name: gameName,
        type: type,
        state: defaultState
      }
    ],
    status: 'online'
  });

  // 2. Gateway Opcode 3 com chave de asset e timestamps
  try {
    const activityData = {
      name: gameName,
      type: typeof type === 'number' ? type : 0,
      state: defaultState,
      timestamps: {
        start: startTimestamp
      },
      assets: {
        large_image: assetKey,
        large_text: gameName,
        small_image: 'steam',
        small_text: 'Online'
      }
    };

    if (client.ws && typeof client.ws.broadcast === 'function') {
      client.ws.broadcast({
        op: 3,
        d: {
          since: null,
          activities: [activityData],
          status: 'online',
          afk: false
        }
      });
    }
  } catch (err) {
    console.warn('[Presence Manager] Broadcast notice:', err.message);
  }

  console.log(`🎮 [Rich Presence] Dubinha agora está: Jogando "${gameName}" (Asset: ${assetKey})`);
}

/**
 * Inicia a rotação automática e realista de jogos ao longo do dia
 * @param {import('discord.js').Client} client
 */
export function startPresenceRotation(client) {
  if (!client?.user) return;

  // 1. Define o primeiro jogo imediatamente
  const initial = JINCHI_ACTIVITIES[currentActivityIndex];
  setBotGame(client, initial.name, initial.state, initial.type);

  // 2. Rotaciona a cada 45 minutos para parecer um jogador humano real
  if (rotationInterval) clearInterval(rotationInterval);

  rotationInterval = setInterval(() => {
    currentActivityIndex = (currentActivityIndex + 1) % JINCHI_ACTIVITIES.length;
    const activity = JINCHI_ACTIVITIES[currentActivityIndex];
    setBotGame(client, activity.name, activity.state, activity.type);
  }, 45 * 60 * 1000);
}
