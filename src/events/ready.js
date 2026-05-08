const { Events } = require('discord.js');

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        console.log(`\n🎵 Nyra is online as ${client.user.tag}`);
        console.log(`📊 Serving ${client.guilds.cache.size} guild(s)\n`);

        // Initialize Lavalink-Client Manager
        try {
            await client.lavalink.init(client.user);
            console.log(`🔗 Lavalink Manager initialized.`);
        } catch (error) {
            console.error(`❌ Failed to initialize Lavalink Manager:`, error);
        }
    },
};