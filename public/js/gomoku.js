// @GAME_NAME: 五子棋 (Gomoku)
// @GAME_DESC: 15x15 黑白連線策略對決
(() => {
    const socket = window.socket;
    const { gameWindow, gameContent } = window.UI;

    let currentRoomId = null;
    let isMyTurn = false;
    let mySymbol = ''; // 'B' (Black) 或 'W' (White)
    let gameState = { board: Array(225).fill(null), turn: '', symbols: {}, isGameOver: false, winner: null };

    // 🔥 自動為五子棋注入專屬 CSS
    const style = document.createElement('style');
    style.innerHTML = `
        .gomoku-board {
            display: grid;
            grid-template-columns: repeat(15, 1fr);
            gap: 1px;
            background: #8b5a2b; /* 格線顏色 */
            border: 2px solid #8b5a2b;
            width: 100%;
            max-width: 380px;
            aspect-ratio: 1 / 1;
            margin: 0 auto;
            border-radius: 1cqw;
            box-shadow: 0 5px 15px rgba(0,0,0,0.5);
        }
        .gomoku-cell {
            background: #e8c57a; /* 木板色 */
            position: relative;
            cursor: pointer;
        }
        .gomoku-piece {
            width: 85%;
            height: 85%;
            border-radius: 50%;
            position: absolute;
            top: 7.5%;
            left: 7.5%;
            box-shadow: 0 2px 4px rgba(0,0,0,0.4);
            animation: dropIn 0.2s ease-out;
        }
        .gomoku-black { background: radial-gradient(circle at 30% 30%, #555, #000); }
        .gomoku-white { background: radial-gradient(circle at 30% 30%, #fff, #ddd); }
        @keyframes dropIn { 0% { transform: scale(1.5); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
    `;
    document.head.appendChild(style);

    // 綁定大廳按鈕
    setTimeout(() => {
        document.getElementById('btn-gomoku').addEventListener('click', () => {
            socket.emit('join_game', 'gomoku');
            gameWindow.style.display = 'flex';
            gameContent.innerHTML = '<h3>連線中，尋找對手...</h3>';
        });
    }, 100);

    socket.on('game_start', (data) => {
        if (data.game !== 'gomoku') return;
        currentRoomId = data.roomId;
        const p1 = data.players[0];
        const p2 = data.players[1];
        // 五子棋預設黑子(B)先走
        gameState = { board: Array(225).fill(null), turn: p1, symbols: { [p1]: 'B', [p2]: 'W' }, isGameOver: false, winner: null };
        mySymbol = gameState.symbols[socket.id] || null;
        
        renderBoard();
        updateTurnDisplay(gameState.turn, mySymbol === null);

        if (socket.id === p1) socket.emit('sync_state', { roomId: currentRoomId, state: gameState });
    });

    socket.on('spectate_start', (data) => {
        if (!data.state.symbols || !Object.values(data.state.symbols).includes('B')) return; // 防呆：確認是黑白棋遊戲
        currentRoomId = data.roomId;
        gameState = data.state.board ? data.state : { board: Array(225).fill(null), turn: '', symbols: {}, isGameOver: false, winner: null };
        mySymbol = null;
        
        gameWindow.style.display = 'flex';
        renderBoard();
        updateTurnDisplay(gameState.turn, true);

        const cells = document.querySelectorAll('.gomoku-cell');
        gameState.board.forEach((mark, index) => {
            if (mark) placePiece(cells[index], mark);
        });
        if (gameState.isGameOver) handleGameOverDisplay(true);
    });

    function renderBoard() {
        let cellsHTML = '';
        for(let i=0; i<225; i++) {
            cellsHTML += `<div class="gomoku-cell" data-index="${i}"></div>`;
        }

        gameContent.innerHTML = `
            <h3>五子棋對戰</h3>
            <h4 id="gomoku-turn-display" style="margin-bottom: 15px; font-size: 1.1rem; transition: color 0.3s;"></h4>
            <div class="gomoku-board" id="gomoku-board">${cellsHTML}</div>
            <div id="gomoku-actions-container" style="margin-top: 20px; display: none;">
                <button id="gomoku-restart-btn" style="background: linear-gradient(90deg, #4ade80, #3b82f6);">再來一次</button>
            </div>
        `;

        document.querySelectorAll('.gomoku-cell').forEach(cell => {
            cell.addEventListener('click', (e) => {
                if (!isMyTurn || gameState.isGameOver) return;
                const index = e.target.getAttribute('data-index') || e.target.parentElement.getAttribute('data-index');
                if (gameState.board[index] !== null) return;
                socket.emit('game_action', { roomId: currentRoomId, action: 'gomoku_move', payload: { index } });
            });
        });

        const restartBtn = document.getElementById('gomoku-restart-btn');
        if (restartBtn) {
            restartBtn.addEventListener('click', () => {
                socket.emit('game_action', { roomId: currentRoomId, action: 'gomoku_restart', payload: {} });
            });
        }
    }

    function placePiece(cell, mark) {
        const piece = document.createElement('div');
        piece.className = `gomoku-piece ${mark === 'B' ? 'gomoku-black' : 'gomoku-white'}`;
        cell.appendChild(piece);
    }

    socket.on('game_action', (data) => {
        if (data.action === 'gomoku_move') {
            const idx = parseInt(data.payload.index);
            const mark = gameState.symbols[data.sender];
            gameState.board[idx] = mark;
            
            const cell = document.querySelector(`.gomoku-cell[data-index="${idx}"]`);
            if (cell) placePiece(cell, mark);
            
            const result = checkWin(gameState.board, idx, mark);
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
        
        if (data.action === 'gomoku_restart') {
            gameState.board = Array(225).fill(null);
            gameState.isGameOver = false;
            gameState.winner = null;
            gameState.turn = Object.keys(gameState.symbols)[0]; 
            
            renderBoard();
            updateTurnDisplay(gameState.turn, mySymbol === null);
            if (data.sender === socket.id) socket.emit('sync_state', { roomId: currentRoomId, state: gameState });
        }
    });

    // 判斷五子連線核心邏輯
    function checkWin(board, lastIndex, mark) {
        const size = 15;
        const r = Math.floor(lastIndex / size);
        const c = lastIndex % size;
        const dirs = [[1,0], [0,1], [1,1], [1,-1]]; // 垂直、水平、右下斜、右上斜
        
        for (let [dr, dc] of dirs) {
            let count = 1;
            // 往正方向檢查
            for (let i = 1; i < 5; i++) {
                let nr = r + dr * i, nc = c + dc * i;
                if (nr < 0 || nr >= size || nc < 0 || nc >= size || board[nr * size + nc] !== mark) break;
                count++;
            }
            // 往反方向檢查
            for (let i = 1; i < 5; i++) {
                let nr = r - dr * i, nc = c - dc * i;
                if (nr < 0 || nr >= size || nc < 0 || nc >= size || board[nr * size + nc] !== mark) break;
                count++;
            }
            if (count >= 5) return mark;
        }
        return board.includes(null) ? null : 'Draw';
    }

    function handleGameOverDisplay(isSpectator) {
        const turnDisplay = document.getElementById('gomoku-turn-display');
        const actionsContainer = document.getElementById('gomoku-actions-container');
        isMyTurn = false;
        if (!turnDisplay) return;
        
        if (gameState.winner === 'Draw') {
            turnDisplay.textContent = '棋盤已滿，平局！'; turnDisplay.style.color = '#fbbf24';
        } else {
            const winnerText = gameState.winner === 'B' ? '黑子' : '白子';
            if (isSpectator) { turnDisplay.textContent = `遊戲結束！贏家是 ${winnerText}`; turnDisplay.style.color = '#00d2fc'; }
            else if (gameState.winner === mySymbol) { turnDisplay.textContent = '你贏了！🎉'; turnDisplay.style.color = '#4ade80'; }
            else { turnDisplay.textContent = '你輸了...'; turnDisplay.style.color = '#f87171'; }
        }
        if (!isSpectator && actionsContainer) actionsContainer.style.display = 'block';
    }

    function updateTurnDisplay(turnId, isSpectator = false) {
        const turnDisplay = document.getElementById('gomoku-turn-display');
        if (!turnDisplay) return;
        if (isSpectator) { 
            const turnText = gameState.symbols[turnId] === 'B' ? '黑子' : '白子';
            turnDisplay.textContent = `觀戰中 (輪到${turnText}下)`; turnDisplay.style.color = '#aaa'; isMyTurn = false; 
        } else {
            isMyTurn = (turnId === socket.id);
            if (isMyTurn) { turnDisplay.textContent = '輪到你了！'; turnDisplay.style.color = '#4ade80'; }
            else { turnDisplay.textContent = '等待對手下棋...'; turnDisplay.style.color = '#f87171'; }
        }
    }

    window.addEventListener('game_left', () => { currentRoomId = null; isMyTurn = false; });
})();
