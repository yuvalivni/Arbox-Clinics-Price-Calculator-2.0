(()=>{
'use strict';
const $=id=>document.getElementById(id);
const cfg=window.ARBOX_INTEGRATION||{};
const base=String(cfg.apiBase||'').replace(/\/+$/,'');
const clientId=String(cfg.googleClientId||'').trim();
let idToken='',sellerEmail='',contact=null,saved=null,busy=false,previewKey=null;
const message=(text,type='')=>{const el=$('arboxIntMessage');el.textContent=text;el.className='arbox-int-message '+type;};
const errString=e=>e&&e.message?e.message:String(e);
const isConfigured=!!(base&&clientId&&base.startsWith('https://'));
const euro=x=>Number(String(x||'').replace(/[^\d.-]/g,''))||0;
function currentEmail(){return $('arboxIntEmail').value.trim().toLowerCase();}
function refresh(){
 const authenticated=!!sellerEmail,matched=!!contact,approved=$('arboxIntApproved').checked;
 $('arboxIntFind').disabled=busy||!authenticated;
 $('arboxIntApproved').disabled=busy||!matched;
 $('arboxIntSave').disabled=busy||!approved||!matched||!!saved;
 $('arboxIntMail').disabled=busy||!saved||saved.status==='sent';
 $('arboxIntWhatsapp').disabled=busy||!saved;
 $('arboxIntAuthInfo').textContent=sellerEmail?'מחובר: '+sellerEmail:'טרם התחברת לחשבון ארגוני';
 if(saved&&saved.recordUrl){$('arboxIntContact').innerHTML=`ההצעה שמורה ב־HubSpot. <a href="${saved.recordUrl}" target="_blank" rel="noopener noreferrer">פתח Contact</a>`;}
}
function makeUuid(){
 if(typeof crypto.randomUUID==='function')return crypto.randomUUID();
 const b=new Uint8Array(16);crypto.getRandomValues(b);b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;
 const h=[...b].map(n=>n.toString(16).padStart(2,'0')).join('');
 return [h.slice(0,8),h.slice(8,12),h.slice(12,16),h.slice(16,20),h.slice(20)].join('-');
}
function resetForPreview(){
 previewKey=makeUuid();contact=null;saved=null;
 $('arboxIntEmail').value=($('quoteEmail')?.value||'').trim();
 $('arboxIntPhone').value='';$('arboxIntApproved').checked=false;$('arboxIntContact').textContent='';
 message(isConfigured?'יש לאתר Contact לפי כתובת המייל, לבדוק את ההצעה ולאשר לפני שמירה או שליחה.':'הדפסה ל־PDF זמינה. החיבור ל־HubSpot עדיין אינו פעיל: יש להגדיר config.js ואת השרת המאובטח.');
 refresh();
}
async function api(path, options={}){
 if(!isConfigured)throw Error('לא הוגדר חיבור Backend מאובטח. לא נעשה שום שינוי ב־HubSpot.');
 if(!idToken)throw Error('נדרשת התחברות לחשבון Google ארגוני');
 const r=await fetch(base+path,{method:options.method||'GET',headers:{Authorization:'Bearer '+idToken,...(options.body?{'Content-Type':'application/json'}:{})},body:options.body?JSON.stringify(options.body):undefined});
 const data=await r.json().catch(()=>({}));
 if(!r.ok)throw Error(data.error||`שגיאת חיבור ${r.status}`);
 return data;
}
async function lookup(){
 if(!/^\S+@\S+\.\S+$/.test(currentEmail()))return message('יש להזין כתובת מייל תקינה של הלקוח.','error');
 busy=true;refresh();message('מחפש Contact לפי כתובת המייל ב־HubSpot...');
 try{
  const c=await api('/api/contacts/find',{method:'POST',body:{email:currentEmail()}});
  if(currentEmail()!==c.email.toLowerCase())throw Error('נמצאה אי־התאמה בכתובת המייל.');
  contact=c;saved=null;$('arboxIntApproved').checked=false;
  if(c.phone)$('arboxIntPhone').value=c.phone;
  $('arboxIntContact').innerHTML=`נמצא: <strong>${escapeHtml(c.name||c.email)}</strong> · <a target="_blank" rel="noopener noreferrer" href="${c.recordUrl}">פתח Contact ב־HubSpot</a>`;
  message('נמצאה רשומה תואמת. ודא שהשם וההצעה נכונים, וסמן אישור לשליחה.','success');
 }catch(e){contact=null;saved=null;$('arboxIntContact').textContent='';message(errString(e),'error');}
 finally{busy=false;refresh();}
}
function escapeHtml(v){return String(v).replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[s]));}
function pdfHtml(){
 const styles=[...document.querySelectorAll('style')].map(s=>s.textContent).join('\n');
 const html=$('proposalSheet').outerHTML;
 return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><style>${styles}</style><style>body{background:#fff;margin:0}#proposalSheet{max-width:none;box-shadow:none;padding:0}</style></head><body>${html}</body></html>`;
}
function amounts(){
 return {system:euro($('packagePrice').textContent)+euro($('branchesPrice').textContent),users:euro($('usersPrice').textContent),monthly:euro($('monthly').textContent),oneTime:euro($('oneTime').textContent)};
}
async function save(){
 if(!contact||!$('arboxIntApproved').checked)return message('יש להתאים Contact ולאשר את ההצעה.','error');
 if(currentEmail()!==contact.email.toLowerCase())return message('כתובת המייל השתנתה מאז הבדיקה. חפש מחדש את ה־Contact.','error');
 if(!window.confirm('לשמור את גרסת ה־PDF הנוכחית ב־HubSpot בכרטיס '+contact.name+'? פעולה זו אינה שולחת הודעה ללקוח.'))return;
 busy=true;refresh();message('מכין PDF ושומר אותו ב־HubSpot. לא נשלח עדיין ללקוח...');
 try{
  const r=await api('/api/proposals',{method:'POST',body:{proposalId:previewKey,clientName:$('client').value,recipientEmail:contact.email,approved:true,amounts:amounts(),html:pdfHtml()}});
  saved={...r,email:contact.email};
  message('ההצעה נשמרה בכרטיס ה־Contact ב־HubSpot. כעת אפשר לשלוח אותה במייל או לשתף בוואטסאפ.','success');
 }catch(e){message(errString(e),'error');}
 finally{busy=false;refresh();}
}
async function mail(){
 if(!saved)return;
 if(!window.confirm(`לשלוח את הצעת המחיר המצורפת ב־PDF אל ${saved.email} מחשבון Gmail המורשה?`))return;
 busy=true;refresh();message('מבצע שליחת מייל...');
 try{
  const r=await api('/api/proposals/'+encodeURIComponent(saved.id)+'/email',{method:'POST',body:{confirmed:true,recipientEmail:saved.email}});
  if(!r.sent)throw Error('לא התקבל אישור שליחה מ־Gmail.');
  saved.status='sent';message('Gmail אישר את שליחת ההצעה אל '+r.recipient+' (מזהה: '+r.messageId+').','success');
 }catch(e){message(errString(e)+'\nאם מצב השליחה אינו ודאי, בדוק את Sent לפני ניסיון חוזר.','error');}
 finally{busy=false;refresh();}
}
async function whatsapp(){
 if(!saved)return;
 const phone=$('arboxIntPhone').value.trim();
 if(!phone)return message('נא להזין מספר וואטסאפ של הלקוח.','error');
 // Open synchronously from the user click to avoid popup blockers.
 const popup=window.open('about:blank','_blank');
 busy=true;refresh();message('מכין קישור פרטי להצעת המחיר...');
 try{
  const r=await api('/api/proposals/'+encodeURIComponent(saved.id)+'/whatsapp?phone='+encodeURIComponent(phone));
  if(popup)popup.location.href=r.whatsappUrl;
  else{$('arboxIntContact').innerHTML+=`<br><a href="${r.whatsappUrl}" target="_blank" rel="noopener noreferrer">פתח WhatsApp לשליחה</a>`;}
  message('WhatsApp נפתח עם הודעה וקישור להצעה (תקף 7 ימים). יש ללחוץ שליחה ב־WhatsApp — פתיחת הצ׳אט אינה שולחת הודעה.','success');
 }catch(e){if(popup)popup.close();message(errString(e),'error');}
 finally{busy=false;refresh();}
}
function initGoogle(){
 if(!isConfigured)return;
 const script=document.createElement('script');script.async=true;script.defer=true;script.src='https://accounts.google.com/gsi/client';
 script.onload=()=>{
  try{
   google.accounts.id.initialize({client_id:clientId,callback:async({credential})=>{
    idToken=credential;sellerEmail='';
    try{const me=await api('/api/me');sellerEmail=me.email;message('התחברת בהצלחה לחשבון '+me.email+'. כעת אפשר לחפש Contact.','success');}
    catch(e){idToken='';message(errString(e),'error');}refresh();
   }});
   google.accounts.id.renderButton($('arboxIntGoogle'),{type:'standard',size:'medium',theme:'outline',text:'signin_with',locale:'he'});
  }catch(e){message('לא ניתן לטעון התחברות Google: '+errString(e),'error');}
 };
 script.onerror=()=>message('לא ניתן לטעון את שירות ההתחברות של Google.','error');
 document.head.appendChild(script);
}
function mount(){
 const modal=$('proposalModal');if(!modal||!$('proposalSheet'))return;
 const section=document.createElement('section');section.id='arboxIntegration';
 section.innerHTML=`
 <div class="arbox-int-heading"><strong>שיתוף הצעה ושמירה ב־HubSpot</strong><small>שליחה רק לאחר בדיקת ההצעה ואישור ידני</small></div>
 <p class="arbox-int-note">חיפוש Contact מתבצע לפי כתובת מייל מדויקת. שמירת PDF בכרטיס הלקוח אינה שולחת אותו אוטומטית. שליחה בוואטסאפ מתבצעת מתוך WhatsApp לאחר לחיצה של איש המכירות.</p>
 <div class="arbox-auth"><div id="arboxIntGoogle"></div><span id="arboxIntAuthInfo">טרם התחברת לחשבון ארגוני</span></div>
 <div class="arbox-int-grid">
  <label>כתובת המייל של הלקוח<input type="email" id="arboxIntEmail" autocomplete="off" placeholder="customer@example.com"></label>
  <label>טלפון לוואטסאפ (אופציונלי)<input type="tel" id="arboxIntPhone" autocomplete="off" placeholder="050-1234567"></label>
  <button type="button" id="arboxIntFind">חפש Contact</button>
 </div>
 <div class="arbox-int-contact" id="arboxIntContact"></div>
 <label class="arbox-int-approved"><input id="arboxIntApproved" type="checkbox"> בדקתי את ההצעה המלאה, המחירים, הנמען והנתונים, ואני מאשר/ת לשמור ולשלוח אותה ללקוח.</label>
 <div class="arbox-int-buttons">
  <button type="button" id="arboxIntSave" class="arbox-primary">1. שמור PDF ב־HubSpot</button>
  <button type="button" id="arboxIntMail">2. שלח ללקוח במייל</button>
  <button type="button" id="arboxIntWhatsapp">2. פתח WhatsApp לשליחה</button>
 </div>
 <div class="arbox-int-message" id="arboxIntMessage" role="status" aria-live="polite"></div>`;
 $('proposalSheet').before(section);
 const css=document.createElement('link');css.rel='stylesheet';css.href='./frontend-integration.css';document.head.appendChild(css);
 $('arboxIntFind').addEventListener('click',lookup);
 $('arboxIntSave').addEventListener('click',save);
 $('arboxIntMail').addEventListener('click',mail);
 $('arboxIntWhatsapp').addEventListener('click',whatsapp);
 $('arboxIntApproved').addEventListener('change',refresh);
 $('arboxIntEmail').addEventListener('input',()=>{contact=null;saved=null;$('arboxIntApproved').checked=false;$('arboxIntContact').textContent='';refresh();});
 const observer=new MutationObserver(()=>{if(!$('proposalModal').hidden && $('proposalSheet').children.length)resetForPreview();});
 observer.observe($('proposalSheet'),{childList:true});
 resetForPreview();initGoogle();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();
