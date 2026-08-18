import { SlashCommandBuilder } from 'discord.js';
import { resumeMusic } from '../../services/musicPlayer.js';

export const data = new SlashCommandBuilder()
  .setName('retomar')
  .setDescription('Retoma a música que estava pausada.');

export async function execute(interaction) {
  const result = resumeMusic(interaction);

  await interaction.reply({
    content: result.message
  });
}
