import { db, $ } from './shared.js?v=20261127-tiers';

const query=new URLSearchParams(location.search);
const legacyId=query.get('id');
let number=query.get('number')||'';
let token=new URLSearchParams(location.hash.slice(1)).get('key')||'';
const statuses={pending:'بانتظار الدفع أو التحقق من التحويل',paid:'تم تأكيد الدفع',preparing:'قيد التجهيز',ready:'جاهز للتسليم',fulfilled:'تم التسليم',cancelled:'الطلب ملغى'};
const money=(fils)=>(Number(fils||0)/1000).toFixed(3).replace(/\.000$/,'')+' د.أ';
const historyKey='tamm_order_access_v1';
const safeUrl=(page)=>{const url=new URL(page,location.href);url.searchParams.set('number',number);url.hash=new URLSearchParams({key:token}).toString();return url.href;};

function readSavedOrders(){try{const rows=JSON.parse(localStorage.getItem(historyKey)||'[]'),now=Date.now(),valid=rows.filter(x=>x&&x.expires>now&&/^[0-9]{6,20}$/.test(x.number)&&/^[0-9a-f]{64}$/.test(x.token));localStorage.setItem(historyKey,JSON.stringify(valid));return valid;}catch{return[];}}
function rememberOrder(code,secret){try{const rows=readSavedOrders().filter(x=>x.number!==code);rows.unshift({number:code,token:secret,expires:Date.now()+30*24*60*60*1000});localStorage.setItem(historyKey,JSON.stringify(rows.slice(0,50)));}catch{}}

function drawTimeline(events=[]){
  const labels={order_received:'تم استلام الطلب',payment_submitted:'تم إرسال إثبات التحويل للمراجعة',paid:'تم تأكيد الدفع',preparing:'بدأ تجهيز الطلب',ready:'الطلب جاهز للتسليم',fulfilled:'تم التسليم',cancelled:'تم إلغاء الطلب'};
  const time=(value)=>new Intl.DateTimeFormat('ar-JO',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Amman'}).format(new Date(value));
  const steps=events.filter((event)=>labels[event.event_key]&&event.created_at);
  $('timeline').replaceChildren(...steps.map((event,index)=>{const li=document.createElement('li');li.className=index===steps.length-1?'current':'done';const date=document.createElement('time');date.dateTime=event.created_at;date.textContent=time(event.created_at);li.append(document.createTextNode(`${labels[event.event_key]} — `),date);return li;}));
  if(!steps.length){const li=document.createElement('li');li.textContent='سجل المراحل غير متاح لهذا الطلب السابق.';$('timeline').append(li);}
}

function statusLabel(status,paymentSubmitted){
  const current=status==='cancelled'?'الطلب ملغى':status==='pending'&&paymentSubmitted?'بانتظار التحقق من التحويل':statuses[status]||'قيد المراجعة';
  $('orderStatus').textContent=current;
}

function showOrder(order,access={}){
  $('result').hidden=false;$('message').textContent='';
  $('serviceTitle').textContent=order.service_title||'طلب تمّ';
  $('shownNumber').textContent=order.tracking_number||'طلب سابق';
  $('orderPrice').textContent=`قيمة الطلب: ${money(order.price_fils)}${order.discount_fils?` — الخصم: ${money(order.discount_fils)}`:''}`;
  $('orderDate').textContent=order.created_at?`تاريخ الطلب: ${new Intl.DateTimeFormat('ar-JO',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Amman'}).format(new Date(order.created_at))} (توقيت الأردن)`:'';
  statusLabel(order.status,order.payment_submitted);
  drawTimeline(access.events||[]);
  $('resume').hidden=true;$('delivery').hidden=true;
  if(order.status==='pending'&&!order.payment_submitted){$('resume').href=access.legacy?`order.html?order=${encodeURIComponent(legacyId)}`:`order.html?tracking=${encodeURIComponent(number)}#key=${encodeURIComponent(token)}`;$('resume').hidden=false;}
  if(['paid','preparing','ready','fulfilled'].includes(order.status)&&access.ready){$('delivery').href=access.legacy?`delivery.html?id=${encodeURIComponent(legacyId)}`:safeUrl('delivery.html');$('delivery').hidden=false;}
}

async function lookupLegacy(){
  const {data,error}=await db.rpc('get_guest_order_summary',{p_order:legacyId});
  const order=data?.[0];if(error||!order){$('message').textContent='تعذر العثور على الطلب السابق.';return;}
  let ready=false;
  if(['paid','preparing','ready','fulfilled'].includes(order.status)){const generated=await db.rpc('get_generated_document',{p_order:legacyId});ready=!generated.error&&!!generated.data?.length;}
  showOrder({...order,service_title:order.service_id,tracking_number:'—'}, {legacy:true,ready,events:[]});
}

async function lookupSecure(){
  const inputNumber=$('orderNumber').value.trim(),inputToken=($('accessKey').value||token).trim().toLowerCase();
  if(!/^[0-9]{6,20}$/.test(inputNumber)||!/^[0-9a-f]{64}$/.test(inputToken)){
    $('message').textContent='أدخل رقم التتبع ورمز الوصول الموجود في الرابط الآمن.';return;
  }
  const button=$('submitTrack');button.disabled=true;
  try{
    const {data,error}=await db.rpc('get_guest_order_summary_v3',{p_tracking_number:inputNumber,p_access_token:inputToken});
    const order=data?.[0];if(error||!order){$('result').hidden=true;$('message').textContent='لم يتم العثور على الطلب أو تعذر التحقق من رابط الوصول.';return;}
    number=order.tracking_number;token=inputToken;
    rememberOrder(number,token);
    $('orderNumber').value=number;$('accessKey').value='';$('keyField').hidden=true;
    history.replaceState(null,'',`track.html?number=${encodeURIComponent(number)}#key=${encodeURIComponent(token)}`);
    let ready=false;
    if(['paid','preparing','ready','fulfilled'].includes(order.status)){const generated=await db.rpc('get_generated_document_v3',{p_tracking_number:number,p_access_token:token});ready=!generated.error&&!!generated.data?.length;}
    const {data:events}=await db.rpc('get_guest_order_timeline_v3',{p_tracking_number:number,p_access_token:token});
    showOrder(order,{ready,events:events||[]});
  } finally {button.disabled=false;}
}

async function renderSavedOrders(){
  $('trackForm').hidden=true;$('myOrders').hidden=false;
  const saved=readSavedOrders();
  if(!saved.length){$('myOrdersList').textContent='لا توجد طلبات محفوظة على هذا الجهاز بعد. احتفظ برابط الوصول الآمن بعد إنشاء الطلب.';return;}
  const rows=await Promise.all(saved.map(async(item)=>{const {data,error}=await db.rpc('get_guest_order_summary_v3',{p_tracking_number:item.number,p_access_token:item.token});return error?null:{saved:item,order:data?.[0]};}));
  const visible=rows.filter(x=>x?.order);
  if(!visible.length){$('myOrdersList').textContent='تعذر استرجاع الطلبات المحفوظة. افتح رابط الوصول الآمن الأصلي للتحقق.';return;}
  $('myOrdersList').replaceChildren(...visible.map(({saved,order})=>{const article=document.createElement('article');article.className='history-row';const title=document.createElement('strong');title.textContent=`${order.service_title} — ${saved.number}`;const details=document.createElement('p');details.textContent=`${statuses[order.status]||order.status} — ${money(order.price_fils)}`;const link=document.createElement('a');link.href=`track.html?number=${encodeURIComponent(saved.number)}#key=${encodeURIComponent(saved.token)}`;link.textContent='فتح تفاصيل الطلب';const remove=document.createElement('button');remove.type='button';remove.textContent='إزالة من هذا الجهاز';remove.onclick=()=>{const next=readSavedOrders().filter(x=>x.number!==saved.number);localStorage.setItem(historyKey,JSON.stringify(next));renderSavedOrders();};article.append(title,details,link,remove);return article;}));
}

if(query.get('view')==='mine')await renderSavedOrders();
else if(legacyId){$('trackForm').hidden=true;await lookupLegacy();}
else{
  $('orderNumber').value=number;
  if(token)$('keyField').hidden=true;
  $('trackForm').onsubmit=async(event)=>{event.preventDefault();await lookupSecure();};
  if(number&&token)await lookupSecure();
}

$('share').onclick=async()=>{
  const url=safeUrl('track.html');
  try{if(navigator.share)await navigator.share({title:'طلب تمّ',text:`تتبع الطلب ${number}`,url});else{await navigator.clipboard.writeText(url);$('message').textContent='تم نسخ رابط المتابعة الآمن.';}}
  catch(error){if(error.name!=='AbortError')$('message').textContent='تعذر مشاركة الرابط. استخدم خيار النسخ أو احفظ الرابط الحالي.';}
};
