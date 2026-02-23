/**
 * FlashFlow Discord Bot — Standalone script (not hosted in Next.js)
 *
 * Features:
 * - /verify slash command → DMs user the connect URL
 * - guildMemberAdd event → welcomes + prompts verification
 *
 * Setup:
 * 1. npm install discord.js
 * 2. Set environment variables: DISCORD_BOT_TOKEN, DISCORD_GUILD_ID, FLASHFLOW_URL
 * 3. Register slash commands: npx tsx scripts/discord-bot/bot.ts --register
 * 4. Run: npx tsx scripts/discord-bot/bot.ts
 */

import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type GuildMember,
} from 'discord.js';

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN!;
const GUILD_ID = process.env.DISCORD_GUILD_ID!;
const FLASHFLOW_URL = process.env.FLASHFLOW_URL || 'https://app.flashflow.so';

// Slash command definition
const verifyCommand = new SlashCommandBuilder()
  .setName('verify')
  .setDescription('Link your Discord account to FlashFlow to get your plan roles');

// Register slash commands (run with --register flag)
async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);
  const clientId = (await rest.get(Routes.oauth2CurrentApplication()) as { id: string }).id;

  await rest.put(Routes.applicationGuildCommands(clientId, GUILD_ID), {
    body: [verifyCommand.toJSON()],
  });

  console.log('Slash commands registered.');
}

// Handle /verify command
async function handleVerify(interaction: ChatInputCommandInteraction) {
  const connectUrl = `${FLASHFLOW_URL}/api/integrations/discord/connect`;

  await interaction.reply({
    content: [
      'To link your Discord account to FlashFlow and get your plan roles:',
      '',
      `1. Make sure you're logged in to FlashFlow`,
      `2. Click this link: ${connectUrl}`,
      `3. Authorize the connection`,
      '',
      'Your roles will be synced automatically based on your FlashFlow plan.',
    ].join('\n'),
    ephemeral: true,
  });
}

// Main bot startup
async function main() {
  // Handle --register flag
  if (process.argv.includes('--register')) {
    await registerCommands();
    process.exit(0);
  }

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  });

  client.once('ready', () => {
    console.log(`Bot logged in as ${client.user?.tag}`);
  });

  // Slash command handler
  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'verify') {
      await handleVerify(interaction);
    }
  });

  // Welcome new members
  client.on('guildMemberAdd', async (member: GuildMember) => {
    try {
      await member.send(
        [
          `Welcome to the FlashFlow Discord server!`,
          '',
          `If you have a FlashFlow account, use the \`/verify\` command in the server to link your accounts and get your plan roles.`,
          '',
          `Don't have an account yet? Sign up at ${FLASHFLOW_URL}`,
        ].join('\n')
      );
    } catch {
      // DMs might be disabled — that's fine
      console.warn(`Could not DM welcome message to ${member.user.tag}`);
    }
  });

  await client.login(BOT_TOKEN);
}

main().catch(console.error);
