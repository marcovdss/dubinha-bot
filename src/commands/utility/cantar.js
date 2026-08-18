import { SlashCommandBuilder } from 'discord.js';
import { playMusic, ALLOWED_TEXT_CHANNEL_ID } from '../../services/musicPlayer.js';

export const data = new SlashCommandBuilder()
  .setName('cantar')
  .setDescription('Toca uma música do YouTube ou rádio na sala de voz permitida.')
  .addStringOption(option =>
    option
      .setName('musica')
      .setDescription('Nome da música, link do YouTube ou estilo (lofi, rock, sertanejo, forró)')
      .setRequired(true)
  );

export async function execute(interaction) {
  await interaction.deferReply();

  const query = interaction.options.getString('musica');
  const result = await playMusic(interaction, query);

  if (!result.success) {
    await interaction.editReply({
      content: result.message
    });
    return;
  }

  // Apenas confirmação limpa e direta
  await interaction.editReply({
    content: `🎶 Tocando agora: **${result.title}**`
  });
}
