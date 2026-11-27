import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

export const db = createClient(
  'https://coydxucjwjpzlkzsujvz.supabase.co',
  'sb_publishable_woh5NjzRRHhXB0K2vtOMnQ_SKYhdHP9'
);
export const $ = (id) => document.getElementById(id);
export const tierNames = { basic: 'أساسية', advanced: 'متقدمة', vip: 'VIP' };
export const services = {
  cv: { description: 'سيرة ذاتية منظمة للطباعة، مع أقسام واضحة للخبرة والتعليم والمهارات.', icon: '📄', eta: 15, fields: ['الاسم الكامل','المسمى المهني','رقم الهاتف','البريد الإلكتروني','المحافظة','التعليم','الخبرات','المهارات','اللغات','رابط LinkedIn'], required: ['الاسم الكامل','المسمى المهني'], inputTypes: { 'رقم الهاتف':'tel','البريد الإلكتروني':'email','رابط LinkedIn':'url' }, uploadLimits: { basic: 1, advanced: 3, vip: 5 }, features: ['تنسيق سيرة واضح وقابل للطباعة','أقسام مرتبة للخبرات والتعليم والمهارات','إرفاق صورة شخصية اختيارية'] },
  wedding: { description: 'دعوة زفاف رقمية بأسماء العروسين والموعد والمكان، مع عدّ تنازلي ورابط تأكيد حضور.', icon: '💍', eta: 30, fields: ['اسم العريس','اسم العروس','التاريخ','الساعة','اسم القاعة','عنوان القاعة','رقم واتساب لتأكيد الحضور','نص الدعوة'], required: ['اسم العريس','اسم العروس','التاريخ','الساعة','اسم القاعة'], inputTypes: { 'التاريخ':'date','الساعة':'time','رقم واتساب لتأكيد الحضور':'tel' }, uploadLimits: { basic: 1, advanced: 3, vip: 5 }, features: ['تصميم دعوة متجاوب','عدّ تنازلي للموعد','خريطة للقاعة عند إدخال العنوان','زر تأكيد حضور عبر واتساب','صورة واحدة اختيارية'] },
  birthday: { description: 'بطاقة عيد ميلاد رقمية فيها رسالة مفاجأة تفتح عند التفاعل.', icon: '🎂', eta: 15, fields: ['اسم صاحب المناسبة','اسم المرسل','التاريخ','الساعة','المكان','رقم واتساب للرد','رسالة التهنئة'], required: ['اسم صاحب المناسبة','التاريخ'], inputTypes: { 'التاريخ':'date','الساعة':'time','رقم واتساب للرد':'tel' }, uploadLimits: { basic: 1, advanced: 3, vip: 5 }, features: ['بطاقة احتفالية متحركة','رسالة تظهر عند فتح المفاجأة','عدّ تنازلي للمناسبة','مشاركة سهلة عبر واتساب','صورة اختيارية'] },
  card: { description: 'بطاقة أعمال رقمية تتيح الاتصال والحفظ المباشر لجهة الاتصال.', icon: '💳', eta: 15, fields: ['اسم النشاط','المسمى','رقم الهاتف','رقم واتساب','البريد الإلكتروني','المدينة أو العنوان','رابط Instagram','الموقع الإلكتروني'], required: ['اسم النشاط','رقم الهاتف'], inputTypes: { 'رقم الهاتف':'tel','رقم واتساب':'tel','البريد الإلكتروني':'email','رابط Instagram':'url','الموقع الإلكتروني':'url' }, uploadLimits: { basic: 1, advanced: 3, vip: 5 }, features: ['أزرار اتصال وبريد وواتساب','تنزيل جهة الاتصال بصيغة VCF','رمز QR لمعلومات البطاقة','شعار أو صورة اختيارية'] },
  qr: { description: 'رمز QR واضح عالي الدقة للرابط الذي تختاره، جاهز للحفظ والطباعة.', icon: '▦', eta: 5, fields: ['الرابط','عنوان الرمز'], required: ['الرابط'], inputTypes: { 'الرابط':'url' }, uploadLimits: { advanced: 1, vip: 1 }, features: ['رمز قابل للمسح','تنزيل بصيغة PNG','فحص أن الرابط صالح قبل إنشاء الطلب'] },
  links: { description: 'صفحة هاتفية تجمع روابطك المهمة في مكان واحد.', icon: '🔗', eta: 10, fields: ['اسم الصفحة','نبذة قصيرة','رقم واتساب'], required: ['اسم الصفحة'], inputTypes: { 'رقم واتساب':'tel' }, repeat: 'links', uploadLimits: { basic: 1, advanced: 3, vip: 5 }, repeatLimits: { basic: 5, advanced: 10, vip: 15 }, features: ['روابط قابلة للنقر','زر واتساب مباشر','رمز QR لمشاركة الصفحة','صورة شخصية أو شعار اختياري'] },
  catalog: { description: 'كتالوج لعرض المنتجات والأسعار مع بحث وطلب مباشر عبر واتساب.', icon: '📚', eta: 30, fields: ['اسم المتجر','نبذة عن المتجر','رقم واتساب لاستقبال الطلبات'], required: ['اسم المتجر','رقم واتساب لاستقبال الطلبات'], inputTypes: { 'رقم واتساب لاستقبال الطلبات':'tel' }, repeat: 'items', uploadLimits: { basic: 1, advanced: 3, vip: 5 }, repeatLimits: { basic: 5, advanced: 10, vip: 15 }, features: ['بطاقات منتجات مع الأسعار والأوصاف','بحث داخل المنتجات','إنشاء رسالة طلب وإرسالها عبر واتساب','صورة غلاف اختيارية'] },
  menu: { description: 'منيو مطعم مرتب مع بحث وتجميع الطلبات وإرسالها عبر واتساب.', icon: '🍽️', eta: 30, fields: ['اسم المطعم','نبذة عن المطعم','رقم واتساب لاستقبال الطلبات'], required: ['اسم المطعم','رقم واتساب لاستقبال الطلبات'], inputTypes: { 'رقم واتساب لاستقبال الطلبات':'tel' }, repeat: 'items', uploadLimits: { basic: 1, advanced: 3, vip: 5 }, repeatLimits: { basic: 5, advanced: 10, vip: 15 }, features: ['أصناف وأسعار وأوصاف','بحث سريع في المنيو','سلة بسيطة وتجميع الطلبات','إرسال الطلب عبر واتساب','صورة غلاف اختيارية'] },
  website: { description: 'صفحة تعريفية متجاوبة تعرض نشاطك وخدماتك وطرق التواصل.', icon: '▣', eta: 60, fields: ['اسم الموقع أو النشاط','عنوان ترحيبي','نبذة','الخدمات','الأعمال أو المشاريع','رقم الهاتف','رقم واتساب','البريد الإلكتروني','المدينة أو العنوان','رابط Instagram'], required: ['اسم الموقع أو النشاط','نبذة'], inputTypes: { 'رقم الهاتف':'tel','رقم واتساب':'tel','البريد الإلكتروني':'email','رابط Instagram':'url' }, uploadLimits: { basic: 1, advanced: 3, vip: 5 }, features: ['واجهة تعريفية متجاوبة','أقسام للخدمات والأعمال','أزرار تواصل مباشرة','صورة غلاف اختيارية'] },
  certificate: { description: 'شهادة رقمية بتصميم أنيق للاستخدامات غير الرسمية، قابلة للطباعة.', icon: '🏅', eta: 10, fields: ['اسم المستفيد','نوع الشهادة','سبب التكريم أو المشاركة','الجهة المانحة','التاريخ','اسم الموقّع المصرح'], required: ['اسم المستفيد','سبب التكريم أو المشاركة','الجهة المانحة'], inputTypes: { 'التاريخ':'date' }, uploadLimits: { basic: 1, advanced: 3, vip: 5 }, features: ['تصميم شهادة قابل للطباعة','اسم المستفيد والجهة والتاريخ','رقم طلب للتحقق من رابط التسليم','شعار الجهة الاختياري','لا تستخدم كبديل عن الشهادات الرسمية'] }
};
const repeatLabels = { links: { singular: 'رابط', plural: 'روابط' }, items: { singular: 'صنف أو منتج', plural: 'أصناف أو منتجات' } };
export function packageFeaturesFor(serviceId, tier) {
  const meta = services[serviceId];
  if (!meta) return [];
  const features = [...meta.features];
  const limit = Number(meta.repeatLimits?.[tier] || 0);
  if (limit) features.unshift(`إضافة حتى ${limit} ${repeatLabels[meta.repeat].plural}`);
  if (serviceId === 'qr') {
    if (tier === 'advanced') features.push('اختيار شعار لإظهاره داخل الرمز مع هامش أمان للمسح');
    if (tier === 'vip') features.push('شعار داخل الرمز بتصميم ذهبي فاخر مع هامش أمان للمسح');
  } else if (tier === 'advanced') {
    features.push('تصميم متقدم بألوان متناسقة مع نوع الخدمة');
  } else if (tier === 'vip') {
    features.push('قالب VIP ذهبي بتنسيق مخصص للخدمة');
  }
  const uploadLimit = Number(meta.uploadLimits?.[tier] || 0);
  if (uploadLimit && tier !== 'basic') features.push(serviceId === 'qr' ? 'إرفاق شعار واحد للرمز' : `إرفاق حتى ${uploadLimit} صور أو ملفات مرجعية`);
  if (tier === 'vip') features.push('زر حفظ أو طباعة المنتج بصيغة PDF');
  return features;
}
export function say(message, target = 'msg') { const el = $(target); if (el) el.textContent = message; }
export function safeFileExtension(file) {
  return ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif', 'application/pdf': 'pdf' })[file.type] || '';
}
