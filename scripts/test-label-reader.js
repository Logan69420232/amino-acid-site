const test=require('node:test'),assert=require('node:assert/strict');
const R=require('../lib/label-reader');
const good='Nutrition per 100 g\nEnergy 2450kJ / 590kcal\nFat 49 g\nSaturates 5.5 g\nCarbohydrate 11 g\nSugars 2.5 g\nFibre 6 g\nProtein 23 g\nSalt 0.01 g';
test('weak food photo retries and keeps a coherent nutrition table from the strongest pass',async()=>{
 let passes=0;const texts=['SUNFLOWER SEEDS\nNutrition information\nFat 4g',good];const worker={setParameters:async()=>{},recognize:async()=>({data:{text:texts[passes++]}})};
 const result=await R.read(worker,{});assert.equal(passes,2);assert.equal(result.text,good);assert.equal(result.readable,true);
});
test('good food and one-ingredient supplement labels need only one recognition pass',async()=>{
 for(const text of [good,'Supplement facts\nServing Size: 1 scoop\nCreatine 3 g']){let passes=0;const result=await R.read({setParameters:async()=>{},recognize:async()=>{passes++;return {data:{text}};}},{});assert.equal(result.readable,true);assert.equal(passes,1);}
});
test('unreadable labels return an honest weak result and stop after bounded attempts',async()=>{
 let calls=0;const r=await R.read({setParameters:async()=>{},recognize:async()=>{calls++;return {data:{text:'PACKAGE ~~ 17%'}};}},{});assert.equal(calls,3);assert.equal(r.readable,false);assert.equal(r.text,'PACKAGE ~~ 17%');
});
test('closing scanner prevents recognition retries and stale results',async()=>{
 let active=true,calls=0;const r=await R.read({setParameters:async()=>{},recognize:async()=>{calls++;active=false;return {data:{text:good}};}},{},{active:()=>active});assert.equal(r,null);assert.equal(calls,1);
});
