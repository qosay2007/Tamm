import { db, $, say, tierNames } from './shared.js';

let orders = [];
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
  await loadOrders();
}

async function loadReports() {
  const [{ data: commissions }, { data: paidWithdrawals }] = await Promise.all([
    db.from('commissions').select('amount_fils'),
    db.from('withdrawals').select('amount_fils').eq('status','paid')
  ]);
  const paid = orders.filter((o) => ['paid','fulfilled'].includes(o.status));
  const values = [
    ['الطلبات المحمّلة',orders.length], ['طلبات بانتظار الدفع',orders.filter((o) => o.status === 'pending').length],
    ['إجمالي المبيعات المعتمدة',money(paid.reduce((sum,o) => sum + Number(o.price_fils),0))],
    ['عمولات المسوقين (50%)',money((commissions || []).reduce((sum,c) => sum + Number(c.amount_fils),0))],
    ['عمولات محوّلة',money((paidWithdrawals || []).reduce((sum,w) => sum + Number(w.amount_fils),0))]
  ];
  $('stats').replaceChildren(...values.map(([label,value]) => { const box = document.createElement('div'); box.className='stat'; const strong=document.createElement('strong');strong.textContent=value;box.append(strong,document.createTextNode(label));return box; }));
}

async function loadOrders() {
  const { data, error } = await db.from('orders').select('*').order('created_at',{ascending:false}).limit(500);
  if (error) return say('تعذر تحميل الطلبات: ' + error.message);
  orders = data || []; await loadReports(); await renderOrders();
}

async function loadServices() {
  const { data, error } = await db.from('services').select('*').order('title'); if (error) return say(error.message);
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
  $('coupons').replaceChildren(...data.map((coupon)=>{const row=document.createElement('article'),info=document.createElement('p');info.textContent=`${coupon.code} — خصم ${coupon.discount_percent}% — مستخدم ${coupon.uses}${coupon.max_uses?` من ${coupon.max_uses}`:' (بلا حد)'}${coupon.expires_at?` — ينتهي ${new Date(coupon.expires_at).toLocaleDateString('ar-JO')}`:''} — ${coupon.active?'نشط':'متوقف'}`;row.append(info,button(coupon.active?'إيقاف':'تفعيل',async()=>{const{error:updateError}=await db.from('coupon_codes').update({active:!coupon.active}).eq('code',coupon.code);say(updateError?updateError.message:'تم تحديث الكوبون.');await loadCoupons();}));return row;}));
}

async function loadStaff() {
  const {data:applications,error}=await db.from('staff_applications').select('*').order('created_at',{ascending:false});if(error)return say(error.message);
  $('applications').replaceChildren(...applications.map((item)=>{const row=document.createElement('article');row.textContent=`${item.user_id} — ${item.status}`;if(item.status==='pending')row.append(button('قبول كمسوّق',async()=>{const{error:approveError}=await db.rpc('approve_marketer',{p_user:item.user_id});say(approveError?approveError.message:'تم قبول المسوّق.');await loadStaff();}));return row;}));
  const {data:withdrawals, error:withdrawError}=await db.from('withdrawals').select('*').order('created_at',{ascending:false});if(withdrawError)return say(withdrawError.message);
  $('withdrawals').replaceChildren(...withdrawals.map((item)=>{const row=document.createElement('article');row.textContent=`${item.user_id} — ${money(item.amount_fils)} — CliQ: ${item.cliq_alias} — ${item.status}`;if(item.status==='pending'){row.append(button('تأكيد التحويل',async()=>{if(!confirm(`حوّل ${money(item.amount_fils)} فعلياً إلى ${item.cliq_alias} ثم أكد هنا.`))return;const{error:updateError}=await db.from('withdrawals').update({status:'paid'}).eq('id',item.id).eq('status','pending').select('id').single();say(updateError?updateError.message:'سُجل التحويل.');await loadStaff();}));row.append(button('رفض الطلب',async()=>{if(!confirm('تأكيد رفض طلب السحب؟'))return;const{error:updateError}=await db.from('withdrawals').update({status:'rejected'}).eq('id',item.id).eq('status','pending').select('id').single();say(updateError?updateError.message:'تم الرفض.');await loadStaff();}));}return row;}));
}

async function load() {
  const {data:{session},error}=await db.auth.getSession();if(error)return say(error.message);
  $('panel').hidden=true;$('auth').hidden=!!session;$('logout').hidden=!session;if(!session)return;
  const {data:role,error:roleError}=await db.from('staff_roles').select('role').eq('user_id',session.user.id).maybeSingle();
  if(roleError||role?.role!=='admin'){say('هذا الحساب لا يملك صلاحية الإدارة.');return;}
  $('panel').hidden=false;await Promise.all([loadOrders(),loadServices(),loadCoupons(),loadStaff()]);
}

$('login').onsubmit=async(e)=>{e.preventDefault();const{error}=await db.auth.signInWithPassword({email:$('email').value,password:$('password').value});if(error)return say(error.message);$('password').value='';await load();};
$('logout').onclick=async()=>{await db.auth.signOut();await load();};
$('search').oninput=renderOrders;
$('couponCode').oninput=()=>{$('couponCode').value=$('couponCode').value.toUpperCase().replace(/[^A-Z0-9_-]/g,'');};
$('couponForm').onsubmit=async(e)=>{e.preventDefault();const code=$('couponCode').value.trim(),max=Number($('couponUses').value)||null,expiry=$('couponExpiry').value?`${$('couponExpiry').value}T23:59:59Z`:null;const{error}=await db.from('coupon_codes').insert({code,discount_percent:Number($('couponPercent').value),max_uses:max,expires_at:expiry});say(error?error.message:'تم إنشاء الكوبون.');if(!error)e.target.reset();await loadCoupons();};
await load();
