const express = require('express');
const crypto = require('crypto');
const esi = require('../esiClient');
const { requireAdmin } = require('../middleware');

const router = express.Router();

// Gate the connect flow behind the admin password so random visitors can't
// use this app to hand over their own EVE token for no reason.
router.get('/login', requireAdmin, (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  req.session.oauthState = state;
  res.redirect(esi.getAuthUrl(state));
});

router.get('/callback', async (req, res) => {
  const { code, state } = req.query;

  if (!state || state !== req.session.oauthState) {
    return res.status(400).send('Invalid OAuth state. Please try connecting again.');
  }
  delete req.session.oauthState;

  try {
    const tokens = await esi.exchangeCode(code);
    const decoded = await esi.verifyAndDecode(tokens.access_token);
    const publicInfo = await esi.getCharacterPublicInfo(decoded.characterId);

    req.session.character = {
      id: decoded.characterId,
      name: decoded.characterName,
      allianceId: publicInfo.alliance_id || null,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + tokens.expires_in * 1000
    };

    res.redirect('/admin.html');
  } catch (err) {
    console.error('OAuth callback error:', err.response?.data || err.message);
    res.status(500).send('Connect failed. Please try again.');
  }
});

router.post('/logout', (req, res) => {
  req.session.character = null;
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  if (!req.session.character) return res.json({ connected: false });
  const { name, id, allianceId } = req.session.character;
  res.json({ connected: true, name, id, allianceId });
});

module.exports = router;
