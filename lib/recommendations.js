/* Food suggestions use the same nutrient definitions as the diary. Missing
   amounts stay unknown; food-label references are not diagnoses of deficiency. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./nutrition'));
  else root.Recommendations=factory(root.Nutrition);
})(typeof globalThis!=='undefined'?globalThis:this,function(N){
  const number=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
  const definitions=N.definitions.filter(d=>['Vitamins','Minerals'].includes(d.group)&&N.dailyValues[d.key]&&!['sodium','chloride'].includes(d.key));
  function assess(entries,lookup,{proteinTarget,aminoTargets=[],epaDhaGoalMg}={}){
    const gaps=[],unknown=[],covered=[];
    function record(key,label,unit,target,t,kind='nutrient',extra={}){
      const partial=!!(t.missing||t.trace||key==='vitamin_k'), confidence=t.known/(t.known+t.missing+t.trace||1);
      const goal={key,label,unit,target,got:t.value,partial,confidence,kind,...extra};
      if(!target||t.value===null){unknown.push(goal);return;}
      const gap=Math.max(0,target-t.value);
      if(gap>target*0.005)gaps.push({...goal,gap,severity:gap/target});else covered.push(goal);
    }
    const valid=entries.filter(e=>number(+e.g)!==null&&+e.g>0);
    const prot=valid.reduce((t,e)=>{const n=number(lookup(e.name)?.protein_g_per_100g);if(n===null)t.missing++;else{t.known++;t.value=(t.value||0)+n*e.g/100;}return t;},{value:null,known:0,missing:0,trace:0});
    record('protein','Protein','g',proteinTarget,prot,'protein');
    for(const d of definitions)record(d.key,d.label,d.unit,N.dailyValues[d.key],N.total(valid,lookup,d.key));
    record('fibre','Fibre','g',N.dailyValues.fibre,N.total(valid,lookup,'fibre'));
    for(const key of ['ala','la']){const t=N.total(valid,lookup,key);record(key,key==='ala'?'ALA':'Linoleic acid','g',N.lipidGuidance(key,t).value,t);}
    const omega=N.epaDhaProgress(valid,lookup,epaDhaGoalMg);
    record('epa_dha','EPA + DHA','mg',omega.targetMg,{value:omega.valueMg,known:omega.epa.known+omega.dha.known,missing:omega.epa.missing+omega.dha.missing,trace:omega.epa.trace+omega.dha.trace});
    for(const a of aminoTargets){
      const t=valid.reduce((sum,e)=>{const f=lookup(e.name);if(!N.hasAminoAcids(f)){sum.missing++;return sum;}sum.known++;sum.value=(sum.value||0)+a.keys.reduce((v,k)=>v+f.aa[k],0)*e.g/100;return sum;},{value:null,known:0,missing:0,trace:0});
      record('aa:'+a.id,a.label,'g',a.target,t,'amino',{keys:a.keys});
    }
    gaps.sort((a,b)=>b.severity*b.confidence-a.severity*a.confidence||a.key.localeCompare(b.key));
    return {gaps,unknown,covered,proteinCovered:prot.value!==null&&prot.value>=proteinTarget,limits:{sodium:N.total(valid,lookup,'sodium'),saturated_fat:N.total(valid,lookup,'saturated_fat')},calories:N.total(valid,lookup,'kcal')};
  }
  // A conservative everyday-food shortlist. This avoids recommending organ meats,
  // concentrates, supplements or unusual foods just because one lab value is high.
  // Portions are practical food portions, not doses intended to fill every gap.
  const families=[
    ['carrot',/\bcarrots?\b/i,80,120,true],['sweet-potato',/sweet potatoes|sweet potato/i,150,200,true],
    ['spinach',/\bspinach\b/i,80,120,true],['broccoli',/\bbroccoli\b/i,80,150,true],
    ['pepper',/peppers.*sweet|sweet.*peppers|bell pepper/i,100,150,true],['kale',/\bkale\b/i,80,120,true],
    ['squash',/\bpumpkin|winter squash|butternut/i,120,180,true],['orange',/\boranges?\b/i,130,180,true],
    ['kiwi',/\bkiwi(?:fruit)?\b/i,80,150,true],['strawberry',/\bstrawberr(?:y|ies)\b/i,120,180,true],
    ['lentil',/\blentils?\b/i,150,200,true],['chickpea',/\bchickpeas?|garbanzo/i,150,200,true],
    ['bean',/\b(?:kidney|black|white|pinto) beans?\b/i,150,200,true],['tofu',/\btofu\b/i,120,180,true],
    ['tempeh',/\btempeh\b/i,100,150,true],['oat',/\boats?|oatmeal\b/i,40,60,true],
    ['rice',/\bbrown rice|rice, brown/i,150,200,true],['almond',/\balmonds?\b/i,25,30,true],
    ['walnut',/\bwalnuts?\b/i,25,30,true],['chia',/\bchia\b/i,15,25,true],
    ['flax',/\bflax(?:seed)?\b/i,15,25,true],['sunflower',/sunflower.*(?:seed|kernel)/i,25,30,true],
    ['salmon',/\bsalmon\b/i,100,140,false],['sardine',/\bsardines?\b/i,80,100,false],
    ['trout',/\btrout\b/i,100,140,false],['herring',/\bherring\b/i,80,120,false],
    ['yogurt',/\byogh?urt\b/i,150,200,false],['egg',/\beggs?\b/i,50,100,false],
    ['chicken',/\bchicken\b/i,100,150,false]
  ];
  const avoid=/\b(baby|infant|formula|liver|giblets?|gizzard|heart|offal|kidney(?! beans?)|organ|oil|powder|isolate|concentrate|supplement|extract|juice|syrup|candy|dessert|pie|cake|cookie|biscuit|sauce|soup|sandwich|pizza|sausage|frankfurter|breaded|battered|fried|smoked|pickled|salted|seasoned|flour|unprepared|dehydrated|brand|granola|bar|bars|snack|spread|drink|beverage|chips)\b|ready-to-eat|with (?:added )?salt/i;
  function foodPortion(f,vegan){
    const name=f.nutritionSource?.name||f.usda_name||f.name;
    // Drained canned fish in oil is edible as logged; free oils remain excluded.
    const filtered=name.replace(/canned in oil|canned,? (?:in )?oil/ig,'canned');
    if(avoid.test(filtered)||f.category==='supplement')return null;
    const family=families.find(([,re])=>re.test(name));if(!family||vegan&&!family[4])return null;
    const [id,,,max,plant]=family;
    if(vegan&&['meat','seafood','dairy','egg'].includes(f.category))return null;
    if(plant&&/\b(beef|pork|chicken|fish|salmon|tuna|egg|eggs|cheese|milk|cream|butter|yogurt|yoghurt|honey|lard|broth)\b/i.test(name))return null;
    if(!plant&&!/cooked|roasted|baked|boiled|poached|canned|yogh?urt/i.test(name))return null;
    if(!plant&&/raw|dried/i.test(name))return null;
    if(['lentil','chickpea','bean','rice','sweet-potato','squash'].includes(id)&&!/cooked|boiled|baked|canned/i.test(name))return null;
    if(/dried|dry/i.test(name)&&!['oat','almond','walnut','chia','flax','sunflower'].includes(id))return null;
    if(!Number.isFinite(f.kcal)||f.kcal<0)return null;
    return {family:id,typical:family[2],max};
  }
  function per100(f,g){
    if(g.kind==='protein')return number(f.protein_g_per_100g);
    if(g.kind==='amino')return N.hasAminoAcids(f)?g.keys.reduce((v,k)=>v+f.aa[k],0):null;
    if(g.key==='epa_dha'){
      const a=number(f.nutrients?.epa),b=number(f.nutrients?.dha);
      // One component is enough to establish a minimum contribution. Mark it.
      return a===null&&b===null?null:((a||0)+(b||0))*1000;
    }
    return number(f.nutrients?.[g.key]);
  }
  function recommend({entries,lookup,foods,proteinTarget,aminoTargets=[],vegan=false,avoided=[],familiar=[],focus='',calorieTarget=null,epaDhaGoalMg}){
    const assessment=assess(entries,lookup,{proteinTarget,aminoTargets,epaDhaGoalMg});
    const focusGap=assessment.gaps.find(g=>g.key===focus);
    const gaps=focusGap?[focusGap]:assessment.gaps,hidden=new Set(avoided),known=new Set(familiar),candidates=[];
    if(!entries.length||!gaps.length)return {...assessment,candidates,focus:focusGap?.key||''};
    for(const f of foods){
      if(hidden.has(f.name))continue;
      const portion=foodPortion(f,vegan);if(!portion)continue;
      const usable=gaps.map(g=>({g,value:per100(f,g)})).filter(x=>x.value>0);
      if(!usable.length)continue;
      // Focused suggestions can shrink to half a normal portion; never ask for
      // enormous servings to force an entire day's remaining nutrients into one food.
      const need=focusGap?focusGap.gap/usable[0].value*100:portion.typical;
      const serve=Math.round(Math.max(portion.typical/2,Math.min(portion.max,need))/5)*5;
      const benefits=usable.map(({g,value})=>{
        const add=value*serve/100,credited=Math.min(add,g.gap);
        const candidatePartial=g.key==='epa_dha'&&(number(f.nutrients?.epa)===null||number(f.nutrients?.dha)===null);
        return {...g,add,after:g.got+add,partial:g.partial||candidatePartial,contribution:credited/g.target,weight:g.kind==='amino'?1/9:1};
      }).filter(g=>g.contribution>=0.02);
      if(!benefits.length||!benefits.some(g=>g.contribution>=0.05))continue;
      benefits.sort((a,b)=>b.contribution*b.confidence*b.weight-a.contribution*a.confidence*a.weight);
      let score=benefits.reduce((s,g)=>s+g.contribution*g.confidence*g.weight,0);
      const calories=f.kcal*serve/100;
      // Limits are penalties, never gaps to fill. A small addition above a limit
      // may still be useful; the user sees the trade-off instead of a 'safe' claim.
      const warnings=[];
      for(const [key,limit] of [['sodium',N.dailyValues.sodium],['saturated_fat',N.lipidGuidance('saturated_fat',{value:0}).value]]){
        const add=number(f.nutrients?.[key]);if(add===null)continue;
        const t=assessment.limits[key],added=add*serve/100;
        if(t.value!==null&&t.value+added>limit&&added>limit*0.025){score-=Math.min(0.6,added/limit);warnings.push(key==='sodium'?'Adds sodium when your recorded total is near or above its limit.':'Adds saturated fat when your recorded total is near or above its limit.');}
      }
      const calorieRoom=calorieTarget&&assessment.calories.value!==null?Math.max(0,calorieTarget-assessment.calories.value):null;
      if(calorieRoom!==null&&calories>calorieRoom){score/=1+(calories-calorieRoom)/200;warnings.push('This portion goes beyond your remaining calorie target. Consider a swap instead of adding it.');}
      score/=1+calories/1000;
      score*=known.has(f.name)?1.05:1; // familiarity only breaks close nutritional matches
      candidates.push({f,serve,benefits,score,calories,protAdd:(f.protein_g_per_100g||0)*serve/100,family:portion.family,warnings});
    }
    const selected=[],used=new Set(),coveredBenefit=new Map();
    for(let i=0;i<3;i++){
      let best=null,bestScore=-Infinity;
      for(const c of candidates){
        if(used.has(c.family))continue;
        const diversity=c.benefits.reduce((s,g)=>s+g.contribution*g.confidence*g.weight*(1-(coveredBenefit.get(g.key)||0)*0.8),0);
        const raw=c.benefits.reduce((s,g)=>s+g.contribution*g.confidence*g.weight,0);
        const rank=c.score*(raw?diversity/raw:0)+(c.f.tier==='featured'?0.005:0);
        if(rank>bestScore){best=c;bestScore=rank;}
      }
      if(!best)break;selected.push(best);used.add(best.family);
      for(const g of best.benefits)coveredBenefit.set(g.key,Math.min(1,(coveredBenefit.get(g.key)||0)+g.add/g.gap));
    }
    return {...assessment,candidates:selected,focus:focusGap?.key||''};
  }
  return {assess,recommend,foodPortion};
});
