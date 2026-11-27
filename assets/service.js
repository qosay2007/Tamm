import { db, $, services, tierNames, packageFeaturesFor, say } from './shared.js?v=20261127-tiers2';
const q = new URLSearchParams(location.search), id = q.get('service'), meta = services[id];
const money = (fils) => (Number(fils) / 1000).toFixed(3).replace(/\.000$/, '') + ' د.أ';
const sampleCopy = {
  cv: [['سيرة مهنية','قالب أنيق','الاسم الكامل','خبراتك ومهاراتك'],['سيرة ATS','تنسيق واضح','المسمى الوظيفي','ملخص مهني مرتب']],
  wedding: [['دعوة ليلة العمر','دعوة زفاف','ليان & عمر','الجمعة · عمّان'],['دعوة ذهبية','موعدكم مع الفرح','سارة & يزن','قاعة الياسمين · ٨ مساءً']],
  birthday: [['هدية عيد ميلاد','افتح المفاجأة','كل عام وأنت بخير','رسالة خاصة من القلب'],['بطاقة احتفال','لحظات حلوة','عيد ميلاد سعيد','اضغط لاكتشاف المفاجأة']],
  card: [['بطاقة أعمال','تواصل بسهولة','اسم النشاط التجاري','اتصال · واتساب · بريد'],['بطاقتك الرقمية','احفظ جهة الاتصال','الاسم والمسمى','روابطك المهنية بلمسة']],
  qr: [['رمز QR مخصص','امسح للوصول','رابطك في مكان واحد','ألوان وهوية تناسبك'],['QR ذهبي','رمز جاهز للطباعة','وجّه عملاءك مباشرة','نموذج عرض — ليس رمزاً فعلياً']],
  links: [['صفحة روابط','كل روابطك بمكان واحد','اسم الصفحة','واتساب · إنستغرام · موقع'],['واجهة أعمال','شارك حضورك الرقمي','روابط النشاط','خدمات · منتجات · تواصل']],
  catalog: [['كتالوج المتجر','منتجات مختارة','حقيبة جلدية','عطر شرقي','ساعة أنيقة'],['عرض المنتجات','تسوّق بسهولة','مجموعة الموسم','وصل حديثاً','عروض المتجر']],
  menu: [['منيو المطعم','أطيب الخيارات','برغر مشوي','سلطة طازجة','قهوة اليوم'],['قائمة الطعام','اطلب على ذوقك','وجبات رئيسية','مقبلات','مشروبات']],
  website: [['موقع النشاط','أهلاً بكم','تعرف على خدماتنا','أعمالنا · نبذة · تواصل'],['واجهة تجارية','حضور يليق بعلامتك','خدمات احترافية','استكشف خدماتنا']],
  certificate: [['شهادة تقدير','شهادة رقمية','اسم المستفيد','تقديراً للإنجاز والتميّز'],['شهادة مشاركة','شهادة قابلة للطباعة','اسم المشارك','مشاركة فاعلة ومميزة']]
};
function makeSampleArt(serviceId, variant) {
  const [title, kicker, sub, detail] = variant;
  const art = document.createElement('div'); art.className = `sample-art art-${serviceId}`;
  const inner = document.createElement('div'); inner.className = 'sample-art-inner';
  const add = (tag, cls, text) => { const el = document.createElement(tag); el.className = cls; if (text) el.textContent = text; inner.append(el); return el; };
  add('span', 'sample-kicker', kicker);
  if (['menu', 'catalog'].includes(serviceId)) {
    add('strong', 'sample-title', title);
    for (const item of variant.slice(2)) { const row = document.createElement('div'); row.className = 'mini-row'; const name = document.createElement('span'); name.textContent = item; const price = document.createElement('b'); price.textContent = serviceId === 'menu' ? '٤ د.أ' : '١٢ د.أ'; row.append(name, price); inner.append(row); }
  } else if (serviceId === 'cv') {
    add('strong', 'sample-title', sub); add('span', 'sample-sub', detail); const lines = document.createElement('div'); lines.className = 'cv-lines'; inner.append(lines);
  } else if (serviceId === 'qr') {
    add('strong', 'sample-title', title); const qr = document.createElement('div'); qr.className = 'fake-qr'; qr.setAttribute('aria-hidden', 'true'); inner.append(qr); add('span', 'sample-sub', detail);
  } else {
    if (['wedding', 'birthday'].includes(serviceId)) add('span', 'sample-icon', meta.icon);
    add('strong', 'sample-title', title);
    if (['card', 'links', 'website', 'wedding', 'birthday'].includes(serviceId)) add('span', 'sample-sub', sub);
    add('span', 'sample-sub', detail);
  }
  art.append(inner); return art;
}
function renderSamples(serviceId) {
  const gallery = $('sampleGallery'), dialog = $('sampleDialog');
  for (const [index, variant] of (sampleCopy[serviceId] || []).entries()) {
    const card = document.createElement('button'); card.type = 'button'; card.className = 'sample-card';
    const art = makeSampleArt(serviceId, variant), caption = document.createElement('span'); caption.className = 'sample-caption';
    const title = document.createElement('b'); title.textContent = variant[0]; const hint = document.createElement('small'); hint.textContent = 'معاينة توضيحية · اضغط للتكبير'; caption.append(title, hint); card.append(art, caption);
    card.addEventListener('click', () => { const enlarged = art.cloneNode(true); $('sampleDialogContent').replaceChildren(enlarged); if (!dialog.open) dialog.showModal(); });
    gallery.append(card);
  }
  $('dialogClose').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
}
if (!meta) say('الخدمة غير متاحة. ارجع إلى قائمة الخدمات.');
else {
  const { data: service, error } = await db.from('services').select('id,title,price_fils').eq('id', id).eq('active', true).maybeSingle();
  if (error || !service) say('تعذر تحميل الخدمة حالياً. حاول مرة أخرى.');
  else {
    $('title').textContent = service.title; $('desc').textContent = meta.description;
    renderSamples(id);
    $('mock').replaceChildren(Object.assign(document.createElement('span'), { textContent: meta.icon }), Object.assign(document.createElement('small'), { textContent: 'تصميم رقمي من تمّ' }));
    $('eta').textContent = `مدة التسليم المستهدفة بعد اعتماد الدفع: ${meta.eta} دقيقة تقريباً.`;
    for (const item of meta.features) { const span = document.createElement('span'); span.textContent = item; $('features').append(span); }
    const { data: packages, error: packageError } = await db.from('service_packages').select('tier,price_fils').eq('service_id', id).eq('enabled', true);
    if (packageError) { say('تعذر تحميل الباقات. حاول مرة أخرى.'); }
    else {
      const tiers = [{ tier: 'basic', price_fils: service.price_fils }, ...(packages || []).sort((a,b) => ['advanced','vip'].indexOf(a.tier) - ['advanced','vip'].indexOf(b.tier))];
      for (const tier of tiers) {
        const card = document.createElement('article'), title = document.createElement('h3'), price = document.createElement('strong'), list = document.createElement('ul'), button = document.createElement('a');
        title.textContent = tierNames[tier.tier]; price.textContent = money(tier.price_fils);
        const benefits = packageFeaturesFor(id, tier.tier);
        for (const benefit of benefits) { const li = document.createElement('li'); li.textContent = benefit; list.append(li); }
        list.className = 'features-list'; button.className = 'buy'; button.textContent = 'اطلب الآن';
        const params = new URLSearchParams({ service: id, tier: tier.tier }); if (q.get('ref')) params.set('ref', q.get('ref'));
        button.href = `order.html?${params}`; card.append(title, price, list, button); $('packages').append(card);
      }
    }
  }
}
