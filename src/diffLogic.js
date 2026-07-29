// Both lists should already be normalized to { id, name, type, standing }.
// This never touches ESI itself - pure comparison, nothing retained after use.
function computeDiff(masterList, currentAllianceList) {
  const masterById = new Map(masterList.map(e => [e.id, e]));
  const currentById = new Map(currentAllianceList.map(e => [e.id, e]));

  const toAdd = [];
  const toChange = [];
  for (const entry of masterList) {
    const current = currentById.get(entry.id);
    if (!current) {
      toAdd.push(entry);
    } else if (current.standing !== entry.standing) {
      toChange.push({ ...entry, from: current.standing, to: entry.standing });
    }
  }

  const toRemove = [];
  for (const current of currentAllianceList) {
    if (!masterById.has(current.id)) {
      toRemove.push(current);
    }
  }

  const byStandingDesc = (a, b) => (b.standing ?? b.to) - (a.standing ?? a.to);
  toAdd.sort(byStandingDesc);
  toChange.sort(byStandingDesc);
  toRemove.sort(byStandingDesc);

  return { toAdd, toRemove, toChange };
}

module.exports = { computeDiff };
