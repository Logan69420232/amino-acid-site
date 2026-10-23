/* Diary days are complete snapshots, never additive sync operations. */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DiarySync = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  const copy = value => JSON.parse(JSON.stringify(value));
  function key(day) {
    if (!day) return null;
    return JSON.stringify([day.date, day.note || '', day.w ?? null, day.t ?? null,
      (day.entries || []).map(e => [e.name, Number(e.g), e.meal || 'other', e.unit || '', e.food || null]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))]);
  }
  function uniqueDays(days) {
    const byDate = new Map();
    for (const day of days || []) if (day && day.date) byDate.set(day.date, copy(day));
    return [...byDate.values()];
  }
  function merge(remote, local, base) {
    if (!remote || !Array.isArray(remote.days)) return {log:copy(local), conflicts:[]};
    const r=new Map(uniqueDays(remote.days).map(d=>[d.date,d]));
    const l=new Map(uniqueDays(local.days).map(d=>[d.date,d]));
    const b=new Map(uniqueDays(base?.days).map(d=>[d.date,d]));
    const days=[], conflicts=[];
    for (const date of new Set([...r.keys(),...l.keys(),...b.keys()])) {
      const rd=r.get(date),ld=l.get(date),bd=b.get(date);
      let chosen;
      if (key(rd)===key(ld)) chosen=rd;
      else if (base && key(ld)===key(bd)) chosen=rd;
      else if (base && key(rd)===key(bd)) chosen=ld;
      else if (!base && !rd) chosen=ld;
      else if (!base && !ld) chosen=rd;
      else { chosen=rd; conflicts.push({date,local:ld || null,remote:rd || null}); }
      if (chosen) days.push(chosen);
    }
    days.sort((a,b)=>a.date.localeCompare(b.date));
    const activeDate=local.days?.[local.active]?.date;
    return {log:{days,active:Math.max(0,days.findIndex(d=>d.date===activeDate))},conflicts};
  }
  return {key,uniqueDays,merge};
});
