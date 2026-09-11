const $=id=>document.getElementById(id);function toast(s){$('toast').textContent=s;$('toast').classList.add('show');setTimeout(()=>$('toast').classList.remove('show'),1800)}
function tick(){$('clock').textContent=new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}setInterval(tick,1000);tick();
function openSettings(){$('modal').classList.add('open')}function closeSettings(){$('modal').classList.remove('open')}
function saveGateway(){localStorage.gateway=$('gateway').value;$('wan').textContent=localStorage.gateway;toast('Gateway saved');closeSettings()}
if(localStorage.gateway)$('wan').textContent=localStorage.gateway;
if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js');