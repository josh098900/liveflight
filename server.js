// server.js - Simplified and Verified Structure

const express = require('express');
const fetch = require('node-fetch');
const { URLSearchParams } = require('url');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const OPENSKY_CLIENT_ID = process.env.OPENSKY_USER;
const OPENSKY_CLIENT_SECRET = process.env.OPENSKY_SECRET;
let accessToken = null;

// This serves all our frontend files
app.use(express.static(__dirname));

// --- HELPER FUNCTION ---
async function getNewAccessToken() {
    console.log('[SERVER] Attempting to get a new access token...');
    const tokenUrl = 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', OPENSKY_CLIENT_ID);
    params.append('client_secret', OPENSKY_CLIENT_SECRET);
    try {
        const response = await fetch(tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params });
        const tokenData = await response.json();
        if (!response.ok) throw new Error(`Token API failed with status ${response.status}: ${JSON.stringify(tokenData)}`);
        console.log('[SERVER] Successfully received new access token!');
        accessToken = tokenData.access_token;
    } catch (error) {
        console.error("[SERVER] CRITICAL: Could not get access token.", error);
        accessToken = null;
    }
};

// --- MIDDLEWARE to ensure token exists before API calls ---
async function ensureValidToken(req, res, next) {
    if (!accessToken) {
        console.log('[SERVER] Middleware: No token found. Fetching new one.');
        await getNewAccessToken();
    }
    if (!accessToken) {
        return res.status(503).json({ error: 'Could not authenticate with OpenSky API.' });
    }
    next();
};

// --- API ENDPOINTS ---
app.get('/api/flights', ensureValidToken, async (req, res) => {
    console.log('[SERVER] Request for /api/flights');
    const statesUrl = 'https://opensky-network.org/api/states/all';
    try {
        const flightResponse = await fetch(statesUrl, { headers: { 'Authorization': `Bearer ${accessToken}` } });
        if (!flightResponse.ok) throw new Error(`OpenSky states API failed with status: ${flightResponse.status}`);
        res.json(await flightResponse.json());
    } catch (error) {
        console.error("[SERVER] Error in /api/flights:", error);
        res.status(500).json({ error: 'Failed to fetch flight data.' });
    }
});

app.get('/api/flight_route', ensureValidToken, async (req, res) => {
    const icao = req.query.icao;
    if (!icao) return res.status(400).json({ error: 'ICAO24 is required' });
    console.log(`[SERVER] Request for /api/flight_route for ${icao}`);
    const now = Math.floor(Date.now() / 1000);
    const twelveHoursAgo = now - 43200;
    const routeUrl = `https://opensky-network.org/api/flights/aircraft?icao24=${icao}&begin=${twelveHoursAgo}&end=${now}`;
    try {
        const routeResponse = await fetch(routeUrl, { headers: { 'Authorization': `Bearer ${accessToken}` } });
        if (!routeResponse.ok) throw new Error(`OpenSky route API failed with status: ${routeResponse.status}`);
        const routeDataArray = await routeResponse.json();
        res.json(routeDataArray.length > 0 ? routeDataArray[routeDataArray.length - 1] : null);
    } catch (error) {
        console.error("[SERVER] Error in /api/flight_route:", error);
        res.status(500).json({ error: 'Failed to fetch flight route.' });
    }
});

app.get('/api/aircraft_meta', ensureValidToken, async (req, res) => {
    const icao = req.query.icao;
    if (!icao) return res.status(400).json({ error: 'ICAO24 is required' });
    console.log(`[SERVER] Request for /api/aircraft_meta for ${icao}`);
    const metaUrl = `https://opensky-network.org/api/metadata/aircraft/icao/${icao}`;
    try {
        const metaResponse = await fetch(metaUrl, { headers: { 'Authorization': `Bearer ${accessToken}` } });
        if (metaResponse.status === 404) return res.json({ message: "No metadata available." });
        if (!metaResponse.ok) throw new Error(`OpenSky metadata API failed with status: ${metaResponse.status}`);
        res.json(await metaResponse.json());
    } catch (error) {
        console.error("[SERVER] Error in /api/aircraft_meta:", error);
        res.status(500).json({ error: 'Failed to fetch aircraft metadata.' });
    }
});

// --- START THE SERVER ---
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});