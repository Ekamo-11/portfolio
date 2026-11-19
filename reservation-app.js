// Import Firebase SDKs
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-functions.js";

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyCHo8lYAuJEfkee1ID-jgWEoaCTPrjc7ps",
  authDomain: "moridemo-fc84c.firebaseapp.com",
  projectId: "moridemo-fc84c",
  storageBucket: "moridemo-fc84c.firebasestorage.app",
  messagingSenderId: "183335636473",
  appId: "1:183335636473:web:46c5ae1ad359a484af8128",
  measurementId: "G-FZ6E06WQYY"
};

// Init
const app = initializeApp(firebaseConfig);
const functions = getFunctions(app, "us-central1");
const bookSlot = httpsCallable(functions, "bookSlot");

// HTTP GET for month snapshot
async function fetchMonthSnapshotHTTP(year, month){
  const url = `https://us-central1-${firebaseConfig.projectId}.cloudfunctions.net/getMonthSnapshot?year=${year}&month=${month}`;
  const res = await fetch(url, { method:'GET' });
  if(!res.ok){ throw new Error(`getMonthSnapshot ${res.status}`); }
  return await res.json();
}

// ===== Utilities =====
const today = new Date();
let MONTH_BY_DATE = {};        // { 'YYYY-MM-DD': { AM:0, PM:0, EV:0, total:0 } }
let MONTH_BLOCKED = new Set(); // Set<'YYYY-MM-DD'>

const SESSIONS = [
  '',
  'コスモヒプノセラピー[催眠療法]：初回',
  'コスモヒプノセラピー[催眠療法]：２回目以降',
  'シティホテルでのコスモヒプノセラピー[催眠療法]',
  'コスモカウンセリング：２時間',
  'コスモカウンセリング：３時間',
  'コスモコーチング：２時間',
  'コスモコーチング：３時間'
];

const DEFAULT_CAP = { AM: 1, PM: 1, EV: 1 };
function ymd(d){ const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), dd=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${dd}`; }
function daysInMonth(y,m){ return new Date(y, m+1, 0).getDate(); }
function startDow(y,m){ return new Date(y, m, 1).getDay(); }

// ===== State =====
let monthCursor = new Date(today.getFullYear(), today.getMonth(), 1);
let pickedDate = '';
let pickedSlot = '';

// ===== DOM =====
const monthLabel = document.getElementById('monthLabel');
const cal = document.getElementById('calendar');
const prevBtn = document.getElementById('prevMonth');
const nextBtn = document.getElementById('nextMonth');
const onlineToolRow = document.getElementById('onlineToolRow');
const slotPicker = document.getElementById('slotPicker');
const pickedInfo = document.getElementById('pickedInfo');

const SLOTS = [
  { id: 'AM', label: '10:30-13:30' },
  { id: 'PM', label: '15:00-18:00' },
  { id: 'EV', label: '19:00-22:00' },
];

// ★修正：サーバーデータ(MONTH_BY_DATE)のみを参照して判定する
function markFromServer(key){
  // 管理者ブロックされている日
  if (MONTH_BLOCKED.has(key)) return '－';
  
  // 予約データを確認
  const info = MONTH_BY_DATE[key] || { AM:0, PM:0, EV:0 };
  
  // 残席計算
  const remaining = ['AM','PM','EV'].reduce((n, k) => {
    // 定員(1) - 予約数(info[k])
    const currentBooked = info[k] || 0;
    return n + ((DEFAULT_CAP[k] - currentBooked) > 0 ? 1 : 0);
  }, 0);

  if (remaining === 3) return '◯'; // 3枠とも空き
  if (remaining === 0) return '×'; // 全て埋まり
  return '△'; // 一部埋まり
}

async function syncBlockedFromServer(){
  const y = monthCursor.getFullYear();
  const m = monthCursor.getMonth() + 1;
  const res = await fetchMonthSnapshotHTTP(y, m);
  
  // ブロックデータの同期
  const blockedSet = new Set();
  if (Array.isArray(res.blockedDates)) res.blockedDates.forEach(d=>blockedSet.add(d));
  MONTH_BLOCKED = blockedSet;
  
  // 予約状況データの同期
  MONTH_BY_DATE = (res && typeof res.byDate === 'object') ? res.byDate : {};
}

// Init selects
const ageSel = document.getElementById('age');
ageRanges().forEach(a=>{const o=document.createElement('option');o.value=a;o.textContent=a;ageSel.appendChild(o)});
const sesSel = document.getElementById('session');
SESSIONS.forEach(s=>{const o=document.createElement('option');o.value=s;o.textContent=s;sesSel.appendChild(o)});

// 初期ロード
(async () => { 
  await syncBlockedFromServer(); 
  renderCalendar(); 
  renderSlotPicker(); 
})();

prevBtn.onclick = async () => { monthCursor.setMonth(monthCursor.getMonth() - 1); await syncBlockedFromServer(); renderCalendar(); renderSlotPicker(); };
nextBtn.onclick = async () => { monthCursor.setMonth(monthCursor.getMonth() + 1); await syncBlockedFromServer(); renderCalendar(); renderSlotPicker(); };

function renderCalendar(){
  const y = monthCursor.getFullYear();
  const m = monthCursor.getMonth();
  monthLabel.textContent = `${y}年 ${m+1}月`;
  cal.innerHTML = '';

  '日月火水木金土'.split('').forEach(w=>{ const h=document.createElement('div'); h.className='head'; h.textContent=w; cal.appendChild(h); });
  for(let i=0;i<startDow(y,m);i++){ cal.appendChild(document.createElement('div')); }

  const dim = daysInMonth(y,m);
  for (let d = 1; d <= dim; d++) {
    const date = new Date(y, m, d);
    const key = ymd(date);
    const isPast = key < ymd(today);
    
    // サーバーデータに基づいてマークを決定
    const sym = markFromServer(key);

    const cell = document.createElement('button');
    cell.className = 'day';
    // 過去日 or 満席 or ブロックなら選択不可
    if (isPast || sym === '×' || sym === '－') cell.classList.add('disabled');
    
    // クラス付与（色付け用）
    let markClass = '';
    if(sym==='◯') markClass='mark-open';
    else if(sym==='△') markClass='mark-limited';
    else if(sym==='×') markClass='mark-full';
    else if(sym==='－') markClass='mark-blocked';

    cell.innerHTML = `<div class="date">${d}</div><div class="mark ${markClass}">${sym}</div>`;
    
    cell.onclick = () => { 
      pickedDate = key; pickedSlot = ''; 
      [...cal.querySelectorAll('.day')].forEach(e=>e.classList.remove('is-picked')); 
      cell.classList.add('is-picked'); 
      renderSlotPicker(); 
    };
    cal.appendChild(cell);
  }
}

function renderSlotPicker(){
  if (!pickedDate) { pickedInfo.textContent = 'カレンダーから日付を選択してください。'; slotPicker.innerHTML = ''; return; }
  pickedInfo.textContent = `選択中: ${pickedDate}`;
  
  slotPicker.innerHTML = '';
  
  // その日の予約状況を取得
  const info = MONTH_BY_DATE[pickedDate] || { AM:0, PM:0, EV:0 };
  const isBlocked = MONTH_BLOCKED.has(pickedDate);

  SLOTS.forEach(sl => {
    const cap = 1; 
    // サーバー上の予約数を確認
    const used = info[sl.id] || 0; 
    const rem = Math.max(0, cap - used);
    
    const b = document.createElement('button'); b.type='button'; b.className='slot';
    b.innerHTML = `<div>${sl.label}</div>` + (rem<=0 ? `<div class="hint">満席</div>` : '');
    
    // 満席またはブロック日なら押せない
    if (rem <= 0 || isBlocked) b.classList.add('disabled');
    
    b.onclick = () => { 
      if (b.classList.contains('disabled')) return; 
      pickedSlot = sl.id; 
      Array.from(slotPicker.children).forEach(x=>x.classList.remove('primary')); 
      b.classList.add('primary'); 
    };
    slotPicker.appendChild(b);
  });
}

function ageRanges(){ const arr=[]; for (let s=15; s<=79; s+=5){ arr.push(`${s}〜${s+4}歳`);} arr.push('80歳以上'); return arr; }

function updateOnlineToolVisibility(){
  const isOnline = document.querySelector('input[name="visit"]:checked')?.value === 'online';
  onlineToolRow.classList.toggle('hidden', !isOnline);
  const toolRadios = document.querySelectorAll('input[name="tool"]');
  toolRadios.forEach(el => { el.disabled = !isOnline; });
  if (!isOnline) { toolRadios.forEach(el => { el.checked = false; }); }
  else if (![...toolRadios].some(el => el.checked)) { const zoom = document.querySelector('input[name="tool"][value="Zoom"]'); if (zoom) zoom.checked = true; }
}

document.querySelectorAll('input[name="visit"]').forEach(r => r.addEventListener('change', updateOnlineToolVisibility));
updateOnlineToolVisibility();

// --- 住所検索機能 ---
const btnZip = document.getElementById('btnZip');
if (btnZip) {
  btnZip.onclick = async () => {
    const zipVal = document.getElementById('zip')?.value?.replace(/[^\d]/g,'') || '';
    if (zipVal.length < 7) { alert('郵便番号は7桁で入力してください'); return; }
    try {
      btnZip.textContent = '検索中...';
      const res = await fetch(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${zipVal}`);
      const data = await res.json();
      if (data.results) {
        const resData = data.results[0];
        const pref = document.getElementById('prefecture');
        if (pref) pref.value = resData.address1;
        const addr1 = document.getElementById('address1');
        if (addr1) addr1.value = resData.address2 + resData.address3;
        addr1.focus();
      } else {
        alert('該当する住所が見つかりませんでした');
      }
    } catch (e) {
      console.error(e);
      alert('住所検索に失敗しました');
    } finally {
      btnZip.textContent = '住所検索';
    }
  };
}

// --- 送信処理 ---
const form = document.getElementById('bookingForm');
form.onsubmit = async (e) => {
  e.preventDefault();
  
  // ★修正：hCaptchaのチェック削除
  // const captchaOk = ... (削除)

  const gv = id => document.getElementById(id)?.value?.trim() || '';
  const gr = name => document.querySelector(`input[name="${name}"]:checked`)?.value || '';

  const nameSei = gv('nameSei');
  const nameMei = gv('nameMei');
  const fullName = `${nameSei} ${nameMei}`.trim();

  const kanaSei = gv('kanaSei');
  const kanaMei = gv('kanaMei');
  const fullKana = `${kanaSei} ${kanaMei}`.trim();

  const zip = gv('zip');
  const pref = gv('prefecture');
  const addr1 = gv('address1');
  const addr2 = gv('address2');
  let fullAddress = '';
  if (pref || addr1) {
    fullAddress = `〒${zip} ${pref}${addr1} ${addr2}`.trim();
  }

  const data = {
    name: fullName,
    kana: fullKana,
    email: gv('email'), email2: gv('email2'),
    phone: gv('phone'),
    address: fullAddress,
    age: gv('age'), session: gv('session'),
    payment: gr('pay'), past: gr('past'), howKnown: gv('howKnown'),
    message: gv('message'),
  };
  
  const visit = gr('visit');
  const isOnline = (visit === 'online');
  data.inperson = !isOnline;
  data.onlineTool = isOnline ? (gr('tool') || 'Zoom') : '';

  if (data.email !== data.email2) { alert('メールアドレス（確認用）が一致しません'); return; }
  if (!nameSei || !nameMei) { alert('お名前を入力してください'); return; }
  if (!kanaSei || !kanaMei) { alert('フリガナを入力してください'); return; }
  if (!data.email || !data.phone || !data.age || !data.session || !visit || !data.payment || !data.past || !data.howKnown) {
    alert('必須項目が入力されていません'); return;
  }
  if (isOnline && !data.onlineTool) { alert('オンラインのツールを選択してください'); return; }

  if (!pickedDate) { alert('カレンダーの日付を選択してください'); return; }
  if (!pickedSlot) { alert('時間帯を選択してください'); return; }

  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = '送信中...';

  try {
    await bookSlot({ date: pickedDate, slot: pickedSlot, ...data });
    
    alert('予約を受け付けました');
    form.reset();
    pickedDate = '';
    pickedSlot = '';
    
    await syncBlockedFromServer();
    renderCalendar();
    renderSlotPicker();
    
    window.scrollTo({ top: 0, behavior: 'smooth' });

  } catch (err) { 
    console.error(err); 
    alert('送信に失敗しました: ' + (err.message || '不明なエラー')); 
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = '送信する';
  }
};