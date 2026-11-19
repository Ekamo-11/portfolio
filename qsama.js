const STORAGE_KEY = 'myQuizApp_Data_Unified';
let quizList = [];
let quizData = { title: "", time: 120, questions: {} };
let currentQuizIndex = null;
let isGameActive = false;
let currentId = null;
let timerInterval = null;
let timeLeft = 0;
let maxTime = 0;

const menuScreen = document.getElementById('menu-screen');
const setupScreen = document.getElementById('setup-screen');
const selectScreen = document.getElementById('select-screen');
const quizScreen = document.getElementById('quiz-screen');
const inputFields = document.getElementById('input-fields');
const answerInput = document.getElementById('answer-input');

window.onload = () => {
    inputFields.innerHTML = "";
    for (let i = 1; i <= 10; i++) {
        const id = i === 10 ? "0" : i.toString();
        const row = document.createElement('div');
        row.className = 'input-row';
        row.innerHTML = `<span>${i}:</span>
            <input type="text" id="q-${id}" placeholder="問題URL/テキスト">
            <input type="text" id="a-${id}" placeholder="答え または ドボン番号">`;
        inputFields.appendChild(row);
    }
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) quizList = JSON.parse(saved);
};

function showScreen(target) {
    [menuScreen, setupScreen, selectScreen, quizScreen].forEach(s => s.classList.add('hidden'));
    target.classList.remove('hidden');
}

function openSetupForNew() {
    currentQuizIndex = null;
    document.getElementById('main-title-input').value = "";
    document.getElementById('total-time-input').value = 120;
    document.querySelectorAll('#input-fields input').forEach(i => i.value = "");
    showScreen(setupScreen);
}

function editSelectedQuiz() {
    if (currentQuizIndex === null) return;
    const data = quizList[currentQuizIndex];
    document.getElementById('main-title-input').value = data.title;
    document.getElementById('total-time-input').value = data.time;
    for (let i = 1; i <= 10; i++) {
        const id = i === 10 ? "0" : i.toString();
        document.getElementById(`q-${id}`).value = data.questions[id].q || "";
        document.getElementById(`a-${id}`).value = data.questions[id].a || "";
    }
    showScreen(setupScreen);
}

function saveAndGoToMenu() {
    const newQuiz = {
        title: document.getElementById('main-title-input').value || "無題",
        time: parseInt(document.getElementById('total-time-input').value) || 120,
        questions: {}
    };
    for (let i = 1; i <= 10; i++) {
        const id = i === 10 ? "0" : i.toString();
        newQuiz.questions[id] = { q: document.getElementById(`q-${id}`).value, a: document.getElementById(`a-${id}`).value, solved: false };
    }
    if (currentQuizIndex !== null) quizList[currentQuizIndex] = newQuiz;
    else quizList.push(newQuiz);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(quizList));
    showSelectScreen();
    showScreen(menuScreen);
}

function showSelectScreen() {
    const container = document.getElementById('quiz-list-container');
    container.innerHTML = "";
    quizList.forEach((quiz, index) => {
        const div = document.createElement('div');
        div.className = 'quiz-item';
        div.innerHTML = `<span>${quiz.title}</span> 
            <div><button onclick="selectQuiz(${index})" class="btn primary" style="padding:5px 10px;">選択</button>
            <button onclick="deleteQuiz(${index})" class="btn" style="background:red; padding:5px 10px; margin-left:5px;">削除</button></div>`;
        container.appendChild(div);
    });
    showScreen(selectScreen);
}

function selectQuiz(index) {
    currentQuizIndex = index;
    quizData = JSON.parse(JSON.stringify(quizList[index]));
    document.getElementById('disp-quiz-title').innerText = "選択中: " + quizData.title;
    document.getElementById('quiz-config-area').classList.remove('hidden');
}

function deleteQuiz(index) {
    if (!confirm("削除しますか？")) return;
    quizList.splice(index, 1);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(quizList));
    showSelectScreen();
    document.getElementById('quiz-config-area').classList.add('hidden');
}

function normalizeNum(str) { return str.replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)); }

function changeQuestion(id) {
    const key = normalizeNum(id);
    if (!quizData.questions[key] || !quizData.questions[key].q) return;
    
    if (!isGameActive) startGlobalTimer();
    currentId = key;
    
    answerInput.value = "";
    answerInput.blur(); 
    document.getElementById('result-message').innerText = "";
    
    const qText = quizData.questions[key].q;
    const aText = quizData.questions[key].a;
    
    document.getElementById('question-number').innerText = key === "0" ? "10" : key;
    const qElement = document.getElementById('question-text');
    const dobonContainer = document.getElementById('dobon-container');
    const answerArea = document.getElementById('answer-area');

    if (qText.startsWith('ドボン：')) {
        answerArea.classList.add('hidden');
        dobonContainer.classList.remove('hidden');
        qElement.innerText = "ドボンを避けて10個選べ！";
        setupDobonGame(qText.replace('ドボン：', ''), aText);
    } else {
        dobonContainer.classList.add('hidden');
        answerArea.classList.remove('hidden');
        
        if (qText.match(/\.(jpeg|jpg|gif|png|webp)$/) != null || qText.startsWith('http')) {
            qElement.innerHTML = `<img src="${qText}" class="quiz-image">`;
        } else {
            qElement.innerText = qText;
        }
        if (aText.includes('{')) {
            const hint = aText.replace(/\{.*?\}/g, "[  ]");
            qElement.innerHTML += `<div class="hint-text">${hint}</div>`;
        }
        setTimeout(() => {
            answerInput.value = "";
            answerInput.focus();
        }, 50);
    }
}

function setupDobonGame(optionsStr, bombIndexStr) {
    const grid = document.getElementById('dobon-grid');
    grid.innerHTML = "";
    updateStatusIcons();
    const options = optionsStr.split(',');
    const bombIndex = parseInt(normalizeNum(bombIndexStr)) - 1;
    let found = 0;
    
    options.forEach((opt, index) => {
        const item = document.createElement('div');
        item.className = 'dobon-item';
        item.innerText = opt.trim();
        item.onclick = () => {
            if (!isGameActive) return;
            if (index === bombIndex) {
                item.classList.add('exploded');
                isGameActive = false;
                clearInterval(timerInterval);
                alert("ドボン！終了です。");
            } else if (!item.classList.contains('selected')) {
                item.classList.add('selected');
                found++;
                updateStatusIcons(found);
                if (found === 10) {
                    isGameActive = false;
                    clearInterval(timerInterval);
                    alert("10個正解！クリア！");
                }
            }
        };
        grid.appendChild(item);
    });
}

function startGlobalTimer() {
    const ratio = parseFloat(document.getElementById('timer-ratio').value);
    maxTime = quizData.time * ratio;
    timeLeft = maxTime;
    isGameActive = true;
    timerInterval = setInterval(() => {
        timeLeft -= 0.1;
        document.getElementById('time-display').innerText = Math.max(0, timeLeft).toFixed(1);
        document.getElementById('timer-bar').style.width = (timeLeft / maxTime) * 100 + "%";
        if (timeLeft <= 0) { 
            clearInterval(timerInterval); 
            isGameActive = false; 
            alert("タイムアップ！"); 
        }
    }, 100);
}

function startQuiz() {
    isGameActive = false;
    clearInterval(timerInterval);
    for (let key in quizData.questions) quizData.questions[key].solved = false;

    document.getElementById('time-display').innerText = quizData.time.toFixed(1);
    document.getElementById('timer-bar').style.width = "100%";
    
    const qNum = document.getElementById('question-number');
    const qText = document.getElementById('question-text');
    qNum.innerText = "クリック または 数字キーで開始";
    qText.innerText = "Ready?";
    
    const startAction = () => { if (!isGameActive) changeQuestion("1"); };
    qNum.onclick = startAction;
    qText.onclick = startAction;

    document.getElementById('dobon-container').classList.add('hidden');
    document.getElementById('answer-area').classList.remove('hidden');
    document.getElementById('result-message').innerText = "";
    answerInput.value = "";
    
    showScreen(quizScreen);
    document.getElementById('current-quiz-title').innerText = quizData.title;
    updateStatusIcons();
}

function checkAnswer() {
    if (!isGameActive || !currentId) return;
    const userAns = answerInput.value.trim();
    if (!userAns) return;
    const correct = quizData.questions[currentId].a.replace(/\{|\}/g, "").split('/');
    if (correct.includes(userAns)) {
        quizData.questions[currentId].solved = true;
        updateStatusIcons();
        document.getElementById('result-message').innerText = "正解！";
        answerInput.value = "";
        const activeQs = Object.values(quizData.questions).filter(q => q.q && q.q.trim() !== "");
        if (activeQs.every(q => q.solved)) {
            isGameActive = false;
            clearInterval(timerInterval);
            setTimeout(() => alert("全問クリア！おめでとうございます！"), 100);
        }
    } else {
        document.getElementById('result-message').innerText = "不正解";
    }
}

function updateStatusIcons(dobonCount = null) {
    const container = document.getElementById('status-icons');
    container.innerHTML = "";
    for (let i = 1; i <= 10; i++) {
        const id = i === 10 ? "0" : i.toString();
        const icon = document.createElement('div');
        icon.innerText = i; 
        icon.className = "status-node"; 
        let isSolved = (dobonCount !== null) ? (i <= dobonCount) : (quizData.questions[id].solved);
        if (isSolved) icon.classList.add('solved');
        container.appendChild(icon);
    }
}

// --- 追加：ファイル共有機能 ---
function exportQuizFile() {
    const title = document.getElementById('main-title-input').value || "quiz_data";
    const exportData = {
        title: title,
        time: parseInt(document.getElementById('total-time-input').value) || 120,
        questions: {}
    };
    for (let i = 1; i <= 10; i++) {
        const id = i === 10 ? "0" : i.toString();
        exportData.questions[id] = { q: document.getElementById(`q-${id}`).value, a: document.getElementById(`a-${id}`).value, solved: false };
    }
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function importQuizFileDirectly(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            
            if (!data.title || !data.questions) {
                alert("エラー：クイズデータの形式が正しくありません。");
                return;
            }

            // 直接 quizList に追加して保存
            const newEntry = {
                title: data.title,
                time: data.time || 120,
                questions: data.questions
            };
            
            quizList.push(newEntry);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(quizList));
            
            // リストを再描画
            showSelectScreen();
            alert(`クイズ「${data.title}」をリストに追加しました！`);
            
        } catch (err) {
            alert("エラー：ファイルの読み込みに失敗しました。");
        }
    };
    reader.readAsText(file);
    input.value = ""; // リセット
}

// --- 作成画面用のインポート（修正版） ---
function importQuizFile(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            document.getElementById('main-title-input').value = data.title || "";
            document.getElementById('total-time-input').value = data.time || 120;
            for (let i = 1; i <= 10; i++) {
                const id = (i === 10) ? "0" : i.toString();
                if (data.questions && data.questions[id]) {
                    document.getElementById(`q-${id}`).value = data.questions[id].q || "";
                    document.getElementById(`a-${id}`).value = data.questions[id].a || "";
                }
            }
            alert("読み込みました！最後に「保存」を押してリストに追加してください。");
        } catch (err) { 
            alert("形式エラー"); 
        }
    };
    reader.readAsText(file);
    input.value = "";
}
function importBulkData() {
    const text = document.getElementById('bulk-input').value.trim();
    if (!text) return;
    const rows = text.split(/\r?\n/);
    for (let i = 0; i < Math.min(rows.length, 10); i++) {
        const id = (i + 1) === 10 ? "0" : (i + 1).toString();
        const cols = rows[i].split(/\t/);
        if (cols.length >= 2) {
            document.getElementById(`q-${id}`).value = cols[0].trim();
            document.getElementById(`a-${id}`).value = cols[1].trim();
        }
    }
    alert("反映しました！");
}

function exitQuiz() { clearInterval(timerInterval); isGameActive = false; showSelectScreen(); }
function updateRatioDisp(v) { document.getElementById('timer-ratio-val').innerText = v; }

document.addEventListener('keydown', (e) => {
    if (quizScreen.classList.contains('hidden')) return;
    if (e.code && e.code.startsWith('Digit')) {
        if (document.activeElement === answerInput) e.preventDefault();
        changeQuestion(e.code.replace('Digit', ''));
        setTimeout(() => { answerInput.value = ""; }, 0);
    } else if (e.key === 'Enter' && !e.isComposing) {
        checkAnswer();
    }
});