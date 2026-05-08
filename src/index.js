require('dotenv').config();

const { Client, GatewayIntentBits } = require('discord.js');
const { LavalinkManager } = require('lavalink-client');
const { loadCommands } = require('./handlers/commandHandler');
const { loadEvents } = require('./handlers/eventHandler');
const { registerLavalinkEvents } = require('./lavalink/lavalinkEvents');
const { registerPlayerEvents } = require('./lavalink/playerEvents');
const ytmusic = require('./services/ytmusic');
const { initSchema } = require('./database/schema');

// Initialize Database
initSchema();

// ─── Discord Client ───────────────────────────────────────────────
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessageReactions
    ],
});

require('./handlers/antiCrash')(client);

// ─── Lavalink-Client (NodeLink Manager) ───────────────────────────
client.lavalink = new LavalinkManager({
    nodes: [
        {
            authorization: process.env.LAVALINK_PASSWORD,
            host: process.env.LAVALINK_HOST,
            port: parseInt(process.env.LAVALINK_PORT) || 2333,
            secure: false,
            id: 'Nyra-Node'
        }
    ],
    // IMPORTANT: This tells lavalink-client how to send packets to Discord
    sendToShard: (guildId, payload) => {
        client.guilds.cache.get(guildId)?.shard?.send(payload);
    },
    client: {
        id: process.env.CLIENT_ID, // Make sure CLIENT_ID is in your .env
        username: "Nyra Brooks"
    },
    // We disable the built-in autoPlay because we are porting your custom ytmusic logic
    autoSkip: true,
    playerOptions: {
        defaultSearchPlatform: "ytmsearch",
        onDisconnect: {
            destroyPlayer: true // Cleans up memory if the bot is kicked from the channel
        },
        onEmptyQueue: {
            destroyPlayer: false, // We keep it alive briefly to let our custom Autoplay kick in
            autoPlayFunction: null
        }
    }
});

// Note: We removed `client.queue = new Map()` because lavalink-client 
// has a robust, built-in queue system (player.queue) that we will use instead.

// ─── Register Lavalink Node Events ───────────────────────────────
// We pass the new lavalink manager to your event registrar
registerLavalinkEvents(client.lavalink);
registerPlayerEvents(client);
client.on("raw", (d) => client.lavalink.sendRawData(d));

// ─── Initialize & Start ──────────────────────────────────────────
(async () => {
    try {
        // Initialize the YTMusic API session
        await ytmusic.initialize();

        // Load dynamic event listeners
        loadEvents(client);

        // Load and register slash commands
        await loadCommands(client);

        // Login to Discord
        await client.login(process.env.DISCORD_TOKEN);

    } catch (error) {
        console.error('❌ Fatal startup error:', error);
        process.exit(1);
    }
})();

// ─── Graceful Shutdown Protocols ──────────────────────────────
const shutdown = async (signal) => {
    console.log(`\n🛑 Received ${signal}. Initiating graceful shutdown...`);
    
    try {
        // 1. Destroy all active music players gracefully
        if (client.lavalink && client.lavalink.players) {
            for (const player of client.lavalink.players.values()) {
                await player.destroy("Bot host is restarting/shutting down.");
            }
            console.log('✅ All audio sessions terminated cleanly.');
        }

        // 2. Safely close the SQLite Database to prevent WAL corruption
        const { db } = require('./database/schema');
        if (db && db.open) {
            db.close();
            console.log('✅ Database connection closed securely.');
        }

        // 3. Disconnect from Discord
        client.destroy();
        console.log('✅ Disconnected from Discord. Goodbye!');
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
    }
};

// Listen for termination signals (Ctrl+C in terminal, or PM2 restart commands)
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));