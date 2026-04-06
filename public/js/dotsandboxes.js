(() => {
    const socket = window.socket;
    const { gameWindow, gameContent } = window.UI;

    let currentRoomId = null;
    let isMyTurn = false;
    let mySymbol = ''; // 'P1' (紅方) 或 'P2' (藍方)
    
    // 遊戲狀態 (20條橫線、20條直線、16個方格)
    let gameState = {
        hLines: Array(20).fill(null),
        vLines: Array(20).fill(null),
        boxes: Array(16).fill(null),
        scores: { P1: 0, P2: 0 },
        turn: '',
        symbols: {},
        isGameOver: false,
        winner: null
    };

    // 🔥 動態注入專屬 CSS (完美融入 19.5:9 手機比例)
    const style = document.createElement('style');
    style.innerHTML = `
        .dab-board {
            display: grid;
            grid-template-columns: repeat(4, 2.5cqw 12cqw) 2.5cqw;
            grid-template-rows: repeat(4, 2.5cqw 12cqw) 2.5cqw;
            width: 100%;
            max-width: 65cqw;
            margin: 0 auto;
            background: rgba(255, 255, 255, 0.03);
            padding: 5cqw;
            border-radius: 4cqw;
            box-shadow: 0 2cqw 8cqw rgba(0,0,0,0.3);
        }
        .dab-dot { background: #888; border-radius: 50%; box-shadow: inset 0 0 0.5cqw #000; }
        .dab-hline { cursor: pointer; transition: background 0.2s, box-shadow 0.2s; border-radius: 2cqw; margin: 0.5cqw 0; }
        .dab-vline { cursor: pointer; transition: background 0.2s, box-shadow 0.2s; border-radius: 2cqw; margin: 0 0.5cqw; }
        .dab-line:hover { background: rgba(255, 255, 255, 0.25); }
        .dab-line.p1-line { background: #e94560; box-shadow: 0 0 2cqw #e94560; }
        .dab-line.p2-line { background: #00d2fc; box-shadow: 0 0 2cqw #00d2fc; }
        .dab-box { transition: background 0.3s; border-radius: 1.5cqw; display: flex; align-items: center; justify-content: center; }
        .dab-box.p1-box { background: rgba(233, 69, 96, 0.4); }
        .dab-box.p2-box { background: rgba(0, 210, 252, 0.4); }
        
        .dab-scoreboard { display: flex; justify-content: space-between; margin-bottom: 4cqw; font-size: 4cqw; padding: 0 5cqw; }
        .dab-score-p1 { color: #e94560; font-weight: 600; text-shadow: 0 0 1cqw rgba(233,69,96,0.5); }
        .dab-score-p2 { color: #00d2fc; font-weight: 600; text-shadow: 0 0 1cqw rgba(0,210,252,0.5); }
    `;
    document.head.appendChild(style);

    // 綁定動態生成的大廳按鈕
    setTimeout(() => {
        document.getElementById('btn-dotsandboxes').addEventListener('click', () => {
            socket.emit('join_game', 'dotsandboxes');
            gameWindow.style.display = 'flex';
            gameContent.innerHTML = '<h3>連線中，尋找對手...</h3>';
        });
    }, 100);

    socket.on('game_start', (data) => {
        if (data.game !== 'dotsandboxes') return;
        currentRoomId = data.roomId;
        const p1 = data.players[0];
        const p2 = data.players[1];
        
        // P1為紅方，P2為藍方
        gameState = {
            hLines: Array(20).fill(null), vLines: Array(20).fill(null), boxes: Array(16).fill(null),
            scores: { P1: 0, P2: 0 }, turn: p1, symbols: { [p1]: 'P1', [p2]: 'P2' },
            isGameOver: false, winner: null
        };
        mySymbol = gameState.symbols[socket.id] || null;
        
        renderBoard();
        updateTurnDisplay(gameState.turn, mySymbol === null);

        if (socket.id === p1) socket.emit('sync_state', { roomId: currentRoomId, state: gameState });
    });

    socket.on('spectate_start', (data) => {
        if (!data.state.symbols || !Object.values(data.state.symbols).includes('P1')) return; 
        currentRoomId = data.roomId;
        gameState = data.state.scores ? data.state : {
            hLines: Array(20).fill(null), vLines: Array(20).fill(null), boxes: Array(16).fill(null),
            scores: { P1: 0, P2: 0 }, turn: '', symbols: {}, isGameOver: false, winner: null
        };
        mySymbol = null;
        
        gameWindow.style.display = 'flex';
        renderBoard();
        
        // 還原盤面
        gameState.hLines.forEach((mark, i) => mark && document.getElementById(`dab-h-${i}`).classList.add(mark==='P1'?'p1-line':'p2-line'));
        gameState.vLines.forEach((mark, i) => mark && document.getElementById(`dab-v-${i}`).classList.add(mark==='P1'?'p1-line':'p2-line'));
        gameState.boxes.forEach((mark, i) => mark && document.getElementById(`dab-b-${i}`).classList.add(mark==='P1'?'p1-box':'p2-box'));
        
        updateTurnDisplay(gameState.turn, true);
        if (gameState.isGameOver) handleGameOverDisplay(true);
    });

    function renderBoard() {
        let boardHTML = '';
        for(let r = 0; r < 9; r++) {
            for(let c = 0; c < 9; c++) {
                if(r%2===0 && c%2===0) {
                    boardHTML += `<div class="dab-dot"></div>`;
                } else if(r%2===0 && c%2===1) {
                    const idx = (r/2)*4 + Math.floor(c/2);
                    boardHTML += `<div class="dab-hline dab-line" data-type="h" data-index="${idx}" id="dab-h-${idx}"></div>`;
                } else if(r%2===1 && c%2===0) {
                    const idx = Math.floor(r/2)*5 + (c/2);
                    boardHTML += `<div class="dab-vline dab-line" data-type="v" data-index="${idx}" id="dab-v-${idx}"></div>`;
                } else {
                    const idx = Math.floor(r/2)*4 + Math.floor(c/2);
                    boardHTML += `<div class="dab-box" data-index="${idx}" id="dab-b-${idx}"></div>`;
                }
            }
        }

        gameContent.innerHTML = `
            <h3 style="margin-bottom: 2cqw;">點格棋對戰</h3>
            <div class="dab-scoreboard">
                <span class="dab-score-p1" id="dab-score-p1">紅方: 0</span>
                <span class="dab-score-p2" id="dab-score-p2">藍方: 0</span>
            </div>
            <h4 id="dab-turn-display" style="margin-bottom: 4cqw; font-size: 3.5cqw; transition: color 0.3s;"></h4>
            
            <div class="dab-board" id="dab-board">${boardHTML}</div>
            
            <div id="dab-actions-container" style="margin-top: 5cqw; display: none;">
                <button id="dab-restart-btn" style="background: linear-gradient(90deg, #4ade80, #3b82f6);">再來一次</button>
            </div>
        `;

        document.querySelectorAll('.dab-line').forEach(line => {
            line.addEventListener('click', (e) => {
                if (!isMyTurn || gameState.isGameOver) return;
                const type = e.target.getAttribute('data-type');
                const index = parseInt(e.target.getAttribute('data-index'));
                
                if (type === 'h' && gameState.hLines[index] !== null) return;
                if (type === 'v' && gameState.vLines[index] !== null) return;
                
                socket.emit('game_action', { roomId: currentRoomId, action: 'dab_move', payload: { type, index } });
            });
        });

        const restartBtn = document.getElementById('dab-restart-btn');
        if (restartBtn) {
            restartBtn.addEventListener('click', () => {
                socket.emit('game_action', { roomId: currentRoomId, action: 'dab_restart', payload: {} });
            });
        }
    }

    socket.on('game_action', (data) => {
        if (data.action === 'dab_move') {
            const { type, index } = data.payload;
            const mark = gameState.symbols[data.sender];
            
            // 更新線條狀態與畫面
            if (type === 'h') gameState.hLines[index] = mark;
            else gameState.vLines[index] = mark;
            
            const lineEl = document.getElementById(`dab-${type}-${index}`);
            if (lineEl) lineEl.classList.add(mark === 'P1' ? 'p1-line' : 'p2-line');

            // 檢查是否得分 (核心邏輯)
            const scored = processBoxChecks(type, index, mark);
            const isSpectator = (mySymbol === null);

            if (scored > 0) {
                gameState.scores[mark] += scored;
                // 如果得分總和為 16，遊戲結束
                if (gameState.scores.P1 + gameState.scores.P2 === 16) {
                    gameState.isGameOver = true;
                    gameState.winner = (gameState.scores.P1 > gameState.scores.P2) ? 'P1' : (gameState.scores.P1 < gameState.scores.P2 ? 'P2' : 'Draw');
                }
                // 注意：得分者繼續他的回合，不換人！
            } else {
                // 沒得分才換人
                const players = Object.keys(gameState.symbols);
                gameState.turn = (gameState.turn === players[0]) ? players[1] : players[0];
            }
            
            if (gameState.isGameOver) handleGameOverDisplay(isSpectator);
            else updateTurnDisplay(gameState.turn, isSpectator);
            
            if (data.sender === socket.id) socket.emit('sync_state', { roomId: currentRoomId, state: gameState });
        }
        
        if (data.action === 'dab_restart') {
            gameState.hLines = Array(20).fill(null);
            gameState.vLines = Array(20).fill(null);
            gameState.boxes = Array(16).fill(null);
            gameState.scores = { P1: 0, P2: 0 };
            gameState.isGameOver = false;
            gameState.winner = null;
            gameState.turn = Object.keys(gameState.symbols)[0]; 
            
            renderBoard();
            updateTurnDisplay(gameState.turn, mySymbol === null);
            if (data.sender === socket.id) socket.emit('sync_state', { roomId: currentRoomId, state: gameState });
        }
    });

    // 檢查封閉格子的演算法
    function processBoxChecks(type, index, mark) {
        let scored = 0;
        const h = gameState.hLines;
        const v = gameState.vLines;

        function checkAndClaim(r, c) {
            const bIdx = r * 4 + c;
            // 檢查四周的線是否都有值
            if (!gameState.boxes[bIdx] && h[r*4+c] && h[(r+1)*4+c] && v[r*5+c] && v[r*5+c+1]) {
                gameState.boxes[bIdx] = mark;
                const boxEl = document.getElementById(`dab-b-${bIdx}`);
                if (boxEl) boxEl.classList.add(mark === 'P1' ? 'p1-box' : 'p2-box');
                return 1;
            }
            return 0;
        }

        if (type === 'h') {
            const r = Math.floor(index / 4), c = index % 4;
            if (r > 0) scored += checkAndClaim(r - 1, c); // 檢查上方的格子
            if (r < 4) scored += checkAndClaim(r, c);     // 檢查下方的格子
        } else if (type === 'v') {
            const r = Math.floor(index / 5), c = index % 5;
            if (c > 0) scored += checkAndClaim(r, c - 1); // 檢查左方的格子
            if (c < 4) scored += checkAndClaim(r, c);     // 檢查右方的格子
        }
        return scored;
    }

    function handleGameOverDisplay(isSpectator) {
        const turnDisplay = document.getElementById('dab-turn-display');
        const actionsContainer = document.getElementById('dab-actions-container');
        document.getElementById('dab-score-p1').textContent = `紅方: ${gameState.scores.P1}`;
        document.getElementById('dab-score-p2').textContent = `藍方: ${gameState.scores.P2}`;
        isMyTurn = false;
        if (!turnDisplay) return;
        
        if (gameState.winner === 'Draw') {
            turnDisplay.textContent = '全場佔滿，平局！'; turnDisplay.style.color = '#fbbf24';
        } else {
            const winnerText = gameState.winner === 'P1' ? '紅方' : '藍方';
            if (isSpectator) { turnDisplay.textContent = `遊戲結束！贏家是 ${winnerText}`; turnDisplay.style.color = '#00d2fc'; }
            else if (gameState.winner === mySymbol) { turnDisplay.textContent = '你贏了！🎉'; turnDisplay.style.color = '#4ade80'; }
            else { turnDisplay.textContent = '你輸了...'; turnDisplay.style.color = '#f87171'; }
        }
        if (!isSpectator && actionsContainer) actionsContainer.style.display = 'block';
    }

    function updateTurnDisplay(turnId, isSpectator = false) {
        const turnDisplay = document.getElementById('dab-turn-display');
        document.getElementById('dab-score-p1').textContent = `紅方: ${gameState.scores.P1}`;
        document.getElementById('dab-score-p2').textContent = `藍方: ${gameState.scores.P2}`;
        if (!turnDisplay) return;
        
        if (isSpectator) { 
            const turnText = gameState.symbols[turnId] === 'P1' ? '紅方' : '藍方';
            turnDisplay.textContent = `觀戰中 (輪到${turnText}畫線)`; turnDisplay.style.color = '#aaa'; isMyTurn = false; 
        } else {
            isMyTurn = (turnId === socket.id);
            if (isMyTurn) { 
                const myColor = mySymbol === 'P1' ? '紅' : '藍';
                turnDisplay.textContent = `輪到你了！(你是${myColor}方)`; turnDisplay.style.color = '#4ade80'; 
            } else { 
                turnDisplay.textContent = '等待對手畫線...'; turnDisplay.style.color = '#f87171'; 
            }
        }
    }

    window.addEventListener('game_left', () => { currentRoomId = null; isMyTurn = false; });
})();
