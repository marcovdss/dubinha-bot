import { SlashCommandBuilder } from 'discord.js';
import { addMusicToQueue } from '../../services/musicPlayer.js';

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
  // Resposta efêmera para não poluir o canal de chat
  await interaction.deferReply({ ephemeral: true });

  const query = interaction.options.getString('musica');
  const result = await addMusicToQueue(interaction, query);

  await interaction.editReply({
    content: result.message
  });
}
