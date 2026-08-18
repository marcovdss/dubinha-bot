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
const ffmpegExecutable = (isWindows && ffmpegPath) ? ffmpegPath : 'ffmpeg';

const { getTracks, getPreview } = spotifyUrlInfo(fetch);

// Canal de texto exclusivo onde os comandos de música são permitidos (#🔊-musica)
export const ALLOWED_TEXT_CHANNEL_ID = '907283294700326932';

// Mapa de filas ativas por Guild ID
const queues = new Map();

// Controle de inicialização do SoundCloud Client (fallback apenas para buscas de texto)
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
 * Cria processo de streaming via FFmpeg com suporte a URL e ReadableStream (pipe:0)
 * @param {string | import('stream').Readable} inputUrlOrStream
 * @returns {import('child_process').ChildProcess}
 */
function createFFmpegStream(inputUrlOrStream) {
  const isPipe = typeof inputUrlOrStream !== 'string';
  const ffArgs = isPipe
    ? [
        '-i', 'pipe:0',
        '-loglevel', 'error',
        '-f', 's16le',
        '-ar', '48000',
        '-ac', '2',
        'pipe:1'
      ]
    : [
        '-reconnect', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '5',
        '-i', inputUrlOrStream,
        '-analyzeduration', '0',
        '-loglevel', 'error',
        '-f', 's16le',
        '-ar', '48000',
        '-ac', '2',
        'pipe:1'
      ];

  const ffProcess = spawn(ffmpegExecutable, ffArgs);

  if (isPipe) {
    inputUrlOrStream.pipe(ffProcess.stdin);
    inputUrlOrStream.on('error', (err) => {
      console.warn('[Piped Stream Error]:', err.message);
    });
  }

  return ffProcess;
}

/**
 * Extrai a URL de áudio direta do YouTube via yt-dlp sem bloqueios
 * @param {string} targetUrl
 * @returns {Promise<string>}
 */
function extractYouTubeStreamUrl(targetUrl) {
  return new Promise((resolve, reject) => {
    const clients = ['android', 'mweb', 'web'];
    let lastErr = null;

    const tryNext = (index) => {
      if (index >= clients.length) {
        return reject(lastErr || new Error('Não foi possível extrair stream do YouTube'));
      }

      const client = clients[index];
      const args = [
        '-f', 'ba/b',
        '--no-warnings',
        '--no-check-certificates',
        '--extractor-args', `youtube:player_client=${client}`,
        '-g',
        targetUrl
      ];

      execFile(ytDlpPath, args, { timeout: 15000 }, (error, stdout) => {
        if (!error && stdout && stdout.trim()) {
          const lines = stdout.trim().split('\n').map(l => l.trim()).filter(l => l.startsWith('http'));
          if (lines.length > 0) {
            return resolve(lines[lines.length - 1]);
          }
        }
        lastErr = error || new Error('URL de áudio inválida');
        tryNext(index + 1);
      });
    };

    tryNext(0);
  });
}

/**
 * Resolve qualquer busca ou link (Spotify, YouTube, SoundCloud, Rádio, Web) para faixas enfileiráveis
 * @param {string} query
 * @returns {Promise<Array<{ title: string, query?: string, isRadio?: boolean, radioUrl?: string, isDirect?: boolean, directUrl?: string, isSpotify?: boolean, isYouTube?: boolean, ytUrl?: string }>>}
 */
async function resolveTracks(query) {
  const lowerQuery = String(query || '').toLowerCase().trim();

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

  // 3. Spotify (Músicas, Álbuns, Playlists) - Busca EXCLUSIVA da faixa original de estúdio do link
  if (query.includes('spotify.com')) {
    console.log(`🟢 [Music Player] Processando link do Spotify: ${query}`);
    if (query.includes('/track/')) {
      const preview = await getPreview(query);
      const cleanArtist = String(preview.artist || '');
      const cleanTitle = String(preview.title || preview.track || 'Música');
      const fullQuery = cleanArtist ? `${cleanArtist} - ${cleanTitle}` : cleanTitle;
      return [{
        title: fullQuery,
        query: fullQuery,
        isSpotify: true
      }];
    } else if (query.includes('/playlist/') || query.includes('/album/')) {
      const tracks = await getTracks(query);
      if (tracks && tracks.length > 0) {
        return tracks.map(t => {
          const trackArtist = String(t.artists?.[0]?.name || t.artist || '');
          const trackName = String(t.name || t.title || 'Música');
          const fullQuery = trackArtist ? `${trackArtist} - ${trackName}` : trackName;
          return {
            title: fullQuery,
            query: fullQuery,
            isSpotify: true
          };
        });
      }
    }
  }

  // 4. Link direto do YouTube
  if (query.includes('youtube.com/watch') || query.includes('youtu.be/') || query.includes('music.youtube.com/')) {
    console.log(`🔴 [Music Player] Processando link direto do YouTube: ${query}`);
    try {
      const searchRes = await yts(String(query));
      const video = searchRes.videos?.[0] || searchRes;
      return [{
        title: video.title || 'Vídeo YouTube',
        isYouTube: true,
        ytUrl: query,
        query: video.title || query
      }];
    } catch {
      return [{
        title: 'Vídeo YouTube',
        isYouTube: true,
        ytUrl: query,
        query: query
      }];
    }
  }

  // 5. Termo de busca genérico por texto (ex: "tim maia", "odd future oldie")
  return [{
    title: String(query),
    query: String(query),
    isGenericSearch: true
  }];
}

/**
 * Obtém o processo de áudio contínuo FFmpeg para uma faixa
 * @param {object} track
 * @returns {Promise<{ process: import('child_process').ChildProcess, title: string }>}
 */
async function getTrackAudioProcess(track) {
  const searchQuery = String(track.query || track.title || '').trim();

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

  // 3. Link do Spotify ou Link Direto do YouTube: Busca ESTRITAMENTE a gravação original de estúdio
  if (track.isSpotify || track.isYouTube) {
    try {
      let ytTargetUrl = track.ytUrl;
      let officialTitle = track.title;

      if (!ytTargetUrl && searchQuery) {
        const searchRes = await yts(`${searchQuery} Official Audio`);
        if (searchRes && searchRes.videos && searchRes.videos.length > 0) {
          // Filtra remixes ou covers para garantir 100% a versão original de estúdio do Spotify
          const bestVideo = searchRes.videos.find(v => {
            const t = v.title.toLowerCase();
            const originalLower = searchQuery.toLowerCase();
            if (!originalLower.includes('remix') && t.includes('remix')) return false;
            if (!originalLower.includes('cover') && t.includes('cover')) return false;
            if (!originalLower.includes('type beat') && t.includes('type beat')) return false;
            return true;
          }) || searchRes.videos[0];

          ytTargetUrl = bestVideo.url;
          officialTitle = bestVideo.title;
          console.log(`🎬 [Music Player - Spotify Original] Encontrado Oficial: "${officialTitle}" (${bestVideo.duration?.timestamp || 'Duração'})`);
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
    } catch (err) {
      console.warn(`[Music Player] Erro ao extrair áudio oficial do link (${err.message})`);
    }

    throw new Error(`Não foi possível carregar a versão oficial da faixa do Spotify: "${track.title}"`);
  }

  // 4. Busca Genérica de Texto: tenta YouTube primeiro, com fallback para SoundCloud
  try {
    let ytTargetUrl = track.ytUrl;
    let officialTitle = track.title;

    if (!ytTargetUrl && searchQuery) {
      const searchRes = await yts(searchQuery);
      if (searchRes && searchRes.videos && searchRes.videos.length > 0) {
        const bestVideo = searchRes.videos[0];
        ytTargetUrl = bestVideo.url;
        officialTitle = bestVideo.title;
        console.log(`🎬 [Music Player] Encontrado no YouTube: "${officialTitle}" (${bestVideo.duration?.timestamp || 'Duração'})`);
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
    console.warn(`[Music Player] YouTube falhou na busca genérica (${ytErr.message}), tentando SoundCloud...`);
  }

  // Fallback para SoundCloud apenas se for busca genérica de texto
  try {
    await ensureSoundCloud();
    const scResults = await play.search(searchQuery, { source: { soundcloud: 'tracks' }, limit: 3 });
    for (const scTrack of scResults) {
      try {
        const scStream = await play.stream(scTrack.url);
        if (scStream && scStream.stream) {
          return {
            process: createFFmpegStream(scStream.stream),
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
 * Registra a mensagem ativa de controle com botões
 * @param {string} guildId
 * @param {import('discord.js').Message} message
 */
export function setQueueControlMessage(guildId, message) {
  const queue = queues.get(guildId);
  if (queue) {
    queue.lastControlMessage = message;
  }
}

/**
 * Toca a próxima música da fila da Guild
 * @param {string} guildId
 * @param {boolean} isAutoAdvance
 */
async function playNextInQueue(guildId, isAutoAdvance = false) {
  const queue = queues.get(guildId);
  if (!queue) return;

  if (queue.songs.length === 0) {
    console.log(`🎵 [Music Player] Fila vazia em: ${guildId}. Desconectando...`);
    if (queue.lastControlMessage) {
      try {
        await queue.lastControlMessage.edit({ components: [] });
      } catch {}
      queue.lastControlMessage = null;
    }
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
    currentTrack.title = finalTitle; // Guarda o nome REAL da faixa reproduzida

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
    console.log(`🎶 [Music Player] Reproduzindo com sucesso: "${finalTitle}"`);

    // Remove botões da mensagem de controle anterior para não poluir o histórico
    if (queue.lastControlMessage) {
      try {
        await queue.lastControlMessage.edit({ components: [] });
      } catch {}
      queue.lastControlMessage = null;
    }

    // Se for avanço automático para a próxima música da fila, envia o novo painel de botões
    if (isAutoAdvance && queue.textChannel) {
      try {
        const newMsg = await queue.textChannel.send({
          content: `🎶 Tocando agora: **${finalTitle}**`,
          components: [createMusicControlRow(false)]
        });
        queue.lastControlMessage = newMsg;
      } catch {}
    }
  } catch (err) {
    console.error(`💥 [Music Player Error ao tocar faixa]:`, err.message);
    queue.songs.shift();
    await playNextInQueue(guildId, isAutoAdvance);
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
        textChannel: interaction.channel,
        lastControlMessage: null,
        songs: [],
        currentTrack: null,
        isPlaying: false,
        isPaused: false,
        activeProcess: null
      };

      player.on(AudioPlayerStatus.Idle, (oldState) => {
        if (oldState.status === AudioPlayerStatus.Playing || oldState.status === AudioPlayerStatus.Buffering) {
          queue.songs.shift(); // Remove a faixa que terminou
          playNextInQueue(guildId, true);
        }
      });

      player.on('error', (error) => {
        console.error('[Player Error]:', error.message);
        queue.songs.shift();
        playNextInQueue(guildId, true);
      });

      queues.set(guildId, queue);
    } else {
      queue.textChannel = interaction.channel;
    }

    const isFirst = queue.songs.length === 0 && !queue.isPlaying;

    // Enfileira as faixas
    queue.songs.push(...tracks);

    if (isFirst) {
      await playNextInQueue(guildId, false);
      const realPlayingTitle = queue.currentTrack?.title || tracks[0].title;
      if (tracks.length > 1) {
        return {
          success: true,
          isFirst: true,
          message: `🎶 Tocando agora: **${realPlayingTitle}** (+ ${tracks.length - 1} faixas adicionadas da playlist)`
        };
      }
      return {
        success: true,
        isFirst: true,
        message: `🎶 Tocando agora: **${realPlayingTitle}**`
      };
    } else {
      if (tracks.length > 1) {
        return {
          success: true,
          isFirst: false,
          message: `➕ **${tracks.length} faixas** adicionadas à fila!`
        };
      }
      return {
        success: true,
        isFirst: false,
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
    if (queue.lastControlMessage) {
      try {
        queue.lastControlMessage.edit({ components: [] }).catch(() => {});
      } catch {}
      queue.lastControlMessage = null;
    }
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
