const socket = io();
let myUsername = '';

const loginScreen = document.getElementById('login-screen');
const lobbyScreen = document.getElementById('lobby-screen');
const usernameInput = document.getElementById('username-input');
const loginBtn = document.getElementById('login-btn');
const welcomeText = document.getElementById('welcome-text');
const playerListUl = document.getElementById('player-list-ul');

// 登入事件
loginBtn.addEventListener('click', () => {
    const name = usernameInput.value.trim();
    if (name) {
        myUsername = name;
        socket.emit('login', name);
        loginScreen.style.display = 'none';
        lobbyScreen.style.display = 'block';
        welcomeText.textContent = `歡迎，${name}！`;
    }
});

// 更新玩家列表與狀態
socket.on('update_player_list', (players) => {
    playerListUl.innerHTML = '';
    for (const id in players) {
        const player = players[id];
        const li = document.createElement('li');
        
        let statusText = '';
        let statusClass = '';
        
        if (player.status === 'idle') {
            statusText = '閒置中';
            statusClass = 'status-idle';
        } else if (player.status === 'playing') {
            statusText = '遊戲中';
            statusClass = 'status-playing';
        } else if (player.status === 'spectating') {
            statusText = '觀戰中';
            statusClass = 'status-spectating';
        }

        let innerHTML = `<span>${player.username} <small class="${statusClass}">(${statusText})</small></span>`;
        
        // 如果該玩家正在遊戲中，顯示觀戰按鈕
        if (player.status === 'playing' && id !== socket.id) {
            innerHTML += `<button class="spectate-btn" onclick="spectatePlayer('${id}')">觀戰</button>`;
        }
        
        li.innerHTML = innerHTML;
        playerListUl.appendChild(li);
    }
});

// 觸發觀戰功能
function spectatePlayer(targetId) {
    socket.emit('spectate', targetId);
}
