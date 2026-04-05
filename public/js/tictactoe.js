const btnTicTacToe = document.getElementById('btn-tictactoe');
const gameWindow = document.getElementById('game-window');
const gameContent = document.getElementById('game-content');
const leaveGameBtn = document.getElementById('leave-game-btn');

const customAlertModal = document.getElementById('custom-alert-modal');
const customAlertMessage = document.getElementById('custom-alert-message');
const customAlertBtn = document.getElementById('custom-alert-btn');

let currentRoomId = null;
let isMyTurn = false;
let mySymbol = ''; // 記錄自己是 O 還是 X

// 🔥 前端自行管理的遊戲狀態
let gameState = {
    board: Array(9).fill(null),
    turn: '',
    symbols: {},
    isGameOver: false, //🔥 新增遊戲結束狀態
    winner: null       //🔥 新增勝利者
};

// 點擊加入遊戲 (改用通用 API)
btnTicTacToe.addEventListener('click', () => {
    socket.emit('join_game', 'tictactoe');
    gameWindow.style.display = 'flex';
    gameContent.innerHTML = '<h3>連線中，尋找對手...</h3>';
});

// 等待對手
socket.on('waiting_for_opponent', () => {
    gameContent.innerHTML = '<h3>等待對手加入...</h3>';
});

// 遊戲開始
socket.on('game_start', (data) => {
    if (data.game !== 'tictactoe') return; // 防呆
    currentRoomId = data.roomId;
    
    // 初始化遊戲狀態：房主是 O，加入者是 X
    const p1 = data.players[0];
    const p2 = data.players[1];
    gameState.board = Array(9).fill(null);
    gameState.turn = p1;
    gameState.symbols[p1] = 'O';
    gameState.symbols[p2] = 'X';
    gameState.isGameOver = false; //🔥
    gameState.winner = null;      //🔥
    
    mySymbol = gameState.symbols[socket.id]; // 取得自己的符號
    
    renderBoard();
    updateTurnDisplay(gameState.turn);
});

// 觀戰開始
socket.on('spectate_start', (data) => {
    currentRoomId = data.roomId;
    gameState = data.state;
    mySymbol = null; // 觀戰者沒有符號
    
    gameWindow.style.display = 'flex';
    renderBoard();
    updateTurnDisplay(gameState.turn, true);

    const cells = document.querySelectorAll('.cell');
    gameState.board.forEach((mark, index) => {
        if (mark) {
            cells[index].textContent = mark;
            cells[index].classList.add(mark === 'O' ? 'mark-o' : 'mark-x');
        }
    });

    //🔥 如果觀戰時遊戲已結束，要顯示對應畫面
    if (gameState.isGameOver) {
        handleGameOverDisplay(true);
    }
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
        <div id="game-actions-container" style="margin-top: 25px; display: none;">
            <button id="restart-game-btn" style="background: linear-gradient(90deg, #4ade80, #3b82f6);">再來一次</button>
        </div>
    `;

    const cells = document.querySelectorAll('.cell');
    cells.forEach(cell => {
        cell.addEventListener('click', (e) => {
            if (!isMyTurn || gameState.isGameOver) return; //🔥 遊戲結束時不可點擊
            const index = e.target.getAttribute('data-index');
            if (gameState.board[index] !== null) return;
            
            // 改用通用 API 發送動作
            socket.emit('game_action', { 
                roomId: currentRoomId, 
                action: 'make_move', 
                payload: { index: index } 
            });
        });
    });

    //🔥 綁定再來一次按鈕事件
    const restartBtn = document.getElementById('restart-game-btn');
    if (restartBtn) {
        restartBtn.addEventListener('click', () => {
            socket.emit('game_action', { 
                roomId: currentRoomId, 
                action: 'restart_game', 
                payload: {} 
            });
        });
    }
}

// 接收通用遊戲動作
socket.on('game_action', (data) => {
    // 處理下棋動作
    if (data.action === 'make_move') {
        const idx = data.payload.index;
        const mark = gameState.symbols[data.sender]; // 根據發送者取得對應符號
        
        // 更新本地端狀態
        gameState.board[idx] = mark;
        
        // 更新畫面
        const cell = document.querySelector(`.cell[data-index="${idx}"]`);
        if (cell) {
            cell.textContent = mark;
            cell.classList.add(mark === 'O' ? 'mark-o' : 'mark-x');
        }
        
        //🔥 檢查是否有人勝利或平手
        const result = checkWin(gameState.board);
        if (result) {
            gameState.isGameOver = true;
            gameState.winner = result; // 'O', 'X', 或 'Draw'
        } else {
            // 沒結束才換人
            const players = Object.keys(gameState.symbols);
            gameState.turn = (gameState.turn === players[0]) ? players[1] : players[0];
        }
        
        const isSpectator = (mySymbol === null);
        
        //🔥 更新畫面與回合顯示
        if (gameState.isGameOver) {
            handleGameOverDisplay(isSpectator);
        } else {
            updateTurnDisplay(gameState.turn, isSpectator);
        }
        
        // 重要：剛下完棋的玩家，負責把最新狀態同步給伺服器
        if (data.sender === socket.id) {
            socket.emit('sync_state', { roomId: currentRoomId, state: gameState });
        }
    }
    
    //🔥 處理「再來一次」動作
    if (data.action === 'restart_game') {
        // 重置狀態
        gameState.board = Array(9).fill(null);
        gameState.isGameOver = false;
        gameState.winner = null;
        
        // 回合重置給第一順位玩家
        const players = Object.keys(gameState.symbols);
        gameState.turn = players[0]; 
        
        // 重新渲染空棋盤
        renderBoard();
        const isSpectator = (mySymbol === null);
        updateTurnDisplay(gameState.turn, isSpectator);
        
        if (data.sender === socket.id) {
            socket.emit('sync_state', { roomId: currentRoomId, state: gameState });
        }
    }
});

//🔥 判斷勝負的函式
function checkWin(board) {
    const lines = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8],
        [0, 3, 6], [1, 4, 7], [2, 5, 8],
        [0, 4, 8], [2, 4, 6]
    ];
    for (let line of lines) {
        const [a, b, c] = line;
        if (board[a] && board[a] === board[b] && board[a] === board[c]) {
            return board[a]; // 回傳 'O' 或 'X'
        }
    }
    if (!board.includes(null)) return 'Draw';
    return null;
}

//🔥 處理遊戲結束畫面的函式
function handleGameOverDisplay(isSpectator) {
    const turnDisplay = document.getElementById('turn-display');
    const actionsContainer = document.getElementById('game-actions-container');
    
    isMyTurn = false; // 遊戲結束不能再下
    
    if (!turnDisplay) return;

    if (gameState.winner === 'Draw') {
        turnDisplay.textContent = '平局！';
        turnDisplay.style.color = '#fbbf24'; // 黃色
    } else {
        // 判斷贏家是不是自己
        const amIWinner = (gameState.winner === mySymbol);
        if (isSpectator) {
            turnDisplay.textContent = `遊戲結束！贏家是 ${gameState.winner}`;
            turnDisplay.style.color = '#00d2fc';
        } else if (amIWinner) {
            turnDisplay.textContent = '你贏了！🎉';
            turnDisplay.style.color = '#4ade80';
        } else {
            turnDisplay.textContent = '你輸了...';
            turnDisplay.style.color = '#f87171';
        }
    }
    
    // 只有遊戲玩家可以看到「再來一次」按鈕
    if (!isSpectator && actionsContainer) {
        actionsContainer.style.display = 'block';
    }
}

// 對手斷線或離開
socket.on('player_disconnected', () => {
    customAlertMessage.textContent = '對手已離開遊戲或斷線！';
    customAlertModal.style.display = 'flex';
});

// 自訂彈窗確認按鈕事件
customAlertBtn.addEventListener('click', () => {
    customAlertModal.style.display = 'none';
    gameWindow.style.display = 'none';
    currentRoomId = null;
});

// 離開遊戲視窗
leaveGameBtn.addEventListener('click', () => {
    gameWindow.style.display = 'none';
    socket.emit('leave_game'); 
    currentRoomId = null;
});

// 負責更新回合提示的函式
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
