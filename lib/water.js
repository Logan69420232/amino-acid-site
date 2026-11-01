(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.Water=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  function amount(value,unit='ml') {
    if(!['ml','l'].includes(unit)||String(value).trim()==='')return null;
    const ml=Number(value)*(unit==='l'?1000:1);
    return Number.isFinite(ml)&&ml>=1&&ml<=10000?Math.round(ml):null;
  }
  function entries(day){return (Array.isArray(day?.water)?day.water:[]).filter(e=>e&&typeof e.id==='string'&&Number.isFinite(e.ml)&&e.ml>0);}
  function total(day){return entries(day).reduce((sum,e)=>sum+e.ml,0);}
  function label(ml){return ml>=1000?Number((ml/1000).toFixed(3)).toLocaleString()+' L':ml.toLocaleString()+' ml';}
  function add(day,ml,id,time){if(amount(ml)!==ml)throw new Error('Invalid water amount');return {...day,water:[...entries(day),{id,ml,time}]};}
  function remove(day,id){return {...day,water:entries(day).filter(e=>e.id!==id)};}
  return {amount,entries,total,label,add,remove};
});
