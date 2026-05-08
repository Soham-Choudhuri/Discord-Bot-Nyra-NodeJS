const { REST, Routes, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');

/**
 * Dynamically loads all slash commands from src/commands/ and registers
 * them with Discord's REST API. Each command file must export:
 *   { data: SlashCommandBuilder, execute: async (interaction, client) => {} }
 */
async function loadCommands(client) {
    client.commands = new Collection();

    const commandsPath = path.join(__dirname, '..', 'commands');
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    const commandData = [];

    for (const file of commandFiles) {
        const command = require(path.join(commandsPath, file));

        if (!command.data || !command.execute) {
            console.warn(`⚠️  Command file ${file} is missing 'data' or 'execute'. Skipping.`);
            continue;
        }

        client.commands.set(command.data.name, command);
        commandData.push(command.data.toJSON());
    }

    // Register commands with Discord REST API
    const rest = new REST().setToken(process.env.DISCORD_TOKEN);

    try {
        console.log(`🔄 Syncing ${commandData.length} slash commands with Discord...`);

        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commandData }
        );

        console.log(`✅ Successfully synced ${commandData.length} slash commands.`);
    } catch (error) {
        console.error('❌ Failed to register slash commands:', error);
    }
}

module.exports = { loadCommands };
