import { SlashCommandBuilder } from 'discord.js';
import { resumeMusic } from '../../services/musicPlayer.js';

export const data = new SlashCommandBuilder()
  .setName('retomar')
  .setDescription('Retoma a reprodução da música pausada.');

export async function execute(interaction) {
  const result = await resumeMusic(interaction);

  await interaction.reply({
    content: result.message,
    ephemeral: true
  });
}
