const configManager = require('../services/configManager');

/**
 * Automatically delete a message or interaction reply after a delay specified in the guild settings.
 * @param {import('discord.js').Message | import('discord.js').Interaction} target - The message or interaction to delete.
 * @param {string} guildId - The guild ID to fetch settings for.
 */
async function autoDelete(target, guildId) {
    if (!target || !guildId) return;

    try {
        const config = configManager.get(guildId);
        
        // delete_timer is in seconds, 0 means disabled
        if (config.delete_timer > 0) {
            setTimeout(async () => {
                try {
                    // If it's a message
                    if (target.delete && typeof target.delete === 'function' && target.deletable) {
                        await target.delete();
                    } 
                    // If it's an interaction
                    else if (target.deleteReply && typeof target.deleteReply === 'function') {
                        await target.deleteReply();
                    }
                } catch (e) {
                    // Message might already be deleted or is ephemeral
                }
            }, config.delete_timer * 1000);
        }
    } catch (error) {
        console.error('❌ autoDelete error:', error);
    }
}

module.exports = { autoDelete };
