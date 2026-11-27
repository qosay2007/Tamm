import { db, $, services, tierNames, packageFeaturesFor, say } from './shared.js?v=20261127-tiers';
const q = new URLSearchParams(location.search), id = q.get('service'), meta = services[id];
const money = (fils) => (Number(fils) / 1000).toFixed(3).replace(/\.000$/, '') + ' د.أ';
if (!meta) say('الخدمة غير متاحة. ارجع إلى قائمة الخدمات.');
else {
  const { data: service, error } = await db.from('services').select('id,title,price_fils').eq('id', id).eq('active', true).maybeSingle();
  if (error || !service) say('تعذر تحميل الخدمة حالياً. حاول مرة أخرى.');
  else {
    $('title').textContent = service.title; $('desc').textContent = meta.description;
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
