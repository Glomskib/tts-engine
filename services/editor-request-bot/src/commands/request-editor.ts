import {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('request-editor')
  .setDescription('Request a video editor for your project');

export async function execute(interaction: ChatInputCommandInteraction) {
  const modal = new ModalBuilder()
    .setCustomId('editor-request-modal')
    .setTitle('Request a Video Editor');

  const budgetInput = new TextInputBuilder()
    .setCustomId('budget')
    .setLabel('Budget range (e.g. "$50-$150")')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder('$50-$150');

  const turnaroundInput = new TextInputBuilder()
    .setCustomId('turnaround')
    .setLabel('Turnaround time (e.g. "48 hours")')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder('48 hours');

  const volumeInput = new TextInputBuilder()
    .setCustomId('weekly_volume')
    .setLabel('Videos per week (e.g. "3")')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder('3');

  const styleInput = new TextInputBuilder()
    .setCustomId('style_notes')
    .setLabel('Style notes & niche')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setPlaceholder('Describe your editing style, niche, and any preferences...');

  const linksInput = new TextInputBuilder()
    .setCustomId('reference_links')
    .setLabel('Reference links (one per line)')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setPlaceholder('https://youtube.com/watch?v=...\nhttps://...');

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(budgetInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(turnaroundInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(volumeInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(styleInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(linksInput),
  );

  await interaction.showModal(modal);
}
