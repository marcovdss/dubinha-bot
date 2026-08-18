import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  StreamType
} from '@discordjs/voice';
import play from 'play-dl';
import ffmpegPath from 'ffmpeg-static';
import { spawn } from 'child_process';

// Canal de texto exclusivo onde os comandos de música são permitidos (#🔊-musica)
export const ALLOWED_TEXT_CHANNEL_ID = '907283294700326932';

// Mapa de conexões ativas por Guild ID
const activeSessions = new Map();

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
 * Busca e extrai stream de áudio via SoundCloud ou YouTube
 * @param {string} query
 * @returns {Promise<{ stream: any, type: string, title: string }>}
 */
async function fetchMusicStream(query) {
  await ensureSoundCloud();

  // 1. Busca no SoundCloud (100% de estabilidade e sem bloqueios de IP)
  try {
    console.log(`🔍 [Music Player] Buscando "${query}" no catálogo SoundCloud...`);
    const scResults = await play.search(query, { source: { soundcloud: 'tracks' }, limit: 1 });
    if (scResults && scResults.length > 0) {
      const track = scResults[0];
      console.log(`✅ [Music Player] Encontrado no SoundCloud: "${track.name}"`);
      const scStream = await play.stream(track.url);
      return {
        stream: scStream.stream,
        type: scStream.type,
        title: track.name || query
      };
    }
  } catch (scErr) {
    console.warn('[Music Player] Busca SoundCloud falhou:', scErr.message);
  }

  // 2. Se for link direto do YouTube ou busca direta
  if (play.yt_validate(query) === 'video') {
    try {
      console.log(`🔍 [Music Player] Extraindo stream do YouTube: ${query}...`);
      const ytStream = await play.stream(query);
      const ytInfo = await play.video_info(query);
      return {
        stream: ytStream.stream,
        type: ytStream.type,
        title: ytInfo?.video_details?.title || 'YouTube Audio'
      };
    } catch (ytErr) {
      console.warn('[Music Player] Stream YouTube direto falhou:', ytErr.message);
    }
  }

  throw new Error('Música não encontrada nos catálogos de streaming');
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
    let audioResource = null;
    let radioProcess = null;

    const lowerQuery = query.toLowerCase().trim();

    // Caso A: Rádio / Estilo predefinido (Lofi, Sertanejo, Rock, Forró, Anime)
    if (PRESET_STREAMS[lowerQuery]) {
      songTitle = PRESET_STREAMS[lowerQuery].title;
      radioProcess = createRadioProcess(PRESET_STREAMS[lowerQuery].url);
      audioResource = createAudioResource(radioProcess.stdout, {
        inputType: StreamType.Raw,
        inlineVolume: true
      });
    }
    // Caso B: Link direto de arquivo de áudio (.mp3, .ogg, .wav)
    else if (/^https?:\/\/.+\.(?:mp3|ogg|wav|m3u8)$/i.test(query)) {
      songTitle = 'Áudio Web';
      audioResource = createAudioResource(query, {
        inputType: StreamType.Arbitrary,
        inlineVolume: true
      });
    }
    // Caso C: Busca por nome de música ou artista (Tim Maia, Evidências, etc.)
    else {
      const musicData = await fetchMusicStream(query);
      songTitle = musicData.title;
      audioResource = createAudioResource(musicData.stream, {
        inputType: musicData.type,
        inlineVolume: true
      });
    }

    if (audioResource.volume) {
      audioResource.volume.setVolume(0.85);
    }

    // Se já havia uma rádio tocando na mesma guilda, encerra o processo anterior
    const prevSession = activeSessions.get(guildId);
    if (prevSession && prevSession.radioProcess) {
      try { prevSession.radioProcess.kill(); } catch {}
    }

    // Conecta à sala de voz do membro
    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: guildId,
      adapterCreator: interaction.guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: false
    });

    // Aguarda o handshake UDP do Discord estar 100% pronto antes de transmitir
    await entersState(connection, VoiceConnectionStatus.Ready, 20_000);

    const player = createAudioPlayer();
    player.play(audioResource);
    connection.subscribe(player);

    activeSessions.set(guildId, {
      connection,
      player,
      radioProcess,
      channel: voiceChannel,
      title: songTitle
    });

    player.on(AudioPlayerStatus.Idle, () => {
      console.log(`🎵 [Music Player] Música concluída em: ${guildId}`);
      if (radioProcess) try { radioProcess.kill(); } catch {}
    });

    player.on('error', (error) => {
      console.error(`💥 [Music Player Error]:`, error.message);
      if (radioProcess) try { radioProcess.kill(); } catch {}
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
      message: 'não consegui encontrar ou tocar essa música agora meu vei'
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
    if (session.radioProcess) {
      try { session.radioProcess.kill(); } catch {}
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
