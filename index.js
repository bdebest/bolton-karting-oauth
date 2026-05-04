// index.js
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Temporary storage (we'll improve this later)
const pendingVerifications = new Map();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// === STEP 1: User clicks this link to start verification ===
app.get('/auth/roblox', (req, res) => {
  try {
    const { discordId } = req.query;
    if (!discordId) {
      return res.status(400).send('Missing discordId parameter.');
    }

    const state = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes

    pendingVerifications.set(state, { discordId, expiresAt });

    const authUrl = `https://apis.roblox.com/oauth/v1/authorize?` +
      `client_id=${process.env.ROBLOX_CLIENT_ID}` +
      `&response_type=code` +
      `&redirect_uri=${encodeURIComponent(process.env.REDIRECT_URI)}` +
      `&scope=openid profile` +
      `&state=${state}`;

    res.redirect(authUrl);
  } catch (error) {
    console.error(error);
    res.status(500).send('Server error');
  }
});

// === STEP 2: Roblox sends user back here after login ===
app.get('/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;

    if (error) return res.send('Roblox returned an error: ' + error);

    const pending = pendingVerifications.get(state);
    if (!pending || Date.now() > pending.expiresAt) {
      return res.status(400).send('Link expired. Please try verifying again.');
    }

    // Exchange code for token
    const tokenResponse = await axios.post('https://apis.roblox.com/oauth/v1/token', {
      client_id: process.env.ROBLOX_CLIENT_ID,
      client_secret: process.env.ROBLOX_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: process.env.REDIRECT_URI,
    }, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    const { access_token } = tokenResponse.data;

    // Get Roblox user info
    const userResponse = await axios.get('https://apis.roblox.com/oauth/v1/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` }
    });

    const robloxUser = userResponse.data;

    console.log(`✅ Success! Discord: ${pending.discordId} | Roblox: ${robloxUser.name}`);

    pendingVerifications.delete(state);

    res.send(`
      <h1 style="color:green">✅ Verification Successful!</h1>
      <p>You can now close this window and return to Discord.</p>
      <script>setTimeout(() => window.close(), 3000);</script>
    `);

  } catch (error) {
    console.error(error);
    res.status(500).send('Something went wrong during verification.');
  }
});

// Health check
app.get('/health', (req, res) => res.send('✅ OAuth Server is Running'));

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});