const express = require('express');
const esi = require('../esiClient');
const store = require('../standingsStore');
const { computeDiff } = require('../diffLogic');
const { requireAdmin, requireCharacterLogin } = require('../middleware');

const router = express.Router();

router.post('/login', (req, res) => {
  const { password } = req.body;
  if (password && password === process.env.ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    return res.json({ ok: true });
  }
  res.status(401).json({ error: 'Wrong password' });
});

router.post('/logout', (req, res) => {
  req.session.isAdmin = false;
  res.json({ ok: true });
});

router.get('/status', (req, res) => {
  res.json({ isAdmin: !!req.session.isAdmin });
});

// --- Master list CRUD ---

router.get('/list', requireAdmin, (req, res) => {
  res.json(store.getList());
});

router.post('/list', requireAdmin, (req, res) => {
  const { id, name, type, standing } = req.body;
  if (!id || !type || standing === undefined) {
    return res.status(400).json({ error: 'id, type, and standing are required' });
  }
  const parsedStanding = Number(standing);
  if (isNaN(parsedStanding) || parsedStanding < -10 || parsedStanding > 10) {
    return res.status(400).json({ error: 'standing must be between -10 and 10' });
  }
  const list = store.addEntry({ id: Number(id), name, type, standing: parsedStanding });
  res.json(list);
});

router.delete('/list/:id', requireAdmin, (req, res) => {
  const list = store.removeEntry(Number(req.params.id));
  res.json(list);
});

// Paste-a-list bulk add: one standing value applied to many resolved names
router.post('/list/bulk', requireAdmin, async (req, res) => {
  const { names, standing } = req.body;
  if (!Array.isArray(names) || names.length === 0) {
    return res.status(400).json({ error: 'names must be a non-empty array' });
  }
  const parsedStanding = Number(standing);
  if (isNaN(parsedStanding) || parsedStanding < -10 || parsedStanding > 10) {
    return res.status(400).json({ error: 'standing must be between -10 and 10' });
  }

  try {
    const uniqueNames = [...new Set(names.map(n => n.trim()).filter(Boolean))];
    const resolvedGroups = [];
    for (let i = 0; i < uniqueNames.length; i += 500) {
      resolvedGroups.push(await esi.resolveNames(uniqueNames.slice(i, i + 500)));
    }
    const resolved = resolvedGroups.flat();
    const resolvedNamesLower = new Set(resolved.map(r => r.name.toLowerCase()));
    const unmatched = uniqueNames.filter(n => !resolvedNamesLower.has(n.toLowerCase()));

    const entries = resolved.map(r => ({ id: r.id, name: r.name, type: r.type, standing: parsedStanding }));
    const list = store.addEntries(entries);

    res.json({ list, added: entries.length, unmatched });
  } catch (err) {
    console.error('Bulk add error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Bulk add failed' });
  }
});

// Search a single name -> ids/types for the "add one at a time" UI
router.post('/resolve', requireAdmin, async (req, res) => {
  const { names } = req.body;
  if (!Array.isArray(names) || names.length === 0) {
    return res.status(400).json({ error: 'names must be a non-empty array' });
  }
  try {
    res.json(await esi.resolveNames(names));
  } catch (err) {
    console.error('Resolve error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Name resolution failed' });
  }
});

// --- Import from a connected character's personal contacts ---

router.post('/import', requireAdmin, requireCharacterLogin, async (req, res) => {
  const char = req.session.character;
  const mode = req.body.mode === 'merge' ? 'merge' : 'overwrite';

  try {
    const contacts = await esi.getCharacterContacts(char.id, char.accessToken);
    const idMap = await esi.resolveIds(contacts.map(c => c.contact_id));

    const entries = contacts.map(c => {
      const info = idMap.get(c.contact_id);
      return {
        id: c.contact_id,
        name: info ? info.name : String(c.contact_id),
        type: c.contact_type,
        standing: c.standing
      };
    });

    const list = mode === 'overwrite' ? store.replaceList(entries) : store.addEntries(entries);
    res.json({ ok: true, mode, imported: entries.length, list });
  } catch (err) {
    console.error('Import error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Import failed' });
  }
});

// --- Diff against current alliance contacts (read-only, nothing retained) ---

router.get('/diff', requireAdmin, requireCharacterLogin, async (req, res) => {
  const char = req.session.character;
  if (!char.allianceId) {
    return res.status(400).json({ error: 'Connected character is not in an alliance' });
  }

  try {
    const [masterList, allianceContacts] = await Promise.all([
      Promise.resolve(store.getList()),
      esi.getAllianceContacts(char.allianceId, char.accessToken)
    ]);

    const idMap = await esi.resolveIds(allianceContacts.map(c => c.contact_id));
    const normalizedCurrent = allianceContacts.map(c => {
      const info = idMap.get(c.contact_id);
      return {
        id: c.contact_id,
        name: info ? info.name : String(c.contact_id),
        type: c.contact_type,
        standing: c.standing
      };
    });

    const diff = computeDiff(masterList, normalizedCurrent);
    res.json(diff);
  } catch (err) {
    console.error('Diff error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to generate diff. Make sure the connected character has alliance contact read permissions.' });
  }
});

module.exports = router;
