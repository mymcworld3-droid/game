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

    // ==========================================
    // 遊戲通用 API (任何新遊戲都共用這些接口)
    // ==========================================

    // 1. 通用配對系統
    socket.on('join_game', (gameName) => {
        if (!players[socket.id]) return;
        
        let joined = false;
        for (const roomId in rooms) {
            // 尋找同名稱且正在等候的遊戲
            if (rooms[roomId].game === gameName && rooms[roomId].players.length === 1) {
                rooms[roomId].players.push(socket.id);
                players[socket.id].status = 'playing';
                players[socket.id].roomId = roomId;
                socket.join(roomId);
                
                io.to(roomId).emit('game_start', { 
                    roomId: roomId, 
                    game: gameName,
                    players: rooms[roomId].players,
                    state: {} // 初始化空白狀態
                });
                io.emit('update_player_list', players);
                joined = true;
                break;
            }
        }

        if (!joined) {
            const newRoomId = 'room_' + socket.id;
            rooms[newRoomId] = { 
                game: gameName, 
                players: [socket.id], 
                spectators: [], 
                state: {} // 狀態交由前端遊戲自行管理與同步
            };
            players[socket.id].status = 'playing';
            players[socket.id].roomId = newRoomId;
            socket.join(newRoomId);
            
            socket.emit('waiting_for_opponent');
            io.emit('update_player_list', players);
        }
    });

    // 2. 通用遊戲動作轉發
    socket.on('game_action', (data) => {
        const { roomId, action, payload } = data;
        // 伺服器不判斷邏輯，直接將動作轉發給房間內所有人
        io.to(roomId).emit('game_action', { 
            sender: socket.id, 
            action: action, 
            payload: payload 
        });
    });

    // 3. 通用狀態同步 (讓玩家把最新畫面存到伺服器，給觀戰者看)
    socket.on('sync_state', (data) => {
        const { roomId, state } = data;
        if (rooms[roomId]) {
            rooms[roomId].state = state; 
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
