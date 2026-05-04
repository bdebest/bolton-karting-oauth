// index.js
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// In-memory store for pending verifications
const pendingVerifications = new Map();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ====================== START VERIFICATION ======================
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

// ====================== CALLBACK - IMPROVED SUCCESS PAGE ======================
app.get('/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      return res.send(`
        <h1 style="color:red">❌ OAuth Error</h1>
        <p>${error}</p>
        <p>Please try again.</p>
      `);
    }

    const pending = pendingVerifications.get(state);
    if (!pending || Date.now() > pending.expiresAt) {
      return res.status(400).send('This link has expired. Please try verifying again.');
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

    console.log(`✅ Verified: Discord ${pending.discordId} → Roblox ${robloxUser.name} (${robloxUser.sub})`);

    pendingVerifications.delete(state);

    // Beautiful Success Page with Logo
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Bolton Karting - Verification Successful</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap');
          
          body {
            margin: 0;
            padding: 0;
            font-family: 'Roboto', sans-serif;
            background: linear-gradient(135deg, #1a1a1a, #2c2c2c);
            color: white;
            text-align: center;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .container {
            max-width: 600px;
            padding: 40px 20px;
          }
          .logo {
            width: 280px;
            margin-bottom: 30px;
          }
          h1 {
            color: #e63939;
            font-size: 2.8rem;
            margin-bottom: 10px;
          }
          .success {
            color: #4ade80;
            font-size: 1.4rem;
            margin: 20px 0;
          }
          p {
            font-size: 1.1rem;
            line-height: 1.6;
            opacity: 0.9;
          }
          .close-btn {
            margin-top: 40px;
            padding: 14px 32px;
            font-size: 1.1rem;
            background: #e63939;
            color: white;
            border: none;
            border-radius: 50px;
            cursor: pointer;
            transition: all 0.3s;
          }
          .close-btn:hover {
            background: #c1121f;
            transform: scale(1.05);
          }
        </style>
      </head>
      <body>
        <div class="container">
          <img src="https://files.catbox.moe/wkfiwn.png" alt="Bolton Karting Logo" class="logo">
          
          <h1>✅ Verification Successful!</h1>
          <div class="success">Welcome to Bolton Karting, ${robloxUser.name}!</div>
          
          <p>Your Discord and Roblox accounts have been successfully linked.</p>
          <p>You can now close this window and return to Discord.</p>
          
          <button class="close-btn" onclick="window.close()">Close Window</button>
        </div>

        <script>
          // Auto close after 6 seconds
          setTimeout(() => {
            window.close();
          }, 6000);
        </script>
      </body>
      </html>
    `);

  } catch (error) {
    console.error('Callback Error:', error.response?.data || error.message);
    res.status(500).send('Something went wrong during verification. Please try again.');
  }
});

// Health check
app.get('/health', (req, res) => res.send('✅ OAuth Server is Running'));

app.listen(PORT, () => {
  console.log(`🚀 Roblox OAuth Server running on port ${PORT}`);
  console.log(`Callback URL: ${process.env.REDIRECT_URI}`);
});