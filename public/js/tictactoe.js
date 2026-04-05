const btnTicTacToe = document.getElementById('btn-tictactoe');
const gameWindow = document.getElementById('game-window');
const gameContent = document.getElementById('game-content');
const leaveGameBtn = document.getElementById('leave-game-btn');

const customAlertModal = document.getElementById('custom-alert-modal');
const customAlertMessage = document.getElementById('custom-alert-message');
const customAlertBtn = document.getElementById('custom-alert-btn');

let currentRoomId = null;
let isMyTurn = false; //🔥 新增變數記錄是否為自己的回合

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
    updateTurnDisplay(data.state.turn); //🔥 初始化回合顯示
});

// 觀戰開始
socket.on('spectate_start', (data) => { //🔥 參數改為 data
    currentRoomId = data.roomId; //🔥 改由 data 取出 roomId
    gameWindow.style.display = 'flex';
    renderBoard();
    updateTurnDisplay(data.state.turn, true); //🔥 初始化觀戰的回合顯示

    // 將現有盤面填入
    const cells = document.querySelectorAll('.cell');
    data.state.board.forEach((mark, index) => { //🔥 讀取 state 裡面的標記
        if (mark) {
            cells[index].textContent = mark; //🔥 填入正確的 O 或 X
            cells[index].classList.add(mark === 'O' ? 'mark-o' : 'mark-x');
        }
    });
});

// 渲染棋盤
function renderBoard() {
    gameContent.innerHTML = `
        <h3>圈圈叉叉對戰</h3>
        <h4 id="turn-display" style="margin-bottom: 20px; font-size: 1.2rem; transition: color 0.3s;"></h4>
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
            if (!isMyTurn) return; //🔥 如果不是自己的回合，阻擋點擊
            if (e.target.textContent) return; //🔥 確保已經有標記的格子不能再點
            
            const index = e.target.getAttribute('data-index');
            // 發送點擊事件給伺服器
            socket.emit('make_move', { roomId: currentRoomId, index: index });
        });
    });
}

// 接收伺服器更新棋盤
socket.on('update_board', (data) => {
    const { index, mark, nextTurn } = data; //🔥 解析後端傳來的標記與下個回合玩家
    const cell = document.querySelector(`.cell[data-index="${index}"]`);
    if (cell && !cell.textContent) {
        cell.textContent = mark; //🔥 直接使用後端決定的 O 或 X
        cell.classList.add(mark === 'O' ? 'mark-o' : 'mark-x');
    }
    
    //🔥 更新回合文字
    const turnDisplay = document.getElementById('turn-display');
    const isSpectator = turnDisplay && turnDisplay.textContent.includes('觀戰');
    updateTurnDisplay(nextTurn, isSpectator);
});
// 對手斷線或離開
socket.on('player_disconnected', () => {
    customAlertMessage.textContent = '對手已離開遊戲或斷線！'; //🔥 改用自訂文字
    customAlertModal.style.display = 'flex'; //🔥 顯示自訂彈窗
});

// 自訂彈窗確認按鈕事件 //🔥
customAlertBtn.addEventListener('click', () => { //🔥
    customAlertModal.style.display = 'none'; //🔥 隱藏彈窗
    gameWindow.style.display = 'none'; //🔥 隱藏遊戲視窗
    currentRoomId = null; //🔥 清空房間狀態
}); //🔥

// 離開遊戲視窗
leaveGameBtn.addEventListener('click', () => {
    gameWindow.style.display = 'none';
    socket.emit('leave_game'); 
    currentRoomId = null;
});

//🔥 負責更新回合提示的函式
function updateTurnDisplay(turnId, isSpectator = false) {
    const turnDisplay = document.getElementById('turn-display');
    if (!turnDisplay) return;

    if (isSpectator) {
        turnDisplay.textContent = '觀戰中...';
        turnDisplay.style.color = '#aaa';
        isMyTurn = false;
    } else {
        isMyTurn = (turnId === socket.id);
        if (isMyTurn) {
            turnDisplay.textContent = '輪到你了！';
            turnDisplay.style.color = '#4ade80'; // 綠色
        } else {
            turnDisplay.textContent = '等待對手下棋...';
            turnDisplay.style.color = '#f87171'; // 紅色
        }
    }
}
