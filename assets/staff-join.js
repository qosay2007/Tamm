import { db, $ } from './shared.js?v=20261128-invite1';

const inviteToken = new URLSearchParams(location.search).get('invite') || '';
const tokenValid = /^[0-9a-f]{64}$/i.test(inviteToken);
let currentSession = null;
const say = (text) => { $('msg').textContent = text; };

function renderSession(session) {
  currentSession = session;
  const signedIn = Boolean(session?.user?.id);
  $('signupForm').hidden = signedIn;
  $('loginForm').hidden = signedIn;
  $('activateBox').hidden = !signedIn;
  if (signedIn) $('signedEmail').textContent = `مسجل الدخول بالبريد: ${session.user.email || '—'}`;
}

async function refreshSession() {
  const { data, error } = await db.auth.getSession();
  if (error) { say('تعذر التحقق من الجلسة. أعد تحميل الصفحة وحاول مرة أخرى.'); return; }
  renderSession(data.session);
  if (!tokenValid) say('رابط الدعوة غير صالح أو ناقص. اطلب من المدير إنشاء رابط جديد.');
  else if (data.session) say('تأكد أن هذا هو البريد المحدد في الدعوة، ثم اضغط تفعيل عضويتي.');
}

$('signupForm').onsubmit = async (event) => {
  event.preventDefault();
  if (!tokenValid) return say('رابط الدعوة غير صالح أو منتهي. اطلب من المدير رابطاً جديداً.');
  const email = $('signupEmail').value.trim().toLowerCase();
  const password = $('signupPassword').value;
  if (password !== $('confirmPassword').value) return say('كلمتا المرور غير متطابقتين.');
  const button = event.target.querySelector('button[type="submit"]'); button.disabled = true;
  try {
    // The account page is already the project's configured Auth redirect URL.
    // It forwards the invite after Supabase has restored the confirmed session.
    const redirect = new URL('account.html', location.origin);
    redirect.searchParams.set('staff_invite', inviteToken);
    const { data, error } = await db.auth.signUp({ email, password, options: { emailRedirectTo: redirect.href } });
    if (error) return say(error.message.includes('Password') ? 'كلمة المرور يجب أن تكون 8 أحرف على الأقل.' : 'تعذر إنشاء الحساب. راجع البريد وكلمة المرور وحاول مرة أخرى.');
    renderSession(data.session);
    say(data.session ? 'تم إنشاء الحساب. اضغط «تفعيل عضويتي» لإكمال الانضمام.' : 'أرسلنا رسالة تأكيد إلى البريد. أكّد البريد ثم ارجع إلى رابط الدعوة وسجّل دخولك لإكمال الانضمام.');
  } finally { button.disabled = false; }
};

$('loginForm').onsubmit = async (event) => {
  event.preventDefault();
  if (!tokenValid) return say('رابط الدعوة غير صالح أو منتهي. اطلب من المدير رابطاً جديداً.');
  const button = event.target.querySelector('button[type="submit"]'); button.disabled = true;
  try {
    const { data, error } = await db.auth.signInWithPassword({ email: $('loginEmail').value.trim(), password: $('loginPassword').value });
    if (error) return say('تعذر تسجيل الدخول. تأكد من البريد وكلمة المرور وأن البريد مؤكد.');
    renderSession(data.session); say('تم تسجيل الدخول. اضغط «تفعيل عضويتي» لإكمال الانضمام.');
  } finally { button.disabled = false; }
};

$('activate').onclick = async () => {
  if (!tokenValid) return say('رابط الدعوة غير صالح أو منتهي.');
  if (!currentSession?.user?.id) return say('سجّل الدخول بالبريد الذي استلم الدعوة أولاً.');
  const button = $('activate'); button.disabled = true;
  try {
    const { error } = await db.rpc('claim_staff_invite_v1', { p_token: inviteToken });
    const messages = {
      'Invite unavailable': 'الدعوة غير صالحة أو انتهت أو استُخدمت. اطلب من المدير رابطاً جديداً.',
      'Invite email mismatch': 'البريد المسجل لا يطابق البريد المحدد في الدعوة. سجّل الدخول بالبريد الذي استلمها.',
      'Email confirmation required': 'أكد بريدك من الرسالة الواردة قبل تفعيل العضوية.',
      'User already has a staff role': 'هذا الحساب لديه دور موظف مسبقاً. تواصل مع المدير إذا كنت تحتاج تحديثه.',
      'Admin permission required': 'لا يمكن إكمال هذه الدعوة من هذا الحساب.'
    };
    if (error) return say(messages[error.message] || 'تعذر تفعيل العضوية. تأكد من تأكيد البريد وأن الدعوة ما زالت صالحة.');
    $('activateBox').hidden = true; $('staffLink').hidden = false;
    say('تم التحقق من الدعوة وتفعيل عضويتك.');
  } finally { button.disabled = false; }
};

if (!tokenValid) {
  $('signupForm').hidden = true; $('loginForm').hidden = true;
  say('رابط الدعوة غير صالح أو ناقص. اطلب من المدير إنشاء رابط جديد.');
} else {
  await refreshSession();
  db.auth.onAuthStateChange((_event, session) => renderSession(session));
}
