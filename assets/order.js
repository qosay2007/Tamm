import { db, $, services, tierNames, tierFeatures, say, safeFileExtension } from './shared.js';

const q = new URLSearchParams(location.search);
const serviceId = q.get('service');
const orderId = q.get('order');
let service, packageRows = [], currentOrder;
const fmt = (fils) => (Number(fils || 0) / 1000).toFixed(3).replace(/\.000$/, '') + ' د.أ';
function setTracking(id) { $('tracking').href = 'track.html?id=' + encodeURIComponent(id); $('tracking').hidden = false; }

async function readSummary(id) {
  const { data, error } = await db.rpc('get_guest_order_summary', { p_order: id });
  if (error || !data?.length) return null;
  return data[0];
}
async function showPayment(id, summary) {
  currentOrder = id;
  setTracking(id);
  $('price').textContent = `المبلغ المطلوب: ${fmt(summary.price_fils)}${summary.discount_fils ? ` (يشمل خصم ${fmt(summary.discount_fils)})` : ''}`;
  if (summary.status !== 'pending') {
    $('msg').textContent = summary.status === 'paid' ? 'تم اعتماد التحويل، يجري تجهيز التصميم تلقائياً.' : 'حالة الطلب: ' + summary.status;
    if (summary.status === 'paid' || summary.status === 'fulfilled') {
      const { data } = await db.rpc('get_generated_document', { p_order: id });
      if (data?.length) { $('msg').textContent = 'التصميم جاهز للاستلام.'; $('tracking').href = 'delivery.html?id=' + encodeURIComponent(id); $('tracking').textContent = 'استلام التصميم'; }
    }
    return;
  }
  if (summary.payment_submitted) { $('msg').textContent = 'وصل مرجع التحويل للإدارة. سنحدّث حالة الطلب بعد المراجعة.'; return; }
  const { data, error } = await db.from('cliq_accounts').select('id,beneficiary,alias,is_default').eq('active', true).order('is_default', { ascending: false });
  if (error || !data?.length) { $('msg').textContent = 'تم حفظ الطلب، لكن لا يوجد حساب CliQ نشط حالياً. احتفظ برقم الطلب من رابط المتابعة.'; return; }
  $('cliq').replaceChildren(...data.map((account) => new Option(`${account.beneficiary} — ${account.alias}`, account.id)));
  $('payment').hidden = false;
  $('payform').onsubmit = async (event) => {
    event.preventDefault(); const button = event.target.querySelector('button'); button.disabled = true;
    try {
      const { error: paymentError } = await db.rpc('submit_guest_payment', { p_order: id, p_account: $('cliq').value, p_reference: $('reference').value.trim() });
      if (paymentError) { say('تعذر إرسال المرجع. تحقق من عدم استخدام المرجع بطلب آخر.'); return; }
      $('payment').hidden = true; say('تم إرسال مرجع التحويل للمراجعة. لا يبدأ تجهيز التصميم إلا بعد اعتماد الإدارة. رقم الطلب: ' + id);
    } finally { button.disabled = false; }
  };
}

async function initExisting() {
  setTracking(orderId);
  const summary = await readSummary(orderId);
  if (!summary) { say('لم يتم العثور على الطلب. تحقق من الرابط أو رقم الطلب.'); return; }
  $('title').textContent = 'طلب محفوظ';
  await showPayment(orderId, summary);
}

function addRepeatFields(kind) {
  const wrap = document.createElement('section'); wrap.className = 'box'; wrap.id = 'items';
  const add = document.createElement('button'); add.type = 'button'; add.textContent = kind === 'links' ? 'إضافة رابط' : 'إضافة عنصر';
  const append = () => {
    if (wrap.querySelectorAll('.repeat-row').length >= 15) return;
    const row = document.createElement('div'); row.className = 'repeat-row box';
    const labels = kind === 'links' ? ['اسم الرابط', 'الرابط HTTPS'] : ['الاسم', 'السعر بالدينار', 'الوصف'];
    for (const label of labels) { const input = document.createElement('input'); input.placeholder = label; input.maxLength = 180; input.required = label !== 'الوصف'; input.dataset.label = label;
      if (label.includes('السعر')) { input.type = 'number'; input.min = '0'; input.step = '.001'; }
      if (label.includes('HTTPS')) input.type = 'url'; row.append(input); }
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'حذف'; remove.onclick = () => { if (wrap.querySelectorAll('.repeat-row').length > 1) row.remove(); };
    row.append(remove); wrap.insertBefore(row, add);
  };
  add.onclick = append; wrap.append(add); append(); $('fields').append(wrap); $('detailsLabel').hidden = true; $('details').required = false;
  return () => Array.from(wrap.querySelectorAll('.repeat-row')).map((row) => Array.from(row.querySelectorAll('input')).map((input) => input.value.trim()));
}

function buildFields(meta) {
  if (meta.repeat) return addRepeatFields(meta.repeat);
  if (!meta.fields.length) return null;
  for (const [index, name] of meta.fields.entries()) {
    const label = document.createElement('label'); label.textContent = name;
    const input = document.createElement('input'); input.maxLength = 350; input.required = index === 0; input.dataset.field = name;
    label.append(input); $('fields').append(label);
  }
  $('detailsLabel').hidden = true; $('details').required = false;
  return null;
}

function setPackage(tier) {
  const uploadMax = tier === 'vip' ? 5 : tier === 'advanced' ? 3 : 0;
  $('uploadsBox').hidden = uploadMax === 0;
  $('uploads').dataset.max = String(uploadMax);
  $('uploads').disabled = uploadMax === 0;
  $('uploads').value = '';
  $('uploadHint').textContent = tier === 'vip' ? 'حتى 5 صور أو ملفات مرجعية خاصة بالتصميم.' : 'حتى 3 صور أو ملفات مرجعية خاصة بالتصميم.';
  $('price').textContent = `سعر الباقة ${tierNames[tier]}: ${fmt(packageRows.find((item) => item.tier === tier)?.price_fils || service.price_fils)}`;
}

async function uploadFiles(order, files) {
  const failed = [];
  for (const file of files) {
    const ext = safeFileExtension(file);
    if (!ext || file.size < 1 || file.size > 10 * 1024 * 1024) { failed.push(file.name); continue; }
    const path = `${order}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await db.storage.from('tamm-order-files').upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) { failed.push(file.name); continue; }
    const safeName = file.name.replace(/[^A-Za-z0-9._ -]/g, '') || `attachment.${ext}`;
    const { error: attachError } = await db.rpc('attach_guest_upload', { p_order: order, p_path: path, p_file_name: safeName, p_content_type: file.type, p_file_size: file.size });
    if (attachError) failed.push(file.name);
  }
  return failed;
}

async function initNew() {
  if (!services[serviceId]) { say('الخدمة غير متاحة. ارجع إلى قائمة الخدمات واختر خدمة.'); return; }
  const { data: found, error } = await db.from('services').select('id,title,price_fils').eq('id', serviceId).eq('active', true).maybeSingle();
  if (error || !found) { say('تعذر تحميل الخدمة حالياً. حاول مرة أخرى.'); return; }
  service = found; const meta = services[serviceId]; $('title').textContent = service.title;
  const { data: packages, error: packageError } = await db.from('service_packages').select('tier,price_fils').eq('service_id', serviceId);
  if (packageError) { say('تعذر تحميل أسعار الباقات. حاول مرة أخرى.'); return; }
  packageRows = [{ tier: 'basic', price_fils: service.price_fils }, ...(packages || [])];
  $('tier').replaceChildren(...packageRows.map((row) => new Option(`${tierNames[row.tier]} — ${fmt(row.price_fils)}`, row.tier)));
  $('tier').value = ['basic','advanced','vip'].includes(q.get('tier')) && packageRows.some((row) => row.tier === q.get('tier')) ? q.get('tier') : 'basic';
  const repeatValues = buildFields(meta);
  $('tier').onchange = () => setPackage($('tier').value); setPackage($('tier').value);
  $('form').hidden = false;
  $('form').onsubmit = async (event) => {
    event.preventDefault();
    let details = $('details').value.trim();
    if (repeatValues) {
      const rows = repeatValues();
      if (rows.some((row) => row.some((value, i) => i < 2 && !value))) return say('أكمل بيانات كل عنصر قبل الإرسال.');
      if (meta.repeat === 'links') {
        if (rows.some((row) => { try { return new URL(row[1]).protocol !== 'https:'; } catch { return true; } })) return say('استخدم روابط HTTPS صالحة فقط.');
        details = rows.map(([label,url]) => `${label} | ${url}`).join('\n');
      } else details = rows.map((row) => `${row[0]} — ${row[1]} د.أ${row[2] ? ` — ${row[2]}` : ''}`).join('\n');
    } else if (meta.fields.length) {
      details = Array.from($('fields').querySelectorAll('input')).filter((input) => input.value.trim()).map((input) => `${input.dataset.field}: ${input.value.trim()}`).join('\n');
    }
    if (!details || details.length > 3000) return say('أدخل تفاصيل الطلب، بحد أقصى 3000 حرف.');
    if (serviceId === 'qr') { try { const u = new URL(details); if (!['https:','http:'].includes(u.protocol)) throw new Error(); } catch { return say('أدخل رابط HTTP أو HTTPS صالحاً.'); } }
    const tier = $('tier').value, files = Array.from($('uploads').files || []), max = Number($('uploads').dataset.max || 0);
    if (files.length > max) return say(`هذه الباقة تسمح بإرفاق ${max} ملفات كحد أقصى.`);
    if (files.some((file) => !safeFileExtension(file) || file.size < 1 || file.size > 10 * 1024 * 1024)) return say('الملفات المقبولة JPG وPNG وWEBP وHEIC وPDF، بحد أقصى 10 ميغابايت للملف.');
    const button = $('submit'); button.disabled = true;
    try {
      const { data: order, error: submitError } = await db.rpc('submit_guest_package_order_v2', {
        p_service: serviceId, p_tier: tier, p_name: $('name').value.trim(), p_phone: $('phone').value.trim(), p_details: details,
        p_ref: q.get('ref'), p_coupon: $('coupon').value.trim()
      });
      if (submitError) return say(submitError.message?.includes('coupon') ? 'الكوبون غير صالح أو منتهي أو استُخدم بالكامل.' : 'تعذر حفظ الطلب. تحقق من البيانات وحاول مجدداً.');
      currentOrder = order; history.replaceState(null, '', `order.html?order=${encodeURIComponent(order)}`);
      $('form').hidden = true; setTracking(order); say('حُفظ الطلب. نرفع الملفات ثم نعرض المبلغ وخيارات الدفع…');
      const failed = files.length ? await uploadFiles(order, files) : [];
      const summary = await readSummary(order);
      if (!summary) return say(`تم حفظ الطلب، لكن تعذر تحميل تفاصيله. رقم الطلب: ${order}`);
      if (failed.length) say(`تم حفظ الطلب، وتعذر رفع ${failed.length} ملف. تواصل مع الدعم قبل الدفع لإضافته.`);
      await showPayment(order, summary);
      if (failed.length) $('msg').textContent = `تعذر رفع ${failed.length} ملف. أرسلها للدعم مع رقم الطلب ${order}. ` + $('msg').textContent;
    } finally { button.disabled = false; }
  };
}

if (orderId) await initExisting(); else await initNew();
