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
// 自動接收伺服器掃描到的遊戲列表並動態生成
// ==========================================
window.socket.on('init_games', (games) => {
    const gameListContainer = document.getElementById('dynamic-game-list');
    if (!gameListContainer) return;
    gameListContainer.innerHTML = ''; 
    
    games.forEach(game => {
        const card = document.createElement('div');
        card.className = 'game-card';
        card.id = `btn-${game.id}`;
        card.innerHTML = `<h4>${game.name}</h4><p>${game.desc}</p>`;
        
        card.addEventListener('click', () => {
            window.socket.emit('join_game', game.id);
            window.UI.gameWindow.style.display = 'flex';
            window.UI.gameContent.innerHTML = '<h3>連線中，尋找對手...</h3>';
        });
        
        gameListContainer.appendChild(card);

        if (!document.querySelector(`script[src="${game.script}"]`)) {
            const script = document.createElement('script');
            script.src = game.script;
            document.body.appendChild(script);
        }
    });
});

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
// 帳號分頁與登入邏輯
// ==========================================
const loginScreen = document.getElementById('login-screen');
const lobbyScreen = document.getElementById('lobby-screen');
const welcomeText = document.getElementById('welcome-text');
const playerListUl = document.getElementById('player-list-ul');
const profileContainer = document.getElementById('profile-container');
const expDisplay = document.getElementById('exp-display');

const tabs = { guest: document.getElementById('tab-guest'), login: document.getElementById('tab-login'), register: document.getElementById('tab-register') };
const forms = { guest: document.getElementById('form-guest'), login: document.getElementById('form-login'), register: document.getElementById('form-register') };

function switchAuthTab(type) {
    Object.values(tabs).forEach(t => t.classList.remove('active'));
    Object.values(forms).forEach(f => f.classList.remove('active'));
    tabs[type].classList.add('active');
    forms[type].classList.add('active');
}
tabs.guest.onclick = () => switchAuthTab('guest');
tabs.login.onclick = () => switchAuthTab('login');
tabs.register.onclick = () => switchAuthTab('register');

// 訪客登入
document.getElementById('btn-guest-login').onclick = () => window.socket.emit('auth_guest');

// 註冊
document.getElementById('btn-register').onclick = () => {
    const acc = document.getElementById('reg-account').value.trim();
    const pwd = document.getElementById('reg-password').value.trim();
    const nick = document.getElementById('reg-nickname').value.trim();
    if (!acc || !pwd || !nick) return alert('請填寫完整資訊！');
    window.socket.emit('auth_register', { account: acc, password: pwd, nickname: nick });
};

window.socket.on('register_result', (res) => {
    if (res.success) {
        alert('註冊成功！請切換到登入頁面進行登入。');
        switchAuthTab('login');
    } else alert('註冊失敗：' + res.msg);
});

// 登入
document.getElementById('btn-login').onclick = () => {
    const acc = document.getElementById('login-account').value.trim();
    const pwd = document.getElementById('login-password').value.trim();
    if (!acc || !pwd) return alert('請輸入帳號密碼！');
    window.socket.emit('auth_login', { account: acc, password: pwd });
};

window.socket.on('login_result', (res) => alert('登入失敗：' + res.msg));

window.socket.on('login_success', (userData) => {
    loginScreen.style.display = 'none';
    lobbyScreen.style.display = 'block';
    welcomeText.textContent = `歡迎，${userData.username}！`;
    
    if (!userData.isGuest) {
        profileContainer.style.display = 'flex';
        expDisplay.textContent = `EXP: ${userData.exp}`;
    }
});

window.socket.on('update_profile', (userData) => {
    welcomeText.textContent = `歡迎，${userData.username}！`;
    expDisplay.textContent = `EXP: ${userData.exp}`;
});

document.getElementById('btn-change-name').onclick = () => {
    const newName = prompt('請輸入新的遊戲暱稱：');
    if (newName && newName.trim() !== '') window.socket.emit('change_name', newName.trim());
};

// ==========================================
// 大廳玩家列表與狀態更新
// ==========================================
const dynamicStyle = document.createElement('style');
dynamicStyle.innerHTML = `
    .status-waiting { color: #fbbf24; font-weight: 600; }
    .join-btn { background: rgba(74, 222, 128, 0.15) !important; border: 1px solid #4ade80 !important; color: #4ade80 !important; }
    .join-btn:hover { background: #4ade80 !important; color: #000 !important; transform: scale(1.05); }
`;
document.head.appendChild(dynamicStyle);

window.socket.on('update_player_list', (players) => {
    playerListUl.innerHTML = '';
    for (const id in players) {
        const player = players[id];
        const li = document.createElement('li');
        
        let statusText = player.status === 'playing' ? '遊戲中' : (player.status === 'spectating' ? '觀戰中' : (player.status === 'waiting' ? '等待對手' : '閒置中'));
        
        let innerHTML = `<span>${player.username} <small class="status-${player.status}">(${statusText})</small></span>`;
        
        if (id !== window.socket.id) {
            if (player.status === 'playing') innerHTML += `<button class="spectate-btn" onclick="spectatePlayer('${id}')">觀戰</button>`;
            else if (player.status === 'waiting') innerHTML += `<button class="spectate-btn join-btn" onclick="joinPlayer('${id}')">加入</button>`;
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
