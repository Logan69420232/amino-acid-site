(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DiaryPanels = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  // Display preferences belong to this browser, not to food logs or cloud sync.
  const storageKey = 'aa_diary_sections_v1';
  function create(storage) {
    const states = Object.create(null);
    try {
      const saved = JSON.parse(storage.getItem(storageKey));
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
        for (const [key, value] of Object.entries(saved)) if (typeof value === 'boolean') states[key] = value;
      }
    } catch (_) { /* Keep working when storage is blocked or damaged. */ }
    function remember(panel) {
      const key = panel.dataset.diarySection;
      if (!key || states[key] === panel.open) return;
      states[key] = panel.open;
      try { storage.setItem(storageKey, JSON.stringify(states)); } catch (_) {}
    }
    return {
      capture(root) { root.querySelectorAll('details[data-diary-section]').forEach(remember); },
      bind(root) {
        root.querySelectorAll('details[data-diary-section]').forEach(panel => {
          const key = panel.dataset.diarySection;
          if (typeof states[key] === 'boolean') panel.open = states[key];
          panel.addEventListener('toggle', () => {
            // Ignore delayed toggle events from markup replaced by a diary render.
            if (panel.isConnected) remember(panel);
          });
        });
      }
    };
  }
  return { create };
});
