const YTMusic = require('ytmusic-api');
const yt = new YTMusic();

async function test() {
    await yt.initialize();
    try {
        const res = await yt.constructRequest('next', {
            videoId: 'dQw4w9WgXcQ',
            playlistId: 'RDAMVMdQw4w9WgXcQ',
            isAudioOnly: true
        });
        
        const tabs = res?.contents?.singleColumnMusicWatchNextResultsRenderer?.tabbedRenderer?.watchNextTabbedResultsRenderer?.tabs[0]?.tabRenderer?.content?.musicQueueRenderer?.content?.playlistPanelRenderer?.contents;
        
        if (tabs && tabs.length > 1) {
            const item = tabs[1].playlistPanelVideoRenderer;
            const videoType = item?.navigationEndpoint?.watchEndpoint?.watchEndpointMusicSupportedConfigs?.watchEndpointMusicConfig?.musicVideoType;
            console.log('Success! Video Type:', videoType);
        } else {
            console.log('Could not parse tabs');
        }
    } catch(e) {
        console.error('Failed:', e.message);
    }
}
test();
