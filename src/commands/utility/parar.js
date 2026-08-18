import { SlashCommandBuilder } from 'discord.js';
import { stopMusic } from '../../services/musicPlayer.js';

export const data = new SlashCommandBuilder()
  .setName('parar')
  .setDescription('Faz o Jinchi parar a música e sair da sala de voz.');

export async function execute(interaction) {
  const result = stopMusic(interaction);

  await interaction.reply({
    content: result.message
  });
}
