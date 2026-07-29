const loginBox = document.getElementById('loginBox');
const adminBox = document.getElementById('adminBox');
const statusEl = document.getElementById('status');

function showStatus(msg, ok) {
  statusEl.textContent = msg;
  statusEl.className = `status show ${ok ? 'ok' : 'err'}`;
}

async function checkAdminStatus() {
  const res = await fetch('/api/admin/status');
  const data = await res.json();
  if (data.isAdmin) {
    loginBox.style.display = 'none';
    adminBox.style.display = 'block';
    loadList();
    checkCharacterStatus();
  }
}

document.getElementById('loginBtn').addEventListener('click', async () => {
  const password = document.getElementById('password').value;
  const res = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password })
  });
  if (res.ok) {
    loginBox.style.display = 'none';
    adminBox.style.display = 'block';
    loadList();
    checkCharacterStatus();
  } else {
    alert('Wrong password');
  }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await fetch('/api/admin/logout', { method: 'POST' });
  window.location.reload();
});

// --- Connected character ---

async function checkCharacterStatus() {
  const res = await fetch('/auth/me');
  const data = await res.json();
  if (data.connected) {
    document.getElementById('notConnected').style.display = 'none';
    document.getElementById('connected').style.display = 'block';
    document.getElementById('charName').textContent = data.name;
    document.getElementById('allianceNote').textContent = data.allianceId
      ? ''
      : '(not in an alliance - diff step needs an alliance member)';
  } else {
    document.getElementById('notConnected').style.display = 'block';
    document.getElementById('connected').style.display = 'none';
  }
}

document.getElementById('disconnectBtn').addEventListener('click', async () => {
  await fetch('/auth/logout', { method: 'POST' });
  checkCharacterStatus();
});

// --- Import ---

async function runImport(mode) {
  showStatus(`Importing (${mode})...`, true);
  try {
    const res = await fetch('/api/admin/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Import failed');
    showStatus(`Imported ${data.imported} contacts (${mode}).`, true);
    loadList();
  } catch (err) {
    showStatus(err.message, false);
  }
}

document.getElementById('importOverwriteBtn').addEventListener('click', () => {
  if (confirm('This replaces the entire master list with this character\'s contacts. Continue?')) {
    runImport('overwrite');
  }
});
document.getElementById('importMergeBtn').addEventListener('click', () => runImport('merge'));

// --- Master list ---

async function loadList() {
  const res = await fetch('/api/admin/list');
  const list = await res.json();
  const body = document.getElementById('listBody');
  body.innerHTML = '';
  list
    .sort((a, b) => b.standing - a.standing)
    .forEach(entry => {
      const tr = document.createElement('tr');
      const standingClass = entry.standing > 0 ? 'pos' : entry.standing < 0 ? 'neg' : '';
      tr.innerHTML = `
        <td>${entry.name || entry.id}</td>
        <td>${entry.type}</td>
        <td class="${standingClass}">${entry.standing}</td>
        <td><button class="btn btn-negative" style="padding:4px 10px;">Remove</button></td>
      `;
      tr.querySelector('button').addEventListener('click', () => removeEntry(entry.id));
      body.appendChild(tr);
    });
}

async function removeEntry(id) {
  await fetch(`/api/admin/list/${id}`, { method: 'DELETE' });
  loadList();
}

document.getElementById('bulkAddBtn').addEventListener('click', async () => {
  const raw = document.getElementById('bulkNames').value;
  const names = raw.split('\n').map(n => n.trim()).filter(Boolean);
  if (names.length === 0) return showStatus('Paste at least one name first', false);
  const standing = document.getElementById('bulkStanding').value;

  showStatus(`Resolving ${names.length} name(s)...`, true);
  try {
    const res = await fetch('/api/admin/list/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ names, standing })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');

    let msg = `Added ${data.added} at ${standing}.`;
    if (data.unmatched.length > 0) msg += ` Could not match: ${data.unmatched.join(', ')}`;
    showStatus(msg, data.unmatched.length === 0);
    document.getElementById('bulkNames').value = '';
    loadList();
  } catch (err) {
    showStatus(err.message, false);
  }
});

document.getElementById('searchBtn').addEventListener('click', async () => {
  const name = document.getElementById('searchName').value.trim();
  if (!name) return;
  const typeFilter = document.getElementById('searchType').value;
  const res = await fetch('/api/admin/resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ names: [name] })
  });
  let results = await res.json();
  if (typeFilter !== 'any') results = results.filter(r => r.type === typeFilter);

  const container = document.getElementById('searchResults');
  container.innerHTML = '';
  if (!results.length) {
    container.textContent = typeFilter === 'any' ? 'No matches found.' : `No ${typeFilter} matches found for that name.`;
    return;
  }
  results.forEach(r => {
    const row = document.createElement('div');
    row.className = 'row-flex';
    row.innerHTML = `
      <span style="flex:1;padding-top:8px;">${r.name} <span style="color:var(--muted)">(${r.type})</span></span>
      <select class="standingInput" style="width:130px;">
        <option value="10">+10</option>
        <option value="5">+5</option>
        <option value="0">Neutral (0)</option>
        <option value="-5">-5</option>
        <option value="-10" selected>-10</option>
      </select>
      <button class="btn btn-accent">Add</button>
    `;
    row.querySelector('button').addEventListener('click', async () => {
      const standing = row.querySelector('.standingInput').value;
      await fetch('/api/admin/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: r.id, name: r.name, type: r.type, standing })
      });
      showStatus(`Added ${r.name} at ${standing}`, true);
      container.innerHTML = '';
      document.getElementById('searchName').value = '';
      loadList();
    });
    container.appendChild(row);
  });
});

// --- Diff ---

function renderDiffGroup(title, cssClass, items, kind) {
  if (items.length === 0) return '';
  const rows = items.map(item => {
    if (kind === 'change') {
      return `<tr><td>${item.name}</td><td>${item.type}</td><td>${item.from} &rarr; <b>${item.to}</b></td></tr>`;
    }
    return `<tr><td>${item.name}</td><td>${item.type}</td><td>${item.standing}</td></tr>`;
  }).join('');
  return `
    <div class="diff-section">
      <h3 class="${cssClass}">${title} (${items.length})</h3>
      <table><thead><tr><th>Name</th><th>Type</th><th>Standing</th></tr></thead><tbody>${rows}</tbody></table>
    </div>
  `;
}

function buildChecklistText(diff) {
  const lines = [];
  if (diff.toAdd.length) {
    lines.push('ADD:');
    diff.toAdd.forEach(i => lines.push(`  [ ] ${i.name} (${i.type}) -> ${i.standing}`));
  }
  if (diff.toChange.length) {
    lines.push('', 'CHANGE:');
    diff.toChange.forEach(i => lines.push(`  [ ] ${i.name} (${i.type}): ${i.from} -> ${i.to}`));
  }
  if (diff.toRemove.length) {
    lines.push('', 'REMOVE:');
    diff.toRemove.forEach(i => lines.push(`  [ ] ${i.name} (${i.type}) currently ${i.standing}`));
  }
  return lines.join('\n');
}

document.getElementById('diffBtn').addEventListener('click', async () => {
  showStatus('Pulling current alliance contacts and comparing...', true);
  const container = document.getElementById('diffResults');
  container.innerHTML = '';
  try {
    const res = await fetch('/api/admin/diff');
    const diff = await res.json();
    if (!res.ok) throw new Error(diff.error || 'Failed to generate diff');

    const total = diff.toAdd.length + diff.toChange.length + diff.toRemove.length;
    if (total === 0) {
      showStatus('Alliance contacts already match the master list.', true);
      return;
    }
    showStatus(`Checklist ready - ${total} change(s) to apply manually.`, true);

    container.innerHTML =
      renderDiffGroup('Add', 'add', diff.toAdd, 'add') +
      renderDiffGroup('Change', 'change', diff.toChange, 'change') +
      renderDiffGroup('Remove', 'remove', diff.toRemove, 'remove') +
      `<h2>Plain-text checklist</h2><pre class="checklist" id="checklistText">${buildChecklistText(diff)}</pre>
       <button class="btn" id="copyChecklistBtn" style="margin-top:8px;">Copy to clipboard</button>`;

    document.getElementById('copyChecklistBtn').addEventListener('click', () => {
      navigator.clipboard.writeText(buildChecklistText(diff));
      showStatus('Checklist copied to clipboard.', true);
    });
  } catch (err) {
    showStatus(err.message, false);
  }
});

checkAdminStatus();
