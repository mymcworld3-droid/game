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

    // 接收遊戲操作
    socket.on('make_move', (data) => {
        const { roomId, index } = data;
        const room = rooms[roomId];
        if (room && room.game === 'tictactoe') {
            room.state.board[index] = socket.id; // 簡單記錄是誰下的
            io.to(roomId).emit('update_board', { index: index, player: socket.id });
        }
    });

    // 處理斷線
    socket.on('disconnect', () => {
        if (players[socket.id]) {
            const roomId = players[socket.id].roomId;
            if (roomId && rooms[roomId]) {
                // 如果在遊戲中斷線，通知房間內其他人並解散房間
                io.to(roomId).emit('player_disconnected');
                delete rooms[roomId];
            }
            delete players[socket.id];
            io.emit('update_player_list', players);
        }
        console.log('使用者斷線:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`伺服器運行於 port ${PORT}`);
});
