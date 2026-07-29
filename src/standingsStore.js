const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || './data';
const FILE_PATH = path.join(DATA_DIR, 'standings-list.json');

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(FILE_PATH)) fs.writeFileSync(FILE_PATH, '[]', 'utf8');
}

// List shape: [{ id: 98765432, name: "Some Corp", type: "corporation", standing: -10 }, ...]
function getList() {
  ensureFile();
  const raw = fs.readFileSync(FILE_PATH, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

function saveList(list) {
  ensureFile();
  fs.writeFileSync(FILE_PATH, JSON.stringify(list, null, 2), 'utf8');
}

function addEntry(entry) {
  const list = getList().filter(e => e.id !== entry.id);
  list.push(entry);
  saveList(list);
  return list;
}

function removeEntry(id) {
  const list = getList().filter(e => e.id !== id);
  saveList(list);
  return list;
}

// entries: [{ id, name, type, standing }, ...] - upserts by id, single write
function addEntries(entries) {
  const list = getList();
  const byId = new Map(list.map(e => [e.id, e]));
  for (const entry of entries) byId.set(entry.id, entry);
  const merged = [...byId.values()];
  saveList(merged);
  return merged;
}

// Wholesale replace - used when importing a character's contacts as the new master list
function replaceList(entries) {
  saveList(entries);
  return entries;
}

module.exports = { getList, saveList, addEntry, addEntries, removeEntry, replaceList };
