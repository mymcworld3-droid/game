// @GAME_NAME: 六邊形五子棋 (Hex Gomoku)
// @GAME_DESC: 無邊界！緊連落子，三軸連線對決！
(() => {
    const socket = window.socket;
    const { gameWindow, gameContent } = window.UI;

    let currentRoomId = null;
    let isMyTurn = false;
    let mySymbol = ''; // 'R' (紅方) 或 'B' (藍方)
    
    // 遊戲狀態：無邊界，board 將以 "q,r" 字串作為 key 儲存座標
    let gameState = {
        board: {}, 
        turn: '',
        symbols: {},
        isGameOver: false,
        winner: null
    };

    // 🔥 動態注入專屬 CSS (包含六邊形棋盤與紅藍六邊形棋子)
    const style = document.createElement('style');
    style.innerHTML = `
        .hex-viewport {
            width: 100%;
            height: 90cqw;
            overflow: auto;
            border-radius: 4cqw;
            background: rgba(0, 0, 0, 0.2);
            box-shadow: inset 0 2cqw 10cqw rgba(0,0,0,0.5);
            /* 隱藏捲軸，讓畫面更乾淨 */
            scrollbar-width: none; 
            touch-action: pan-x pan-y;
        }
        .hex-viewport::-webkit-scrollbar { display: none; }
        
        .hex-board-container {
            position: relative;
            width: 200cqw;
            height: 200cqw;
        }

        .hex-cell {
            position: absolute;
            cursor: default;
        }

        /* 內部六邊形形狀 */
        .hex-inner {
            width: 100%; 
            height: 100%;
            background: #2a2a40;
            clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
            transform: scale(0.92); /* 縮小一點以產生格線間距 */
            position: relative;
            transition: background 0.3s;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        /* 可以下子的地方會有綠色光 */
        .hex-cell.valid {
            cursor: pointer;
            z-index: 10;
            filter: drop-shadow(0 0 0.8cqw #4ade80); /* 綠色發光外框 */
        }
        .hex-cell.valid .hex-inner {
            background: rgba(74, 222, 128, 0.2); /* 內部微透綠 */
        }
        .hex-cell.valid:hover .hex-inner {
            background: rgba(74, 222, 128, 0.5);
        }

        /* 🔥 六邊形棋子樣式 (紅與藍) */
        .hex-piece {
            width: 80%; height: 80%;
            /* 取代圓角的 border-radius，改用 clip-path 裁切成六邊形 */
            clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
            animation: dropIn 0.2s ease-out;
            /* clip-path 會裁掉 box-shadow，改用 drop-shadow 產生陰影 */
            filter: drop-shadow(0 0.5cqw 1cqw rgba(0,0,0,0.8));
        }
        .hex-red { background: radial-gradient(circle at 30% 30%, #ff6b6b, #cc0000); }
        .hex-blue { background: radial-gradient(circle at 30% 30%, #4da6ff, #0055cc); }
        
        @keyframes dropIn { 0% { transform: scale(1.5); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
    `;
    document.head.appendChild(style);

    // 🔥 刪除原本的 setTimeout 按鈕綁定，交給 lobby.js 統一處理，徹底解決雙重加入房間的 Bug！

    socket.on('waiting_for_opponent', () => {
        if(gameWindow.style.display === 'flex' && gameContent.innerHTML.includes('連線中')) {
            gameContent.innerHTML = '<h3>等待對手加入...</h3>';
        }
    });

    socket.on('game_start', (data) => {
        if (data.game !== 'hexgomoku') return;
        currentRoomId = data.roomId;
        const p1 = data.players[0];
        const p2 = data.players[1];
        
        // P1為紅方先手，P2為藍方
        gameState = {
            board: {}, turn: p1, symbols: { [p1]: 'R', [p2]: 'B' },
            isGameOver: false, winner: null
        };
        mySymbol = gameState.symbols[socket.id] || null;
        
        renderBoard();
        updateTurnDisplay(gameState.turn, mySymbol === null);
        updateValidMoves();

        if (socket.id === p1) socket.emit('sync_state', { roomId: currentRoomId, state: gameState });
    });

    socket.on('spectate_start', (data) => {
        if (data.game !== 'hexgomoku' && (!data.state.symbols || !Object.values(data.state.symbols).includes('R'))) return; 
        currentRoomId = data.roomId;
        gameState = data.state.board ? data.state : { board: {}, turn: '', symbols: {}, isGameOver: false, winner: null };
        mySymbol = null;
        
        gameWindow.style.display = 'flex';
        renderBoard();
        
        // 還原盤面棋子
        for (const [key, mark] of Object.entries(gameState.board)) {
            placePiece(key, mark);
        }
        
        updateTurnDisplay(gameState.turn, true);
        if (gameState.isGameOver) handleGameOverDisplay(true);
        updateValidMoves();
    });

    function renderBoard() {
        const size = 3.5; 
        const width = Math.sqrt(3) * size; 
        const height = 2 * size;           
        const cx = 100; 
        const cy = 100; 

        let cellsHTML = '';
        const radius = 12; // 預先渲染大網格，供玩家滑動

        for (let q = -radius; q <= radius; q++) {
            for (let r = -radius; r <= radius; r++) {
                if (Math.abs(q + r) <= radius) {
                    const x = cx + width * (q + r / 2);
                    const y = cy + height * 0.75 * r;
                    
                    cellsHTML += `
                        <div class="hex-cell" id="hex-${q}-${r}" data-q="${q}" data-r="${r}" 
                             style="left: ${x - width/2}cqw; top: ${y - height/2}cqw; width: ${width}cqw; height: ${height}cqw;">
                            <div class="hex-inner"></div>
                        </div>
                    `;
                }
            }
        }

        gameContent.innerHTML = `
            <h3 style="margin-bottom: 2cqw;">六邊形五子棋</h3>
            <h4 id="hex-turn-display" style="margin-bottom: 3cqw; font-size: 3.5cqw; transition: color 0.3s;"></h4>
            
            <div class="hex-viewport" id="hex-viewport">
                <div class="hex-board-container" id="hex-board">
                    ${cellsHTML}
                </div>
            </div>
            
            <div id="hex-actions-container" style="margin-top: 4cqw; display: none;">
                <button id="hex-restart-btn" style="background: linear-gradient(90deg, #4ade80, #3b82f6);">再來一次</button>
            </div>
        `;

        setTimeout(() => {
            const vp = document.getElementById('hex-viewport');
            if(vp) {
                vp.scrollLeft = (vp.scrollWidth - vp.clientWidth) / 2;
                vp.scrollTop = (vp.scrollHeight - vp.clientHeight) / 2;
            }
        }, 50);

        document.querySelectorAll('.hex-cell').forEach(cell => {
            cell.addEventListener('click', (e) => {
                if (!isMyTurn || gameState.isGameOver) return;
                const targetCell = e.target.closest('.hex-cell');
                if (!targetCell || !targetCell.classList.contains('valid')) return;

                const q = parseInt(targetCell.getAttribute('data-q'));
                const r = parseInt(targetCell.getAttribute('data-r'));
                
                socket.emit('game_action', { roomId: currentRoomId, action: 'hex_move', payload: { q, r } });
            });
        });

        const restartBtn = document.getElementById('hex-restart-btn');
        if (restartBtn) {
            restartBtn.addEventListener('click', () => {
                socket.emit('game_action', { roomId: currentRoomId, action: 'hex_restart', payload: {} });
            });
        }
    }

    // 計算並發亮所有合法的相鄰落子點
    function updateValidMoves() {
        document.querySelectorAll('.hex-cell.valid').forEach(el => el.classList.remove('valid'));
        if (!isMyTurn || gameState.isGameOver) return;

        const boardKeys = Object.keys(gameState.board);

        // 第一步強制只能下在最中間 (0,0)
        if (boardKeys.length === 0) {
            const centerCell = document.getElementById('hex-0-0');
            if (centerCell) centerCell.classList.add('valid');
            return;
        }

        const neighbors = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];
        const validSet = new Set();

        for (const key of boardKeys) {
            const [q, r] = key.split(',').map(Number);
            for (const [dq, dr] of neighbors) {
                const nq = q + dq;
                const nr = r + dr;
                const nKey = `${nq},${nr}`;
                if (!gameState.board[nKey]) {
                    validSet.add(nKey);
                }
            }
        }

        validSet.forEach(key => {
            const [q, r] = key.split(',');
            const el = document.getElementById(`hex-${q}-${r}`);
            if (el) el.classList.add('valid');
        });
    }

    function placePiece(key, mark) {
        const [q, r] = key.split(',');
        const cell = document.getElementById(`hex-${q}-${r}`);
        if (!cell) return;
        const inner = cell.querySelector('.hex-inner');
        if (!inner) return;

        const piece = document.createElement('div');
        // 🔥 套用新設計的紅藍樣式
        piece.className = `hex-piece ${mark === 'R' ? 'hex-red' : 'hex-blue'}`;
        inner.appendChild(piece);
    }

    socket.on('game_action', (data) => {
        if (data.action === 'hex_move') {
            const { q, r } = data.payload;
            const mark = gameState.symbols[data.sender];
            const key = `${q},${r}`;
            
            gameState.board[key] = mark;
            placePiece(key, mark);
            
            const result = checkWin(gameState.board, q, r, mark);
            const isSpectator = (mySymbol === null);

            if (result) {
                gameState.isGameOver = true;
                gameState.winner = result;
            } else {
                const players = Object.keys(gameState.symbols);
                gameState.turn = (gameState.turn === players[0]) ? players[1] : players[0];
            }
            
            if (gameState.isGameOver) handleGameOverDisplay(isSpectator);
            else updateTurnDisplay(gameState.turn, isSpectator);

            updateValidMoves(); 
            
            if (data.sender === socket.id) socket.emit('sync_state', { roomId: currentRoomId, state: gameState });
        }
        
        if (data.action === 'hex_restart') {
            gameState.board = {};
            gameState.isGameOver = false;
            gameState.winner = null;
            gameState.turn = Object.keys(gameState.symbols)[0]; 
            
            renderBoard();
            updateTurnDisplay(gameState.turn, mySymbol === null);
            updateValidMoves();
            
            if (data.sender === socket.id) socket.emit('sync_state', { roomId: currentRoomId, state: gameState });
        }
    });

    function checkWin(board, lastQ, lastR, mark) {
        const dirs = [[1, 0], [0, 1], [1, -1]]; 
        for (let [dq, dr] of dirs) {
            let count = 1;
            for (let i = 1; i < 5; i++) {
                if (board[`${lastQ + dq * i},${lastR + dr * i}`] === mark) count++;
                else break;
            }
            for (let i = 1; i < 5; i++) {
                if (board[`${lastQ - dq * i},${lastR - dr * i}`] === mark) count++;
                else break;
            }
            if (count >= 5) return mark;
        }
        return null;
    }

    function handleGameOverDisplay(isSpectator) {
        const turnDisplay = document.getElementById('hex-turn-display');
        const actionsContainer = document.getElementById('hex-actions-container');
        isMyTurn = false;
        if (!turnDisplay) return;
        
        const winnerText = gameState.winner === 'R' ? '紅方' : '藍方';
        if (isSpectator) { turnDisplay.textContent = `遊戲結束！贏家是 ${winnerText}`; turnDisplay.style.color = '#00d2fc'; }
        else if (gameState.winner === mySymbol) { turnDisplay.textContent = '你贏了！🎉'; turnDisplay.style.color = '#4ade80'; }
        else { turnDisplay.textContent = '你輸了...'; turnDisplay.style.color = '#f87171'; }
        
        if (!isSpectator && actionsContainer) actionsContainer.style.display = 'block';
        updateValidMoves(); 
    }

    function updateTurnDisplay(turnId, isSpectator = false) {
        const turnDisplay = document.getElementById('hex-turn-display');
        if (!turnDisplay) return;
        
        if (isSpectator) { 
            const turnText = gameState.symbols[turnId] === 'R' ? '紅方' : '藍方';
            turnDisplay.textContent = `觀戰中 (輪到${turnText}下)`; turnDisplay.style.color = '#aaa'; isMyTurn = false; 
        } else {
            isMyTurn = (turnId === socket.id);
            if (isMyTurn) { 
                turnDisplay.textContent = '輪到你了！(只能下在發光處)'; turnDisplay.style.color = '#4ade80'; 
            } else { 
                turnDisplay.textContent = '等待對手下棋...'; turnDisplay.style.color = '#f87171'; 
            }
        }
    }

    window.addEventListener('game_left', () => { currentRoomId = null; isMyTurn = false; });
})();
