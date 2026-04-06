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

// 🔥 動態注入專屬加入按鈕與等待狀態的 CSS
const dynamicStyle = document.createElement('style');
dynamicStyle.innerHTML = `
    .status-waiting { color: #fbbf24; font-weight: 600; } /* 黃色 */
    .join-btn { background: rgba(74, 222, 128, 0.15) !important; border: 1px solid #4ade80 !important; color: #4ade80 !important; }
    .join-btn:hover { background: #4ade80 !important; color: #000 !important; transform: scale(1.05); }
`;
document.head.appendChild(dynamicStyle);

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
        
        let statusText = '閒置中';
        if (player.status === 'playing') statusText = '遊戲中';
        else if (player.status === 'spectating') statusText = '觀戰中';
        else if (player.status === 'waiting') statusText = '等待對手'; //🔥 解析等待中

        let statusClass = `status-${player.status}`;
        
        let innerHTML = `<span>${player.username} <small class="${statusClass}">(${statusText})</small></span>`;
        
        //🔥 根據狀態決定要給「觀戰」還是「加入」按鈕
        if (id !== window.socket.id) {
            if (player.status === 'playing') {
                innerHTML += `<button class="spectate-btn" onclick="spectatePlayer('${id}')">觀戰</button>`;
            } else if (player.status === 'waiting') {
                // 如果房間還沒滿，顯示綠色的加入按鈕
                innerHTML += `<button class="spectate-btn join-btn" onclick="joinPlayer('${id}')">加入</button>`;
            }
        }
        
        li.innerHTML = innerHTML;
        playerListUl.appendChild(li);
    }
});

window.spectatePlayer = function(targetId) {
    window.socket.emit('spectate', targetId);
};

//🔥 新增：點擊加入某人的功能
window.joinPlayer = function(targetId) {
    window.UI.gameWindow.style.display = 'flex';
    window.UI.gameContent.innerHTML = '<h3>連線中，加入對局...</h3>';
    window.socket.emit('join_specific', targetId);
};
window.spectatePlayer = function(targetId) {
    window.socket.emit('spectate', targetId);
};
