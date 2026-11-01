/* Presentation helpers. These never change nutritional values or source records. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.DiaryUX=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 function identity(e){const f=e.food;return f?.supplement?JSON.stringify([f.name,f.serving_g,f.doseUnit,f.ingredients]):f?.barcode||f?.scanId||e.name;}
 function recent(days,lookup,supplements=false){const seen=new Set();return days.slice().sort((a,b)=>b.date.localeCompare(a.date)).flatMap(d=>d.entries.slice().reverse()).filter(e=>{const f=lookup(e.name,e);if(!f||!!f.supplement!==supplements)return false;const key=identity(e);if(seen.has(key))return false;seen.add(key);return true;});}
 function range(days,{period='7',month='',end,foodOnly=false,lookup=()=>null}={}){end=end||new Date().toISOString().slice(0,10);let start='0000-01-01',finish=end;
 if(period==='month'){start=month+'-01';const d=new Date(start+'T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+1);d.setUTCDate(0);finish=d.toISOString().slice(0,10);}
 else if(period!=='all'){const d=new Date(end+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-((+period||7)-1));start=d.toISOString().slice(0,10);}
 else finish='9999-12-31';
 const selected=days.map((d,i)=>({i,d:{...d,entries:foodOnly?d.entries.filter(e=>!lookup(e.name,e)?.supplement):d.entries.slice()}})).filter(x=>x.d.date>=start&&x.d.date<=finish);
 return {start,end:finish,days:selected};}
 return {identity,recent,range};
});
