import { SlashCommandBuilder } from 'discord.js';
import { addMusicToQueue, createMusicControlRow, setQueueControlMessage } from '../../services/musicPlayer.js';

export const data = new SlashCommandBuilder()
  .setName('cantar')
  .setDescription('Toca uma música/playlist ou adiciona na fila de reprodução.')
  .addStringOption(option =>
    option
      .setName('musica')
      .setDescription('Nome da música, artista, link ou estilo (lofi, rock, sertanejo, forro, anime)')
      .setRequired(true)
  );

export async function execute(interaction) {
  await interaction.deferReply();

  const query = interaction.options.getString('musica');
  const result = await addMusicToQueue(interaction, query);

  if (!result.success) {
    return interaction.editReply({
      content: result.message,
      components: []
    });
  }

  // Se começou a tocar agora, anexa os botões e registra como painel ativo
  if (result.isFirst) {
    const replyMsg = await interaction.editReply({
      content: result.message,
      components: [createMusicControlRow(false)]
    });
    setQueueControlMessage(interaction.guildId, replyMsg);
  } else {
    // Se foi apenas adicionada para tocar depois (fila), responde sem botões para evitar poluição
    await interaction.editReply({
      content: result.message,
      components: []
    });
  }
}
