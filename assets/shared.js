import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

export const db = createClient(
  'https://coydxucjwjpzlkzsujvz.supabase.co',
  'sb_publishable_woh5NjzRRHhXB0K2vtOMnQ_SKYhdHP9'
);
export const $ = (id) => document.getElementById(id);
export const tierNames = { basic: 'أساسية', advanced: 'متقدمة', vip: 'VIP' };
export const tierFeatures = {
  basic: ['قالب الخدمة الأساسي', 'توليد وتسليم تلقائي بعد اعتماد الدفع'],
  advanced: ['قالب بتصميم متقدم', 'إرفاق حتى 3 صور أو ملفات مرجعية'],
  vip: ['تصميم VIP ذهبي مميز', 'إرفاق حتى 5 صور أو ملفات مرجعية', 'حفظ التصميم أو طباعته PDF']
};
export const services = {
  cv: { description: 'سيرة ذاتية منظمة وجاهزة للطباعة', icon: '📄', eta: 15, fields: ['الاسم الكامل','المسمى المهني','التعليم','الخبرات','المهارات','اللغات','وسائل التواصل'], features: ['أقسام الخبرات والمهارات','تنسيق واضح قابل للطباعة'] },
  wedding: { description: 'دعوة زفاف رقمية بأسماء العروسين وموعد الحفل', icon: '💍', eta: 30, fields: ['اسم العريس','اسم العروس','التاريخ','الساعة','المكان','نص الدعوة'], features: ['أسماء العروسين','الموعد والمكان','قالب زفاف احتفالي'] },
  birthday: { description: 'دعوة رقمية لعيد الميلاد بالاسم والموعد والمكان', icon: '🎂', eta: 15, fields: ['اسم صاحب المناسبة','التاريخ','الساعة','المكان','نص الدعوة'], features: ['بيانات المناسبة','قالب احتفالي'] },
  card: { description: 'بطاقة أعمال رقمية ببيانات النشاط والتواصل', icon: '💳', eta: 15, fields: ['اسم النشاط','المسمى','الهاتف','البريد الإلكتروني','روابط التواصل'], features: ['معلومات النشاط','بيانات التواصل'] },
  qr: { description: 'رمز QR قابل للحفظ لرابط تختاره', icon: '▦', eta: 5, fields: [], features: ['إنشاء QR للرابط','حفظ بصيغة PNG'] },
  links: { description: 'صفحة واحدة تجمع روابطك الشخصية', icon: '🔗', eta: 10, fields: [], repeat: 'links', features: ['روابط قابلة للنقر','واجهة مناسبة للهاتف'] },
  catalog: { description: 'كتالوج رقمي لعرض المنتجات والأسعار', icon: '📚', eta: 30, fields: [], repeat: 'items', features: ['أسماء المنتجات','الأسعار والأوصاف'] },
  menu: { description: 'قائمة رقمية للأصناف والأسعار', icon: '🍽️', eta: 30, fields: [], repeat: 'items', features: ['الأصناف والأسعار','عرض مرتب للعملاء'] },
  website: { description: 'صفحة تعريفية شخصية للخدمات والمشاريع', icon: '▣', eta: 60, fields: ['اسم الموقع','نبذة','الخدمات','المشاريع','بيانات التواصل'], features: ['نبذة وخدمات','المشاريع والتواصل'] },
  certificate: { description: 'شهادة رقمية باسم المستفيد والمناسبة', icon: '🏅', eta: 10, fields: ['اسم المستفيد','سبب التكريم','الجهة المانحة','التاريخ'], features: ['اسم المستفيد','سبب التكريم والتاريخ'] }
};
export function say(message, target = 'msg') { const el = $(target); if (el) el.textContent = message; }
export function safeFileExtension(file) {
  return ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif', 'application/pdf': 'pdf' })[file.type] || '';
}
