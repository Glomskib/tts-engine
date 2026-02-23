import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import * as requestEditor from './commands/request-editor.js';

const token = process.env.DISCORD_BOT_TOKEN!;
const clientId = process.env.DISCORD_CLIENT_ID!;
const guildId = process.env.DISCORD_GUILD_ID!;

const commands = [requestEditor.data.toJSON()];

const rest = new REST().setToken(token);

console.log(`Deploying ${commands.length} command(s) to guild ${guildId}...`);

rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands })
  .then(() => console.log('Commands registered successfully.'))
  .catch(console.error);
