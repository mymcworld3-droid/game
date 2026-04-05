const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// 狀態管理
const players = {}; // { socketId: { username, status: 'idle' | 'playing' | 'spectating', roomId } }
const rooms = {};   // { roomId: { game: 'tictactoe', players: [id1, id2], spectators: [id...], state: {...} } }

io.on('connection', (socket) => {
    console.log('新使用者連線:', socket.id);

    // 處理登入
    socket.on('login', (username) => {
        players[socket.id] = { username: username, status: 'idle', roomId: null };
        io.emit('update_player_list', players);
    });

    // 處理請求建立/加入圈圈叉叉
    socket.on('join_tictactoe', () => {
        if (!players[socket.id]) return;
        
        // 簡單配對邏輯：找一個正在等候的房間，或建立新房間
        let joined = false;
        for (const roomId in rooms) {
            if (rooms[roomId].game === 'tictactoe' && rooms[roomId].players.length === 1) {
                rooms[roomId].players.push(socket.id);
                players[socket.id].status = 'playing';
                players[socket.id].roomId = roomId;
                socket.join(roomId);
                
                rooms[roomId].state.symbols[socket.id] = 'X'; //🔥 分配標記 X 給第二位玩家
                
                io.to(roomId).emit('game_start', { 
                    roomId: roomId, 
                    players: rooms[roomId].players,
                    state: rooms[roomId].state //🔥 將包含回合與標記的 state 傳給前端
                });
                io.emit('update_player_list', players);
                joined = true;
                break;
            }
        }

        if (!joined) {
            const newRoomId = 'room_' + socket.id;
            rooms[newRoomId] = { 
                game: 'tictactoe', 
                players: [socket.id], 
                spectators: [], 
                state: { 
                    board: Array(9).fill(null), 
                    turn: socket.id, //🔥 記錄現在是誰的回合
                    symbols: { [socket.id]: 'O' } //🔥 房主先手，標記為 O
                } 
            };
            players[socket.id].status = 'playing';
            players[socket.id].roomId = newRoomId;
            socket.join(newRoomId);
            
            socket.emit('waiting_for_opponent');
            io.emit('update_player_list', players);
        }
    });
    
    // 處理觀戰
    socket.on('spectate', (targetSocketId) => {
        if (!players[socket.id] || !players[targetSocketId]) return;
        
        const targetRoomId = players[targetSocketId].roomId;
        if (targetRoomId && rooms[targetRoomId]) {
            rooms[targetRoomId].spectators.push(socket.id);
            players[socket.id].status = 'spectating';
            players[socket.id].roomId = targetRoomId;
            socket.join(targetRoomId);
            
            //🔥 將 roomId 與 state 一起包裝傳送，讓前端好解析
            socket.emit('spectate_start', { roomId: targetRoomId, state: rooms[targetRoomId].state });
            io.emit('update_player_list', players);
        }
    });

    // 接收遊戲操作
    socket.on('make_move', (data) => {
        const { roomId, index } = data;
        const room = rooms[roomId];
        //🔥 增加判斷：確保遊戲是圈圈叉叉，並且真的是該玩家的回合
        if (room && room.game === 'tictactoe' && room.state.turn === socket.id) {
            //🔥 確保該格子是空的才允許下棋
            if (room.state.board[index] === null) {
                const mark = room.state.symbols[socket.id];
                room.state.board[index] = mark; //🔥 記錄真實的 O 或 X
                
                //🔥 換對手回合
                room.state.turn = (room.players[0] === socket.id) ? room.players[1] : room.players[0];
                
                io.to(roomId).emit('update_board', { 
                    index: index, 
                    mark: mark, //🔥 傳送標記
                    nextTurn: room.state.turn //🔥 傳送下一個回合是誰
                });
            }
        }
    });

    // 處理離開遊戲 (主動點擊離開按鈕)
    socket.on('leave_game', () => {
        if (!players[socket.id]) return;
        
        const roomId = players[socket.id].roomId;
        if (roomId && rooms[roomId]) {
            // 如果離開的是遊戲玩家
            if (rooms[roomId].players.includes(socket.id)) {
                socket.to(roomId).emit('player_disconnected'); //🔥 改用 socket.to()，只發送給房間內「除了自己以外」的人
                delete rooms[roomId]; // 刪除房間
                
                // 把原本在該房間的所有玩家與觀戰者狀態強制設回 idle
                for (const pid in players) {
                    if (players[pid].roomId === roomId) {
                        players[pid].status = 'idle';
                        players[pid].roomId = null;
                        const targetSocket = io.sockets.sockets.get(pid);
                        if (targetSocket) targetSocket.leave(roomId);
                    }
                }
            } 
            // 如果離開的只是觀戰者
            else if (rooms[roomId].spectators.includes(socket.id)) {
                rooms[roomId].spectators = rooms[roomId].spectators.filter(id => id !== socket.id);
                players[socket.id].status = 'idle';
                players[socket.id].roomId = null;
                socket.leave(roomId);
            }
        } else {
            // 防呆機制：若找不到房間，依然重置玩家狀態
            players[socket.id].status = 'idle';
            players[socket.id].roomId = null;
        }
        
        io.emit('update_player_list', players);
    });

    // 處理斷線 (直接關閉網頁或網路斷線)
    socket.on('disconnect', () => {
        if (players[socket.id]) {
            const roomId = players[socket.id].roomId;
            if (roomId && rooms[roomId]) {
                if (rooms[roomId].players.includes(socket.id)) {
                    // 玩家斷線，通知其他人並解散房間
                    io.to(roomId).emit('player_disconnected');
                    delete rooms[roomId];
                    
                    for (const pid in players) {
                        if (players[pid].roomId === roomId && pid !== socket.id) {
                            players[pid].status = 'idle';
                            players[pid].roomId = null;
                            const targetSocket = io.sockets.sockets.get(pid);
                            if (targetSocket) targetSocket.leave(roomId);
                        }
                    }
                } else if (rooms[roomId].spectators.includes(socket.id)) {
                    // 觀戰者斷線，單純從名單移除
                    rooms[roomId].spectators = rooms[roomId].spectators.filter(id => id !== socket.id);
                }
            }
            delete players[socket.id]; // 刪除該名斷線玩家的資料
            io.emit('update_player_list', players);
        }
        console.log('使用者斷線:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`伺服器運行於 port ${PORT}`);
});
