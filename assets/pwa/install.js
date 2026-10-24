(() => {
 const share='<svg class="share-symbol" viewBox="0 0 20 24" aria-hidden="true"><path d="M10 15V2m-4 4 4-4 4 4M5 10H2v12h16V10h-3"/></svg>';
 function detectInstallDevice(nav) {
  const ua = nav.userAgent || '';
  if (/Android/i.test(ua) || nav.userAgentData?.platform === 'Android') return 'android';
  if (/iPad/i.test(ua) || (/Macintosh/i.test(ua) && nav.maxTouchPoints > 1) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1)) return 'ipad';
  if (/iPhone|iPod/i.test(ua)) return 'iphone';
  return 'desktop';
 }
 // Browser identification is advisory: embedded browsers can disguise their user agent.
 function detectAppleInstallBrowser(nav) {
  const ua=nav.userAgent||'';
  if (/FBAN|FBAV|Instagram|Line\/|MicroMessenger|TikTok/i.test(ua)) return 'embedded';
  if (/CriOS\//i.test(ua)) return 'chrome';
  if (/FxiOS|EdgiOS|OPiOS|DuckDuckGo|GSA\//i.test(ua)) return 'other';
  return /Version\/.*Safari\//i.test(ua)?'safari':'embedded';
 }
 const actualDevice=detectInstallDevice(navigator);
 const appleBrowser=detectAppleInstallBrowser(navigator);
 const icon='/assets/favicon.svg';
 const card=(id,dismiss=false)=>`<aside class="install-card" id="${id}" aria-label="Install Aminodata"><img src="${icon}" alt=""/><div class="install-card-copy"><strong>Your diary. One tap away.</strong><p>Add Aminodata to your home screen.</p></div><button type="button" data-open-install>Install Aminodata</button>${dismiss?'<button type="button" class="install-dismiss" aria-label="Dismiss installation suggestion">×</button>':''}</aside>`;
 (document.querySelector('.home-install-slot') || document.querySelector('.land-benefits')).insertAdjacentHTML('afterend',card('homeInstallCard'));
 const menuButton='<button type="button" data-open-install class="install-menu-button"><svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M5 16v5h14v-5"/></svg><span class="nav-text">Install Aminodata</span></button>';
 document.querySelector('#appSidebar nav').insertAdjacentHTML('beforeend',menuButton);
 document.querySelector('#mobileMore .mobile-more-label').insertAdjacentHTML('beforebegin',menuButton);
 document.body.insertAdjacentHTML('beforeend',`<dialog class="install-dialog" id="installDialog" aria-labelledby="installTitle" aria-describedby="installIntro"><button type="button" class="install-dialog-close" aria-label="Close installation guide">×</button><div class="install-dialog-main"><div class="install-content"><p class="install-eyebrow">Aminodata, closer to hand</p><h2 id="installTitle">A home for your<br>daily habits.</h2><p class="install-intro" id="installIntro">Add Aminodata to your home screen.<br>Your food diary is always a tap away.</p><p class="install-device-label" id="installDeviceLabel"></p><div id="installInstructions" role="region" aria-labelledby="installDeviceLabel"></div><button type="button" class="install-native" id="nativeInstall" hidden>Install Aminodata</button><p class="install-status" id="installStatus" role="status"></p><p class="install-footnote">Free to install. Use your existing Aminodata account.<br>Internet connection required.</p><button type="button" class="install-later" id="installLater">Maybe later</button></div><div class="install-art" aria-hidden="true"><div class="preview-phone"><div class="phone-island"></div><div class="phone-clock">9:41</div><div class="phone-icons"><i></i><i></i><i></i><i></i><div class="phone-app"><img src="${icon}" alt=""/><small>Aminodata</small></div><i></i><i></i><i></i><i></i></div><div class="phone-dock"><i></i><i></i><i></i></div></div><p class="install-art-copy">Less searching.<br>More showing up.<small>Your diary, on your home screen.</small></p></div></div></dialog>`);
 const dialog=document.getElementById('installDialog'),native=document.getElementById('nativeInstall'),status=document.getElementById('installStatus');
 let deferredPrompt=null,currentDevice=actualDevice,returnFocus=null;
 const instructions={
  iphone:[['Tap Share '+share,'Open the browser’s Share menu.'],['Choose “Add to Home Screen”','Scroll through the Share menu to find it.'],['Tap Add','If shown, leave “Open as Web App” switched on.']],
  ipad:[['Tap Share '+share,'Open the browser’s Share menu.'],['Choose “Add to Home Screen”','Scroll through the Share menu to find it.'],['Tap Add','If shown, leave “Open as Web App” switched on.']],
  android:[['Open Aminodata in Chrome','On your Android phone, visit aminodata.org.'],['Choose “Install app”','Find it in Chrome’s ⋮ menu, or use the install prompt when offered.'],['Confirm Install','The Aminodata icon will appear on your home screen or in your app list.']],
  desktop:[['Open Aminodata in Chrome or Edge','Visit aminodata.org in your usual browser.'],['Choose the install option','Look for Install in the address bar or browser menu.'],['Confirm and open Aminodata','It opens in its own window. On a Mac using Safari, choose File → Add to Dock.']]
 };
 function device(key){
  currentDevice=key;
  const names={iphone:'iPhone',ipad:'iPad',android:'Android',desktop:'computer'};
  document.getElementById('installDeviceLabel').textContent='Install on your '+names[key];
  document.getElementById('installIntro').innerHTML=key==='desktop'?'Keep your food diary close at hand.<br>Open Aminodata in its own window.':'Add Aminodata to your home screen.<br>Your food diary is always a tap away.';
  const panel=document.getElementById('installInstructions');
  const apple=['iphone','ipad'].includes(key);
  const needsSafari=apple && !['safari','chrome'].includes(appleBrowser);
  const safariHelp=apple && appleBrowser!=='safari'?`<div class="install-browser-help"><p>${needsSafari?'Open Aminodata in Safari, then follow these steps.':'You can install directly from Chrome’s Share menu, or open Safari instead.'}</p><div class="install-browser-actions"><a class="install-safari" href="x-safari-https://www.aminodata.org/" aria-describedby="installSafariHelp">Open in Safari</a><button type="button" class="install-copy">Copy link</button></div><p id="installSafariHelp">If Safari doesn’t open, copy the link and paste it into Safari. You may need to sign in again.</p><p class="install-copy-status" role="status"></p></div>`:'';
  panel.innerHTML=safariHelp+'<ol class="install-steps">'+instructions[key].map(([title,desc],i)=>`<li><span class="install-step-number">${i+1}</span><div><strong>${title}</strong><p>${desc}</p></div></li>`).join('')+'</ol>';
  panel.querySelector('.install-copy')?.addEventListener('click',async()=>{
   const copyStatus=panel.querySelector('.install-copy-status');
   try {
    await navigator.clipboard.writeText('https://www.aminodata.org/');
    copyStatus.textContent='Link copied. Open Safari and paste it into the address bar.';
   } catch {
    copyStatus.textContent='Open Safari and type aminodata.org into the address bar.';
   }
  });
  // Safari’s custom scheme is a best-effort handoff, not a standard web API.
  // Keep the visible copy fallback; no timer can reliably detect a successful app switch.
  native.hidden=!deferredPrompt||['iphone','ipad'].includes(key)||key!==actualDevice;
  status.textContent='';
 }
 function open(){
  if(dialog.open)return;
  returnFocus=document.activeElement;
  if(!document.getElementById('mobileMore').hidden){document.getElementById('mobileMore').hidden=true;document.getElementById('mobileMoreToggle').setAttribute('aria-expanded','false');returnFocus=document.getElementById('mobileMoreToggle');}
  device(actualDevice);dialog.showModal();
 }
 document.querySelectorAll('[data-open-install]').forEach(b=>b.addEventListener('click',open));
 document.getElementById('installLater').addEventListener('click',()=>dialog.close());
 device(actualDevice);
 dialog.querySelector('.install-dialog-close').addEventListener('click',()=>dialog.close());dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});dialog.addEventListener('close',()=>{rememberPrompt();returnFocus?.focus();});
 window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;device(currentDevice);});
 native.addEventListener('click',async()=>{if(!deferredPrompt)return;const prompt=deferredPrompt;deferredPrompt=null;native.hidden=true;try{await prompt.prompt();const choice=await prompt.userChoice;status.textContent=choice.outcome==='accepted'?'Installation requested. Your browser will finish setting it up.':'No problem. You can install Aminodata whenever you’re ready.';}catch{status.textContent='Use your browser’s installation option to continue.';}});
 window.addEventListener('appinstalled',()=>{try{localStorage.setItem('aa_install_completed','1');}catch{}deferredPrompt=null;native.hidden=true;status.textContent='Aminodata is installed. Look for its icon on your device.';document.querySelectorAll('.install-card,.install-menu-button').forEach(c=>c.hidden=true);});
 if(matchMedia('(display-mode: standalone)').matches||navigator.standalone)document.querySelectorAll('.install-card,.install-menu-button').forEach(c=>c.hidden=true);
 // Prompt only in the signed-in diary, with a seven-day cooldown on this device.
 function shouldPromptInstall({signedIn,diary,installed,lastShown,now}){
  return signedIn && diary && !installed && (!lastShown || now-lastShown>=7*24*60*60*1000);
 }
 let sessionLastShown=0;
 function rememberPrompt(){sessionLastShown=Date.now();try{localStorage.setItem('aa_install_last_shown',String(sessionLastShown));}catch{}}
 function eligible(){
  let lastShown=sessionLastShown,completed=false;
  try{lastShown=Number(localStorage.getItem('aa_install_last_shown'))||sessionLastShown;completed=localStorage.getItem('aa_install_completed')==='1';}catch{}
  return shouldPromptInstall({signedIn:document.body.classList.contains('authed'),diary:document.body.dataset.view==='day',installed:completed||matchMedia('(display-mode: standalone)').matches||!!navigator.standalone,lastShown,now:Date.now()});
 }
 let promptTimer,hasLoggedFood=false;
 window.addEventListener("aminodata:food-logged",()=>{hasLoggedFood=true;schedulePrompt();});
 function schedulePrompt(){
  clearTimeout(promptTimer);
  if(!document.body.classList.contains('authed') && dialog.open && returnFocus===document.body)dialog.close();
  if(!eligible()||!hasLoggedFood)return;
  promptTimer=setTimeout(()=>{
   const editing=document.activeElement?.matches('input,textarea,select,[contenteditable="true"]');
   if(!eligible()||editing||document.querySelector('dialog[open],.overlay:not([hidden])'))return;
   rememberPrompt();open();
  },3000);
 }
 new MutationObserver(schedulePrompt).observe(document.body,{attributes:true,attributeFilter:['class','data-view']});
 schedulePrompt();
})();
