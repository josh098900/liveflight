// server.js - Full Code

const express = require('express');
const fetch = require('node-fetch');
const { URLSearchParams } = require('url');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const OPENSKY_CLIENT_ID = process.env.OPENSKY_USER;
const OPENSKY_CLIENT_SECRET = process.env.OPENSKY_SECRET;
let accessToken = null;

app.use(express.static(__dirname));

// --- HELPER FUNCTIONS ---
const getNewAccessToken = async () => {
    console.log('[SERVER] Attempting to get a new access token...');
    const tokenUrl = 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', OPENSKY_CLIENT_ID);
    params.append('client_secret', OPENSKY_CLIENT_SECRET);
    try {
        const response = await fetch(tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params });
        const tokenData = await response.json();
        if (!response.ok) throw new Error(`Failed to get access token. Status: ${response.status}. Body: ${JSON.stringify(tokenData)}`);
        console.log('[SERVER] Successfully received new access token!');
        accessToken = tokenData.access_token;
    } catch (error) {
        console.error("[SERVER] CRITICAL: Could not get access token.", error);
        accessToken = null;
    }
};

const ensureValidToken = async (req, res, next) => {
    if (!accessToken) {
        console.log('[SERVER] No access token found. Fetching a new one...');
        await getNewAccessToken();
    }
    if (!accessToken) {
        return res.status(503).json({ error: 'Could not authenticate with OpenSky API.' });
    }
    next();
};

// --- API ENDPOINTS ---

app.get('/api/flights', ensureValidToken, async (req, res) => {
    console.log('[SERVER] Fetching all flight data...');
    const statesUrl = 'https://opensky-network.org/api/states/all';
    try {
        const flightResponse = await fetch(statesUrl, { headers: { 'Authorization': `Bearer ${accessToken}` } });
        if (!flightResponse.ok) {
             if (flightResponse.status === 401) { // If token expired, get a new one and retry
                await getNewAccessToken();
                const retryResponse = await fetch(statesUrl, { headers: { 'Authorization': `Bearer ${accessToken}` } });
                if (!retryResponse.ok) throw new Error(`Still failed after retry. Status: ${retryResponse.status}`);
                res.json(await retryResponse.json());
                return;
            }
            throw new Error(`OpenSky API responded with status: ${flightResponse.status}`);
        }
        res.json(await flightResponse.json());
    } catch (error) {
        console.error("[SERVER] Error fetching all flights data:", error);
        res.status(500).json({ error: 'Failed to fetch flight data.' });
    }
});

app.get('/api/flight_route', ensureValidToken, async (req, res) => {
    const icao = req.query.icao;
    if (!icao) return res.status(400).json({ error: 'ICAO24 identifier is required' });
    console.log(`[SERVER] Fetching route for: ${icao}`);
    const now = Math.floor(Date.now() / 1000);
    const twelveHoursAgo = now - 43200;
    const routeUrl = `https://opensky-network.org/api/flights/aircraft?icao24=${icao}&begin=${twelveHoursAgo}&end=${now}`;
    try {
        const routeResponse = await fetch(routeUrl, { headers: { 'Authorization': `Bearer ${accessToken}` } });
        if (!routeResponse.ok) throw new Error(`OpenSky route API responded with status: ${routeResponse.status}`);
        const routeDataArray = await routeResponse.json();
        res.json(routeDataArray.length > 0 ? routeDataArray[routeDataArray.length - 1] : null);
    } catch (error) {
        console.error("[SERVER] Error fetching flight route:", error);
        res.status(500).json({ error: 'Failed to fetch flight route.' });
    }
});

app.get('/api/aircraft_meta', ensureValidToken, async (req, res) => {
    const icao = req.query.icao;
    if (!icao) return res.status(400).json({ error: 'ICAO24 identifier is required' });
    console.log(`[SERVER] Fetching metadata for: ${icao}`);
    const metaUrl = `https://opensky-network.org/api/metadata/aircraft/icao/${icao}`;
    try {
        const metaResponse = await fetch(metaUrl, { headers: { 'Authorization': `Bearer ${accessToken}` } });
        if (!metaResponse.ok) {
            if (metaResponse.status === 404) return res.json({ message: "No metadata available." });
            throw new Error(`OpenSky metadata API responded with status: ${metaResponse.status}`);
        }
        res.json(await metaResponse.json());
    } catch (error) {
        console.error("[SERVER] Error fetching aircraft metadata:", error);
        res.status(500).json({ error: 'Failed to fetch aircraft metadata.' });
    }
});

// --- START THE SERVER ---
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});