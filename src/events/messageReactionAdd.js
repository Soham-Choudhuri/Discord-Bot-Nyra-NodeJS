const { Events } = require('discord.js');
const { db } = require('../database/schema');
const { extractVideoId } = require('../lavalink/playerEvents');

module.exports = {
    name: Events.MessageReactionAdd,
    once: false,
    async execute(reaction, user, client) {
        // Ignore bot reactions and ensure it's the correct emoji
        if (user.bot) return;
        if (reaction.emoji.name !== '❤️') return;

        // Ensure the reaction is on a message sent by the bot
        if (reaction.message.author.id !== client.user.id) return;

        // Fetch the player to get the currently playing track
        const player = client.lavalink.getPlayer(reaction.message.guildId);
        if (!player || !player.queue.current) return;

        const track = player.queue.current;
        const videoId = extractVideoId(track.info.uri);
        if (!videoId) return;

        try {
            // Silently insert the track into the database if it doesn't exist
            const exists = db.prepare('SELECT 1 FROM user_favorites WHERE user_id = ? AND track_url = ?').get(user.id, videoId);

            if (!exists) {
                db.prepare('INSERT INTO user_favorites (user_id, track_url, track_title, track_author) VALUES (?, ?, ?, ?)')
                    .run(user.id, videoId, track.info.title, track.info.author || 'Unknown');
            }
        } catch (error) {
            console.error(`❌ DB Error (Reaction Add):`, error.message);
        }
    },
};