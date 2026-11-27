import { db, $, tierNames, say } from './shared.js?v=20261127-tiers2';

const query = new URLSearchParams(location.search);
const id = query.get('id');
const trackingNumber = query.get('number');
const accessToken = new URLSearchParams(location.hash.slice(1)).get('key');
const labels = { qr:'رمز QR',cv:'السيرة الذاتية',certificate:'شهادة رقمية',birthday:'بطاقة عيد ميلاد',wedding:'دعوة زفاف',card:'بطاقة أعمال',links:'صفحة الروابط',website:'موقع تعريفي',menu:'منيو إلكتروني',catalog:'كتالوج المنتجات' };
let qrRenderPromise = null, qrLogoImage = null, qrCodePromise = null;
const loadQrCode = () => qrCodePromise ||= import('https://cdn.jsdelivr.net/npm/qrcode@1.5.4/+esm').then((module) => module.default || module);
const withTimeout = (promise, ms = 15000) => {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = window.setTimeout(() => reject(new Error('timeout')), ms); })]).finally(() => window.clearTimeout(timer));
};

async function loadDocument() {
  $('retry').hidden = true; $('doc').hidden = true; $('content').replaceChildren(); $('attachments').replaceChildren();
  say('جاري تحميل التصميم…');
  try {
    let result;
    if (trackingNumber && /^[0-9]{6,20}$/.test(trackingNumber) && /^[0-9a-f]{64}$/.test(accessToken || '')) {
      result = await withTimeout(db.rpc('get_generated_document_v3', { p_tracking_number: trackingNumber, p_access_token: accessToken }));
    } else if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
      say('رابط الاستلام غير مكتمل أو غير صالح. افتح رابط التسليم من صفحة طلباتي.'); return;
    } else {
      result = await withTimeout(db.rpc('get_generated_document', { p_order: id }));
    }
    await renderDocument(result?.data?.[0], result?.error);
  } catch (error) {
    say(error?.message === 'timeout' ? 'استغرق تحميل التصميم وقتاً أطول من المعتاد. افحص اتصال الإنترنت ثم أعد المحاولة.' : 'تعذر تحميل التصميم حالياً. افحص اتصال الإنترنت ثم أعد المحاولة.');
    $('retry').hidden = false;
  }
}
$('retry').onclick = loadDocument;
await loadDocument();

const el = (tag, className = '', text = '') => {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (text !== undefined && text !== null) item.textContent = String(text);
  return item;
};
const link = (href, text, className = 'action') => {
  const a = el('a', className, text); a.href = href; a.rel = 'noopener noreferrer';
  if (/^https?:/i.test(href)) a.target = '_blank';
  return a;
};
const phoneDigits = (value = '') => {
  let digits = String(value).replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = '962' + digits.slice(1);
  if (digits.length === 9 && digits.startsWith('7')) digits = '962' + digits;
  return digits;
};

function parseContent(text = '') {
  const fields = {}, links = [], items = [], free = [];
  for (const raw of String(text).split(/\n+/).map((line) => line.trim()).filter(Boolean)) {
    const match = raw.match(/^([^:]{1,80}):\s*(.*)$/);
    if (!match) {
      const legacyLink = raw.match(/^(.*?)\s*\|\s*(https:\/\/\S+)$/i);
      const legacyItem = raw.match(/^(.*?)\s*[—-]\s*([\d,.]+)\s*د\.أ(?:\s*[—-]\s*(.*))?$/);
      if (legacyLink) links.push({ title: legacyLink[1], url: legacyLink[2] });
      else if (legacyItem) items.push({ title: legacyItem[1], price: legacyItem[2], description: legacyItem[3] || '' });
      else free.push(raw);
      continue;
    }
    const [, key, value] = match;
    if (key === 'رابط') {
      const [title, url] = value.split('|').map((part) => part.trim());
      if (title && /^https:\/\//i.test(url || '')) links.push({ title, url });
    } else if (key === 'عنصر') {
      const parts = value.split('|').map((part) => part.trim());
      const [title, category, price, ...description] = parts.length >= 4 ? parts : [parts[0], '', parts[1], ...parts.slice(2)];
      if (title) items.push({ title, category: category || '', price: price || '', description: description.join(' | ') });
    } else fields[key] = value;
  }
  return { fields, links, items, free };
}

function infoRows(container, entries) {
  for (const [labelText, value] of entries.filter(([, value]) => String(value || '').trim())) {
    const row = el('div', 'field'), label = el('strong', '', labelText), body = el('span', '', value);
    row.append(label, body); container.append(row);
  }
}

async function addQr(container, value, filename = 'TAMM-QR.png') {
  if (!value) return;
  try {
    const QRCode = await loadQrCode();
    const canvas = document.createElement('canvas');
    const tier = $('doc').dataset.packageTier || 'basic';
    const dark = tier === 'vip' ? '#493300' : tier === 'advanced' ? '#65480b' : '#17130b';
    const rendering = QRCode.toCanvas(canvas, value, { width: 320, margin: 4, errorCorrectionLevel: 'H', color: { dark, light: '#ffffff' } });
    qrRenderPromise = rendering.then(() => ({ canvas, save }));
    canvas.className = 'product-qr'; canvas.setAttribute('aria-label', 'رمز QR للمشاركة');
    const save = el('a', 'action', 'تنزيل رمز QR بصيغة PNG'); save.download = filename; save.href = canvas.toDataURL('image/png');
    container.append(canvas, save);
    await rendering;
    if (qrLogoImage && ['advanced','vip'].includes(tier)) drawQrLogo(canvas, qrLogoImage);
    save.href = canvas.toDataURL('image/png');
  } catch { container.append(el('p', 'notice', 'تعذر إنشاء رمز QR حالياً.')); }
}

function drawQrLogo(canvas, image) {
  const context = canvas.getContext('2d'); if (!context || !image?.naturalWidth) return;
  const size = Math.round(canvas.width * 0.15), padding = Math.round(size * 0.16);
  const x = Math.round((canvas.width - size) / 2), y = Math.round((canvas.height - size) / 2);
  context.fillStyle = '#fff'; context.fillRect(x - padding, y - padding, size + padding * 2, size + padding * 2);
  context.drawImage(image, x, y, size, size);
}

function addCountdown(container, date, time = '') {
  if (!date) return;
  const target = new Date(`${date}T${time || '00:00'}:00+03:00`);
  if (Number.isNaN(target.getTime())) return;
  const card = el('div', 'countdown'), label = el('strong', '', 'الوقت المتبقي للمناسبة'), output = el('span', 'countdown-value', '');
  card.append(label, output); container.append(card);
  const update = () => {
    const remaining = target.getTime() - Date.now();
    if (remaining <= 0) { output.textContent = 'بدأت مناسبتكم 🎉'; return; }
    const days = Math.floor(remaining / 86400000), hours = Math.floor(remaining % 86400000 / 3600000), minutes = Math.floor(remaining % 3600000 / 60000);
    output.textContent = `${days} يوم · ${hours} ساعة · ${minutes} دقيقة`;
  };
  update(); window.setInterval(update, 60000);
}

function downloadVCard(fields) {
  const name = fields['اسم النشاط'] || fields['اسم الصفحة'] || fields['اسم الموقع أو النشاط'] || '';
  const phone = fields['رقم الهاتف'] || fields['الهاتف'] || '';
  const email = fields['البريد الإلكتروني'] || '';
  const address = fields['المدينة أو العنوان'] || '';
  const vcard = ['BEGIN:VCARD','VERSION:3.0',`FN:${name}`,`TEL;TYPE=CELL:${phone}`,`EMAIL:${email}`,`ADR;TYPE=WORK:;;${address}`, 'END:VCARD'].join('\r\n');
  const blob = new Blob([vcard], { type: 'text/vcard;charset=utf-8' }), url = URL.createObjectURL(blob);
  const a = el('a', 'action', 'حفظ جهة الاتصال'); a.href = url; a.download = 'TAMM-contact.vcf'; a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function buildInvitation(container, fields, serviceId) {
  const isWedding = serviceId === 'wedding';
  const heading = isWedding ? `${fields['اسم العريس'] || ''} و ${fields['اسم العروس'] || ''}` : fields['اسم صاحب المناسبة'] || '';
  $('title').textContent = isWedding ? 'دعوة زفاف' : 'دعوة عيد ميلاد';
  $('name').textContent = heading;
  container.classList.add('invitation-content');
  container.append(el('p', 'invitation-kicker', isWedding ? 'بكل المحبة والفرح ندعوكم لمشاركتنا يومنا' : `إلى ${fields['اسم صاحب المناسبة'] || 'صاحب المناسبة'}، كل عام وأنت بخير`));
  if (isWedding && fields['نص الدعوة']) container.append(el('p', 'invitation-message', fields['نص الدعوة']));
  if (!isWedding && fields['رسالة التهنئة']) {
    const reveal = el('button', 'action gift-reveal', 'افتح المفاجأة 🎁'); reveal.type = 'button';
    const message = el('p', 'invitation-message gift-message', fields['رسالة التهنئة']); message.hidden = true;
    reveal.onclick = () => { message.hidden = false; reveal.hidden = true; container.classList.add('gift-open'); };
    container.append(reveal, message);
  }
  infoRows(container, [['التاريخ', fields['التاريخ']], ['الوقت', fields['الساعة']], ['القاعة', fields['اسم القاعة'] || fields['المكان']]]);
  addCountdown(container, fields['التاريخ'], fields['الساعة']);
  const address = fields['عنوان القاعة'] || fields['المكان'];
  if (address) container.append(link(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`, 'افتح موقع المناسبة على الخريطة'));
  const guestPhone = phoneDigits(fields['رقم واتساب لتأكيد الحضور'] || fields['رقم واتساب للرد']);
  if (guestPhone) container.append(link(`https://wa.me/${guestPhone}?text=${encodeURIComponent(isWedding ? 'يسعدني تأكيد حضوري للمناسبة، ألف مبروك.' : 'يسعدني الحضور، كل عام وأنتم بخير.')}`, isWedding ? 'تأكيد الحضور عبر واتساب' : 'الرد عبر واتساب'));
  const sender = fields['اسم المرسل']; if (sender) container.append(el('p', 'invitation-signature', `بمحبة، ${sender}`));
}

function buildCv(container, fields) {
  $('title').textContent = 'السيرة الذاتية'; $('name').textContent = fields['الاسم الكامل'] || '';
  container.classList.add('cv-content');
  container.append(el('h3', 'cv-role', fields['المسمى المهني'] || ''));
  infoRows(container, [['الهاتف', fields['رقم الهاتف']], ['البريد الإلكتروني', fields['البريد الإلكتروني']], ['المحافظة', fields['المحافظة']], ['LinkedIn', fields['رابط LinkedIn']]]);
  for (const [key, label] of [['التعليم','التعليم'],['الخبرات','الخبرات المهنية'],['المهارات','المهارات'],['اللغات','اللغات']]) {
    if (!fields[key]) continue;
    const section = el('section', 'cv-section'); section.append(el('h3', '', label), el('p', '', fields[key])); container.append(section);
  }
  container.append(el('p', 'notice', 'السيرة الذاتية أداة لعرض خبراتك بوضوح، ولا تضمن القبول الوظيفي.'));
}

function buildCertificate(container, fields, tracking) {
  $('title').textContent = fields['نوع الشهادة'] || 'شهادة رقمية'; $('name').textContent = fields['اسم المستفيد'] || '';
  container.classList.add('certificate-content');
  container.append(el('p', 'certificate-award', 'شهادة تقدير ومشاركة'));
  container.append(el('p', '', fields['سبب التكريم أو المشاركة'] || fields['سبب التكريم'] || ''));
  infoRows(container, [['الجهة المانحة', fields['الجهة المانحة']], ['التاريخ', fields['التاريخ']], ['الموقّع المصرح', fields['اسم الموقّع المصرح']] ]);
  container.append(el('p', 'certificate-ref', `مرجع الطلب: ${tracking || '—'}`));
  container.append(el('p', 'notice', 'هذه شهادة رقمية غير رسمية أُنشئت من المعلومات التي قدمها العميل، ولا تحل محل وثيقة أو اعتماد رسمي.'));
}

function buildCard(container, fields) {
  $('title').textContent = 'بطاقة أعمال رقمية'; $('name').textContent = fields['اسم النشاط'] || '';
  container.classList.add('business-card-content');
  container.append(el('p', 'cv-role', fields['المسمى'] || ''));
  infoRows(container, [['الهاتف', fields['رقم الهاتف'] || fields['الهاتف']], ['البريد الإلكتروني', fields['البريد الإلكتروني']], ['العنوان', fields['المدينة أو العنوان']]]);
  const phone = phoneDigits(fields['رقم الهاتف'] || fields['الهاتف']), whatsapp = phoneDigits(fields['رقم واتساب'] || fields['رقم الهاتف'] || fields['الهاتف']);
  const actions = el('div', 'product-actions');
  if (phone) actions.append(link(`tel:${phone}`, 'اتصال'));
  if (whatsapp) actions.append(link(`https://wa.me/${whatsapp}`, 'واتساب'));
  if (fields['البريد الإلكتروني']) actions.append(link(`mailto:${fields['البريد الإلكتروني']}`, 'إرسال بريد'));
  const socials = fields['رابط Instagram'] || fields['روابط التواصل'];
  if (socials) for (const candidate of socials.split(/[\s,]+/).filter((value) => /^https:\/\//i.test(value)).slice(0,4)) actions.append(link(candidate, 'حساب تواصل'));
  container.append(actions);
  const save = el('button', 'action', 'حفظ جهة الاتصال'); save.type = 'button'; save.onclick = () => downloadVCard(fields); container.append(save);
  const vcard = ['BEGIN:VCARD','VERSION:3.0',`FN:${fields['اسم النشاط'] || ''}`,`TEL;TYPE=CELL:${fields['رقم الهاتف'] || ''}`,`EMAIL:${fields['البريد الإلكتروني'] || ''}`, 'END:VCARD'].join('\n');
  addQr(container, vcard, 'TAMM-contact-QR.png');
}

function buildLinks(container, fields, links) {
  $('title').textContent = fields['اسم الصفحة'] || 'روابطي'; $('name').textContent = fields['اسم الصفحة'] || '';
  container.classList.add('links-content');
  if (fields['نبذة قصيرة']) container.append(el('p', 'profile-bio', fields['نبذة قصيرة']));
  const actions = el('div', 'product-actions link-list');
  for (const item of links) actions.append(link(item.url, item.title));
  const whatsapp = phoneDigits(fields['رقم واتساب']);
  if (whatsapp) actions.append(link(`https://wa.me/${whatsapp}`, 'تواصل عبر واتساب'));
  container.append(actions);
  addQr(container, location.href, 'TAMM-links-QR.png');
}

function buildWebSite(container, fields) {
  const businessName = fields['اسم الموقع أو النشاط'] || fields['اسم الموقع'] || '';
  $('title').textContent = businessName || 'صفحة تعريفية'; $('name').textContent = fields['عنوان ترحيبي'] || businessName || '';
  container.classList.add('website-content');
  if (fields['نبذة']) container.append(el('p', 'profile-bio', fields['نبذة']));
  infoRows(container, [['الخدمات', fields['الخدمات']], ['الأعمال والمشاريع', fields['الأعمال أو المشاريع'] || fields['المشاريع']], ['التواصل', fields['بيانات التواصل']], ['العنوان', fields['المدينة أو العنوان']]]);
  const actions = el('div', 'product-actions');
  const phone = phoneDigits(fields['رقم الهاتف']), whatsapp = phoneDigits(fields['رقم واتساب'] || fields['رقم الهاتف']);
  if (phone) actions.append(link(`tel:${phone}`, 'اتصال'));
  if (whatsapp) actions.append(link(`https://wa.me/${whatsapp}`, 'تواصل عبر واتساب'));
  if (fields['البريد الإلكتروني']) actions.append(link(`mailto:${fields['البريد الإلكتروني']}`, 'البريد الإلكتروني'));
  const socialUrl = fields['رابط Instagram'] || fields['الموقع الإلكتروني'];
  if (socialUrl && /^https:\/\//i.test(socialUrl)) actions.append(link(socialUrl, fields['رابط Instagram'] ? 'Instagram' : 'الموقع الإلكتروني'));
  if (actions.childElementCount) container.append(actions);
}

function buildQr(container, fields, fallback) {
  const target = fields['الرابط'] || fallback;
  $('title').textContent = 'رمز QR مخصص'; $('name').textContent = fields['عنوان الرمز'] || 'امسح الرمز لفتح الرابط';
  container.classList.add('qr-content');
  if (!target) { container.append(el('p', 'notice', 'الرابط غير متوفر.')); return; }
  container.append(link(target, target, 'plain-url'));
  addQr(container, target);
}

function buildProductList(container, fields, items, serviceId) {
  const isMenu = serviceId === 'menu';
  $('title').textContent = isMenu ? (fields['اسم المطعم'] || 'المنيو الإلكتروني') : (fields['اسم المتجر'] || 'كتالوج المنتجات');
  $('name').textContent = fields['نبذة عن المطعم'] || fields['نبذة عن المتجر'] || '';
  container.classList.add(isMenu ? 'menu-content' : 'catalog-content');
  const search = el('input', 'product-search'); search.type = 'search'; search.placeholder = isMenu ? 'ابحث في المنيو' : 'ابحث في المنتجات'; search.setAttribute('aria-label', search.placeholder);
  const list = el('div', 'product-list'), cartItems = new Map(), cart = el('aside', 'order-cart');
  const cartSummary = el('p', '', 'لم تضف عناصر بعد.'), send = el('button', 'action', 'إرسال الطلب عبر واتساب'); send.type = 'button';
  const phone = phoneDigits(fields['رقم واتساب لاستقبال الطلبات']);
  send.disabled = !phone;
  const renderCart = () => {
    const selections = [...cartItems.entries()];
    const total = selections.reduce((sum, [index, quantity]) => sum + (Number(items[index].price.replace(',','.')) || 0) * quantity, 0);
    cartSummary.textContent = selections.length ? `العناصر: ${selections.map(([index, quantity]) => `${items[index].title} × ${quantity}`).join('، ')}${total ? ` — الإجمالي التقريبي ${total.toFixed(3)} د.أ` : ''}` : 'لم تضف عناصر بعد.';
  };
  items.forEach((item, index) => {
    const card = el('article', 'product-card'), category = el('span', 'product-category', item.category), title = el('h3', '', item.title), price = el('strong', 'product-price', item.price ? `${item.price} د.أ` : ''), description = el('p', '', item.description), add = el('button', 'action', 'أضف للطلب');
    add.type = 'button'; add.onclick = () => { cartItems.set(index, (cartItems.get(index) || 0) + 1); renderCart(); };
    card.append(category, title, price, description, add); if (!item.category) category.hidden = true; list.append(card);
  });
  search.oninput = () => { const term = search.value.trim().toLocaleLowerCase(); for (const card of list.children) card.hidden = !card.textContent.toLocaleLowerCase().includes(term); };
  send.onclick = () => {
    const selections = [...cartItems.entries()];
    if (!selections.length) { cartSummary.textContent = 'أضف صنفاً واحداً على الأقل.'; return; }
    const message = selections.map(([index, quantity]) => `${items[index].title} × ${quantity} — ${items[index].price} د.أ`).join('\n');
    location.href = `https://wa.me/${phone}?text=${encodeURIComponent(`مرحباً، أريد طلب:\n${message}`)}`;
  };
  cart.append(cartSummary, send);
  if (!phone) cart.append(el('p', 'notice', 'أضف رقم واتساب للنشاط عند إنشاء الطلب لتفعيل زر الإرسال.'));
  if (!items.length) list.append(el('p', 'notice', 'لم تُضف عناصر إلى هذا الطلب.'));
  container.append(search, list, cart);
}

async function renderDocument(doc, error) {
  if (error || !doc) { say('التصميم غير متاح بعد أو أن رابط الوصول غير صالح. إذا أكدت الإدارة الدفع للتو، أعد المحاولة بعد لحظات.'); $('retry').hidden = false; return; }
  const content = doc.content || {}, tier = content.package_tier || 'basic';
  const parsed = parseContent(content.text || ''), { fields, links, items, free } = parsed;
  $('doc').classList.add(doc.service_id, tier);
  $('doc').dataset.tier = tierNames[tier] || tierNames.basic;
  $('doc').dataset.packageTier = tier;
  const tierBadge = el('span', `tier-badge ${tier}`, tierNames[tier] || tierNames.basic);
  $('doc').insertBefore(tierBadge, $('title'));

  switch (doc.service_id) {
    case 'cv': buildCv($('content'), fields); break;
    case 'wedding': case 'birthday': buildInvitation($('content'), fields, doc.service_id); break;
    case 'certificate': buildCertificate($('content'), fields, trackingNumber); break;
    case 'card': buildCard($('content'), fields); break;
    case 'links': buildLinks($('content'), fields, links); break;
    case 'website': buildWebSite($('content'), fields); break;
    case 'qr': buildQr($('content'), fields, free[0] || content.text || ''); break;
    case 'menu': case 'catalog': buildProductList($('content'), fields, items, doc.service_id); break;
    default: $('title').textContent = labels[doc.service_id] || 'تصميم تمّ'; $('content').textContent = content.text || '';
  }

  $('doc').classList.toggle('invite', ['birthday','wedding'].includes(doc.service_id));
  const attachments = Array.isArray(content.attachments) ? content.attachments.slice(0,5) : [];
  for (const file of attachments) {
    const { data: object, error: downloadError } = await db.storage.from('tamm-order-files').download(file.path);
    if (downloadError || !object) continue;
    const url = URL.createObjectURL(object);
    if (String(file.type).startsWith('image/')) {
      const img = el('img', 'attachment-image'); img.src = url; img.alt = file.name || 'صورة مرفقة بالتصميم'; $('attachments').append(img);
      if (doc.service_id === 'qr' && ['advanced','vip'].includes(tier) && !qrLogoImage) {
        qrLogoImage = img; await img.decode().catch(() => {});
      }
    } else {
      const a = el('a', 'action', 'فتح الملف: ' + (file.name || 'ملف مرفق')); a.href = url; a.target = '_blank'; a.rel = 'noopener'; $('attachments').append(a);
    }
  }
  if (qrLogoImage && doc.service_id === 'qr' && qrRenderPromise) {
    const qr = await qrRenderPromise;
    if (qr) { drawQrLogo(qr.canvas, qrLogoImage); qr.save.href = qr.canvas.toDataURL('image/png'); }
  }
  $('doc').hidden = false; $('print').hidden = tier === 'vip';
  say(tier === 'vip' ? `منتج VIP جاهز — ${tierNames[tier]}. استخدم زر الطباعة لحفظ نسخة PDF.` : `المنتج الرقمي جاهز — ${tierNames[tier] || tierNames.basic}.`);
  $('print').onclick = () => window.print();
}
