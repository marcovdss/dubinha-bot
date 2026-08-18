import { SlashCommandBuilder } from 'discord.js';
import { triggerPizzaEvent } from '../../services/randomEvents.js';

export const data = new SlashCommandBuilder()
  .setName('pizza')
  .setDescription('Faz o Jinchi cobrar dinheiro de pizza no PIX de um amigo ou de alguém aleatório!')
  .addUserOption(option =>
    option
      .setName('alvo')
      .setDescription('Quem o Jinchi vai cobrar? (Opcional - deixe vazio para escolher alguém aleatório)')
      .setRequired(false)
  )
  .addStringOption(option =>
    option
      .setName('sabor')
      .setDescription('Qual sabor de pizza o Jinchi quer pedir? (Ex: Pepperoni, Calabresa, 4 Queijos)')
      .setRequired(false)
  )
  .addStringOption(option =>
    option
      .setName('valor')
      .setDescription('Quanto de PIX ele vai pedir? (Ex: 20 conto, 30 conto, 50 conto)')
      .setRequired(false)
  );

export async function execute(interaction) {
  const targetUser = interaction.options.getUser('alvo');
  const sabor = interaction.options.getString('sabor');
  const valor = interaction.options.getString('valor');

  await interaction.reply({
    content: `🍕 *Jinchi bateu o desespero da fome e está indo cobrar o PIX da pizza no chat...*`,
    ephemeral: true
  });

  await triggerPizzaEvent(interaction.client, targetUser, interaction.channel, { sabor, valor });
}
