import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  StreamType
} from '@discordjs/voice';
import ffmpegPath from 'ffmpeg-static';
import { spawn, execFile } from 'child_process';
import yts from 'yt-search';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ytDlpPath = path.resolve(__dirname, '../../bin/yt-dlp.exe');

// Canal de texto exclusivo onde os comandos de música são permitidos (#🔊-musica)
export const ALLOWED_TEXT_CHANNEL_ID = '907283294700326932';

// Mapa de conexões ativas por Guild ID
const activeSessions = new Map();

// Rádios temáticas diretas
const PRESET_STREAMS = {
  lofi: {
    title: 'Lofi Hip Hop Chill Beats',
    url: 'https://stream.zeno.fm/f3wvbbqmdg8uv'
  },
  sertanejo: {
    title: 'Modão Sertanejo das Antigas',
    url: 'https://stream.zeno.fm/4w9wnv58tg8uv'
  },
  rock: {
    title: 'Rock Clássico 80s/90s',
    url: 'https://stream.zeno.fm/yr7n8w3w21zuv'
  },
  forro: {
    title: 'Forró Pé de Serra Nordestino',
    url: 'https://stream.zeno.fm/a8438k4zvg8uv'
  },
  anime: {
    title: 'Anime & Gaming Chill Radio',
    url: 'https://stream.zeno.fm/7cvg4h203wzuv'
  }
};

/**
 * Extrai o link de áudio e título do YouTube via yt-dlp
 * @param {string} targetUrlOrSearch
 * @returns {Promise<{ streamUrl: string, title: string }>}
 */
function extractYouTubeInfo(targetUrlOrSearch) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(ytDlpPath)) {
      return reject(new Error('yt-dlp.exe não encontrado'));
    }

    const isUrl = targetUrlOrSearch.startsWith('http://') || targetUrlOrSearch.startsWith('https://');
    const target = isUrl ? targetUrlOrSearch : `ytsearch1:${targetUrlOrSearch}`;

    const args = [
      '-f', 'ba/b',
      '--extractor-args', 'youtube:player_client=android,web',
      '--print', '%(title)s',
      '-g',
      target
    ];

    execFile(ytDlpPath, args, { timeout: 20000 }, (error, stdout, stderr) => {
      if (error) {
        return reject(error);
      }

      const lines = stdout.trim().split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length === 0) {
        return reject(new Error('Nenhum stream encontrado'));
      }

      const title = lines[0];
      const streamUrl = lines[lines.length - 1];

      resolve({ title, streamUrl });
    });
  });
}

/**
 * Cria um stream contínuo de PCM 48kHz via FFmpeg
 * @param {string} inputUrl
 * @returns {import('child_process').ChildProcess}
 */
function createFFmpegStream(inputUrl) {
  const ffArgs = [
    '-reconnect', '1',
    '-reconnect_streamed', '1',
    '-reconnect_delay_max', '5',
    '-i', inputUrl,
    '-analyzeduration', '0',
    '-loglevel', '0',
    '-f', 's16le',
    '-ar', '48000',
    '-ac', '2',
    'pipe:1'
  ];

  return spawn(ffmpegPath, ffArgs);
}

/**
 * Conecta ao canal de voz onde o membro está e toca a música solicitada por completo sem cortes
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {string} query - Termo de busca, link do YouTube ou gênero
 */
export async function playMusic(interaction, query) {
  // 1. Valida se o comando foi enviado no canal de texto permitido (#🔊-musica)
  if (interaction.channelId !== ALLOWED_TEXT_CHANNEL_ID) {
    return {
      success: false,
      message: `esse comando só pode ser usado no canal <#${ALLOWED_TEXT_CHANNEL_ID}> meu vei`
    };
  }

  // 2. Valida se o usuário está conectado em alguma sala de voz
  const member = interaction.member;
  const voiceChannel = member?.voice?.channel;

  if (!voiceChannel) {
    return {
      success: false,
      message: 'entra em alguma sala de voz primeiro meu vei\nse quer que eu cante pras paredes ?'
    };
  }

  const permissions = voiceChannel.permissionsFor(interaction.client.user);
  if (!permissions.has('Connect') || !permissions.has('Speak')) {
    return {
      success: false,
      message: `não tenho permissão pra entrar ou falar na sala ${voiceChannel.name} não mano`
    };
  }

  const guildId = interaction.guild.id;

  try {
    let songTitle = query;
    let inputAudioUrl = null;
    const lowerQuery = query.toLowerCase().trim();

    // 1. Preset direto de rádio/gênero
    if (PRESET_STREAMS[lowerQuery]) {
      songTitle = PRESET_STREAMS[lowerQuery].title;
      inputAudioUrl = PRESET_STREAMS[lowerQuery].url;
    }
    // 2. Link direto de áudio (MP3 / OGG)
    else if (/^https?:\/\/.+\.(?:mp3|ogg|wav|m3u8)$/i.test(query)) {
      songTitle = 'Áudio Web';
      inputAudioUrl = query;
    }
    // 3. YouTube (Links ou Busca)
    else {
      console.log(`🎬 [Music Player] Extraindo áudio do YouTube para: "${query}"...`);
      const ytInfo = await extractYouTubeInfo(query);
      songTitle = ytInfo.title;
      inputAudioUrl = ytInfo.streamUrl;
      console.log(`✅ [Music Player] Stream URL obtida com sucesso: "${songTitle}"`);
    }

    if (!inputAudioUrl) {
      return {
        success: false,
        message: 'não consegui encontrar o áudio dessa música meu vei'
      };
    }

    // Cria o processo de decodificação FFmpeg (com auto-reconnect)
    const ffmpegProcess = createFFmpegStream(inputAudioUrl);

    ffmpegProcess.on('error', (err) => {
      console.error('[FFmpeg Process Error]:', err.message);
    });

    const audioResource = createAudioResource(ffmpegProcess.stdout, {
      inputType: StreamType.Raw,
      inlineVolume: true
    });

    if (audioResource.volume) {
      audioResource.volume.setVolume(0.85);
    }

    // Se já havia uma sessão ativa, encerra o processo anterior
    const prevSession = activeSessions.get(guildId);
    if (prevSession && prevSession.ffmpegProcess) {
      try {
        prevSession.ffmpegProcess.kill();
      } catch {}
    }

    // Conecta à sala de voz do membro
    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: guildId,
      adapterCreator: interaction.guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: false
    });

    const player = createAudioPlayer();
    player.play(audioResource);
    connection.subscribe(player);

    activeSessions.set(guildId, {
      connection,
      player,
      ffmpegProcess,
      channel: voiceChannel,
      title: songTitle
    });

    player.on(AudioPlayerStatus.Idle, () => {
      console.log(`🎵 [Music Player] Música concluída em: ${guildId}`);
      try { ffmpegProcess.kill(); } catch {}
    });

    player.on('error', (error) => {
      console.error(`💥 [Music Player Error]:`, error.message);
      try { ffmpegProcess.kill(); } catch {}
    });

    return {
      success: true,
      title: songTitle,
      channelName: voiceChannel.name
    };
  } catch (error) {
    console.error('[PlayMusic Error]:', error);
    return {
      success: false,
      message: 'não consegui tocar essa música agora meu vei'
    };
  }
}

/**
 * Para a música e desconecta o bot da sala de voz
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export function stopMusic(interaction) {
  if (interaction.channelId !== ALLOWED_TEXT_CHANNEL_ID) {
    return {
      success: false,
      message: `esse comando só pode ser usado no canal <#${ALLOWED_TEXT_CHANNEL_ID}> meu vei`
    };
  }

  const guildId = interaction.guild.id;
  const session = activeSessions.get(guildId);

  if (!session) {
    return {
      success: false,
      message: 'to cantando em lugar nenhum não meu vei'
    };
  }

  try {
    if (session.ffmpegProcess) {
      try { session.ffmpegProcess.kill(); } catch {}
    }
    session.player.stop();
    session.connection.destroy();
    activeSessions.delete(guildId);

    return {
      success: true,
      message: 'música parada'
    };
  } catch (error) {
    console.error('[StopMusic Error]:', error);
    activeSessions.delete(guildId);
    return {
      success: true,
      message: 'música parada'
    };
  }
}
