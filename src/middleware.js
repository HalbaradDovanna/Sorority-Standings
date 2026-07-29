const esi = require('./esiClient');

async function requireCharacterLogin(req, res, next) {
  const char = req.session.character;
  if (!char) return res.status(401).json({ error: 'Connect an EVE character first' });

  if (Date.now() > char.expiresAt - 60000) {
    try {
      const tokens = await esi.refreshAccessToken(char.refreshToken);
      char.accessToken = tokens.access_token;
      char.refreshToken = tokens.refresh_token;
      char.expiresAt = Date.now() + tokens.expires_in * 1000;
    } catch (err) {
      console.error('Token refresh failed:', err.response?.data || err.message);
      req.session.character = null;
      return res.status(401).json({ error: 'Session expired, please reconnect' });
    }
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.isAdmin) return res.status(401).json({ error: 'Admin login required' });
  next();
}

module.exports = { requireCharacterLogin, requireAdmin };
