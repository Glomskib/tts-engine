import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import { handleInteraction } from './events/interactionCreate.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', (c) => {
  console.log(`Editor Request Bot online as ${c.user.tag}`);
});

client.on('interactionCreate', handleInteraction);

client.login(process.env.DISCORD_BOT_TOKEN);
