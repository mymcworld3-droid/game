const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs'); 

// 🔥 已經幫你寫入你的專屬 Cloudflare Worker 網址
const CF_API_URL = "https://gameauth.mymcworld3.workers.dev"; 

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// 自動掃描遊戲目錄
const jsDir = path.join(__dirname, 'public', 'js');
let availableGames = [];

function scanGames() {
    availableGames = [];
    try {
        const files = fs.readdirSync(jsDir).filter(f => f.endsWith('.js') && f !== 'lobby.js');
        for (const file of files) {
            const content = fs.readFileSync(path.join(jsDir, file), 'utf-8');
            const nameMatch = content.match(/\/\/\s*@GAME_NAME:\s*(.+)/);
            const descMatch = content.match(/\/\/\s*@GAME_DESC:\s*(.+)/);
            if (nameMatch) {
                availableGames.push({
                    id: file.replace('.js', ''),
                    name: nameMatch[1].trim(),
                    desc: descMatch ? descMatch[1].trim() : '無說明',
                    script: `/js/${file}`
                });
            }
        }
        console.log('✅ 自動偵測到遊戲:', availableGames.map(g => g.name).join(', '));
    } catch (err) {
        console.error('掃描遊戲失敗:', err);
    }
}
scanGames();

const players = {}; 
const rooms = {};   

io.on('connection', (socket) => {
    console.log('新使用者連線:', socket.id);

    socket.emit('init_games', availableGames);

    // ==========================================
    // 🔥 帳號系統登入註冊邏輯
    // ==========================================
    
    // 1. 訪客登入 (隨機編號)
    socket.on('auth_guest', () => {
        const guestName = '訪客_' + Math.floor(1000 + Math.random() * 9000);
        players[socket.id] = { account: null, username: guestName, exp: 0, status: 'idle', roomId: null, game: null, isGuest: true };
        socket.emit('login_success', { username: guestName, exp: 0, isGuest: true });
        io.emit('update_player_list', players);
    });

    // 2. 註冊帳號
    socket.on('auth_register', async (data) => {
        try {
            const res = await fetch(`${CF_API_URL}/register`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) });
            socket.emit('register_result', await res.json());
        } catch (e) { 
            socket.emit('register_result', { success: false, msg: "資料庫連線失敗" }); 
        }
    });

    // 3. 登入帳號
    socket.on('auth_login', async (data) => {
        try {
            const res = await fetch(`${CF_API_URL}/login`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) });
            const result = await res.json();
            if (result.success) {
                players[socket.id] = { account: result.account, username: result.nickname, exp: result.exp, status: 'idle', roomId: null, game: null, isGuest: false };
                socket.emit('login_success', { username: result.nickname, exp: result.exp, isGuest: false });
                io.emit('update_player_list', players);
            } else {
                socket.emit('login_result', result);
            }
        } catch (e) { 
            socket.emit('login_result', { success: false, msg: "資料庫連線失敗" }); 
        }
    });

    // 4. 修改暱稱
    socket.on('change_name', async (newName) => {
        const p = players[socket.id];
        if (p && !p.isGuest && p.account) {
            p.username = newName;
            await fetch(`${CF_API_URL}/update_name`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ account: p.account, nickname: newName }) });
            socket.emit('update_profile', { username: p.username, exp: p.exp });
            io.emit('update_player_list', players);
        }
    });

    // 5. 贏得遊戲增加經驗值
    socket.on('add_exp', async (amount) => {
        const p = players[socket.id];
        if (p && !p.isGuest && p.account) {
            p.exp += amount;
            await fetch(`${CF_API_URL}/add_exp`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ account: p.account, exp_add: amount }) });
            socket.emit('update_profile', { username: p.username, exp: p.exp });
        }
    });

    // ==========================================
    // 遊戲通用 API
    // ==========================================

    socket.on('join_game', (gameName) => {
        if (!players[socket.id]) return;
        
        let joined = false;
        for (const roomId in rooms) {
            if (rooms[roomId].game === gameName && rooms[roomId].players.length === 1) {
                rooms[roomId].players.push(socket.id);
                players[socket.id].status = 'playing';
                players[socket.id].roomId = roomId;
                players[socket.id].game = gameName;
                
                const hostId = rooms[roomId].players[0];
                if (players[hostId]) players[hostId].status = 'playing';
                
                socket.join(roomId);
                
                io.to(roomId).emit('game_start', { 
                    roomId: roomId, 
                    game: gameName,
                    players: rooms[roomId].players,
                    state: {} 
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
                state: {} 
            };
            players[socket.id].status = 'waiting';
            players[socket.id].roomId = newRoomId;
            players[socket.id].game = gameName;
            socket.join(newRoomId);
            
            socket.emit('waiting_for_opponent');
            io.emit('update_player_list', players);
        }
    });

    socket.on('join_specific', (targetId) => {
        if (!players[socket.id] || !players[targetId]) return;
        
        const targetRoomId = players[targetId].roomId;
        const room = rooms[targetRoomId];
        
        if (targetRoomId && room && room.players.length === 1) {
            const gameName = room.game;
            room.players.push(socket.id);
            
            players[socket.id].status = 'playing';
            players[socket.id].roomId = targetRoomId;
            players[socket.id].game = gameName;
            
            players[targetId].status = 'playing';
            
            socket.join(targetRoomId);
            
            io.to(targetRoomId).emit('game_start', { 
                roomId: targetRoomId, 
                game: gameName,
                players: room.players,
                state: {} 
            });
            io.emit('update_player_list', players);
        }
    });

    socket.on('game_action', (data) => {
        const { roomId, action, payload } = data;
        io.to(roomId).emit('game_action', { 
            sender: socket.id, 
            action: action, 
            payload: payload 
        });
    });

    socket.on('sync_state', (data) => {
        const { roomId, state } = data;
        if (rooms[roomId]) {
            rooms[roomId].state = state; 
        }
    });

    socket.on('spectate', (targetSocketId) => {
        if (!players[socket.id] || !players[targetSocketId]) return;
        
        const targetRoomId = players[targetSocketId].roomId;
        const room = rooms[targetRoomId];
        if (targetRoomId && room && room.players.length === 2) {
            room.spectators.push(socket.id);
            players[socket.id].status = 'spectating';
            players[socket.id].roomId = targetRoomId;
            socket.join(targetRoomId);
            
            socket.emit('spectate_start', { 
                roomId: targetRoomId, 
                game: room.game,
                state: room.state 
            });
            io.emit('update_player_list', players);
        }
    });

    socket.on('leave_game', () => {
        if (!players[socket.id]) return;
        
        const roomId = players[socket.id].roomId;
        if (roomId && rooms[roomId]) {
            if (rooms[roomId].players.includes(socket.id)) {
                socket.to(roomId).emit('player_disconnected'); 
                delete rooms[roomId]; 
                
                for (const pid in players) {
                    if (players[pid].roomId === roomId) {
                        players[pid].status = 'idle';
                        players[pid].roomId = null;
                        players[pid].game = null;
                        const targetSocket = io.sockets.sockets.get(pid);
                        if (targetSocket) targetSocket.leave(roomId);
                    }
                }
            } 
            else if (rooms[roomId].spectators.includes(socket.id)) {
                rooms[roomId].spectators = rooms[roomId].spectators.filter(id => id !== socket.id);
                players[socket.id].status = 'idle';
                players[socket.id].roomId = null;
                socket.leave(roomId);
            }
        } else {
            players[socket.id].status = 'idle';
            players[socket.id].roomId = null;
            players[socket.id].game = null;
        }
        io.emit('update_player_list', players);
    });

    socket.on('disconnect', () => {
        if (players[socket.id]) {
            const roomId = players[socket.id].roomId;
            if (roomId && rooms[roomId]) {
                if (rooms[roomId].players.includes(socket.id)) {
                    io.to(roomId).emit('player_disconnected');
                    delete rooms[roomId];
                    
                    for (const pid in players) {
                        if (players[pid].roomId === roomId && pid !== socket.id) {
                            players[pid].status = 'idle';
                            players[pid].roomId = null;
                            players[pid].game = null;
                            const targetSocket = io.sockets.sockets.get(pid);
                            if (targetSocket) targetSocket.leave(roomId);
                        }
                    }
                } else if (rooms[roomId].spectators.includes(socket.id)) {
                    rooms[roomId].spectators = rooms[roomId].spectators.filter(id => id !== socket.id);
                }
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
