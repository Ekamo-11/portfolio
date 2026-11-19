// 管理カレンダー（管理UI + Cloud Functions連携）

const PROJECT_ID = 'moridemo-fc84c';
const REGION = 'us-central1';
const CF_BASE = `https://${REGION}-${PROJECT_ID}.cloudfunctions.net`;

// Firebase SDK v11（app.js と整合）
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-functions.js';

const firebaseConfig = {
  apiKey: 'AIzaSyCHo8lYAuJEfkee1ID-jgWEoaCTPrjc7ps',
  // ↓ ここを moridemo.com ではなく、元のプロジェクト専用ドメインに戻す
  authDomain: 'moridemo-fc84c.firebaseapp.com', 
  projectId: PROJECT_ID,
  appId: '1:183335636473:web:46c5ae1ad359a484af8128',
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({
  prompt: 'select_account'
});
const fns = getFunctions(app, REGION);

// 状態
const state = {
  cursor: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  snapshot: { blocked: new Set(), byDate: {} },
  bulk: { active: false, selected: new Set() }
};

// Utils
const pad2 = (n) => String(n).padStart(2, '0');
const toDateStr = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const findCell = (dateStr) => document.querySelector(`#calendar [data-date="${dateStr}"]`);

function setCellAsBlocked(cell, yes) {
  if (!cell) return;
  cell.classList.toggle('blocked', !!yes);
  const badge = cell.querySelector('.day-badge');
  if (badge && yes) badge.textContent = '－';
}

async function fetchMonthSnapshot(year, month) {
  const url = `${CF_BASE}/getMonthSnapshot?year=${year}&month=${month}`;
  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) throw new Error(`getMonthSnapshot ${res.status}`);
  const data = await res.json();
  const blockedSet = new Set();
  if (Array.isArray(data.blocked)) data.blocked.forEach(d => blockedSet.add(d));
  if (Array.isArray(data.blockedDates)) data.blockedDates.forEach(d => blockedSet.add(d));
  if (data.calendar && typeof data.calendar === 'object') {
    Object.entries(data.calendar).forEach(([k, v]) => { if (v && v.blocked === true) blockedSet.add(k); });
  }
  const byDate = (data && typeof data.byDate === 'object') ? data.byDate : {};
  return { blocked: blockedSet, byDate };
}

async function callSetBlockedBulk(year, month, weekday, blocked = true) {
  const last = new Date(year, month, 0).getDate();
  const dates = [];
  for (let d = 1; d <= last; d++) {
    const dt = new Date(year, month - 1, d);
    if (dt.getDay() === Number(weekday)) dates.push(toDateStr(dt));
  }
  const setBlocked = httpsCallable(fns, 'setBlockedBulk');
  return (await setBlocked({ dates, blocked })).data;
}

function computeMarkFrom(info) {
  const slots = ['AM', 'PM', 'EV'];
  let available = 0;
  for (let i = 0; i < slots.length; i++) {
    const used = (info && typeof info === 'object' && (info[slots[i]] || 0)) || 0;
    if (used < 1) available++;
  }
  if (available === 3) return '◯';
  if (available === 0) return '×';
  return '△';
}

// ↓↓↓ ここからコピーして slotLabel 関数を上書き ↓↓↓

function slotLabel(slot) {
  switch (String(slot || '')) {
    case 'AM': return '10:30-13:30'; // 午前 → 時間表記へ
    case 'PM': return '15:00-18:00'; // 午後 → 時間表記へ
    case 'EV': return '19:00-22:00'; // 夜間 → 時間表記へ
    default: return String(slot || '');
  }
}

// ↑↑↑ ここまでコピー ↑↑↑

function renderCalendar() {
  const cal = document.getElementById('calendar');
  if (!cal) return;

  cal.innerHTML = '';
  ['日', '月', '火', '水', '木', '金', '土'].forEach(h => {
    const hd = document.createElement('div');
    hd.className = 'head';
    hd.textContent = h;
    cal.appendChild(hd);
  });

  const y = state.cursor.getFullYear();
  const m = state.cursor.getMonth();
  const first = new Date(y, m, 1);
  const firstWeekday = first.getDay();
  const lastDate = new Date(y, m + 1, 0).getDate();

  for (let i = 0; i < firstWeekday; i++) cal.appendChild(document.createElement('div'));

  for (let d = 1; d <= lastDate; d++) {
    const date = new Date(y, m, d);
    const dateStr = toDateStr(date);
    const cell = document.createElement('button');
    cell.className = 'day';
    cell.dataset.date = dateStr;
    cell.innerHTML = `<div class="date">${d}</div><div class="day-badge">◯</div>`;

    // mark
    if (!state.snapshot.blocked.has(dateStr)) {
      const info = state.snapshot.byDate[dateStr];
      const badge = cell.querySelector('.day-badge');
      if (badge && info) badge.textContent = computeMarkFrom(info);
    }
    if (state.snapshot.blocked.has(dateStr)) setCellAsBlocked(cell, true);

    cell.addEventListener('click', async () => {
      const ds = cell.dataset.date;
      if (state.bulk.active) {
        const on = cell.classList.toggle('selected');
        if (on) state.bulk.selected.add(ds); else state.bulk.selected.delete(ds);
        updateBulkCount();
        return;
      }
      await showDayDetail(ds);
    });

    cal.appendChild(cell);
  }

  const label = document.getElementById('monthLabel');
  if (label) label.textContent = y + '年 ' + (m + 1) + '月';
}

async function refreshMonth() {
  const y = state.cursor.getFullYear();
  const m = state.cursor.getMonth() + 1;
  const snap = await fetchMonthSnapshot(y, m);
  state.snapshot.blocked = snap.blocked;
  state.snapshot.byDate = snap.byDate || {};
  renderCalendar();
}

function hookupNav() {
  const prev = document.getElementById('prevMonth');
  const next = document.getElementById('nextMonth');
  if (prev) prev.addEventListener('click', async () => { state.cursor = new Date(state.cursor.getFullYear(), state.cursor.getMonth() - 1, 1); await refreshMonth(); });
  if (next) next.addEventListener('click', async () => { state.cursor = new Date(state.cursor.getFullYear(), state.cursor.getMonth() + 1, 1); await refreshMonth(); });
}

// ↓↓↓ これをコピーして admin.js の hookupWeekdayButtons を上書き ↓↓↓

function hookupWeekdayButtons() {
  const b1 = document.getElementById('blockWeekday');
  const b2 = document.getElementById('unblockWeekday');
  if (!b1 || !b2) return;

  // チェックされた曜日を取得する関数
  const getSelectedWeekdays = () => {
    const checked = Array.from(document.querySelectorAll('input[name="wd"]:checked'));
    return checked.map(el => Number(el.value));
  };

  // 複数曜日のブロック処理を実行する関数
  const applyWeekdays = async (blocked) => {
    const wds = getSelectedWeekdays();
    if (wds.length === 0) {
      alert('曜日を選択してください');
      return;
    }
    
    // 全ての日付を計算
    const y = state.cursor.getFullYear();
    const m = state.cursor.getMonth() + 1;
    const last = new Date(y, m, 0).getDate();
    const targetDates = [];

    for (let d = 1; d <= last; d++) {
      const dt = new Date(y, m - 1, d);
      // その日の曜日が、選択された曜日リストに含まれているか？
      if (wds.includes(dt.getDay())) {
        targetDates.push(toDateStr(dt));
      }
    }

    if (targetDates.length === 0) return;

    try {
      const setBlocked = httpsCallable(fns, 'setBlockedBulk');
      await setBlocked({ dates: targetDates, blocked });
      await refreshMonth();
      showToast(blocked ? '選択した曜日を予約不可にしました' : '解除しました');
    } catch(e) {
      console.error(e);
      showToast('失敗しました');
    }
  };

  b1.addEventListener('click', async () => {
    setBusy(b1, true);
    await applyWeekdays(true);
    setBusy(b1, false);
  });

  b2.addEventListener('click', async () => {
    setBusy(b2, true);
    await applyWeekdays(false);
    setBusy(b2, false);
  });
}
// ↑↑↑ ここまでコピー ↑↑↑

function hookupAuthButton() {
  const loginBtn = document.getElementById('btnSignIn');
  if (!loginBtn) return;
  loginBtn.addEventListener('click', () => { signInWithPopup(auth, provider).catch(console.error); });
  onAuthStateChanged(auth, (user) => {
    loginBtn.textContent = user ? 'ログイン中' : 'Googleで管理者ログイン';
    loginBtn.disabled = !!user;
  });
}

(function setupBulkControls(){
  const t = document.getElementById('toggleBulk');
  const bOn = document.getElementById('blockSel');
  const bOff = document.getElementById('unblockSel');
  const bClear = document.getElementById('clearSel');
  if(!t||!bOn||!bOff||!bClear) return;
  t.addEventListener('click', ()=>{
    state.bulk.active = !state.bulk.active;
    t.setAttribute('aria-pressed', state.bulk.active ? 'true' : 'false');
    t.classList.toggle('is-active', state.bulk.active);
    if(!state.bulk.active) clearBulkSelection();
    updateBulkCount();
  });
  bClear.addEventListener('click', ()=> clearBulkSelection());
  async function applySelected(blocked){
    if(state.bulk.selected.size===0) return;
    try{
      setBusy(bOn, true); setBusy(bOff, true);
      const dates = Array.from(state.bulk.selected);
      const setBlocked = httpsCallable(fns, 'setBlockedBulk');
      await setBlocked({ dates, blocked });
      await refreshMonth();
      clearBulkSelection();
    }catch(e){ console.error(e); }
    finally { setBusy(bOn, false); setBusy(bOff, false); }
  }
  bOn.addEventListener('click', ()=> applySelected(true));
  bOff.addEventListener('click', ()=> applySelected(false));
})();

function updateBulkCount(){ const el=document.getElementById('bulkCount'); if(el) el.textContent = '選択 ' + state.bulk.selected.size + ' 日'; }
function clearBulkSelection(){ state.bulk.selected.clear(); document.querySelectorAll(`#calendar .day.selected`).forEach(e=>e.classList.remove('selected')); updateBulkCount(); }

function setBusy(id, on){ const el = typeof id==='string' ? document.getElementById(id) : id; if(!el) return; if(on){ el.classList.add('is-loading'); el.disabled = true; } else { el.classList.remove('is-loading'); el.disabled = false; } }
function showToast(message){ const el = document.getElementById('toast'); const text = (typeof message === 'string') ? message : String(message ?? ''); if(!el){ alert(text); return; } el.textContent = text; el.classList.add('show'); setTimeout(()=> el.classList.remove('show'), 2000); }

// ↓↓↓ ここからコピーして admin.js の showDayDetail 関数を上書き ↓↓↓

const listReservationsCF = httpsCallable(fns, 'listReservations');
const setBlockedCF = httpsCallable(fns, 'setBlockedBulk');
const cancelReservationCF = httpsCallable(fns, 'cancelReservation'); // ★追加：削除用関数

async function showDayDetail(dateStr){
  const card = document.getElementById('dayDetail');
  const title = document.getElementById('dayTitle');
  const list = document.getElementById('reservationList');
  const info = document.getElementById('countInfo');
  const btnBlock = document.getElementById('toggleBlockBtn');

  if (!card || !title || !list || !info || !btnBlock) return;

  title.textContent = `${dateStr}`;
  list.innerHTML = '読み込み中...';
  card.style.display = '';

  const isBlocked = state.snapshot.blocked.has(dateStr);
  
  if (isBlocked) {
    btnBlock.textContent = '予約不可を解除する';
    btnBlock.className = 'btn btn-primary';
  } else {
    btnBlock.textContent = 'この日を予約不可にする';
    btnBlock.className = 'btn btn-danger';
  }

  let items = [];

  try{
    const res = await listReservationsCF({ date: dateStr });
    items = (res.data && res.data.items) || [];
    
    // 時間順に並び替え
    const sortOrder = { 'AM': 1, 'PM': 2, 'EV': 3 };
    items.sort((a, b) => {
      const oA = sortOrder[a.slot] || 99;
      const oB = sortOrder[b.slot] || 99;
      return oA - oB;
    });

    info.textContent = `件数: ${items.length}`;

    if(items.length === 0){ 
      list.innerHTML = '<div class="muted">予約はありません</div>'; 
    } else {
      list.innerHTML = '';
      items.forEach(it=>{
        const div = document.createElement('div');
        div.className = 'item';
        div.innerHTML = `
          <div style="font-size:1.1em; margin-bottom:4px; display:flex; justify-content:space-between; align-items:flex-start;">
            <div>
              <strong>${slotLabel(it.slot)}</strong> 
              <span class="muted">/ ${it.session || ''}</span>
            </div>
            <button class="btn-cancel-res" data-id="${it.id}" style="font-size:12px; padding:4px 8px; background:#fff; border:1px solid #ef4444; color:#ef4444; border-radius:4px; cursor:pointer;">取消</button>
          </div>
          <div style="line-height:1.6;">
            ${it.name || ''}${it.kana ? '（' + it.kana + '）' : ''} 
            <br>
            <a href="mailto:${it.email}">${it.email || ''}</a> / ${it.phone || ''}
          </div>
          <div style="font-size:0.9em; color:#64748b; margin-top:4px;">
            方法: ${it.onlineTool || (it.inperson ? '対面' : '')}, 
            既往: ${it.past || ''}, 
            支払い: ${it.payment || ''}
          </div>
          ${it.message ? `<div style="background:#f1f5f9; padding:8px; margin-top:6px; border-radius:6px; font-size:0.9em;">${it.message}</div>` : ''}
        `;
        list.appendChild(div);
      });

      // ★追加：削除ボタンのイベント設定
      document.querySelectorAll('.btn-cancel-res').forEach(btn => {
        btn.onclick = async (e) => {
          e.stopPropagation(); // 親要素のクリックイベントを止める
          const resId = btn.dataset.id;
          if(!confirm('本当にこの予約を取り消しますか？\n（この操作は元に戻せません）')) return;

          try {
            btn.textContent = '...';
            btn.disabled = true;
            await cancelReservationCF({ reservationId: resId });
            showToast('予約を取り消しました');
            // 画面更新
            await refreshMonth();
            await showDayDetail(dateStr);
          } catch(err) {
            console.error(err);
            alert('削除に失敗しました');
            btn.textContent = '取消';
            btn.disabled = false;
          }
        };
      });
    }

  }catch(e){
    console.error(e);
    list.innerHTML = '<div class="muted">取得に失敗しました</div>';
  }

  // ブロックボタンの動作
  btnBlock.onclick = async () => {
    if (!isBlocked && items.length > 0) {
      const msg = `【警告】\nこの日には既に ${items.length} 件の予約が入っています。\n\n予約不可に設定しても既存の予約は消えませんが、\nこれ以上の新規予約はできなくなります。\n\n本当に変更しますか？`;
      if (!confirm(msg)) return;
    }
    try {
      btnBlock.disabled = true;
      btnBlock.textContent = '処理中...';
      await setBlockedCF({ dates: [dateStr], blocked: !isBlocked });
      await refreshMonth();
      await showDayDetail(dateStr);
      showToast(isBlocked ? '予約不可を解除しました' : 'この日を予約不可にしました');
    } catch(e) {
      console.error(e);
      alert('エラーが発生しました');
    } finally {
      btnBlock.disabled = false;
    }
  };
}

// ↑↑↑ ここまでコピー ↑↑↑

(async function main(){
  hookupNav();
  hookupWeekdayButtons();
  hookupAuthButton();
  renderCalendar();
  await refreshMonth();
})();
