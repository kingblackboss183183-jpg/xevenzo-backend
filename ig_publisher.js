const fs = require('fs');
const path = require('path');

const GRAPH_API_VERSION = 'v21.0';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function publishInstagramReel({ igUserId, accessToken, videoUrl, caption }) {
    if (!igUserId || !accessToken || !videoUrl) {
        throw new Error("IG_USER_ID, IG_ACCESS_TOKEN, അല്ലെങ്കിൽ videoUrl ലഭ്യമല്ല.");
    }

    const createUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}/${igUserId}/media`;
    const createParams = new URLSearchParams({
        media_type: 'REELS',
        video_url: videoUrl,
        caption: caption || '',
        access_token: accessToken
    });

    const createRes = await fetch(createUrl, { method: 'POST', body: createParams });
    const createData = await createRes.json();
    if (!createRes.ok || !createData.id) {
        throw new Error(`Media container error: ${JSON.stringify(createData.error || createData)}`);
    }

    const containerId = createData.id;

    for (let i = 0; i < 12; i++) {
        await sleep(5000);
        const statusUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}/${containerId}?fields=status_code&access_token=${encodeURIComponent(accessToken)}`;
        const statusRes = await fetch(statusUrl);
        const statusData = await statusRes.json();
        if (statusData.status_code === 'FINISHED') break;
        if (statusData.status_code === 'ERROR') {
            throw new Error(`Reel processing failed: ${JSON.stringify(statusData)}`);
        }
    }

    const publishUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}/${igUserId}/media_publish`;
    const publishParams = new URLSearchParams({
        creation_id: containerId,
        access_token: accessToken
    });

    const publishRes = await fetch(publishUrl, { method: 'POST', body: publishParams });
    const publishData = await publishRes.json();
    if (!publishRes.ok || !publishData.id) {
        throw new Error(`Publish error: ${JSON.stringify(publishData.error || publishData)}`);
    }

    return { containerId, mediaId: publishData.id };
}

if (require.main === module) {
    console.log("✅ IG_PUBLISHER MODULE LOADED OK (Graph API v21.0 ready)");
}


async function publishInstagramStory({ igUserId, accessToken, videoUrl }) {
    if (!igUserId || !accessToken || !videoUrl) {
        throw new Error("IG_USER_ID, IG_ACCESS_TOKEN, അല്ലെങ്കിൽ videoUrl ലഭ്യമല്ല.");
    }

    const createUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}/${igUserId}/media`;
    const createParams = new URLSearchParams({
        media_type: 'STORIES',
        video_url: videoUrl,
        access_token: accessToken
    });

    const createRes = await fetch(createUrl, { method: 'POST', body: createParams });
    const createData = await createRes.json();
    if (!createRes.ok || !createData.id) {
        throw new Error(`Story container error: ${JSON.stringify(createData.error || createData)}`);
    }

    const containerId = createData.id;

    for (let i = 0; i < 12; i++) {
        await sleep(5000);
        const statusUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}/${containerId}?fields=status_code&access_token=${encodeURIComponent(accessToken)}`;
        const statusRes = await fetch(statusUrl);
        const statusData = await statusRes.json();
        if (statusData.status_code === 'FINISHED') break;
        if (statusData.status_code === 'ERROR') {
            throw new Error(`Story processing failed: ${JSON.stringify(statusData)}`);
        }
    }

    const publishUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}/${igUserId}/media_publish`;
    const publishParams = new URLSearchParams({
        creation_id: containerId,
        access_token: accessToken
    });

    const publishRes = await fetch(publishUrl, { method: 'POST', body: publishParams });
    const publishData = await publishRes.json();
    if (!publishRes.ok || !publishData.id) {
        throw new Error(`Story publish error: ${JSON.stringify(publishData.error || publishData)}`);
    }

    return { containerId, mediaId: publishData.id };
}

module.exports = { publishInstagramReel, publishInstagramStory };
