const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs'); //🔥 新增檔案系統模組，用來讀取資料夾

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// 🔥 終極版：自動掃描遊戲目錄
// ==========================================
const jsDir = path.join(__dirname, 'public', 'js');
let availableGames = [];

function scanGames() {
    availableGames = [];
    try {
        // 讀取 public/js 底下所有的 .js 檔案 (排除 lobby.js 主控台)
        const files = fs.readdirSync(jsDir).filter(f => f.endsWith('.js') && f !== 'lobby.js');
        
        for (const file of files) {
            const content = fs.readFileSync(path.join(jsDir, file), 'utf-8');
            
            // 尋找檔案內的魔法註解
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
scanGames(); //🔥 啟動伺服器時執行一次掃描

// 狀態管理
const players = {}; 
const rooms = {};   

io.on('connection', (socket) => {
    console.log('新使用者連線:', socket.id);

    socket.emit('init_games', availableGames); //🔥 新玩家連線時，直接把掃描到的遊戲清單發給他

    // 處理登入
    socket.on('login', (username) => {
        //🔥 新增 game 屬性記錄玩家正在玩哪款遊戲
        players[socket.id] = { username: username, status: 'idle', roomId: null, game: null }; 
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
            if (rooms[roomId].game === gameName && rooms[roomId].players.length === 1) {
                rooms[roomId].players.push(socket.id);
                players[socket.id].status = 'playing';
                players[socket.id].roomId = roomId;
                players[socket.id].game = gameName; //🔥 記錄遊戲名稱
                
                //🔥 將原本在等待的房主狀態也改為 playing
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
            players[socket.id].status = 'waiting'; //🔥 更改狀態為 waiting (等待對手)
            players[socket.id].roomId = newRoomId;
            players[socket.id].game = gameName;    //🔥 記錄遊戲名稱
            socket.join(newRoomId);
            
            socket.emit('waiting_for_opponent');
            io.emit('update_player_list', players);
        }
    });

    // 🔥 新增：處理玩家點擊列表上的「加入」按鈕 (指定加入某人的房間)
    socket.on('join_specific', (targetId) => {
        if (!players[socket.id] || !players[targetId]) return;
        
        const targetRoomId = players[targetId].roomId;
        const room = rooms[targetRoomId];
        
        // 確保房間存在且真的只有一個人 (等待中)
        if (targetRoomId && room && room.players.length === 1) {
            const gameName = room.game;
            room.players.push(socket.id);
            
            // 更新加入者的狀態
            players[socket.id].status = 'playing';
            players[socket.id].roomId = targetRoomId;
            players[socket.id].game = gameName;
            
            // 更新房主的狀態
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
            if (rooms[roomId].players.includes(socket.id)) {
                socket.to(roomId).emit('player_disconnected'); 
                delete rooms[roomId]; 
                
                for (const pid in players) {
                    if (players[pid].roomId === roomId) {
                        players[pid].status = 'idle';
                        players[pid].roomId = null;
                        players[pid].game = null; //🔥 清空遊戲紀錄
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
            players[socket.id].game = null; //🔥 清空遊戲紀錄
        }
        io.emit('update_player_list', players);
    });

    // 處理斷線 (直接關閉網頁或網路斷線)
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
                            players[pid].game = null; //🔥 清空遊戲紀錄
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
