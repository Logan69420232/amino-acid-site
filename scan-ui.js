/* Camera and OCR are started only by a deliberate user action. Images stay on device. */
(function(){
  const dialog=document.createElement('dialog');dialog.id='foodScanDialog';dialog.className='food-scan-dialog';dialog.setAttribute('aria-labelledby','scanTitle');document.body.appendChild(dialog);
  const escape=uiEsc, scriptJobs=new Map();let epoch=0,controls=null,worker=null,abort=null,photoURL=null,opener=null,context=null,reader=null,labelCanvas=null;
  const $=id=>dialog.querySelector('#'+id);
  function stop(){epoch++;resetTorch();controls?.stop();controls=null;const start=$('scanCamera');if(start)start.hidden=false;const capture=$('scanCapture');if(capture){capture.hidden=true;capture.disabled=false;}const v=$('scanVideo');if(v?.srcObject){v.srcObject.getTracks().forEach(t=>t.stop());v.srcObject=null;}worker?.terminate();worker=null;abort?.abort();abort=null;if(photoURL){URL.revokeObjectURL(photoURL);photoURL=null;}}
  function valid(t){return dialog.open&&epoch===t&&store.owner===context?.owner&&activeLogDay().date===context?.date;}
  function status(text,error=false){const el=$('scanStatus');if(el){el.textContent=text;el.classList.toggle('is-error',error);}}
  function script(src,global){if(window[global])return Promise.resolve();if(scriptJobs.has(src))return scriptJobs.get(src);const job=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=()=>{scriptJobs.delete(src);s.remove();reject(Error('Scanner could not load. Check your connection and try again.'));};document.head.appendChild(s);});scriptJobs.set(src,job);return job;}
  function frame(title){stop();dialog.innerHTML=`<header class="scan-head"><div><span class="scan-eyebrow">ADD TO ${escape(MEAL_LABEL[context.meal].toUpperCase())}</span><h2 id="scanTitle">${title}</h2></div><button type="button" id="scanClose" aria-label="Close scanner">×</button></header><div id="scanBody"></div><p id="scanStatus" role="status" aria-live="polite"></p>`;$('scanClose').onclick=()=>dialog.close();dialog.scrollTop=0;}
  function supplementSearch(){
    frame('Find a supplement');
    $('scanBody').innerHTML='<button type="button" id="supplementScan" class="scan-primary supplement-scan-first">Scan a supplement label</button><p class="scan-hint">Or search for a nutrient and enter your dose.</p><label>Search supplements<input id="supplementQuery" type="search" placeholder="Try iron, vitamin C or magnesium" autocomplete="off"></label><div id="supplementResults" class="supplement-results"></div><p class="scan-hint">Generic nutrients, not branded products. For a blend or multivitamin, scan its label to record each ingredient.</p>';
    const render=()=>{const results=SupplementScan.search($('supplementQuery').value);$('supplementResults').innerHTML=results.length?results.map(d=>`<button type="button" data-supplement-key="${d.key}"><span>${escape(d.label)}</span><small>${d.doseUnit==='µg'?'mcg':d.doseUnit} <span aria-hidden="true">＋</span></small></button>`).join(''):'<p>No matching nutrient. Try another name or use Scan a supplement label above.</p>';$('supplementResults').querySelectorAll('[data-supplement-key]').forEach(b=>b.onclick=()=>supplementDose(b.dataset.supplementKey));};
    $('supplementQuery').oninput=render;render();$('supplementScan').onclick=()=>openMode('label');// Keep the phone keyboard closed until the user chooses to search.
    $('scanClose').focus({preventScroll:true});
  }
  function supplementDose(key){
    const d=SupplementScan.catalog.find(d=>d.key===key);if(!d)return;
    frame(d.label);const t=epoch;
    const note=d.group==='Minerals'?'Use the elemental '+d.label.toLowerCase()+' amount, not the weight of the compound.':key==='omega_3'?'Enter total omega-3, not total fish oil. Scan the label if you want separate EPA and DHA amounts.':key==='vitamin_d'?'Use mcg (µg) or IU from your label.':key==='vitamin_e'||key==='vitamin_a_rae'?'For IU, choose the form printed on your supplement label. If unsure, use its mg or mcg amount.': 'Match the nutrient and units printed on your label. For blends or other forms, scan the label.';
    $('scanBody').innerHTML=`<p class="scan-lead">${escape(note)}</p><form id="supplementDoseForm"><label>Total dose you took<input id="supplementDose" type="number" min="0.000001" step="any" required placeholder="Enter amount" inputmode="decimal"></label><label>Unit<select id="supplementUnit">${SupplementScan.doseUnits(key).map(([value,label])=>`<option value="${value}">${escape(label)}</option>`).join('')}</select></label><p class="scan-hint">Enter the total nutrient amount you took today, not the number of tablets. This records your intake; it does not suggest a dose.</p><p id="supplementDoseSummary" aria-live="polite"></p><div class="scan-actions"><button class="scan-primary" type="submit">Add to Supplements</button><button type="button" id="supplementBack">Back to search</button></div></form>`;
    $('supplementUnit').value=d.doseUnit;
    const preview=()=>{$('supplementDoseSummary').textContent='';try{const f=SupplementScan.fromDose(key,$('supplementDose').value,$('supplementUnit').value,'dose-preview');$('supplementDoseSummary').textContent='Will add '+f.name+($('supplementUnit').value.startsWith('IU')?' = '+Nutrition.format(f.nutrients[key]/100)+' '+d.unit:'');}catch{}};
    $('supplementDoseForm').oninput=preview;$('supplementBack').onclick=supplementSearch;
    $('supplementDoseForm').onsubmit=e=>{e.preventDefault();if(!valid(t)){dialog.close();return;}try{const f=SupplementScan.fromDose(key,$('supplementDose').value,$('supplementUnit').value,crypto.randomUUID());let added=false;uiMutateDay(()=>{added=addToDay(f.name,1,'supplements',undefined,f);},'Supplement added.');if(added){dialog.close();window.__v2Render?.();}}catch(e){status(e.message,true);}};
    $('supplementDose').focus();
  }
  window.__openSupplementSearch=button=>{opener=button;context={owner:store.owner,date:activeLogDay().date,meal:'supplements',mode:'label'};if(!dialog.open)dialog.showModal();supplementSearch();};
  window.__openSupplementScan=button=>{opener=button;context={owner:store.owner,date:activeLogDay().date,meal:'supplements',mode:'label'};if(!dialog.open)dialog.showModal();openMode('label');};
  document.getElementById('supplementSearchEntry').onclick=e=>window.__openSupplementSearch(e.currentTarget);
  function supplementReview(draft){
    draft={...draft,name:String(draft.name||'').trim()||SupplementScan.suggestName(draft.ingredients)};
    frame(draft.name||'Your supplement');const t=epoch,reviewState=SupplementScan.reviewState(draft);
    const unitOptions=SupplementScan.units.map(u=>`<option value="${u}">${u}</option>`).join('');
    const servingFields=`<div class="scan-basis"><label>Label amounts are for<input id="scanServing" type="number" inputmode="decimal" min="0.001" max="5000" step="any" required placeholder="Number" value="${escape(draft.servingCount||'')}"></label><label>Unit<select id="scanDoseUnit">${unitOptions}</select></label></div>`;
    $('scanBody').innerHTML=`<p class="scan-hint" id="scanReadMessage">${escape(reviewState.message)}</p><form id="scanReview"><div id="scanLabelSummary" class="scan-label-summary" aria-live="polite"></div>${reviewState.missingServing?'<div id="scanServingQuick" class="scan-serving-quick"><p>We found the strength. Is this amount per tablet or capsule?</p><button type="button" id="scanPerTablet">Per tablet</button><button type="button" id="scanPerCapsule">Per capsule</button><button type="button" id="scanOtherServing">Other serving size</button></div>':''}<div class="scan-portion"><label><span class="scan-amount-title" id="scanAmountTitle">Amount you took</span><div class="scan-dose-inline"><input aria-label="Amount you took" id="scanPortion" type="number" inputmode="decimal" min="0.001" max="2000" step="any" required placeholder="Number" value=""><span id="scanDoseLabel"></span></div></label><p id="scanPortionSummary" aria-live="polite"></p></div><div class="scan-actions"><button class="scan-primary" type="submit">Add to ${escape(MEAL_LABEL[context.meal])}</button></div><details id="scanLabelDetails" class="scan-label-details"><summary>Edit label details</summary><label>Supplement name<input id="scanName" maxlength="160" required value="${escape(draft.name||'')}"></label>${servingFields}<div id="scanIngredients"></div><button type="button" id="scanAddIngredient">＋ Add ingredient</button></details></form><details class="scan-label-details"><summary>Scan options</summary><div class="scan-actions"><button type="button" id="scanAgain">Retake photo</button>${labelCanvas?'<button type="button" id="scanCrop">Select nutrition table</button>':''}<button type="button" id="scanSearchInstead">Search instead</button><button type="button" id="scanFoodInstead">Use food label format</button></div>${draft.previewImage?'<details class="scan-photo-preview"><summary>Original label</summary><img src="'+draft.previewImage+'" alt="Supplement label being reviewed"></details>':''}${draft.text?'<details class="scan-text"><summary>Text read from label</summary><pre>'+escape(draft.text)+'</pre></details>':''}</details>`;
    if($('scanServingQuick')){
      const choose=unit=>{$('scanServing').value=1;$('scanDoseUnit').value=unit;preview();$('scanPortion').focus();};
      $('scanPerTablet').onclick=()=>choose('tablets');$('scanPerCapsule').onclick=()=>choose('capsules');
      $('scanOtherServing').onclick=()=>{$('scanLabelDetails').open=true;$('scanServing').focus();};
    }
    $('scanSearchInstead').onclick=()=>{context.meal='supplements';supplementSearch();};
    $('scanDoseUnit').value=draft.doseUnit||'servings';
    function addRow(row={}){const el=document.createElement('fieldset');el.className='scan-ingredient';el.innerHTML=`<legend>Ingredient</legend><label>Name<input data-field="label" maxlength="160" required value="${escape(row.label||'')}"></label><div class="scan-basis"><label>Amount<input data-field="amount" type="number" inputmode="decimal" min="0" step="any" required value="${escape(row.amount??'')}"></label><label>Unit<input data-field="unit" maxlength="24" required value="${escape(row.unit??'mg')}" placeholder="mg, µg, IU, CFU…"></label></div><button type="button" class="scan-remove">Remove ingredient</button>`;el.querySelector('button').onclick=()=>{el.remove();preview();};$('scanIngredients').appendChild(el);}
    const read=()=>({name:$('scanName').value,brand:draft.brand||'',servingCount:$('scanServing').value,doseUnit:$('scanDoseUnit').value,ingredients:Array.from($('scanIngredients').children,el=>{const row=Object.fromEntries(['label','amount','unit'].map(k=>[k,el.querySelector('[data-field="'+k+'"]').value]));row.key=SupplementScan.matchKey(row.label,row.unit);return row;})});
    function preview(){
      const d=read(),count=+d.servingCount,intake=SupplementScan.intakeQuantity(count,d.doseUnit,$('scanPortion').value),qty=intake?.unitsTaken||0;
      const asServings=count>1&&!['ml','g'].includes(d.doseUnit),intakeUnit=asServings?'servings':d.doseUnit;
      $('scanAmountTitle').textContent='How many '+intakeUnit+' did you take?';$('scanPortion').setAttribute('aria-label',$('scanAmountTitle').textContent);
      if($('scanServingQuick'))$('scanServingQuick').hidden=count>0;
      $('scanReview').querySelector('[type=submit]').disabled=!(count>0);
      $('scanTitle').textContent=d.name||'Your supplement';
      const state=SupplementScan.reviewState({...d,issues:draft.issues});$('scanReadMessage').hidden=!state.needsIngredients&&!draft.issues?.length;$('scanReadMessage').textContent=state.message;
      $('scanDoseLabel').textContent=intakeUnit;
      const known=d.ingredients.filter(r=>r.key),other=d.ingredients.filter(r=>!r.key),useful=known.length?known:other;
      const rows=useful.map(r=>'<div><span>'+escape(SupplementScan.definitions.find(n=>n.key===r.key)?.label||r.label)+'</span><b>'+escape(SupplementScan.number(r.amount)===null?'Check amount':Nutrition.format(+r.amount)+' '+r.unit)+'</b></div>').join('');
      $('scanLabelSummary').innerHTML='<strong>'+escape(count>0?(asServings?'1 serving = '+count+' '+d.doseUnit:'Per '+count+' '+(count===1?(d.doseUnit==='gummies'?'gummy':d.doseUnit.replace(/s$/,'')):d.doseUnit)):'Strength read from label')+'</strong>'+rows+(known.length&&other.length?'<small>'+other.length+' other label ingredient'+(other.length===1?'':'s')+' in Edit label details</small>':'');
      $('scanLabelSummary').hidden=!d.ingredients.length;
      $('scanPortionSummary').textContent='';
      if(qty>0&&count>0){try{const f=SupplementScan.makeFood(d,'preview-supplement');$('scanPortionSummary').textContent='You’ll log '+useful.slice(0,5).map(r=>Nutrition.format(+r.amount*qty/f.serving_g)+' '+r.unit+' '+(SupplementScan.definitions.find(n=>n.key===r.key)?.label||r.label)).join(' · ');}catch{}}
    }
    (draft.ingredients?.length?draft.ingredients:[{}]).forEach(addRow);preview();
    if(reviewState.needsIngredients)$('scanLabelDetails').open=true;
    if(draft.issues?.length){const p=document.createElement('p');p.className='scan-hint';p.textContent=draft.issues.join(' ');$('scanLabelDetails').insertBefore(p,$('scanIngredients'));}
    $('scanAddIngredient').onclick=()=>{if($('scanIngredients').children.length>=100)return;addRow();$('scanIngredients').lastElementChild.querySelector('input').focus();};
    $('scanReview').addEventListener('invalid',e=>{if($('scanLabelDetails').contains(e.target))$('scanLabelDetails').open=true;},true);
    $('scanReview').oninput=preview;
    $('scanAgain').onclick=()=>openMode(context.mode);$('scanFoodInstead').onclick=()=>review({...FoodScan.parseLabel(draft.text||''),previewImage:draft.previewImage,weakRead:draft.weakRead,issues:draft.issues,forceFood:true});
    $('scanReview').onsubmit=e=>{e.preventDefault();if(!valid(t)){dialog.close();return;}try{const d=read(),f=SupplementScan.makeFood(d,crypto.randomUUID()),quantity=SupplementScan.intakeQuantity(d.servingCount,d.doseUnit,$('scanPortion').value)?.unitsTaken;if(!Number.isFinite(quantity)||quantity<=0||quantity>2000)throw Error('Enter an amount above zero and no more than 2,000 label units.');let added=false;uiMutateDay(()=>{added=addToDay(f.name,quantity,context.meal,undefined,f);},'Supplement added.');if(added){dialog.close();window.__v2Render?.();}}catch(e){$('scanLabelDetails').open=true;status(e.message,true);}};
    if($('scanCrop'))$('scanCrop').onclick=()=>cropLabel({...draft,...read()});
    $('scanClose').focus();
  }

  function scanReadNotice(draft){
    const issues=draft.issues||[];
    return (draft.weakRead||issues.length)?'<div class="scan-read-notice"><p>'+(issues.length?'Some amounts need a closer look. Compare these readings with your label before adding.':'We couldn’t read enough of this label. Select just the nutrition table, retake a closer photo, or enter the values below.')+'</p>'+(issues.length?'<ul>'+issues.map(issue=>'<li>'+escape(issue)+'</li>').join('')+'</ul>':'')+'<button type="button" id="scanRetake">Retake photo</button>'+(labelCanvas?'<button type="button" id="scanCrop">Select nutrition table</button>':'')+'</div>':(labelCanvas?'<button type="button" id="scanCrop">Adjust nutrition table</button>':'');
  }
  function review(draft){
    if(!draft.forceFood && (draft.supplement||context.meal==='supplements'||SupplementScan.detect(draft.text||'')))return supplementReview({...SupplementScan.parse(draft.text||''),...draft});
    frame('Check your food');const t=epoch;
    $('scanBody').innerHTML=`${scanReadNotice(draft)}<p class="scan-lead">Check the product, nutrition column and portion before adding it.</p>${draft.source==='Open Food Facts'?'<p class="scan-source">Product data from <a href="https://world.openfoodfacts.org/product/'+encodeURIComponent(draft.barcode)+'" target="_blank" rel="noopener">Open Food Facts</a> · <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noopener">ODbL</a>. Values can be incomplete or out of date.</p>':'<p class="scan-source">Read on your device. Compare every number with the label. For labels with two columns, use one column consistently.</p>'}
      ${draft.previewImage?'<details class="scan-photo-preview"><summary>View original label</summary><img src="'+draft.previewImage+'" alt="Nutrition label being reviewed"></details>':''}<button type="button" id="scanSupplement">This is a supplement</button><form id="scanReview"><label>Product name<input id="scanName" maxlength="160" required value="${escape(draft.name||'')}" autocomplete="off"></label><label>Brand <span>(optional)</span><input id="scanBrand" maxlength="100" value="${escape(draft.brand||'')}"></label>
      <div class="scan-basis"><label>These label values are per<select id="scanBasis" required><option value="">Choose the column you are using</option><option value="100g">100 g</option><option value="serving">Serving / portion</option><option value="100ml">100 ml</option></select></label><label id="scanWeightLabel">Weight of that serving / 100 ml (g)<input id="scanWeight" type="number" step="any" min="0.1" max="5000" value="${escape(draft.referenceGrams||'')}"></label></div>
      <p class="scan-hint">For liquids, weigh the volume shown. Millilitres are not automatically grams. Leave optional nutrients blank if unknown.</p><div class="scan-nutrients">${FoodScan.fields.map(([k,l,u])=>`<label>${l} <span>${u}</span><input id="scan-${k}" type="number" inputmode="decimal" step="any" min="0" ${['energy','protein','carb','fat'].includes(k)?'required':''} value="${draft.values[k]==null?'':Number(draft.values[k].toFixed(3))}" placeholder="Unknown"></label>`).join('')}</div>
      <div class="scan-portion"><label>Your portion (g)<input id="scanPortion" type="number" inputmode="decimal" min="0.1" max="2000" step="any" required value="100"></label><p id="scanPortionSummary" aria-live="polite"></p></div>
      <p class="scan-hint">Amino acids and unlisted nutrients will remain unavailable. No nutrition values are estimated.</p><div class="scan-actions"><button class="scan-primary" type="submit">Add to ${escape(MEAL_LABEL[context.meal])}</button><button type="button" id="scanAgain">Start again</button></div></form>${draft.text?'<details class="scan-text"><summary>Text read from the label</summary><pre>'+escape(draft.text)+'</pre></details>':''}`;
    $('scanSupplement').onclick=()=>supplementReview({...SupplementScan.parse(draft.text||''),name:$('scanName').value,brand:$('scanBrand').value,previewImage:draft.previewImage,weakRead:draft.weakRead,issues:draft.issues});
    $('scanBasis').value=draft.basis||'';
    const read=()=>({...draft,name:$('scanName').value,brand:$('scanBrand').value,basis:$('scanBasis').value,referenceGrams:$('scanWeight').value,values:Object.fromEntries(FoodScan.fields.map(([k])=>[k,$('scan-'+k).value]))});
    const preview=()=>{const b=$('scanBasis').value;$('scanWeightLabel').hidden=b==='100g';$('scanWeight').required=b!=='100g';try{const f=FoodScan.makeFood(read(),'preview-food');const g=+$('scanPortion').value;$('scanPortionSummary').textContent=g>0?`${Math.round(f.kcal*g/100)} kcal · ${(f.protein_g_per_100g*g/100).toFixed(1)} g protein in your portion`:'';}catch{$('scanPortionSummary').textContent='Complete the main nutrition values to see your portion.';}};
    $('scanReview').oninput=e=>{preview();};
    $('scanBasis').onchange=preview;preview();setupPackPicker(draft,preview);$('scanAgain').onclick=()=>openMode(context.mode);
    $('scanReview').onsubmit=e=>{e.preventDefault();if(!valid(t)){dialog.close();return;}try{const f=FoodScan.makeFood(read(),crypto.randomUUID());const grams=Number($('scanPortion').value);if($('scanReview').dataset.packEstimate==='true')f.portionEstimate={packGrams:+$('packWeight').value,beforePercent:+$('packBefore').value,afterPercent:+$('packLeft').value};if(!Number.isFinite(grams)||grams<=0||grams>2000)throw Error('Enter a portion between 0.1 and 2,000 g.');let added=false;uiMutateDay(()=>{added=addToDay(f.name,grams,context.meal,undefined,f);},'Scanned food added.');if(added){dialog.close();window.__v2Render?.();}}catch(e){status(e.message,true);}};
    if($('scanRetake'))$('scanRetake').onclick=()=>openMode('label');
    if($('scanCrop'))$('scanCrop').onclick=()=>cropLabel({...draft,...read()});
    $('scanName').focus();
  }

  function setupPackPicker(draft,preview,simple=false){
    const portion=$('scanPortion').closest('.scan-portion'),form=$('scanReview');
    const panel=document.createElement('section');panel.className='scan-pack';
    $('scanTitle').textContent=draft.name||'Your scanned food';$('scanBody').querySelector('.scan-lead')?.remove();
    panel.innerHTML=`<h3>How much did you eat?</h3><div class="scan-pack-modes" role="group" aria-label="Portion method"><button type="button" id="packEstimate" aria-pressed="false">Estimate from pack</button><button type="button" id="packGramsMode" aria-pressed="true">Enter grams</button></div><div id="packControls" hidden><label class="pack-weight">Full pack weight (g)<input id="packWeight" type="number" inputmode="decimal" min="1" max="100000" step="any" value="${draft.packGrams||''}" placeholder="Weight printed on the pack"></label><p class="scan-hint">${draft.packGrams?'Check this weight matches your pack.':'Enter the weight printed on your pack.'}</p><div class="pack-visual-row"><div class="pack-bag" id="packBag" aria-hidden="true"><div class="pack-fill" id="packFill"></div><span id="packPercent" hidden>100%</span><span class="pack-handle" id="packHandle">↕</span></div><div class="pack-result"><span>You ate</span><strong id="packEaten">0%</strong><span id="packAmount">≈ 0 g</span><p>Drag the bag down to show what’s left.</p></div></div><label class="pack-range-label">Left now <output id="packLeftOutput">100%</output><input id="packLeft" aria-label="Pack remaining now" type="range" min="0" max="100" step="1" value="100"></label><div class="pack-shortcuts" role="group" aria-label="Amount eaten"><button type="button" data-pack-eaten="25">¼ pack</button><button type="button" data-pack-eaten="50">½ pack</button><button type="button" data-pack-eaten="100">All of it</button></div><details class="pack-before"><summary>Already opened?</summary><label>How full was it before?<input id="packBefore" aria-label="Pack fullness before eating" type="range" min="1" max="100" value="100"><output id="packBeforeOutput">100% full</output></label></details><p class="scan-hint">A visual estimate, not a weighed portion. Log only what you ate, excluding food shared or thrown away.</p></div>`;
    // Food review and standalone portions share the same visual control.
    if(!simple){
      const details=document.createElement('details');details.className='pack-nutrition';
      details.innerHTML='<summary>Product & nutrition details</summary>';
      const last=portion.nextElementSibling;
      while(form.firstChild&&form.firstChild!==portion)details.appendChild(form.firstChild);
      form.insertBefore(details,last);
      details.appendChild($('scanSupplement'));const source=$('scanBody').querySelector('.scan-source');if(source)details.appendChild(source);details.appendChild(last);
      try{FoodScan.makeFood(draft,'preview-food');}catch{details.open=true;}
      form.addEventListener('invalid',e=>{if(details.contains(e.target))details.open=true;},true);
    }
    form.insertBefore(panel,portion);
    const estimateSummary=document.createElement('p');estimateSummary.id='packNutritionSummary';estimateSummary.className='scan-hint';panel.appendChild(estimateSummary);
    let estimate=false;
    function update(){
      const before=+$('packBefore').value;const left=Math.min(before,+$('packLeft').value);$('packLeft').max=before;$('packLeft').value=left;
      const grams=FoodScan.packPortion($('packWeight').value,before,left);
      $('packBeforeOutput').textContent=before+'% full';$('packLeftOutput').textContent=left+'%';$('packPercent').textContent=left+'%';$('packEaten').textContent=(before-left)+'% of pack';$('packAmount').textContent=grams===null?'Enter the pack weight':'≈ '+grams+' g';
      $('packFill').style.height=left+'%';$('packHandle').style.bottom='calc('+left+'% - 16px)';
      if(estimate){$('scanPortion').value=grams===null?'':grams;$('scanPortion').setCustomValidity(grams===null?'Enter the full pack weight.':grams<=0?'Move the bag level to show how much you ate.':grams>2000?'This is more than 2,000 g. Check the pack weight and portion.':'');}
      preview();$('packNutritionSummary').textContent=estimate&&$('scanPortionSummary').textContent?'Estimated: '+$('scanPortionSummary').textContent:'';
      form.querySelector('[type=submit]').disabled=estimate&&(grams===null||grams<0.1||grams>2000);
      form.dataset.packEstimate=estimate?'true':'false';
    }
    function mode(on){estimate=on;$('packControls').hidden=!on;portion.hidden=on;$('packEstimate').setAttribute('aria-pressed',String(on));$('packGramsMode').setAttribute('aria-pressed',String(!on));$('packWeight').required=on;$('packWeight').disabled=!on;
      $('scanPortion').required=!on;$('scanPortion').disabled=on;$('scanPortion').setCustomValidity('');
      if(!on&&!(+$('scanPortion').value>0))$('scanPortion').value=100;update();}
    $('packEstimate').onclick=()=>mode(true);$('packGramsMode').onclick=()=>mode(false);
    form.addEventListener('input',update);
    panel.querySelectorAll('[data-pack-eaten]').forEach(b=>b.onclick=()=>{$('packLeft').value=Math.max(0,+$('packBefore').value-+b.dataset.packEaten);update();});
    const bag=$('packBag');let dragging=false;
    const move=e=>{const r=bag.getBoundingClientRect();$('packLeft').value=Math.max(0,Math.min(+$('packBefore').value,Math.round((1-(e.clientY-r.top)/r.height)*100)));update();};
    bag.onpointerdown=e=>{dragging=true;bag.setPointerCapture(e.pointerId);move(e);};bag.onpointermove=e=>{if(dragging)move(e);};bag.onpointerup=bag.onpointercancel=()=>{dragging=false;};
    // The visible fields explain invalid estimates; never silently fall back to 100 g.
    form.addEventListener('submit',e=>{if(estimate){const g=FoodScan.packPortion($('packWeight').value,$('packBefore').value,$('packLeft').value);if(g===null||g<0.1||g>2000){e.preventDefault();e.stopImmediatePropagation();status('Check the pack weight and choose an amount eaten between 0.1 and 2,000 g.',true);}}},true);
    mode(simple||!!draft.packGrams);
  }

  // Reuse the pack picker wherever a food quantity is editable. Never apply to tablets.
  window.__openPackPortion=(f,amount,onChoose,button)=>{
    if(f?.supplement)return;
    opener=button;context={owner:store.owner,date:activeLogDay().date,meal:currentMeal,mode:'portion',view:document.body.dataset.view};
    if(!dialog.open)dialog.showModal();frame(escape(f?.name||'Your food portion'));const t=epoch;
    dialog.querySelector('.scan-eyebrow').textContent='FOOD PORTION';
    $('scanBody').innerHTML='<form id="scanReview"><div class="scan-portion"><label>Your portion (g)<input id="scanPortion" type="number" inputmode="decimal" min="0.1" max="2000" step="any" required></label><p id="scanPortionSummary" aria-live="polite"></p></div><div class="scan-actions"><button class="scan-primary" type="submit">Use this portion</button></div></form>';
    $('scanPortion').value=amount||100;
    const preview=()=>{const g=+$('scanPortion').value;const parts=[];if(f?.kcal!=null)parts.push(Math.round(f.kcal*g/100)+' kcal');if(f?.protein_g_per_100g!=null)parts.push((f.protein_g_per_100g*g/100).toFixed(1)+' g protein');$('scanPortionSummary').textContent=g>0?parts.join(' · '):'';};
    setupPackPicker({name:f?.name||'Your food portion',packGrams:f?.packGrams||f?.portionEstimate?.packGrams},preview,true);
    $('scanReview').oninput=preview;
    $('scanReview').onsubmit=e=>{e.preventDefault();if(!valid(t)){dialog.close();return;}const g=+$('scanPortion').value;if(!(g>=0.1&&g<=2000))return;dialog.close();onChoose(g);};
    $('scanClose').focus({preventScroll:true});
  };

  function cropLabel(draft){
    const source=labelCanvas;if(!source)return;
    frame('Select the nutrition table');
    $('scanBody').innerHTML='<p class="scan-lead">Drag a box around the whole table, including the column headings and units. Leave out other languages and packaging text.</p><canvas id="scanCropCanvas" aria-label="Label photo: drag to select the nutrition table"></canvas><details><summary>Adjust selection precisely</summary><div id="scanCropEdges"></div></details><div class="scan-actions"><button type="button" class="scan-primary" id="scanReadCrop">Read selected table</button><button type="button" id="scanCropBack">Back to review</button></div>';
    const c=$('scanCropCanvas'),ctx=c.getContext('2d'),scale=Math.min(1,1000/source.width);
    c.width=Math.round(source.width*scale);c.height=Math.round(source.height*scale);
    let box={left:.1,top:.1,right:.9,bottom:.9},start=null;
    for(const edge of ['left','top','right','bottom']){const label=document.createElement('label');label.textContent=edge[0].toUpperCase()+edge.slice(1)+' edge';const input=document.createElement('input');input.type='range';input.min=0;input.max=100;input.step=1;input.dataset.edge=edge;label.appendChild(input);$('scanCropEdges').appendChild(label);input.oninput=()=>{const v=+input.value/100;if(edge==='left')box.left=Math.min(v,box.right-.05);if(edge==='right')box.right=Math.max(v,box.left+.05);if(edge==='top')box.top=Math.min(v,box.bottom-.05);if(edge==='bottom')box.bottom=Math.max(v,box.top+.05);draw();};}
    function draw(){ctx.drawImage(source,0,0,c.width,c.height);ctx.fillStyle='#211b2ba6';ctx.fillRect(0,0,c.width,c.height);const x=box.left*c.width,y=box.top*c.height,w=(box.right-box.left)*c.width,h=(box.bottom-box.top)*c.height;ctx.drawImage(source,box.left*source.width,box.top*source.height,(box.right-box.left)*source.width,(box.bottom-box.top)*source.height,x,y,w,h);ctx.strokeStyle='#fff';ctx.lineWidth=4;ctx.strokeRect(x,y,w,h);$('scanCropEdges').querySelectorAll('input').forEach(input=>{input.value=Math.round(box[input.dataset.edge]*100);});}
    const point=e=>{const r=c.getBoundingClientRect();return {x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))};};
    c.onpointerdown=e=>{start=point(e);c.setPointerCapture(e.pointerId);};
    c.onpointermove=e=>{if(!start)return;const p=point(e);if(Math.abs(p.x-start.x)>=.03&&Math.abs(p.y-start.y)>=.03){box={left:Math.min(start.x,p.x),right:Math.max(start.x,p.x),top:Math.min(start.y,p.y),bottom:Math.max(start.y,p.y)};draw();}};
    c.onpointerup=c.onpointercancel=()=>{start=null;};
    $('scanCropBack').onclick=()=>review(draft);
    $('scanReadCrop').onclick=()=>{const t=epoch,out=document.createElement('canvas');out.width=Math.round((box.right-box.left)*source.width);out.height=Math.round((box.bottom-box.top)*source.height);if(out.width<60||out.height<40){status('Select the full table, including its headings and amounts.',true);return;}out.getContext('2d').drawImage(source,box.left*source.width,box.top*source.height,out.width,out.height,0,0,out.width,out.height);$('scanReadCrop').disabled=true;out.toBlob(blob=>{if(valid(t)&&blob)photo(new File([blob],'label-table.png',{type:'image/png'}),'label');},'image/png');};
    draw();
  }

  async function lookup(raw){const code=FoodScan.barcode(raw);if(!code){status('Enter a valid 8, 12, 13 or 14 digit product barcode.',true);return;}stop();const t=epoch;status('Finding this product…');$('scanLookup').disabled=true;abort=new AbortController();const timer=setTimeout(()=>abort?.abort(),12000);
    try{const url='https://world.openfoodfacts.org/api/v2/product/'+code+'.json?fields=product_name,product_name_en,brands,nutriments,quantity,serving_size,nutrition_data_per&app_name=Aminodata';const r=await fetch(url,{signal:abort.signal,credentials:'omit',referrerPolicy:'no-referrer'});if(!r.ok)throw Error(r.status===429?'Too many lookups. Please wait a minute, or scan the label.':'Product lookup is temporarily unavailable. Try the label scanner.');const data=await r.json();if(!valid(t))return;if(!data.product||data.status===0){status('Product not found. Scan its nutrition label or enter the values yourself.',true);return;}review(FoodScan.fromProduct(data.product,code));}catch(e){if(valid(t))status(e.name==='AbortError'?'Lookup timed out. Try again or scan the label.':e.message,true);}finally{clearTimeout(timer);if(valid(t)&&$('scanLookup'))$('scanLookup').disabled=false;}
  }
  // Torch is optional hardware; never block scanning when it is unavailable.
  let torchTrack=null,torchOn=false;
  function resetTorch(){
    const old=torchTrack;torchTrack=null;torchOn=false;
    if(old)old.stop();
    const b=$('scanTorch');if(b){b.hidden=true;b.disabled=false;b.setAttribute('aria-pressed','false');b.textContent='Flash off';}
  }
  function setupTorch(video,t){
    const b=$('scanTorch'),track=video.srcObject?.getVideoTracks?.()[0];
    if(!b||!track||!valid(t))return;
    let supports=false;try{const cap=track.getCapabilities?.().torch;supports=cap===true||(Array.isArray(cap)&&cap.includes(true));}catch{}
    if(!supports||typeof track.applyConstraints!=='function')return;
    torchTrack=track;torchOn=track.getSettings?.().torch===true;b.hidden=false;
    const render=()=>{b.textContent=torchOn?'Flash on':'Flash off';b.setAttribute('aria-pressed',String(torchOn));};render();
    b.onclick=async()=>{
      if(!valid(t)||torchTrack!==track||track.readyState==='ended')return;
      b.disabled=true;const next=!torchOn;
      try{
        const constraints=track.getConstraints?.()||{};
        await track.applyConstraints({...constraints,advanced:[...(constraints.advanced||[]).map(c=>{const {torch,...rest}=c;return rest;}),{torch:next}]});
        if(!valid(t)||torchTrack!==track)return;
        const actual=track.getSettings?.().torch;
        if(typeof actual==='boolean'&&actual!==next)throw Error('Flash unavailable');
        torchOn=next;render();
      }catch{if(valid(t)&&torchTrack===track)status('Could not change the flash. Try moving to brighter light.',true);}
      finally{if(valid(t)&&torchTrack===track)b.disabled=false;}
    };
  }
  async function withPhotoLight(t,draw){
    const track=torchTrack,b=$('scanTorch');
    if(b)b.disabled=true;
    const apply=on=>{const constraints=track.getConstraints?.()||{};return track.applyConstraints({...constraints,advanced:[...(constraints.advanced||[]).map(c=>{const {torch,...rest}=c;return rest;}),{torch:on}]});};
    try{
      if(track?.readyState!=='ended'&&track){
        try{await apply(true);if(valid(t))await new Promise(resolve=>setTimeout(resolve,250));}catch{/* Capture still works without hardware light. */}
      }
      if(valid(t))draw();
    }finally{
      // Always extinguish the capture light, including failed captures/cancellation.
      if(track&&track.readyState!=='ended'){try{await apply(false);}catch{track.stop();}}
      if(valid(t)&&torchTrack===track){torchOn=false;if(b){b.textContent='Flash off';b.setAttribute('aria-pressed','false');b.disabled=false;}}
    }
  }
  async function camera(mode){stop();const t=epoch;status('Opening your back camera…');$('scanCamera').disabled=true;if(mode==='label')$('scanCamera').hidden=true;try{
    if(!navigator.mediaDevices?.getUserMedia)throw Error('Camera access needs HTTPS and a supported browser. You can enter the values manually.');
    const v=$('scanVideo');v.hidden=false;if($('scanCameraView'))$('scanCameraView').hidden=false;
    if(mode==='label'){
      const stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:2560},height:{ideal:1920}}});
      if(!valid(t)){stream.getTracks().forEach(track=>track.stop());return;}
      v.srcObject=stream;await v.play();if(!valid(t))return;
      setupTorch(v,t);$('scanCapture').hidden=false;status('Fit the table and serving size inside the frame, then tap Take photo.');
    }else{
      await script('/assets/scanner/zxing.min.js','ZXingBrowser');if(!valid(t))return;
      reader=new ZXingBrowser.BrowserMultiFormatReader();
      const c=await reader.decodeFromConstraints({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1280}}},v,result=>{if(result&&valid(t)){const code=FoodScan.barcode(result.getText());if(code)lookup(code);}});
      if(valid(t)){controls=c;setupTorch(v,t);status('Hold the barcode inside the camera view. It scans automatically.');}else c.stop();
    }
  }catch(e){if(valid(t)){stop();status(e.name==='NotAllowedError'?'Camera permission was denied. Allow it in browser settings or enter the values manually.':e.name==='NotFoundError'?'No camera found. You can enter the values manually.':e.message,true);}}
  finally{if($('scanCamera'))$('scanCamera').disabled=false;}}
  async function captureLabel(){
    const v=$('scanVideo'),button=$('scanCapture');
    if(button?.disabled)return;
    if(!v?.videoWidth||!v.srcObject){status('Start the camera and wait for the picture before capturing.',true);return;}
    if($('scanTorch')?.disabled){status('Wait for the camera light to finish changing, then take the photo.');return;}
    const t=epoch;button.disabled=true;let canvas=null;
    try{
      await withPhotoLight(t,()=>{
        canvas=document.createElement('canvas');
        const r=v.getBoundingClientRect(),scale=Math.max(r.width/v.videoWidth,r.height/v.videoHeight),visibleW=r.width/scale,visibleH=r.height/scale;
        canvas.width=Math.round(visibleW*.84);canvas.height=Math.round(visibleH*.84);
        canvas.getContext('2d').drawImage(v,(v.videoWidth-visibleW)/2+visibleW*.08,(v.videoHeight-visibleH)/2+visibleH*.08,visibleW*.84,visibleH*.84,0,0,canvas.width,canvas.height);
      });
      if(!valid(t)||!canvas)return;
      canvas.toBlob(blob=>{if(!valid(t))return;if(blob)photo(new File([blob],'nutrition-label.jpg',{type:'image/jpeg'}),'label');else{status('Could not capture the picture. Try again.',true);button.disabled=false;}},'image/jpeg',0.95);
    }catch{if(valid(t)){status('Could not capture the picture. Try again.',true);button.disabled=false;}}
  }
  async function photo(file,mode){if(!file)return;stop();const t=epoch;if(file.size>12*1024*1024||!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type)){status('Choose a JPG, PNG or WebP photo up to 12 MB. If HEIC will not open, use a screenshot.',true);return;}status(mode==='barcode'?'Reading barcode…':'Reading the label on your device…');try{const image=new Image();photoURL=URL.createObjectURL(file);image.src=photoURL;await image.decode();if(!valid(t))return;const canvas=document.createElement('canvas'),scale=Math.min(1,3200/Math.max(image.width,image.height));canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
      if(mode==='barcode'){await script('/assets/scanner/zxing.min.js','ZXingBrowser');if(!valid(t))return;const r=new ZXingBrowser.BrowserMultiFormatReader();const result=await r.decodeFromImageUrl(canvas.toDataURL('image/png'));if(valid(t))await lookup(result.getText());}
      else{labelCanvas=canvas;await script('/assets/scanner/tesseract.min.js','Tesseract');if(!valid(t))return;const w=await Tesseract.createWorker('eng',1,{workerPath:'/assets/scanner/worker.min.js',corePath:'/assets/scanner',langPath:'/assets/scanner',workerBlobURL:false,logger:m=>{if(valid(t)&&m.status==='recognizing text')status('Reading label… '+Math.round(m.progress*100)+'%');}});if(!valid(t)){await w.terminate();return;}worker=w;const result=await LabelReader.read(w,canvas,{active:()=>valid(t),retrying:()=>status('Taking another look at the label…')});await w.terminate();worker=null;if(valid(t)&&result){const draft=FoodScan.parseLabel(result.text);draft.weakRead=!result.readable;draft.issues=result.issues||[];draft.previewImage=canvas.toDataURL("image/jpeg",0.85);review(draft);if(!Object.keys(draft.values).length&&!SupplementScan.parse(draft.text).ingredients.length)status('No clear nutrition amounts were found. You can enter them below or try a sharper photo.',true);}}
    }catch(e){if(valid(t))status(mode==='barcode'?'Could not read a barcode. Try a clearer photo or type its digits.':'Could not read this image. Try a clearer JPG/PNG photo, or enter the label values yourself.',true);}}
  function openMode(mode){context.mode=mode;frame(mode==='barcode'?'Scan a barcode':'Scan a nutrition label');$('scanBody').innerHTML=mode==='barcode'?`<p class="scan-lead">Find a packaged food, then check it before adding.</p><video id="scanVideo" playsinline muted hidden></video><button type="button" class="scan-primary" id="scanCamera">Start camera</button><label class="scan-upload">Use a barcode photo<input id="scanPhoto" type="file" accept="image/*" capture="environment"></label><form id="scanCodeForm"><label>Or type the barcode<input id="scanCode" inputmode="numeric" autocomplete="off" maxlength="20" placeholder="Numbers under the barcode" required></label><button type="submit" id="scanLookup">Find product</button></form><p class="scan-hint">Camera frames stay on your device. Only the barcode is sent to Open Food Facts for lookup.</p><div class="scan-actions"><button type="button" id="scanSwitch">Scan a nutrition label instead</button><button type="button" id="scanManual">Enter values myself</button></div>`:`<p class="scan-lead">Fit the nutrition table and serving size inside the frame. Keep the bottle straight and avoid glare.</p><div class="scan-camera-view" id="scanCameraView" hidden><video id="scanVideo" playsinline muted hidden></video><div class="scan-camera-guide" aria-hidden="true"></div></div><div class="scan-actions"><button type="button" class="scan-primary" id="scanCamera">Start camera</button><button type="button" class="scan-primary" id="scanCapture" hidden>Take photo</button></div><label class="scan-upload">Choose a label photo<input id="scanPhoto" type="file" accept="image/*" capture="environment"></label><p class="scan-hint">English labels · read on your device. Your photo is not uploaded or saved. The first scan downloads the reader; it may take a moment.</p><div class="scan-actions"><button type="button" id="scanManual">Enter values myself</button><button type="button" id="scanSwitch">Scan a barcode instead</button></div>`;
    const flash=document.createElement('button');flash.type='button';flash.id='scanTorch';flash.hidden=true;flash.textContent='Flash off';flash.setAttribute('aria-pressed','false');$('scanCamera').after(flash);
    $('scanPhoto').onchange=e=>photo(e.target.files[0],mode);$('scanManual').onclick=()=>review(FoodScan.parseLabel(''));$('scanSwitch').onclick=()=>openMode(mode==='barcode'?'label':'barcode');$('scanCamera').onclick=()=>camera(mode);if(mode==='label'){$('scanCapture').onclick=captureLabel;camera('label');}if(mode==='barcode'){$('scanCodeForm').onsubmit=e=>{e.preventDefault();lookup($('scanCode').value);};}$('scanClose').focus();
  }
  document.querySelectorAll('[data-food-scan]').forEach(b=>b.addEventListener('click',()=>{opener=b;context={owner:store.owner,date:activeLogDay().date,meal:currentMeal,mode:b.dataset.foodScan};if(!dialog.open)dialog.showModal();openMode(context.mode);}));
  dialog.addEventListener('close',()=>{stop();labelCanvas=null;dialog.innerHTML='';opener?.focus();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&!$('scanReview')){stop();if(dialog.open)status('Scanner paused. Restart the camera to continue.');}});
  window.addEventListener('pagehide',stop);
  new MutationObserver(()=>{if(dialog.open&&(store.owner!==context?.owner||document.body.dataset.view!==(context?.mode==='portion'?context.view:'day')))dialog.close();}).observe(document.body,{attributes:true,attributeFilter:['class','data-view']});
})();
