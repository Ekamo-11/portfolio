const BOARD_SIZE = 6;
let savedQuizzes = JSON.parse(localStorage.getItem('nanmon_osero_data')) || [];
let currentEditingBoard = [];
let currentGameData = null;
let boardState = [];
let currentPlayer = 1;
let editingTarget = { y: 0, x: 0, cell: null }; // モーダル編集用のターゲット

// --- 画面切り替え --
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById(screenId).classList.remove('hidden');
    if (screenId === 'screen-list') renderQuizList();
    if (screenId === 'screen-editor') initEditor();
}

// --- 漢字用の動的フォントサイズスタイル（はみ出し防止＆アスペクト比維持） ---
function getKanjiStyle(text, isStone = false) {
    if (!text) return '';
    const len = text.length;
    
    // マス幅: 80px -> 余白考慮の有効幅: ~72px
    // 石の幅: 70px -> 円形と境界考慮の有効幅: ~56px
    const availableWidth = isStone ? 56 : 72;
    const baseFontSize = isStone ? 26 : 32;
    
    // 全体の推定横幅
    const estimatedWidth = len * baseFontSize;
    
    let styles = [
        `font-size: ${baseFontSize}px`,
        `display: block`,
        `width: max-content !important`, // 文字幅にきっちり合わせる
        `white-space: nowrap`,
        `line-height: 1.2`
    ];
    
    if (estimatedWidth > availableWidth) {
        const scale = availableWidth / estimatedWidth;
        styles.push(`transform: scale(${scale})`);
        styles.push(`transform-origin: center center`);
    }
    
    return `style="${styles.join('; ')};"`;
}

// --- ヒント用の動的フォントサイズスタイル（はみ出し防止＆アスペクト比維持） ---
function getHintStyle(text) {
    if (!text) return '';
    const len = text.length;
    
    // マスの中のヒント有効幅: ~72px
    const availableWidth = 72;
    const baseFontSize = 11;
    
    // 全体の推定横幅
    const estimatedWidth = len * baseFontSize;
    
    let styles = [
        `font-size: ${baseFontSize}px`,
        `display: block`,
        `width: max-content !important`, // 文字幅にきっちり合わせる
        `margin-top: 2px !important`, // 上の漢字との隙間
        `white-space: nowrap`,
        `line-height: 1.2`
    ];
    
    if (estimatedWidth > availableWidth) {
        const scale = availableWidth / estimatedWidth;
        styles.push(`transform: scale(${scale})`);
        styles.push(`transform-origin: center center`);
    }
    
    return `style="${styles.join('; ')};"`;
}
// --- 問題作成ロジック ---
function initEditor() {
    const container = document.getElementById('editor-board');
    container.innerHTML = '';
    currentEditingBoard = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
    document.getElementById('quiz-title').value = '';

    for (let y = 0; y < BOARD_SIZE; y++) {
        for (let x = 0; x < BOARD_SIZE; x++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            
            if ((y === 2 && x === 2) || (y === 3 && x === 3) || (y === 2 && x === 3) || (y === 3 && x === 2)) {
                cell.style.backgroundColor = '#ccc';
                cell.style.cursor = 'default';
                cell.innerHTML = '<span style="color:#666; font-size:12px;">初期石</span>';
            } else {
                cell.onclick = () => openModal(y, x, cell);
            }
            container.appendChild(cell);
        }
    }
}

function openModal(y, x, cell) {
    editingTarget = { y, x, cell };
    const data = currentEditingBoard[y][x] || { kanji: '', yomi: '', hint: '' };
    
    document.getElementById('modal-kanji').value = data.kanji;
    document.getElementById('modal-yomi').value = data.yomi;
    document.getElementById('modal-hint').value = data.hint;
    
    document.getElementById('editor-modal').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('editor-modal').classList.add('hidden');
}

function commitModal() {
    const kanji = document.getElementById('modal-kanji').value.trim();
    const yomi = document.getElementById('modal-yomi').value.trim();
    const hint = document.getElementById('modal-hint').value.trim();

    if (!kanji || !yomi) {
        alert("漢字と読みは必須です");
        return;
    }

    const { y, x, cell } = editingTarget;
    currentEditingBoard[y][x] = { kanji, yomi, hint };

    // スケール関数を適用してマスを更新
    cell.innerHTML = `
        <div class="cell-content">
            <div class="kanji" ${getKanjiStyle(kanji, false)}>${kanji}</div>
            ${hint ? `<div class="yomi-hint" ${getHintStyle(hint)}>${hint}</div>` : ''}
        </div>
    `;

    closeModal();
}

function saveQuiz() {
    const title = document.getElementById('quiz-title').value.trim();
    if (!title) return alert("タイトルを入力してください");

    let hasData = false;
    for (let y = 0; y < BOARD_SIZE; y++) {
        for (let x = 0; x < BOARD_SIZE; x++) {
            if (currentEditingBoard[y][x]) hasData = true;
        }
    }
    if (!hasData) return alert("少なくとも1つのマスにクイズを設定してください");

    const newQuiz = {
        id: Date.now().toString(),
        title: title,
        board: currentEditingBoard
    };

    savedQuizzes.push(newQuiz);
    localStorage.setItem('nanmon_osero_data', JSON.stringify(savedQuizzes));
    alert("問題を保存しました！");
    showScreen('screen-list');
}

function deleteQuiz(id, event) {
    event.stopPropagation();
    if (!confirm("本当にこの問題を削除しますか？")) return;
    savedQuizzes = savedQuizzes.filter(q => q.id !== id);
    localStorage.setItem('nanmon_osero_data', JSON.stringify(savedQuizzes));
    renderQuizList();
}

// --- 一覧画面表示 ---
function renderQuizList() {
    const container = document.getElementById('quiz-list-container');
    container.innerHTML = '';

    if (savedQuizzes.length === 0) {
        container.innerHTML = '<p>作成された問題がありません。「新しく問題を作る」から作成してください。</p>';
        return;
    }

    savedQuizzes.forEach(quiz => {
        const item = document.createElement('div');
        item.className = 'quiz-item';
        item.innerHTML = `
            <span class="title">${quiz.title}</span>
            <div class="actions">
                <button class="btn success" onclick="startGame('${quiz.id}')">遊ぶ</button>
                <button class="btn danger" onclick="deleteQuiz('${quiz.id}', event)">削除</button>
            </div>
        `;
        container.appendChild(item);
    });
}

// --- ゲームプレイプレイ画面 ---
function startGame(id) {
    currentGameData = savedQuizzes.find(q => q.id === id);
    if (!currentGameData) return;

    showScreen('screen-game');
    document.getElementById('game-title-display').innerText = currentGameData.title;

    // オセロ盤面の初期化 (0: 空白, 1: 青(先手), 2: 赤(後手))
    boardState = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0));
    boardState[2][2] = 2; // 白（赤）
    boardState[3][3] = 2; // 白（赤）
    boardState[2][3] = 1; // 黒（青）
    boardState[3][2] = 1; // 黒（青）

    currentPlayer = 1;
    renderGameBoard();
}

function renderGameBoard() {
    const container = document.getElementById('game-board');
    container.innerHTML = '';

    // 現在のプレイヤーが打てる場所があるかチェック
    const anyMovePossible = hasAnyValidMove(currentPlayer);
    if (!anyMovePossible) {
        // パス処理
        const opponent = currentPlayer === 1 ? 2 : 1;
        if (hasAnyValidMove(opponent)) {
            alert(`${currentPlayer === 1 ? '青' : '赤'}に置ける場所がないためパスします。`);
            currentPlayer = opponent;
        }
    }

    document.getElementById('current-player').innerText = currentPlayer === 1 ? '青' : '赤';
    document.getElementById('current-player').className = currentPlayer === 1 ? 'blue-text' : 'red-text';

    for (let y = 0; y < BOARD_SIZE; y++) {
        for (let x = 0; x < BOARD_SIZE; x++) {
            const cell = document.createElement('div');
            cell.className = 'cell';

            const state = boardState[y][x];
            const data = currentGameData.board[y][x];

            if (state === 1 || state === 2) {
                // 石が置いてある場合
                const stone = document.createElement('div');
                stone.className = `stone ${state === 1 ? 'blue' : 'red'}`;
                // 石の上の文字もスケールを適用
                const kanjiText = data ? data.kanji : '';
                stone.innerHTML = `<span class="kanji" ${getKanjiStyle(kanjiText, true)}>${kanjiText}</span>`;
                cell.appendChild(stone);
            } else if (data) {
                // まだ石が置かれておらず、クイズデータがある場合
                cell.innerHTML = `
                    <div class="cell-content">
                        <div class="kanji" ${getKanjiStyle(data.kanji, false)}>${data.kanji}</div>
                        ${data.hint ? `<div class="yomi-hint" ${getHintStyle(data.hint)}>${data.hint}</div>` : ''}
                    </div>
                `;
                cell.onclick = () => handleCellClick(y, x, data);
            }
            container.appendChild(cell);
        }
    }
}

function hasAnyValidMove(p) {
    for (let y = 0; y < BOARD_SIZE; y++) {
        for (let x = 0; x < BOARD_SIZE; x++) {
            if (boardState[y][x] === 0 && currentGameData.board[y][x]) {
                if (getFlippable(y, x, p).length > 0) return true;
            }
        }
    }
    return false;
}

function handleCellClick(y, x, data) {
    if (boardState[y][x] !== 0 || !data) return;

    const flippable = getFlippable(y, x, currentPlayer);
    if (flippable.length === 0) return alert("そこには置けません");

    const answer = prompt(`${data.kanji} の読みは？`);
    if (answer !== data.yomi) {
        alert("不正解！");
        return;
    }

    boardState[y][x] = currentPlayer;
    flippable.forEach(p => boardState[p.y][p.x] = currentPlayer);
    
    currentPlayer = currentPlayer === 1 ? 2 : 1;
    renderGameBoard();
    checkGameOver();
}

function getFlippable(y, x, p) {
    const dirs = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
    let results = [];
    const opp = p === 1 ? 2 : 1;
    dirs.forEach(([dy, dx]) => {
        let temp = [], ny = y + dy, nx = x + dx;
        while (ny>=0 && ny<BOARD_SIZE && nx>=0 && nx<BOARD_SIZE && boardState[ny][nx] === opp) {
            temp.push({y: ny, x: nx}); ny += dy; nx += dx;
        }
        if (ny>=0 && ny<BOARD_SIZE && nx>=0 && nx<BOARD_SIZE && boardState[ny][nx] === p) {
            results = results.concat(temp);
        }
    });
    return results;
}

function checkGameOver() {
    // 両者ともに打てる場所がなくなったらゲーム終了
    const p1Moves = hasAnyValidMove(1);
    const p2Moves = hasAnyValidMove(2);

    if (!p1Moves && !p2Moves) {
        let blueCount = 0, redCount = 0;
        for (let y = 0; y < BOARD_SIZE; y++) {
            for (let x = 0; x < BOARD_SIZE; x++) {
                if (boardState[y][x] === 1) blueCount++;
                if (boardState[y][x] === 2) redCount++;
            }
        }
        
        setTimeout(() => {
            alert(`ゲーム終了！\n青: ${blueCount}枚\n赤: ${redCount}枚\n\n${blueCount > redCount ? '青の勝ち！' : blueCount < redCount ? '赤の勝ち！' : '引き分け！'}`);
            showScreen('screen-list');
        }, 300);
    }
}

// 起動時に一覧表示
window.onload = () => {
    renderQuizList();
};