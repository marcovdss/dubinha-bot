import { SlashCommandBuilder } from 'discord.js';
import { stopMusic } from '../../services/musicPlayer.js';

export const data = new SlashCommandBuilder()
  .setName('parar')
  .setDescription('Para a música, limpa a fila e desconecta da sala.');

export async function execute(interaction) {
  const result = await stopMusic(interaction);

  await interaction.reply({
    content: result.message,
    ephemeral: true
  });
}
