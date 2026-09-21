(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.AccountStorage = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function create(backing) {
    let owner = null, revision = 0;
    const keyFor = key => "aa_scoped:" + (owner ? "user:" + encodeURIComponent(owner) : "guest") + ":" + key;
    return {
      get owner() { return owner; },
      get revision() { return revision; },
      setOwner(id) { owner = id || null; revision++; },
      getItem(key) { return backing.getItem(keyFor(key)); },
      setItem(key, value) { backing.setItem(keyFor(key), String(value)); revision++; },
      removeItem(key) { backing.removeItem(keyFor(key)); revision++; }
    };
  }
  return { create };
});
