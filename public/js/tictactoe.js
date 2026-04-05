const btnTicTacToe = document.getElementById('btn-tictactoe');
const gameWindow = document.getElementById('game-window');
const gameContent = document.getElementById('game-content');
const leaveGameBtn = document.getElementById('leave-game-btn');

let currentRoomId = null;

// 點擊遊戲列表中的圈圈叉叉
btnTicTacToe.addEventListener('click', () => {
    socket.emit('join_tictactoe');
    gameWindow.style.display = 'flex';
    gameContent.innerHTML = '<h3>連線中，尋找對手...</h3>';
});

// 等待對手
socket.on('waiting_for_opponent', () => {
    gameContent.innerHTML = '<h3>等待對手加入...</h3>';
});

// 遊戲開始
socket.on('game_start', (data) => {
    currentRoomId = data.roomId;
    renderBoard();
});

// 觀戰開始
socket.on('spectate_start', (state) => {
    currentRoomId = state.roomId;
    gameWindow.style.display = 'flex';
    renderBoard();
    // 將現有盤面填入
    const cells = document.querySelectorAll('.cell');
    state.board.forEach((playerMark, index) => {
        if (playerMark) {
            cells[index].textContent = 'O'; // 簡單示範，實務上需區分 O 和 X
            cells[index].classList.add('mark-o'); //🔥 增加樣式發光
        }
    });
});

// 渲染棋盤
function renderBoard() {
    gameContent.innerHTML = `
        <h3>圈圈叉叉對戰</h3>
        <div class="board" id="tictactoe-board">
            <div class="cell" data-index="0"></div>
            <div class="cell" data-index="1"></div>
            <div class="cell" data-index="2"></div>
            <div class="cell" data-index="3"></div>
            <div class="cell" data-index="4"></div>
            <div class="cell" data-index="5"></div>
            <div class="cell" data-index="6"></div>
            <div class="cell" data-index="7"></div>
            <div class="cell" data-index="8"></div>
        </div>
    `;

    const cells = document.querySelectorAll('.cell');
    cells.forEach(cell => {
        cell.addEventListener('click', (e) => {
            const index = e.target.getAttribute('data-index');
            // 發送點擊事件給伺服器
            socket.emit('make_move', { roomId: currentRoomId, index: index });
        });
    });
}

// 接收伺服器更新棋盤
socket.on('update_board', (data) => {
    const { index, player } = data;
    const cell = document.querySelector(`.cell[data-index="${index}"]`);
    if (cell && !cell.textContent) {
        // 為了示範，由發送者視角填入 O 或 X
        cell.textContent = player === socket.id ? 'O' : 'X';
    }
});

// 對手斷線
socket.on('player_disconnected', () => {
    alert('對手已斷線！');
    gameWindow.style.display = 'none';
    currentRoomId = null;
});

// 離開遊戲視窗
leaveGameBtn.addEventListener('click', () => {
    gameWindow.style.display = 'none';
    currentRoomId = null;
    // 實務上這裡需要發送 emit 告訴伺服器你退出了房間，並將狀態改回 idle
});
