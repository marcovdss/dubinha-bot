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
import play from 'play-dl';
import ffmpegPath from 'ffmpeg-static';
import { spawn } from 'child_process';
import spotifyUrlInfo from 'spotify-url-info';

const { getTracks, getPreview } = spotifyUrlInfo(fetch);

// Canal de texto exclusivo onde os comandos de música são permitidos (#🔊-musica)
export const ALLOWED_TEXT_CHANNEL_ID = '907283294700326932';

// Mapa de filas ativas por Guild ID
const queues = new Map();

// Controle de inicialização do SoundCloud Client
let soundcloudReady = false;

async function ensureSoundCloud() {
  if (!soundcloudReady) {
    try {
      const clientId = await play.getFreeClientID();
      if (clientId) {
        await play.setToken({ soundcloud: { client_id: clientId } });
        soundcloudReady = true;
        console.log('🎵 [Music Player] SoundCloud Engine inicializado com sucesso!');
      }
    } catch (err) {
      console.warn('[Music Player] Erro ao obter SoundCloud ClientID:', err.message);
    }
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
 * Cria um stream contínuo e ininterrupto para web rádios via FFmpeg com auto-reconnect
 * @param {string} url
 * @returns {import('child_process').ChildProcess}
 */
function createRadioProcess(url) {
  const ffArgs = [
    '-reconnect', '1',
    '-reconnect_streamed', '1',
    '-reconnect_delay_max', '5',
    '-i', url,
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
 * Busca e extrai stream de áudio via Multi-Provedores (Spotify, SoundCloud, YouTube, Web)
 * @param {string} query
 * @returns {Promise<Array<{ title: string, searchQuery?: string, streamUrl?: string, soundCloudUrl?: string, isRadio?: boolean, radioUrl?: string, isDirect?: boolean, isYouTube?: boolean, ytUrl?: string }>>}
 */
async function resolveTracks(query) {
  const lowerQuery = query.toLowerCase().trim();

  // 1. Rádios / Presets temáticos
  if (PRESET_STREAMS[lowerQuery]) {
    return [{
      title: PRESET_STREAMS[lowerQuery].title,
      isRadio: true,
      radioUrl: PRESET_STREAMS[lowerQuery].url
    }];
  }

  // 2. Links Diretos de Áudio (.mp3, .ogg, .wav, .m3u8, etc.)
  if (/^https?:\/\/.+\.(?:mp3|ogg|wav|m3u8|flac)$/i.test(query)) {
    return [{
      title: 'Áudio Direto da Web',
      isDirect: true,
      streamUrl: query
    }];
  }

  // 3. Spotify (Faixas, Álbuns, Playlists)
  if (query.includes('spotify.com')) {
    try {
      console.log(`🟢 [Music Player] Detectado link do Spotify: ${query}`);
      if (query.includes('/track/')) {
        const preview = await getPreview(query);
        const title = `${preview.artist} - ${preview.title}`;
        return [{
          title: title,
          searchQuery: title
        }];
      } else if (query.includes('/playlist/') || query.includes('/album/')) {
        const tracks = await getTracks(query);
        if (tracks && tracks.length > 0) {
          return tracks.map(t => {
            const trackArtist = t.artists?.[0]?.name || t.artist || '';
            const trackName = t.name || t.title || 'Música';
            const fullTitle = trackArtist ? `${trackArtist} - ${trackName}` : trackName;
            return {
              title: fullTitle,
              searchQuery: fullTitle
            };
          });
        }
      }
    } catch (spErr) {
      console.warn('[Music Player] Erro ao resolver Spotify:', spErr.message);
    }
  }

  await ensureSoundCloud();

  // 4. SoundCloud (Playlists completas)
  if (query.includes('soundcloud.com') && query.includes('/sets/')) {
    try {
      console.log(`🟠 [Music Player] Detectada playlist SoundCloud: ${query}`);
      const playlist = await play.soundcloud(query);
      const tracks = await playlist.all_tracks();
      return tracks.map(t => ({
        title: t.name || 'Faixa SoundCloud',
        soundCloudUrl: t.url
      }));
    } catch (e) {
      console.warn('[Music Player] Erro ao carregar playlist SoundCloud:', e.message);
    }
  }

  // 5. YouTube direto (Links de vídeo)
  if (play.yt_validate(query) === 'video') {
    try {
      console.log(`🔴 [Music Player] Detectado vídeo do YouTube: ${query}`);
      const info = await play.video_info(query);
      return [{
        title: info?.video_details?.title || 'Vídeo YouTube',
        isYouTube: true,
        ytUrl: query,
        searchQuery: info?.video_details?.title || query
      }];
    } catch (ytErr) {
      console.warn('[Music Player] YouTube video info falhou:', ytErr.message);
    }
  }

  // 6. Busca Universal de Faixa no SoundCloud (Padrão de Alta Fidelidade)
  try {
    const scResults = await play.search(query, { source: { soundcloud: 'tracks' }, limit: 1 });
    if (scResults && scResults.length > 0) {
      const track = scResults[0];
      return [{
        title: track.name || query,
        soundCloudUrl: track.url
      }];
    }
  } catch (scErr) {
    console.warn('[Music Player] Busca SoundCloud falhou:', scErr.message);
  }

  throw new Error('Nenhuma música encontrada');
}

/**
 * Obtém stream de áudio com fallback resiliente entre múltiplos candidatos e provedores
 * @param {string} searchQuery
 * @returns {Promise<{ stream: any, type: string }>}
 */
async function getResilientAudioStream(searchQuery) {
  await ensureSoundCloud();

  // 1. Tenta os 5 primeiros resultados do SoundCloud
  try {
    const scResults = await play.search(searchQuery, { source: { soundcloud: 'tracks' }, limit: 5 });
    if (scResults && scResults.length > 0) {
      for (const track of scResults) {
        try {
          const scStream = await play.stream(track.url);
          if (scStream && scStream.stream) {
            return {
              stream: scStream.stream,
              type: scStream.type
            };
          }
        } catch (itemErr) {
          console.warn(`[Music Player] Faixa "${track.name}" indisponível no SoundCloud (404/privada), tentando próxima opção...`);
        }
      }
    }
  } catch (scErr) {
    console.warn('[Music Player] Erro na busca do SoundCloud:', scErr.message);
  }

  // 2. Fallback para YouTube caso todas as opções do SoundCloud falhem
  try {
    const ytResults = await play.search(searchQuery, { source: { youtube: 'video' }, limit: 1 });
    if (ytResults && ytResults.length > 0) {
      const ytStream = await play.stream(ytResults[0].url);
      if (ytStream && ytStream.stream) {
        return {
          stream: ytStream.stream,
          type: ytStream.type
        };
      }
    }
  } catch (ytErr) {
    console.warn('[Music Player] Fallback YouTube falhou:', ytErr.message);
  }

  throw new Error(`Não foi possível reproduzir o áudio de "${searchQuery}"`);
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
    let audioResource = null;

    if (queue.radioProcess) {
      try { queue.radioProcess.kill(); } catch {}
      queue.radioProcess = null;
    }

    // 1. Rádio Web Contínua (FFmpeg Raw PCM)
    if (currentTrack.isRadio) {
      queue.radioProcess = createRadioProcess(currentTrack.radioUrl);
      audioResource = createAudioResource(queue.radioProcess.stdout, {
        inputType: StreamType.Raw,
        inlineVolume: true
      });
    }
    // 2. Link Direto Web
    else if (currentTrack.isDirect) {
      audioResource = createAudioResource(currentTrack.streamUrl, {
        inputType: StreamType.Arbitrary,
        inlineVolume: true
      });
    }
    // 3. Faixa direta do SoundCloud (com fallback para busca caso dê 404)
    else if (currentTrack.soundCloudUrl) {
      try {
        const scStream = await play.stream(currentTrack.soundCloudUrl);
        audioResource = createAudioResource(scStream.stream, {
          inputType: scStream.type,
          inlineVolume: true
        });
      } catch (errDirect) {
        console.warn(`[Music Player] Link direto falhou (${errDirect.message}), acionando busca resiliente para "${currentTrack.title}"...`);
        const resilient = await getResilientAudioStream(currentTrack.title);
        audioResource = createAudioResource(resilient.stream, {
          inputType: resilient.type,
          inlineVolume: true
        });
      }
    }
    // 4. Faixa com searchQuery (Spotify ou termo) -> busca resiliente
    else if (currentTrack.searchQuery) {
      const resilient = await getResilientAudioStream(currentTrack.searchQuery);
      audioResource = createAudioResource(resilient.stream, {
        inputType: resilient.type,
        inlineVolume: true
      });
    }

    if (!audioResource) {
      throw new Error(`Não foi possível gerar recurso de áudio para "${currentTrack.title}"`);
    }

    if (audioResource.volume) {
      audioResource.volume.setVolume(0.85);
    }

    queue.player.play(audioResource);
    queue.isPlaying = true;
    queue.isPaused = false;
  } catch (err) {
    console.error(`💥 [Music Player Error ao tocar faixa]:`, err.message);
    queue.songs.shift(); // Remove a com erro e tenta a próxima
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
        radioProcess: null
      };

      player.on(AudioPlayerStatus.Idle, () => {
        queue.songs.shift(); // Remove a música que terminou
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
  queue.player.stop(); // Dispara o evento Idle que puxa a próxima

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
    const upcoming = queue.songs.slice(1, 11); // Até 10 músicas
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
    if (queue.radioProcess) {
      try { queue.radioProcess.kill(); } catch {}
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
