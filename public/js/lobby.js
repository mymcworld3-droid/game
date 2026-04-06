// 全域變數掛載，讓各個分離的遊戲腳本都能調用
window.socket = io();
window.UI = {
    gameWindow: document.getElementById('game-window'),
    gameContent: document.getElementById('game-content'),
    leaveGameBtn: document.getElementById('leave-game-btn'),
    customAlertModal: document.getElementById('custom-alert-modal'),
    customAlertMessage: document.getElementById('custom-alert-message'),
    customAlertBtn: document.getElementById('custom-alert-btn')
};

// ==========================================
// 🔥 遊戲註冊表 (未來新增遊戲，只需在這裡加一筆資料)
// ==========================================
const AVAILABLE_GAMES = [
    {
        id: 'tictactoe',
        name: '圈圈叉叉 (Tic-Tac-Toe)',
        desc: '經典 3x3 益智對戰',
        script: '/js/tictactoe.js'
    },
    {
        id: 'gomoku',
        name: '五子棋 (Gomoku)',
        desc: '15x15 黑白連線策略對決',
        script: '/js/gomoku.js'
    }
];

// 動態生成大廳遊戲列表與載入腳本
const gameListContainer = document.getElementById('dynamic-game-list');
AVAILABLE_GAMES.forEach(game => {
    // 1. 生成按鈕
    const card = document.createElement('div');
    card.className = 'game-card';
    card.id = `btn-${game.id}`;
    card.innerHTML = `<h4>${game.name}</h4><p>${game.desc}</p>`;
    gameListContainer.appendChild(card);

    // 2. 自動載入該遊戲的 JS 腳本
    const script = document.createElement('script');
    script.src = game.script;
    document.body.appendChild(script);
});

// ==========================================
// 統一共用 UI 邏輯 (離開房間、斷線彈窗)
// ==========================================
window.UI.leaveGameBtn.addEventListener('click', () => {
    window.UI.gameWindow.style.display = 'none';
    window.socket.emit('leave_game'); 
    // 觸發全域事件，通知各遊戲重置自身狀態
    window.dispatchEvent(new Event('game_left'));
});

window.UI.customAlertBtn.addEventListener('click', () => {
    window.UI.customAlertModal.style.display = 'none';
    window.UI.gameWindow.style.display = 'none';
    window.dispatchEvent(new Event('game_left'));
});

window.socket.on('player_disconnected', () => {
    window.UI.customAlertMessage.textContent = '對手已離開遊戲或斷線！';
    window.UI.customAlertModal.style.display = 'flex';
});

// ==========================================
// 登入與玩家列表邏輯
// ==========================================
let myUsername = '';
const loginScreen = document.getElementById('login-screen');
const lobbyScreen = document.getElementById('lobby-screen');
const usernameInput = document.getElementById('username-input');
const loginBtn = document.getElementById('login-btn');
const welcomeText = document.getElementById('welcome-text');
const playerListUl = document.getElementById('player-list-ul');

loginBtn.addEventListener('click', () => {
    const name = usernameInput.value.trim();
    if (name) {
        myUsername = name;
        window.socket.emit('login', name);
        loginScreen.style.display = 'none';
        lobbyScreen.style.display = 'block';
        welcomeText.textContent = `歡迎，${name}！`;
    }
});

window.socket.on('update_player_list', (players) => {
    playerListUl.innerHTML = '';
    for (const id in players) {
        const player = players[id];
        const li = document.createElement('li');
        let statusText = player.status === 'idle' ? '閒置中' : (player.status === 'playing' ? '遊戲中' : '觀戰中');
        let statusClass = `status-${player.status}`;
        
        let innerHTML = `<span>${player.username} <small class="${statusClass}">(${statusText})</small></span>`;
        if (player.status === 'playing' && id !== window.socket.id) {
            innerHTML += `<button class="spectate-btn" onclick="spectatePlayer('${id}')">觀戰</button>`;
        }
        li.innerHTML = innerHTML;
        playerListUl.appendChild(li);
    }
});

window.spectatePlayer = function(targetId) {
    window.socket.emit('spectate', targetId);
};
