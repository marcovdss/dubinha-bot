import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  StreamType
} from '@discordjs/voice';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { execFile, spawn } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import yts from 'yt-search';
import play from 'play-dl';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import spotifyUrlInfo from 'spotify-url-info';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isWindows = process.platform === 'win32';
const localWinBin = path.resolve(__dirname, '../../bin/yt-dlp.exe');
const ytDlpPath = (isWindows && fs.existsSync(localWinBin)) ? localWinBin : 'yt-dlp';

const { getTracks, getPreview } = spotifyUrlInfo(fetch);

// Canal de texto exclusivo onde os comandos de música são permitidos (#🔊-musica)
export const ALLOWED_TEXT_CHANNEL_ID = '907283294700326932';

// Mapa de filas ativas por Guild ID
const queues = new Map();

// Controle de inicialização do SoundCloud Client (fallback)
let soundcloudReady = false;

async function ensureSoundCloud() {
  if (!soundcloudReady) {
    try {
      const clientId = await play.getFreeClientID();
      if (clientId) {
        await play.setToken({ soundcloud: { client_id: clientId } });
        soundcloudReady = true;
      }
    } catch {}
  }
}

// Rádios temáticas diretas de alta fidelidade
const PRESET_STREAMS = {
  lofi: {
    title: 'Lofi Hip Hop Chill Beats (24/7)',
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
 * Cria processo de streaming via FFmpeg com reconexão automática e PCM 48kHz stereo
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
 * Extrai a URL de áudio direta do YouTube via yt-dlp sem bloqueios
 * @param {string} targetUrl
 * @returns {Promise<string>}
 */
function extractYouTubeStreamUrl(targetUrl) {
  return new Promise((resolve, reject) => {
    const clients = ['android', 'ios', 'tv_embedded', 'mweb'];
    let lastErr = null;

    const tryNext = (index) => {
      if (index >= clients.length) {
        return reject(lastErr || new Error('Não foi possível extrair stream do YouTube'));
      }

      const client = clients[index];
      const args = [
        '-f', 'ba/b',
        '--extractor-args', `youtube:player_client=${client}`,
        '-g',
        targetUrl
      ];

      execFile(ytDlpPath, args, { timeout: 15000 }, (error, stdout) => {
        if (error || !stdout.trim()) {
          lastErr = error;
          return tryNext(index + 1);
        }
        const lines = stdout.trim().split('\n').map(l => l.trim()).filter(Boolean);
        resolve(lines[lines.length - 1]);
      });
    };

    tryNext(0);
  });
}

/**
 * Resolve qualquer busca ou link (Spotify, YouTube, SoundCloud, Rádio, Web) para faixas enfileiráveis
 * @param {string} query
 * @returns {Promise<Array<{ title: string, query?: string, isRadio?: boolean, radioUrl?: string, isDirect?: boolean, directUrl?: string, ytUrl?: string }>>}
 */
async function resolveTracks(query) {
  const lowerQuery = query.toLowerCase().trim();

  // 1. Rádios temáticas pré-definidas
  if (PRESET_STREAMS[lowerQuery]) {
    return [{
      title: PRESET_STREAMS[lowerQuery].title,
      isRadio: true,
      radioUrl: PRESET_STREAMS[lowerQuery].url
    }];
  }

  // 2. Links diretos de áudio (.mp3, .ogg, .wav, .m3u8, .flac)
  if (/^https?:\/\/.+\.(?:mp3|ogg|wav|m3u8|flac)$/i.test(query)) {
    return [{
      title: 'Áudio Direto da Web',
      isDirect: true,
      directUrl: query
    }];
  }

  // 3. Spotify (Músicas, Álbuns, Playlists)
  if (query.includes('spotify.com')) {
    console.log(`🟢 [Music Player] Processando link do Spotify: ${query}`);
    if (query.includes('/track/')) {
      const preview = await getPreview(query);
      const cleanArtist = preview.artist || '';
      const cleanTitle = preview.title || preview.track || 'Música';
      const fullQuery = cleanArtist ? `${cleanArtist} - ${cleanTitle}` : cleanTitle;
      return [{
        title: fullQuery,
        query: `${cleanArtist} ${cleanTitle}`.trim()
      }];
    } else if (query.includes('/playlist/') || query.includes('/album/')) {
      const tracks = await getTracks(query);
      if (tracks && tracks.length > 0) {
        return tracks.map(t => {
          const trackArtist = t.artists?.[0]?.name || t.artist || '';
          const trackName = t.name || t.title || 'Música';
          const fullQuery = trackArtist ? `${trackArtist} - ${trackName}` : trackName;
          return {
            title: fullQuery,
            query: `${trackArtist} ${trackName}`.trim()
          };
        });
      }
    }
  }

  // 4. Link direto do YouTube
  if (query.includes('youtube.com/watch') || query.includes('youtu.be/') || query.includes('music.youtube.com/')) {
    console.log(`🔴 [Music Player] Processando link direto do YouTube: ${query}`);
    try {
      const searchRes = await yts(query);
      const video = searchRes.videos?.[0] || searchRes;
      return [{
        title: video.title || 'Vídeo YouTube',
        ytUrl: query,
        query: video.title || query
      }];
    } catch {
      return [{
        title: 'Vídeo YouTube',
        ytUrl: query,
        query: query
      }];
    }
  }

  // 5. Termo de busca genérico (ex: "tim maia", "odd future oldie")
  return [{
    title: query,
    query: query
  }];
}

/**
 * Obtém o processo de áudio contínuo FFmpeg para uma faixa
 * @param {object} track
 * @returns {Promise<{ process: import('child_process').ChildProcess, title: string }>}
 */
async function getTrackAudioProcess(track) {
  // 1. Rádio contínua
  if (track.isRadio) {
    return {
      process: createFFmpegStream(track.radioUrl),
      title: track.title
    };
  }

  // 2. Link direto de áudio
  if (track.isDirect) {
    return {
      process: createFFmpegStream(track.directUrl),
      title: track.title
    };
  }

  // 3. YouTube (Busca oficial exata via yt-search + yt-dlp + FFmpeg)
  try {
    let ytTargetUrl = track.ytUrl;
    let officialTitle = track.title;

    if (!ytTargetUrl) {
      const searchRes = await yts(track.query || track.title);
      if (searchRes && searchRes.videos.length > 0) {
        const bestVideo = searchRes.videos[0];
        ytTargetUrl = bestVideo.url;
        officialTitle = bestVideo.title;
        console.log(`🎬 [Music Player] Encontrado no YouTube Oficial: "${officialTitle}" (${bestVideo.duration.timestamp})`);
      }
    }

    if (ytTargetUrl) {
      const rawAudioUrl = await extractYouTubeStreamUrl(ytTargetUrl);
      if (rawAudioUrl) {
        return {
          process: createFFmpegStream(rawAudioUrl),
          title: officialTitle
        };
      }
    }
  } catch (ytErr) {
    console.warn(`[Music Player] Falha no YouTube Oficial (${ytErr.message}), tentando SoundCloud...`);
  }

  // 4. Fallback SoundCloud se o YouTube falhar
  try {
    await ensureSoundCloud();
    const scResults = await play.search(track.query || track.title, { source: { soundcloud: 'tracks' }, limit: 3 });
    for (const scTrack of scResults) {
      try {
        const scStream = await play.stream(scTrack.url);
        if (scStream && scStream.url) {
          return {
            process: createFFmpegStream(scStream.url),
            title: scTrack.name || track.title
          };
        }
      } catch {}
    }
  } catch (scErr) {
    console.warn('[Music Player] Fallback SoundCloud falhou:', scErr.message);
  }

  throw new Error(`Não foi possível tocar: "${track.title}"`);
}

/**
 * Toca a próxima música da fila da Guild
 * @param {string} guildId
 */
async function playNextInQueue(guildId) {
  const queue = queues.get(guildId);
  if (!queue) return;

  if (queue.songs.length === 0) {
    console.log(`🎵 [Music Player] Fila vazia em: ${guildId}. Desconectando...`);
    if (queue.connection) {
      try { queue.connection.destroy(); } catch {}
    }
    queues.delete(guildId);
    return;
  }

  const currentTrack = queue.songs[0];
  queue.currentTrack = currentTrack;

  try {
    if (queue.activeProcess) {
      try { queue.activeProcess.kill(); } catch {}
      queue.activeProcess = null;
    }

    const { process: audioProcess, title: finalTitle } = await getTrackAudioProcess(currentTrack);
    queue.activeProcess = audioProcess;
    currentTrack.title = finalTitle;

    audioProcess.on('error', (err) => {
      console.error('[FFmpeg Process Error]:', err.message);
    });

    const audioResource = createAudioResource(audioProcess.stdout, {
      inputType: StreamType.Raw,
      inlineVolume: true
    });

    if (audioResource.volume) {
      audioResource.volume.setVolume(0.85);
    }

    queue.player.play(audioResource);
    queue.isPlaying = true;
    queue.isPaused = false;
  } catch (err) {
    console.error(`💥 [Music Player Error ao tocar faixa]:`, err.message);
    queue.songs.shift();
    playNextInQueue(guildId);
  }
}

/**
 * Adiciona música ou playlist na fila e inicia se estiver parado
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {string} query
 */
export async function addMusicToQueue(interaction, query) {
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
    const tracks = await resolveTracks(query);
    if (!tracks || tracks.length === 0) {
      return {
        success: false,
        message: 'não consegui encontrar essa música meu vei'
      };
    }

    let queue = queues.get(guildId);

    if (!queue) {
      const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: guildId,
        adapterCreator: interaction.guild.voiceAdapterCreator,
        selfDeaf: false,
        selfMute: false
      });

      await entersState(connection, VoiceConnectionStatus.Ready, 20_000);

      const player = createAudioPlayer();
      connection.subscribe(player);

      queue = {
        guildId,
        connection,
        player,
        voiceChannel,
        songs: [],
        currentTrack: null,
        isPlaying: false,
        isPaused: false,
        activeProcess: null
      };

      player.on(AudioPlayerStatus.Idle, () => {
        queue.songs.shift(); // Remove a faixa que terminou
        playNextInQueue(guildId);
      });

      player.on('error', (error) => {
        console.error('[Player Error]:', error.message);
        queue.songs.shift();
        playNextInQueue(guildId);
      });

      queues.set(guildId, queue);
    }

    const isFirst = queue.songs.length === 0 && !queue.isPlaying;

    // Enfileira as faixas
    queue.songs.push(...tracks);

    if (isFirst) {
      playNextInQueue(guildId);
      if (tracks.length > 1) {
        return {
          success: true,
          message: `🎶 Tocando agora: **${tracks[0].title}** (+ ${tracks.length - 1} faixas adicionadas da playlist)`
        };
      }
      return {
        success: true,
        message: `🎶 Tocando agora: **${tracks[0].title}**`
      };
    } else {
      if (tracks.length > 1) {
        return {
          success: true,
          message: `➕ **${tracks.length} faixas** adicionadas à fila!`
        };
      }
      return {
        success: true,
        message: `➕ Adicionado à fila: **${tracks[0].title}** (Posição #${queue.songs.length})`
      };
    }
  } catch (error) {
    console.error('[AddMusic Error]:', error);
    return {
      success: false,
      message: 'não consegui carregar essa música meu vei'
    };
  }
}

/**
 * Pula para a próxima música da fila
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export function skipMusic(interaction) {
  if (interaction.channelId !== ALLOWED_TEXT_CHANNEL_ID) {
    return {
      success: false,
      message: `esse comando só pode ser usado no canal <#${ALLOWED_TEXT_CHANNEL_ID}> meu vei`
    };
  }

  const guildId = interaction.guild.id;
  const queue = queues.get(guildId);

  if (!queue || !queue.currentTrack) {
    return {
      success: false,
      message: 'não tem nada tocando pra pular meu vei'
    };
  }

  const skippedTitle = queue.currentTrack.title;
  queue.player.stop();

  return {
    success: true,
    message: `⏭️ Pulada: **${skippedTitle}**`
  };
}

/**
 * Pausa a reprodução atual
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export function pauseMusic(interaction) {
  if (interaction.channelId !== ALLOWED_TEXT_CHANNEL_ID) {
    return {
      success: false,
      message: `esse comando só pode ser usado no canal <#${ALLOWED_TEXT_CHANNEL_ID}> meu vei`
    };
  }

  const guildId = interaction.guild.id;
  const queue = queues.get(guildId);

  if (!queue || !queue.isPlaying || queue.isPaused) {
    return {
      success: false,
      message: 'não tem nenhuma música tocando no momento meu vei'
    };
  }

  queue.player.pause();
  queue.isPaused = true;

  return {
    success: true,
    message: '⏸️ Música pausada!'
  };
}

/**
 * Retoma a reprodução pausada
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export function resumeMusic(interaction) {
  if (interaction.channelId !== ALLOWED_TEXT_CHANNEL_ID) {
    return {
      success: false,
      message: `esse comando só pode ser usado no canal <#${ALLOWED_TEXT_CHANNEL_ID}> meu vei`
    };
  }

  const guildId = interaction.guild.id;
  const queue = queues.get(guildId);

  if (!queue || !queue.isPaused) {
    return {
      success: false,
      message: 'a música não está pausada meu vei'
    };
  }

  queue.player.unpause();
  queue.isPaused = false;

  return {
    success: true,
    message: '▶️ Música retomada!'
  };
}

/**
 * Retorna a lista da fila de reprodução atual
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export function getQueueList(interaction) {
  if (interaction.channelId !== ALLOWED_TEXT_CHANNEL_ID) {
    return {
      success: false,
      message: `esse comando só pode ser usado no canal <#${ALLOWED_TEXT_CHANNEL_ID}> meu vei`
    };
  }

  const guildId = interaction.guild.id;
  const queue = queues.get(guildId);

  if (!queue || (!queue.currentTrack && queue.songs.length === 0)) {
    return {
      success: false,
      message: 'a fila está vazia no momento meu vei'
    };
  }

  let text = `🎶 **Tocando Agora:**\n▶️ **${queue.currentTrack?.title || 'Nada'}**\n\n`;

  if (queue.songs.length > 1) {
    text += `📋 **Próximas na Fila (${queue.songs.length - 1}):**\n`;
    const upcoming = queue.songs.slice(1, 11);
    upcoming.forEach((track, index) => {
      text += `**${index + 1}.** ${track.title}\n`;
    });
    if (queue.songs.length > 11) {
      text += `*...e mais ${queue.songs.length - 11} música(s)*\n`;
    }
  } else {
    text += `*Nenhuma outra música na fila.*`;
  }

  return {
    success: true,
    message: text
  };
}

/**
 * Para a música, limpa a fila e desconecta da sala
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
  const queue = queues.get(guildId);

  if (!queue) {
    return {
      success: false,
      message: 'to cantando em lugar nenhum não meu vei'
    };
  }

  try {
    if (queue.activeProcess) {
      try { queue.activeProcess.kill(); } catch {}
    }
    queue.songs = [];
    queue.player.stop();
    queue.connection.destroy();
    queues.delete(guildId);

    return {
      success: true,
      message: 'música parada e fila limpa'
    };
  } catch (error) {
    console.error('[StopMusic Error]:', error);
    queues.delete(guildId);
    return {
      success: true,
      message: 'música parada'
    };
  }
}

/**
 * Cria a barra de botões interativos do player de música
 * @param {boolean} isPaused
 * @returns {ActionRowBuilder<ButtonBuilder>}
 */
export function createMusicControlRow(isPaused = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('music_pause_resume')
      .setLabel(isPaused ? 'Retomar' : 'Pausar')
      .setEmoji(isPaused ? '▶️' : '⏸️')
      .setStyle(isPaused ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('music_skip')
      .setLabel('Pular')
      .setEmoji('⏭️')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('music_queue')
      .setLabel('Fila')
      .setEmoji('📋')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('music_stop')
      .setLabel('Parar')
      .setEmoji('🛑')
      .setStyle(ButtonStyle.Danger)
  );
}

/**
 * Processa cliques nos botões do player de música
 * @param {import('discord.js').ButtonInteraction} interaction
 */
export async function handleMusicButton(interaction) {
  const customId = interaction.customId;
  const guildId = interaction.guildId;
  const queue = queues.get(guildId);

  if (!queue) {
    return interaction.reply({
      content: 'não tem nenhuma música tocando no momento meu vei',
      ephemeral: true
    });
  }

  if (customId === 'music_pause_resume') {
    if (queue.isPaused) {
      queue.player.unpause();
      queue.isPaused = false;
      await interaction.update({
        components: [createMusicControlRow(false)]
      });
      await interaction.followUp({ content: '▶️ Música retomada!', ephemeral: true });
    } else {
      queue.player.pause();
      queue.isPaused = true;
      await interaction.update({
        components: [createMusicControlRow(true)]
      });
      await interaction.followUp({ content: '⏸️ Música pausada!', ephemeral: true });
    }
  } else if (customId === 'music_skip') {
    const skipped = queue.currentTrack?.title || 'Música';
    queue.player.stop();
    await interaction.reply({
      content: `⏭️ Pulada por <@${interaction.user.id}>: **${skipped}**`
    });
  } else if (customId === 'music_queue') {
    const queueList = getQueueList(interaction);
    await interaction.reply({
      content: queueList.message,
      ephemeral: true
    });
  } else if (customId === 'music_stop') {
    stopMusic(interaction);
    await interaction.reply({
      content: `🛑 Música parada por <@${interaction.user.id}>.`
    });
  }
}
