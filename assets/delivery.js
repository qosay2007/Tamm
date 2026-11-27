import QRCode from 'https://cdn.jsdelivr.net/npm/qrcode@1.5.4/+esm';
import { db, $, tierNames, say } from './shared.js';
const id = new URLSearchParams(location.search).get('id');
const labels = { qr:'رمز QR',cv:'السيرة الذاتية',certificate:'شهادة تقدير',birthday:'دعوة عيد ميلاد',wedding:'دعوة زفاف',card:'بطاقة أعمال',links:'روابط شخصية',website:'موقع شخصي',menu:'قائمة الطعام',catalog:'كتالوج المنتجات' };
if (!id || !/^[0-9a-f-]{36}$/i.test(id)) say('رابط الاستلام غير صالح.');
else {
  const { data, error } = await db.rpc('get_generated_document', { p_order: id });
  const doc = data?.[0];
  if (error || !doc) say('التصميم غير متاح بعد. تأكد من اعتماد الدفع من صفحة متابعة الطلب.');
  else {
    const content = doc.content || {}, tier = content.package_tier || 'basic';
    $('title').textContent = labels[doc.service_id] || 'تصميم تمّ'; $('doc').classList.add(doc.service_id, tier);
    $('doc').dataset.tier = tierNames[tier] || tierNames.basic;
    let text = String(content.text || '');
    if (['cv','certificate','birthday','wedding','card','website'].includes(doc.service_id)) {
      const pairs = text.split(/\n+/).filter(Boolean).map((line) => { const i = line.indexOf(': '); return i > 0 ? [line.slice(0,i),line.slice(i+2)] : ['',line]; });
      const headings = { cv:['الاسم الكامل'],certificate:['اسم المستفيد'],birthday:['اسم صاحب المناسبة'],wedding:['اسم العريس','اسم العروس'],card:['اسم النشاط'],website:['اسم الموقع'] };
      $('name').textContent = pairs.filter(([key]) => headings[doc.service_id]?.includes(key)).map(([,value]) => value).join(' و ');
      $('content').replaceChildren(...pairs.filter(([key]) => !headings[doc.service_id]?.includes(key)).map(([key,value]) => {
        const field = document.createElement('div'), label = document.createElement('strong'), body = document.createElement('span');
        field.className = 'field'; label.textContent = key || 'التفاصيل'; body.textContent = value; field.append(label,body); return field;
      }));
    } else if (doc.service_id === 'qr') {
      const canvas = document.createElement('canvas'); canvas.style.maxWidth = '100%';
      try { await QRCode.toCanvas(canvas, text.trim(), { width: 320, margin: 4, errorCorrectionLevel: 'M' }); $('content').append(canvas); const save = document.createElement('a'); save.textContent = 'حفظ QR بصيغة PNG'; save.download = 'TAMM-QR.png'; save.href = canvas.toDataURL('image/png'); $('content').append(document.createElement('br'),save); }
      catch { say('تعذر إنشاء رمز QR. راجع الرابط وأرسل رقم الطلب للدعم.'); }
    } else if (doc.service_id === 'links') {
      $('content').replaceChildren(...text.split(/\n+/).filter(Boolean).map((line) => {
        const row = document.createElement('p'), match = line.match(/^(.*?)\s*\|\s*(https:\/\/\S+)$/i);
        if (!match) row.textContent = line; else { const a = document.createElement('a'); a.href = match[2]; a.rel = 'noopener noreferrer'; a.textContent = match[1] || match[2]; row.append(a); }
        return row;
      }));
    } else if (['menu','catalog'].includes(doc.service_id)) {
      $('content').replaceChildren(...text.split(/\n+/).filter(Boolean).map((line) => { const row = document.createElement('div'); row.className = 'field'; row.textContent = line; return row; }));
    } else $('content').textContent = text;

    $('doc').classList.toggle('invite',['birthday','wedding'].includes(doc.service_id));
    const attachments = Array.isArray(content.attachments) ? content.attachments.slice(0,5) : [];
    for (const file of attachments) {
      const { data: object, error: downloadError } = await db.storage.from('tamm-order-files').download(file.path);
      if (downloadError || !object) continue;
      const url = URL.createObjectURL(object);
      if (String(file.type).startsWith('image/')) { const img = document.createElement('img'); img.src = url; img.alt = file.name || 'صورة مرفقة بالتصميم'; $('attachments').append(img); }
      else { const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'فتح الملف: ' + (file.name || 'ملف مرفق'); $('attachments').append(a); }
    }
    $('doc').hidden = false; $('print').hidden = false;
    say(`التصميم جاهز — باقة ${tierNames[tier] || tierNames.basic}. احفظه أو اطبعه من جهازك.`);
    $('print').onclick = () => window.print();
  }
}
