const ytmusic = require('./ytmusic');

class AutoplayManager {
    /**
     * @param {string} guildId
     * @param {string} mode 'dynamic' or 'static'
     * @param {string} initialVideoId
     */
    constructor(guildId, mode = 'static', initialVideoId = null) {
        this.guildId = guildId;
        this.mode = mode; 
        this.seedVideoId = initialVideoId;
        
        // Infinite Memory
        this.playedIds = new Set();
        if (initialVideoId) this.playedIds.add(initialVideoId);
        
        this.buffer = [];
        this.isFetching = false;
        this.retryCount = 0;
    }
    
    /**
     * Record a track that was played into infinite memory
     * and naturally advance the seed if in dynamic mode.
     */
    addHistory(videoId) {
        if (!videoId) return;
        this.playedIds.add(videoId);
        if (this.mode === 'dynamic') {
            this.seedVideoId = videoId;
        }
    }
    
    /**
     * Get the next recommended track metadata.
     * @param {object} config - Guild configuration
     * @param {string[]} artistHistory - Recent artist names
     */
    async getNextTrack(config, artistHistory = []) {
        if (!this.seedVideoId) return null;

        // If buffer is empty, we MUST wait for the fill
        if (this.buffer.length === 0) {
            await this.fillBuffer(config, artistHistory);
        }
        
        return this.buffer.shift() || null;
    }
    
    /**
     * Fetches recommendations and applies dynamic filtering.
     */
    async fillBuffer(config, artistHistory = []) {
        if (this.isFetching || !this.seedVideoId) return;
        this.isFetching = true;
        
        try {
            // Compile the dynamic regex from config
            let regex;
            try {
                regex = new RegExp(config.regex_blacklist, 'i');
            } catch (e) {
                // Fallback if regex is broken (shouldn't happen with modal validation)
                regex = /\b(slowed|reverb|nightcore|remix)\b/i;
            }

            while (this.retryCount < 3) {
                try {
                    // Fetch recommendations
                    const tracks = await ytmusic.getAdvancedUpNexts(this.seedVideoId);
                    
                    // Filter with Advanced Heuristics
                    const validTracks = tracks.filter(t => {
                        if (!t.videoId || this.playedIds.has(t.videoId)) return false;
                        
                        // 1. ATV isolation
                        if (t.videoType !== 'MUSIC_VIDEO_TYPE_ATV') return false;
                        
                        // 2. Regex Blacklist (Title & Artist)
                        const searchStr = `${t.title} ${t.artists}`;
                        if (regex.test(searchStr)) return false;

                        // 3. Artist History (Artist Shuffling)
                        if (artistHistory.includes(t.artists)) return false;
                        
                        return true;
                    });
                    
                    if (validTracks.length === 0) {
                        this.retryCount++;
                        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, this.retryCount)));
                        continue;
                    }
                    
                    // Smart Shuffling: Group by artist to prevent clusters
                    const artistMap = new Map();
                    for (const t of validTracks) {
                        if (!artistMap.has(t.artists)) artistMap.set(t.artists, []);
                        artistMap.get(t.artists).push(t);
                    }
                    
                    const shuffled = [];
                    while (artistMap.size > 0) {
                        for (const [artist, list] of artistMap.entries()) {
                            shuffled.push(list.shift());
                            if (list.length === 0) artistMap.delete(artist);
                        }
                    }
                    
                    this.buffer.push(...shuffled.slice(0, 25));
                    this.retryCount = 0;
                    break;
                } catch(e) {
                    console.error(`[AutoplayManager] Fetch error:`, e.message);
                    this.retryCount++;
                    await new Promise(r => setTimeout(r, 1000 * Math.pow(2, this.retryCount)));
                }
            }
        } finally {
            this.isFetching = false;
        }
    }
}

module.exports = AutoplayManager;
