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
                
                io.to(roomId).emit('game_start', { roomId: roomId, players: rooms[roomId].players });
                io.emit('update_player_list', players);
                joined = true;
                break;
            }
        }

        if (!joined) {
            const newRoomId = 'room_' + socket.id;
            rooms[newRoomId] = { game: 'tictactoe', players: [socket.id], spectators: [], state: { board: Array(9).fill(null), turn: socket.id } };
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
            
            socket.emit('spectate_start', rooms[targetRoomId].state);
            io.emit('update_player_list', players);
        }
    });

    // 接收遊戲操作 (這段保留原本的，加在它下面)
    socket.on('make_move', (data) => {
        const { roomId, index } = data;
        const room = rooms[roomId];
        if (room && room.game === 'tictactoe') {
            room.state.board[index] = socket.id;
            io.to(roomId).emit('update_board', { index: index, player: socket.id });
        }
    });

    // 處理離開遊戲 (主動點擊離開按鈕)
    socket.on('leave_game', () => {
        if (!players[socket.id]) return;
        
        const roomId = players[socket.id].roomId;
        if (roomId && rooms[roomId]) {
            // 如果離開的是遊戲玩家
            if (rooms[roomId].players.includes(socket.id)) {
                io.to(roomId).emit('player_disconnected'); // 通知房間內其他人退出
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
