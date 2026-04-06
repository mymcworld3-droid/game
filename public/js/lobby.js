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
// 🔥 自動接收伺服器掃描到的遊戲列表並動態生成
// ==========================================
window.socket.on('init_games', (games) => {
    const gameListContainer = document.getElementById('dynamic-game-list');
    if (!gameListContainer) return;
    gameListContainer.innerHTML = ''; // 清空重置
    
    games.forEach(game => {
        // 1. 生成按鈕
        const card = document.createElement('div');
        card.className = 'game-card';
        card.id = `btn-${game.id}`;
        card.innerHTML = `<h4>${game.name}</h4><p>${game.desc}</p>`;
        
        // 🔥 集中在這裡綁定點擊加入事件，徹底解決各遊戲 setTimeout 找不到按鈕的 Bug
        card.addEventListener('click', () => {
            window.socket.emit('join_game', game.id);
            window.UI.gameWindow.style.display = 'flex';
            window.UI.gameContent.innerHTML = '<h3>連線中，尋找對手...</h3>';
        });
        
        gameListContainer.appendChild(card);

        // 2. 自動載入該遊戲的 JS 腳本 (加上防重複載入機制)
        if (!document.querySelector(`script[src="${game.script}"]`)) {
            const script = document.createElement('script');
            script.src = game.script;
            document.body.appendChild(script);
        }
    });
});

// ==========================================
// 統一共用 UI 邏輯 (離開房間、斷線彈窗)
// ==========================================
window.UI.leaveGameBtn.addEventListener('click', () => {
    window.UI.gameWindow.style.display = 'none';
    window.socket.emit('leave_game'); 
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

// 動態注入專屬加入按鈕與等待狀態的 CSS
const dynamicStyle = document.createElement('style');
dynamicStyle.innerHTML = `
    .status-waiting { color: #fbbf24; font-weight: 600; }
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
        else if (player.status === 'waiting') statusText = '等待對手';

        let statusClass = `status-${player.status}`;
        
        let innerHTML = `<span>${player.username} <small class="${statusClass}">(${statusText})</small></span>`;
        
        if (id !== window.socket.id) {
            if (player.status === 'playing') {
                innerHTML += `<button class="spectate-btn" onclick="spectatePlayer('${id}')">觀戰</button>`;
            } else if (player.status === 'waiting') {
                innerHTML += `<button class="spectate-btn join-btn" onclick="joinPlayer('${id}')">加入</button>`;
            }
        }
        
        li.innerHTML = innerHTML;
        playerListUl.appendChild(li);
    }
});

window.joinPlayer = function(targetId) {
    window.UI.gameWindow.style.display = 'flex';
    window.UI.gameContent.innerHTML = '<h3>連線中，加入對局...</h3>';
    window.socket.emit('join_specific', targetId);
};

window.spectatePlayer = function(targetId) {
    window.socket.emit('spectate', targetId);
};
