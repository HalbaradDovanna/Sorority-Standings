const axios = require('axios');
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

const ESI_BASE = 'https://esi.evetech.net';
const SSO_BASE = 'https://login.eveonline.com';
const SCOPES = [
  'esi-characters.read_contacts.v1',
  'esi-alliances.read_contacts.v1'
];

const jwks = jwksClient({
  jwksUri: `${SSO_BASE}/oauth/jwks`,
  cache: true,
  cacheMaxAge: 24 * 60 * 60 * 1000
});

function getSigningKey(kid) {
  return new Promise((resolve, reject) => {
    jwks.getSigningKey(kid, (err, key) => {
      if (err) return reject(err);
      resolve(key.getPublicKey());
    });
  });
}

function getAuthUrl(state) {
  const params = new URLSearchParams({
    response_type: 'code',
    redirect_uri: process.env.EVE_CALLBACK_URL,
    client_id: process.env.EVE_CLIENT_ID,
    scope: SCOPES.join(' '),
    state
  });
  return `${SSO_BASE}/v2/oauth/authorize/?${params.toString()}`;
}

async function exchangeCode(code) {
  const basicAuth = Buffer.from(
    `${process.env.EVE_CLIENT_ID}:${process.env.EVE_CLIENT_SECRET}`
  ).toString('base64');

  const res = await axios.post(
    `${SSO_BASE}/v2/oauth/token`,
    new URLSearchParams({ grant_type: 'authorization_code', code }).toString(),
    {
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    }
  );
  return res.data;
}

async function refreshAccessToken(refreshToken) {
  const basicAuth = Buffer.from(
    `${process.env.EVE_CLIENT_ID}:${process.env.EVE_CLIENT_SECRET}`
  ).toString('base64');

  const res = await axios.post(
    `${SSO_BASE}/v2/oauth/token`,
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    }).toString(),
    {
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    }
  );
  return res.data;
}

async function verifyAndDecode(accessToken) {
  const decodedHeader = jwt.decode(accessToken, { complete: true });
  if (!decodedHeader) throw new Error('Could not decode access token');
  const publicKey = await getSigningKey(decodedHeader.header.kid);
  const payload = jwt.verify(accessToken, publicKey, {
    algorithms: ['RS256'],
    issuer: ['login.eveonline.com', 'https://login.eveonline.com']
  });
  const characterId = parseInt(payload.sub.split(':')[2], 10);
  return {
    characterId,
    characterName: payload.name,
    scopes: payload.scp || []
  };
}

function authHeader(accessToken) {
  return { headers: { Authorization: `Bearer ${accessToken}` } };
}

// Public endpoint, no auth - used to find the character's current alliance_id
async function getCharacterPublicInfo(characterId) {
  const res = await axios.get(`${ESI_BASE}/characters/${characterId}/`);
  return res.data; // includes alliance_id if the character is in one
}

async function getCharacterContacts(characterId, accessToken) {
  let page = 1;
  let all = [];
  while (true) {
    const res = await axios.get(
      `${ESI_BASE}/v2/characters/${characterId}/contacts/?page=${page}`,
      authHeader(accessToken)
    );
    all = all.concat(res.data);
    const pages = parseInt(res.headers['x-pages'] || '1', 10);
    if (page >= pages) break;
    page += 1;
  }
  return all; // [{contact_id, contact_type, standing, ...}]
}

// Read-only - ESI has no write endpoint for alliance contacts.
async function getAllianceContacts(allianceId, accessToken) {
  let page = 1;
  let all = [];
  while (true) {
    const res = await axios.get(
      `${ESI_BASE}/v2/alliances/${allianceId}/contacts/?page=${page}`,
      authHeader(accessToken)
    );
    all = all.concat(res.data);
    const pages = parseInt(res.headers['x-pages'] || '1', 10);
    if (page >= pages) break;
    page += 1;
  }
  return all;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Public endpoint - names -> ids/types (used for the paste-a-list / search-add features)
async function resolveNames(names) {
  const res = await axios.post(`${ESI_BASE}/universe/ids/`, names);
  const data = res.data;
  const out = [];
  (data.characters || []).forEach(c => out.push({ id: c.id, name: c.name, type: 'character' }));
  (data.corporations || []).forEach(c => out.push({ id: c.id, name: c.name, type: 'corporation' }));
  (data.alliances || []).forEach(c => out.push({ id: c.id, name: c.name, type: 'alliance' }));
  return out;
}

// Public endpoint - ids -> names (used to label imported contacts / alliance contacts,
// since those endpoints only return ids, not names)
async function resolveIds(ids) {
  const uniqueIds = [...new Set(ids)];
  const results = [];
  for (const batch of chunk(uniqueIds, 1000)) {
    if (batch.length === 0) continue;
    const res = await axios.post(`${ESI_BASE}/universe/names/`, batch);
    results.push(...res.data); // [{id, name, category}]
  }
  return new Map(results.map(r => [r.id, r]));
}

module.exports = {
  getAuthUrl,
  exchangeCode,
  refreshAccessToken,
  verifyAndDecode,
  getCharacterPublicInfo,
  getCharacterContacts,
  getAllianceContacts,
  resolveNames,
  resolveIds
};
