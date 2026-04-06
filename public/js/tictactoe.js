(() => {
    const socket = window.socket;
    const { gameWindow, gameContent } = window.UI;

    let currentRoomId = null;
    let isMyTurn = false;
    let mySymbol = '';

    let gameState = { board: Array(9).fill(null), turn: '', symbols: {}, isGameOver: false, winner: null };

    // 取得動態生成的按鈕
    setTimeout(() => {
        document.getElementById('btn-tictactoe').addEventListener('click', () => {
            socket.emit('join_game', 'tictactoe');
            gameWindow.style.display = 'flex';
            gameContent.innerHTML = '<h3>連線中，尋找對手...</h3>';
        });
    }, 100);

    socket.on('waiting_for_opponent', () => {
        // 確保目前是在我們的遊戲畫面
        if(gameWindow.style.display === 'flex' && gameContent.innerHTML.includes('連線中')) {
            gameContent.innerHTML = '<h3>等待對手加入...</h3>';
        }
    });

    socket.on('game_start', (data) => {
        if (data.game !== 'tictactoe') return;
        currentRoomId = data.roomId;
        const p1 = data.players[0];
        const p2 = data.players[1];
        gameState = { board: Array(9).fill(null), turn: p1, symbols: { [p1]: 'O', [p2]: 'X' }, isGameOver: false, winner: null };
        mySymbol = gameState.symbols[socket.id] || null;
        
        renderBoard();
        updateTurnDisplay(gameState.turn, mySymbol === null);

        if (socket.id === p1) socket.emit('sync_state', { roomId: currentRoomId, state: gameState });
    });

    socket.on('spectate_start', (data) => {
        if (!data.state.symbols || Object.values(data.state.symbols)[0] !== 'O') return; // 防呆：確認是 O/X 遊戲
        currentRoomId = data.roomId;
        gameState = data.state.board ? data.state : { board: Array(9).fill(null), turn: '', symbols: {}, isGameOver: false, winner: null };
        mySymbol = null;
        
        gameWindow.style.display = 'flex';
        renderBoard();
        updateTurnDisplay(gameState.turn, true);

        const cells = document.querySelectorAll('.tictactoe-cell');
        gameState.board.forEach((mark, index) => {
            if (mark) {
                cells[index].textContent = mark;
                cells[index].classList.add(mark === 'O' ? 'mark-o' : 'mark-x');
            }
        });
        if (gameState.isGameOver) handleGameOverDisplay(true);
    });

    function renderBoard() {
        gameContent.innerHTML = `
            <h3>圈圈叉叉對戰</h3>
            <h4 id="turn-display" style="margin-bottom: 20px; font-size: 1.2rem; transition: color 0.3s;"></h4>
            <div class="board" id="tictactoe-board">
                ${Array(9).fill(0).map((_, i) => `<div class="cell tictactoe-cell" data-index="${i}"></div>`).join('')}
            </div>
            <div id="game-actions-container" style="margin-top: 25px; display: none;">
                <button id="restart-game-btn" style="background: linear-gradient(90deg, #4ade80, #3b82f6);">再來一次</button>
            </div>
        `;

        document.querySelectorAll('.tictactoe-cell').forEach(cell => {
            cell.addEventListener('click', (e) => {
                if (!isMyTurn || gameState.isGameOver) return;
                const index = e.target.getAttribute('data-index');
                if (gameState.board[index] !== null) return;
                socket.emit('game_action', { roomId: currentRoomId, action: 'tictactoe_move', payload: { index } });
            });
        });

        const restartBtn = document.getElementById('restart-game-btn');
        if (restartBtn) {
            restartBtn.addEventListener('click', () => {
                socket.emit('game_action', { roomId: currentRoomId, action: 'tictactoe_restart', payload: {} });
            });
        }
    }

    socket.on('game_action', (data) => {
        if (data.action === 'tictactoe_move') {
            const idx = data.payload.index;
            const mark = gameState.symbols[data.sender];
            gameState.board[idx] = mark;
            
            const cell = document.querySelector(`.tictactoe-cell[data-index="${idx}"]`);
            if (cell) {
                cell.textContent = mark;
                cell.classList.add(mark === 'O' ? 'mark-o' : 'mark-x');
            }
            
            const result = checkWin(gameState.board);
            if (result) {
                gameState.isGameOver = true;
                gameState.winner = result;
            } else {
                const players = Object.keys(gameState.symbols);
                gameState.turn = (gameState.turn === players[0]) ? players[1] : players[0];
            }
            
            const isSpectator = (mySymbol === null);
            if (gameState.isGameOver) handleGameOverDisplay(isSpectator);
            else updateTurnDisplay(gameState.turn, isSpectator);
            
            if (data.sender === socket.id) socket.emit('sync_state', { roomId: currentRoomId, state: gameState });
        }
        
        if (data.action === 'tictactoe_restart') {
            gameState.board = Array(9).fill(null);
            gameState.isGameOver = false;
            gameState.winner = null;
            gameState.turn = Object.keys(gameState.symbols)[0]; 
            
            renderBoard();
            updateTurnDisplay(gameState.turn, mySymbol === null);
            if (data.sender === socket.id) socket.emit('sync_state', { roomId: currentRoomId, state: gameState });
        }
    });

    function checkWin(board) {
        const lines = [[0,1,2], [3,4,5], [6,7,8], [0,3,6], [1,4,7], [2,5,8], [0,4,8], [2,4,6]];
        for (let [a, b, c] of lines) if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
        return board.includes(null) ? null : 'Draw';
    }

    function handleGameOverDisplay(isSpectator) {
        const turnDisplay = document.getElementById('turn-display');
        const actionsContainer = document.getElementById('game-actions-container');
        isMyTurn = false;
        if (!turnDisplay) return;
        if (gameState.winner === 'Draw') {
            turnDisplay.textContent = '平局！'; turnDisplay.style.color = '#fbbf24';
        } else {
            if (isSpectator) { turnDisplay.textContent = `遊戲結束！贏家是 ${gameState.winner}`; turnDisplay.style.color = '#00d2fc'; }
            else if (gameState.winner === mySymbol) { turnDisplay.textContent = '你贏了！🎉'; turnDisplay.style.color = '#4ade80'; }
            else { turnDisplay.textContent = '你輸了...'; turnDisplay.style.color = '#f87171'; }
        }
        if (!isSpectator && actionsContainer) actionsContainer.style.display = 'block';
    }

    function updateTurnDisplay(turnId, isSpectator = false) {
        const turnDisplay = document.getElementById('turn-display');
        if (!turnDisplay) return;
        if (isSpectator) { turnDisplay.textContent = '觀戰中...'; turnDisplay.style.color = '#aaa'; isMyTurn = false; }
        else {
            isMyTurn = (turnId === socket.id);
            if (isMyTurn) { turnDisplay.textContent = '輪到你了！'; turnDisplay.style.color = '#4ade80'; }
            else { turnDisplay.textContent = '等待對手下棋...'; turnDisplay.style.color = '#f87171'; }
        }
    }

    // 監聽來自 lobby 的全域離開事件，清空自身狀態
    window.addEventListener('game_left', () => { currentRoomId = null; isMyTurn = false; });
})();
