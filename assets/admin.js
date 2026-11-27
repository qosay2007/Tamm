import { db, $, say, tierNames } from './shared.js';

let orders = [];
let services = [];
let coupons = [];
let applications = [];
let withdrawals = [];
let marketersCount = 0;
const statuses = { pending:'قيد المراجعة', paid:'مدفوع', fulfilled:'مكتمل', cancelled:'ملغى' };
const money = (fils) => (Number(fils || 0) / 1000).toFixed(3).replace(/\.000$/, '') + ' د.أ';
const button = (text, onClick) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = text; b.onclick = onClick; return b; };

async function renderOrders() {
  const query = $('search').value.trim().toLocaleLowerCase();
  const visible = orders.filter((o) => [o.id,o.service_id,o.details?.name,o.details?.phone,o.payment_reference,o.coupon_code].some((v) => String(v || '').toLocaleLowerCase().includes(query))).slice(0,100);
  $('orders').replaceChildren(...await Promise.all(visible.map(async (order) => {
    const card = document.createElement('article'), p = document.createElement('p'), meta = document.createElement('p'), pay = document.createElement('p'), select = document.createElement('select'), actions = document.createElement('div');
    p.textContent = `${order.id} | ${order.service_id} | ${tierNames[order.package_tier] || tierNames.basic} | ${money(order.price_fils)}${order.discount_fils ? ` (خصم ${money(order.discount_fils)} — ${order.coupon_code || ''})` : ''}`;
    meta.textContent = `العميل: ${order.details?.name || '—'} | الهاتف: ${order.details?.phone || '—'} | التفاصيل: ${order.details?.text || '—'}`;
    pay.textContent = `حساب CliQ: ${order.cliq_account_id || '—'} | مرجع التحويل: ${order.payment_reference || 'لم يُرسل'}`;
    select.replaceChildren(...Object.entries(statuses).filter(([key]) => key === order.status || (order.status === 'pending' && ['paid','cancelled'].includes(key)) || (order.status === 'paid' && key === 'fulfilled')).map(([key,label]) => new Option(label,key,false,key === order.status)));
    actions.className = 'actions';
    if (order.status === 'pending' && order.payment_reference) actions.append(button('اعتماد التحويل بعد التحقق', async () => {
      if (!confirm(`تحقّق من وصول ${money(order.price_fils)} إلى الحساب المحدد ومن تطابق المرجع التالي قبل الاعتماد:\n${order.payment_reference}\n\nسيبدأ توليد التصميم آلياً بعد الاعتماد.`)) return;
      await updateOrder(order, 'paid');
    }));
    if (order.status === 'pending') actions.append(button(order.payment_reference ? 'رفض المرجع / إلغاء' : 'إلغاء الطلب', async () => {
      const prompt = order.payment_reference
        ? 'ألغِ الطلب فقط بعد التأكد من عدم وصول التحويل أو ردّ المبلغ للعميل. هل تأكدت؟'
        : 'تأكيد إلغاء الطلب؟';
      if (confirm(prompt)) await updateOrder(order,'cancelled');
    }));
    if (order.status === 'paid') actions.append(button('تأكيد اكتمال الطلب', async () => { if (confirm('تم تسليم التصميم للعميل؟')) await updateOrder(order,'fulfilled'); }));
    const files = Array.isArray(order.details?.attachments) ? order.details.attachments.slice(0,5) : [];
    const fileBox = document.createElement('div'); fileBox.className = 'actions';
    for (const file of files) {
      const { data, error } = await db.storage.from('tamm-order-files').createSignedUrl(file.path, 300);
      if (error || !data?.signedUrl) continue;
      const link = document.createElement('a'); link.href = data.signedUrl; link.target = '_blank'; link.rel = 'noopener'; link.textContent = 'ملف العميل: ' + (file.name || 'مرفق'); fileBox.append(link);
    }
    card.append(p,meta,pay,select,actions,fileBox); return card;
  })));
}

async function updateOrder(order, status) {
  const { error } = await db.from('orders').update({ status }).eq('id',order.id).eq('status',order.status).select('id').single();
  say(error ? `تعذر تحديث الطلب: ${error.message}` : (status === 'paid' ? 'تم اعتماد الدفع وبدء التوليد الآلي.' : 'تم تحديث حالة الطلب.'));
  await loadOrders(); await loadReports(); await loadQuickLinks();
}

const paidOrders = () => orders.filter((o) => ['paid','fulfilled'].includes(o.status));
const netAmount = (o) => Math.max(0, Number(o.price_fils || 0) - Number(o.discount_fils || 0));
const uniqueCustomers = () => new Set(orders.map((o) => String(o.details?.phone || '').trim()).filter(Boolean)).size;

function renderRevenueChart() {
  const svg = $('revenueChart'), ns = 'http://www.w3.org/2000/svg';
  const dayKey = (date) => new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Amman', year:'numeric', month:'2-digit', day:'2-digit' }).format(date);
  const todayKey=dayKey(new Date()),today=new Date(`${todayKey}T00:00:00Z`);
  const days = Array.from({length:7},(_,i)=>{const date=new Date(today);date.setUTCDate(date.getUTCDate()-6+i);return {date,key:dayKey(date),value:0};});
  for (const order of paidOrders()) { const day=days.find((item)=>item.key===dayKey(new Date(order.created_at))); if(day)day.value+=netAmount(order); }
  svg.replaceChildren();
  const add=(tag,attrs={},parent=svg)=>{const e=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,String(v));parent.append(e);return e;};
  const defs=add('defs'), gradient=add('linearGradient',{id:'revenueFill',x1:'0',x2:'0',y1:'0',y2:'1'},defs);
  add('stop',{offset:'0%','stop-color':'#eeb834','stop-opacity':'.43'},gradient);add('stop',{offset:'100%','stop-color':'#eeb834','stop-opacity':'.02'},gradient);
  const left=52,right=782,top=24,bottom=166,max=Math.max(1000,...days.map((d)=>d.value)),step=(right-left)/6;
  for(let i=0;i<5;i++){const y=top+(bottom-top)*i/4;add('line',{x1:left,y1:y,x2:right,y2:y,class:'chart-grid'});const label=add('text',{x:left-9,y:y+4,'text-anchor':'end'});label.textContent=i===4?'0':`${Math.round(max*(4-i)/4/1000)} د`;}
  const points=days.map((day,i)=>[left+i*step,bottom-(day.value/max)*(bottom-top)]),path=points.map(([x,y],i)=>`${i?'L':'M'}${x},${y}`).join(' ');
  add('path',{d:`${path} L${right},${bottom} L${left},${bottom} Z`,class:'chart-area'});add('path',{d:path,class:'chart-line'});
  days.forEach((day,i)=>{const [x,y]=points[i];add('circle',{cx:x,cy:y,r:6,class:'chart-dot'});const label=add('text',{x,y:195,'text-anchor':'middle'});label.textContent=new Intl.DateTimeFormat('ar-JO',{timeZone:'UTC',weekday:'short'}).format(day.date);});
  $('reportNote').textContent=`إيرادات مدفوعة ومعتمدة بعد الخصومات، من أحدث ${orders.length} طلب؛ التوقيت بتوقيت الأردن.`;
}

async function loadReports() {
  const [{ data: commissions }, { data: paidWithdrawals }] = await Promise.all([
    db.from('commissions').select('amount_fils'),
    db.from('withdrawals').select('amount_fils').eq('status','paid')
  ]);
  const paid = paidOrders(), revenue=paid.reduce((sum,o)=>sum+netAmount(o),0), conversion=orders.length?Math.round(paid.length/orders.length*1000)/10:0;
  const metrics=[
    ['العملاء',uniqueCustomers().toLocaleString('ar-JO'),'♟'],
    ['الطلبات',orders.length.toLocaleString('ar-JO'),'🛒'],
    ['إجمالي الإيرادات',money(revenue),'▣'],
    ['نسبة الدفع',`${conversion.toLocaleString('ar-JO')}%`,'▥']
  ];
  $('stats').replaceChildren(...metrics.map(([label,value,icon])=>{const box=document.createElement('div');box.className='stat';const symbol=document.createElement('span');symbol.className='stat-icon';symbol.textContent=icon;const copy=document.createElement('div');copy.className='stat-copy';const title=document.createElement('span');title.className='stat-label';title.textContent=label;const strong=document.createElement('strong');strong.textContent=value;const note=document.createElement('span');note.className='stat-delta';note.textContent='من أحدث الطلبات';copy.append(title,strong,note);box.append(symbol,copy);return box;}));
  const reportValues=[
    ['بانتظار الدفع',orders.filter((o)=>o.status==='pending').length],
    ['الطلبات المكتملة',orders.filter((o)=>o.status==='fulfilled').length],
    ['عمولات المسوقين',money((commissions||[]).reduce((sum,c)=>sum+Number(c.amount_fils),0))],
    ['السحوبات المحوّلة',money((paidWithdrawals||[]).reduce((sum,w)=>sum+Number(w.amount_fils),0))]
  ];
  $('reportStats').replaceChildren(...reportValues.map(([label,value])=>{const box=document.createElement('div');box.className='stat';const strong=document.createElement('strong');strong.textContent=typeof value==='number'?value.toLocaleString('ar-JO'):value;box.append(strong,document.createTextNode(label));return box;}));
  renderRevenueChart();
}

async function loadQuickLinks() {
  const cards=[
    ['الطلبات','sectionOrders',orders.length,'▦'],['الخدمات','sectionServices',services.filter((s)=>s.active).length,'▣'],
    ['الكوبونات','sectionCoupons',coupons.filter((c)=>c.active).length,'⚑'],['العملاء','sectionOrders',uniqueCustomers(),'♟'],
    ['التقارير','sectionReports','الإحصائيات','▥'],['المسوقون','sectionPeople',marketersCount,'♟'],
    ['طلبات الموظفين','sectionPeople',applications.filter((a)=>a.status==='pending').length,'♟'],['طلبات السحب','sectionPeople',withdrawals.filter((w)=>w.status==='pending').length,'د.أ']
  ];
  $('quickLinks').replaceChildren(...cards.map(([label,target,count,icon])=>{const a=document.createElement('a');a.className='quick-card';a.href=`#${target}`;const i=document.createElement('span');i.className='quick-icon';i.textContent=icon;const title=document.createElement('span');title.className='quick-label';title.textContent=label;const number=document.createElement('span');number.className='quick-count';number.textContent=typeof count==='number'?count.toLocaleString('ar-JO'):String(count);a.append(i,title,number);return a;}));
}

async function loadOrders() {
  const { data, error } = await db.from('orders').select('*').order('created_at',{ascending:false}).limit(500);
  if (error) return say('تعذر تحميل الطلبات: ' + error.message);
  orders = data || []; await renderOrders();
}

async function loadServices() {
  const { data, error } = await db.from('services').select('*').order('title'); if (error) return say(error.message);
  services=data||[];
  $('services').replaceChildren(...data.map((item) => {
    const row=document.createElement('article'),title=document.createElement('strong'),price=document.createElement('input'),enabled=document.createElement('input'),save=button('حفظ',async()=>{
      const value=Math.round(Number(price.value)*1000); if(!Number.isSafeInteger(value)||value<1)return say('أدخل سعراً صالحاً.');
      const {error:updateError}=await db.from('services').update({price_fils:value,active:enabled.checked}).eq('id',item.id).select('id').single();say(updateError?updateError.message:'تم حفظ الخدمة.');
    });
    title.textContent=item.title;price.type='number';price.min='.001';price.step='.001';price.value=(item.price_fils/1000).toFixed(3);price.setAttribute('aria-label','السعر بالدينار');
    enabled.type='checkbox';enabled.checked=item.active;row.append(title,price,enabled,document.createTextNode('متاحة'),save);return row;
  }));
  const {data:packages,error:packageError}=await db.from('service_packages').select('service_id,tier,price_fils').order('service_id');if(packageError)return say(packageError.message);
  $('packages').replaceChildren(...packages.map((item)=>{const row=document.createElement('article'),price=document.createElement('input'),save=button('حفظ السعر',async()=>{const value=Math.round(Number(price.value)*1000);if(!Number.isSafeInteger(value)||value<1)return say('أدخل سعراً صالحاً.');const{error:updateError}=await db.from('service_packages').update({price_fils:value}).eq('service_id',item.service_id).eq('tier',item.tier).select('tier').single();say(updateError?updateError.message:'تم حفظ السعر.');});row.append(document.createTextNode(`${item.service_id} — ${tierNames[item.tier]} `));price.type='number';price.min='.001';price.step='.001';price.value=(item.price_fils/1000).toFixed(3);row.append(price,save);return row;}));
}

async function loadCoupons() {
  const { data, error } = await db.from('coupon_codes').select('*').order('created_at',{ascending:false});if(error)return say(error.message);
  coupons=data||[];
  $('coupons').replaceChildren(...data.map((coupon)=>{const row=document.createElement('article'),info=document.createElement('p');info.textContent=`${coupon.code} — خصم ${coupon.discount_percent}% — مستخدم ${coupon.uses}${coupon.max_uses?` من ${coupon.max_uses}`:' (بلا حد)'}${coupon.expires_at?` — ينتهي ${new Date(coupon.expires_at).toLocaleDateString('ar-JO')}`:''} — ${coupon.active?'نشط':'متوقف'}`;row.append(info,button(coupon.active?'إيقاف':'تفعيل',async()=>{const{error:updateError}=await db.from('coupon_codes').update({active:!coupon.active}).eq('code',coupon.code);say(updateError?updateError.message:'تم تحديث الكوبون.');await loadCoupons();}));return row;}));
}

async function loadStaff() {
  const {data:applicationRows,error}=await db.from('staff_applications').select('*').order('created_at',{ascending:false});if(error)return say(error.message);
  applications=applicationRows||[];
  $('applications').replaceChildren(...applications.map((item)=>{const row=document.createElement('article');row.textContent=`${item.user_id} — ${item.status}`;if(item.status==='pending')row.append(button('قبول كمسوّق',async()=>{const{error:approveError}=await db.rpc('approve_marketer',{p_user:item.user_id});say(approveError?approveError.message:'تم قبول المسوّق.');await loadStaff();await loadQuickLinks();}));return row;}));
  const {data:withdrawalRows, error:withdrawError}=await db.from('withdrawals').select('*').order('created_at',{ascending:false});if(withdrawError)return say(withdrawError.message);
  withdrawals=withdrawalRows||[];
  $('withdrawals').replaceChildren(...withdrawals.map((item)=>{const row=document.createElement('article');row.textContent=`${item.user_id} — ${money(item.amount_fils)} — CliQ: ${item.cliq_alias} — ${item.status}`;if(item.status==='pending'){row.append(button('تأكيد التحويل',async()=>{if(!confirm(`حوّل ${money(item.amount_fils)} فعلياً إلى ${item.cliq_alias} ثم أكد هنا.`))return;const{error:updateError}=await db.from('withdrawals').update({status:'paid'}).eq('id',item.id).eq('status','pending').select('id').single();say(updateError?updateError.message:'سُجل التحويل.');await loadStaff();await loadQuickLinks();}));row.append(button('رفض الطلب',async()=>{if(!confirm('تأكيد رفض طلب السحب؟'))return;const{error:updateError}=await db.from('withdrawals').update({status:'rejected'}).eq('id',item.id).eq('status','pending').select('id').single();say(updateError?updateError.message:'تم الرفض.');await loadStaff();await loadQuickLinks();}));}return row;}));
}

async function load() {
  const {data:{session},error}=await db.auth.getSession();if(error)return say(error.message);
  $('panel').hidden=true;$('auth').hidden=!!session;$('dashboardHeader').hidden=!session;$('quicknav').hidden=!session;document.querySelector('.bottomnav').hidden=!session;$('logout').hidden=!session;if(!session)return;
  const {data:role,error:roleError}=await db.from('staff_roles').select('role').eq('user_id',session.user.id).maybeSingle();
  if(roleError||role?.role!=='admin'){say('هذا الحساب لا يملك صلاحية الإدارة.');return;}
  const {data:profile}=await db.from('profiles').select('display_name').eq('user_id',session.user.id).maybeSingle();
  const adminName=profile?.display_name||session.user.email?.split('@')[0]||'المدير';
  $('welcomeName').textContent=adminName;$('dashboardHeader').querySelector('.avatar').textContent=Array.from(adminName.trim())[0]||'ت';
  $('panel').hidden=false;
  await Promise.all([loadOrders(),loadServices(),loadCoupons(),loadStaff()]);
  const {count}=await db.from('marketers').select('user_id',{count:'exact',head:true});marketersCount=count||0;
  await loadReports();await loadQuickLinks();
  const pending=orders.filter((o)=>o.status==='pending').length;$('alertBadge').textContent=pending.toLocaleString('ar-JO');$('alertBadge').hidden=!pending;
}

$('login').onsubmit=async(e)=>{e.preventDefault();const{error}=await db.auth.signInWithPassword({email:$('email').value,password:$('password').value});if(error)return say(error.message);$('password').value='';await load();};
$('logout').onclick=async()=>{await db.auth.signOut();await load();};
$('menuToggle').onclick=()=>{$('quicknav').classList.toggle('open');};
$('quicknav').addEventListener('click',(event)=>{if(event.target.closest('a'))$('quicknav').classList.remove('open');});
$('alerts').onclick=()=>document.querySelector('#sectionOrders').scrollIntoView({behavior:'smooth'});
document.querySelector('.bottomnav').addEventListener('click',(event)=>{const link=event.target.closest('a');if(!link)return;document.querySelectorAll('.bottomnav a').forEach((item)=>item.classList.toggle('active',item===link));});
$('search').oninput=renderOrders;
$('couponCode').oninput=()=>{$('couponCode').value=$('couponCode').value.toUpperCase().replace(/[^A-Z0-9_-]/g,'');};
$('couponForm').onsubmit=async(e)=>{e.preventDefault();const code=$('couponCode').value.trim(),max=Number($('couponUses').value)||null,expiry=$('couponExpiry').value?`${$('couponExpiry').value}T23:59:59Z`:null;const{error}=await db.from('coupon_codes').insert({code,discount_percent:Number($('couponPercent').value),max_uses:max,expires_at:expiry});say(error?error.message:'تم إنشاء الكوبون.');if(!error)e.target.reset();await loadCoupons();await loadQuickLinks();};
await load();
