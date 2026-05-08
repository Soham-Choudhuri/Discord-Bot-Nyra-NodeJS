const { Events } = require('discord.js');
const { db } = require('../database/schema');
const { extractVideoId } = require('../lavalink/playerEvents');

module.exports = {
    name: Events.MessageReactionRemove,
    once: false,
    async execute(reaction, user, client) {
        if (user.bot) return;
        if (reaction.emoji.name !== '❤️') return;
        if (reaction.message.author.id !== client.user.id) return;

        const player = client.lavalink.getPlayer(reaction.message.guildId);
        if (!player || !player.queue.current) return;

        const track = player.queue.current;
        const videoId = extractVideoId(track.info.uri);
        if (!videoId) return;

        try {
            // Silently delete the track from the database
            db.prepare('DELETE FROM user_favorites WHERE user_id = ? AND track_url = ?')
                .run(user.id, videoId);
        } catch (error) {
            console.error(`❌ DB Error (Reaction Remove):`, error.message);
        }
    },
};