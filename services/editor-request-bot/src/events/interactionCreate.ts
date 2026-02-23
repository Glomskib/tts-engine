import type { Interaction } from 'discord.js';
import * as requestEditor from '../commands/request-editor.js';
import { getSupabase } from '../lib/supabase.js';

function parseBudget(raw: string): { min: number | null; max: number | null } {
  const nums = raw.replace(/[^0-9.\-–—]/g, ' ').split(/[\s\-–—]+/).map(Number).filter(n => !isNaN(n) && n > 0);
  if (nums.length >= 2) return { min: Math.min(...nums), max: Math.max(...nums) };
  if (nums.length === 1) return { min: nums[0], max: nums[0] };
  return { min: null, max: null };
}

export async function handleInteraction(interaction: Interaction) {
  // Slash command → open modal
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === requestEditor.data.name) {
      await requestEditor.execute(interaction);
    }
    return;
  }

  // Modal submit → insert row
  if (interaction.isModalSubmit() && interaction.customId === 'editor-request-modal') {
    await interaction.deferReply({ ephemeral: true });

    try {
      const budget = parseBudget(interaction.fields.getTextInputValue('budget'));
      const turnaround = interaction.fields.getTextInputValue('turnaround');
      const weeklyVolume = parseInt(interaction.fields.getTextInputValue('weekly_volume'), 10) || null;
      const styleNotes = interaction.fields.getTextInputValue('style_notes');
      const linksRaw = interaction.fields.getTextInputValue('reference_links');
      const referenceLinks = linksRaw
        ? linksRaw.split('\n').map(l => l.trim()).filter(Boolean)
        : [];

      const supabase = getSupabase();
      const { error } = await supabase.from('ff_editor_requests').insert({
        requester_discord_user_id: interaction.user.id,
        requester_discord_username: interaction.user.username,
        budget_min: budget.min,
        budget_max: budget.max,
        turnaround,
        weekly_volume: weeklyVolume,
        style_notes: styleNotes,
        reference_links: referenceLinks.length > 0 ? referenceLinks : null,
      });

      if (error) {
        console.error('Supabase insert error:', error);
        await interaction.editReply('Something went wrong saving your request. Please try again.');
        return;
      }

      await interaction.editReply(
        'Your editor request has been submitted! Our ops team will review it and get back to you soon.'
      );
    } catch (err) {
      console.error('Modal submit error:', err);
      await interaction.editReply('Something went wrong. Please try again.');
    }
  }
}
