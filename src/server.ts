import { WebSocketServer } from 'ws';
import { createServer, IncomingMessage, ServerResponse } from 'http';

interface GameState {
  ball: {
    x: number;
    y: number;
    dx: number;
    dy: number;
    size: number;
  };
  paddles: {
    left: { y: number; height: number; width: number; speed: number; velocity: number; targetY: number };
    right: { y: number; height: number; width: number; speed: number; velocity: number; targetY: number };
  };
  score: {
    left: number;
    right: number;
  };
  isPlaying: boolean;
  gameMode: 'auto' | 'player' | 'multiplayer';
  colorIndex: number;
  isPaused: boolean;
  pauseEndTime: number;
  decrunchEffect: {
    isActive: boolean;
    startTime: number;
    duration: number;
  };
}

interface Player {
  id: string;
  side: 'left' | 'right' | 'spectator';
  ws: any;
  roomId: string;
  lastSeen: number;
}

interface GameRoom {
  id: string;
  gameState: GameState;
  players: Map<string, Player>;
  gamemaster: string | null;
  lastUpdate: number;
  isActive: boolean;
}

class PongWebSocketServer {
  private wss: WebSocketServer;
  private server: any;
  private rooms: Map<string, GameRoom> = new Map();
  private players: Map<string, Player> = new Map();
  private port: number;

  constructor(port?: number) {
    this.port = port || parseInt(process.env.PORT || '3002');
    this.server = createServer();

    // Add health check endpoint with CORS headers
    this.server.on('request', (req: IncomingMessage, res: ServerResponse) => {
      // Add CORS headers for all requests
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      // Handle preflight requests
      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'healthy',
          timestamp: new Date().toISOString(),
          stats: this.getStats()
        }));
      } else if (req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🏓 Pong WebSocket Server</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Courier New', monospace;
            background: linear-gradient(135deg, #1a0b3d, #2d1b5e);
            color: #fff;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            text-align: center;
        }
        .container {
            max-width: 600px;
            padding: 2rem;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 15px;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.2);
        }
        h1 { font-size: 3rem; margin-bottom: 1rem; color: #ff006e; }
        .status { color: #00ff88; font-size: 1.2rem; margin: 1rem 0; }
        .stats { margin: 2rem 0; }
        .stat-item { margin: 0.5rem 0; font-size: 1.1rem; }
        .endpoint {
            background: rgba(0, 0, 0, 0.3);
            padding: 1rem;
            border-radius: 10px;
            margin: 1rem 0;
            font-family: monospace;
        }
        .footer { margin-top: 2rem; opacity: 0.7; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🏓 PONG SERVER</h1>
        <div class="status">✅ Server Online & Ready</div>

        <div class="stats">
            <div class="stat-item">🎮 Active Rooms: ${this.rooms.size}</div>
            <div class="stat-item">👥 Connected Players: ${this.players.size}</div>
            <div class="stat-item">⏰ Server Time: ${new Date().toLocaleString()}</div>
        </div>

        <div class="endpoint">
            <strong>WebSocket Endpoint:</strong><br>
            wss://pong-websocket-server-1.onrender.com
        </div>

        <div class="endpoint">
            <strong>Health Check:</strong><br>
            <a href="/health" style="color: #00ff88;">/health</a>
        </div>

        <div class="footer">
            <p>Multiplayer Pong WebSocket Server</p>
            <p>Ready for real-time gaming! 🚀</p>
        </div>
    </div>
</body>
</html>
        `);
      } else {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>404 - Not Found</title>
    <style>
        body {
            font-family: 'Courier New', monospace;
            background: linear-gradient(135deg, #1a0b3d, #2d1b5e);
            color: #fff;
            text-align: center;
            padding: 2rem;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .container { max-width: 500px; }
        h1 { font-size: 4rem; color: #ff006e; margin-bottom: 1rem; }
        p { font-size: 1.2rem; margin: 1rem 0; }
        a { color: #00ff88; text-decoration: none; }
        a:hover { text-decoration: underline; }
    </style>
</head>
<body>
    <div class="container">
        <h1>404</h1>
        <p>🏓 Endpoint not found!</p>
        <p><a href="/">← Back to Server Status</a></p>
    </div>
</body>
</html>
        `);
      }
    });

    this.wss = new WebSocketServer({ server: this.server });
    this.setupWebSocketHandlers();
    this.startCleanupInterval();
  }

  private setupWebSocketHandlers() {
    this.wss.on('connection', (ws) => {
      console.log('🎮 New WebSocket connection');
      let playerId: string | null = null;

      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message.toString());
          this.handleMessage(ws, data);
          playerId = data.playerId || playerId;
        } catch (error) {
          console.error('❌ Error parsing message:', error);
          ws.send(JSON.stringify({ error: 'Invalid JSON' }));
        }
      });

      ws.on('close', () => {
        console.log('🔌 WebSocket disconnected');
        if (playerId) {
          this.handlePlayerDisconnect(playerId);
        }
      });

      ws.on('error', (error) => {
        console.error('❌ WebSocket error:', error);
      });
    });
  }

  private handleMessage(ws: any, message: any) {
    const { type, playerId, roomId, data } = message;

    switch (type) {
      case 'join_room':
        this.handleJoinRoom(ws, playerId, roomId);
        break;
      case 'update_paddle':
        this.handlePaddleUpdate(playerId, data);
        break;
      case 'update_game_state':
        this.handleGameStateUpdate(playerId, roomId, data);
        break;
      case 'reset_room':
        this.handleResetRoom(playerId, roomId);
        break;
      default:
        console.log('❓ Unknown message type:', type);
    }
  }

  private handleJoinRoom(ws: any, playerId: string, roomId: string) {
    console.log(`🏓 Player ${playerId} joining room ${roomId}`);

    // Get or create room
    let room = this.rooms.get(roomId);
    if (!room) {
      room = this.createNewRoom(roomId);
      this.rooms.set(roomId, room);
    }

    // Determine player side
    let playerSide: 'left' | 'right' | 'spectator' = 'spectator';
    const leftPlayer = Array.from(room.players.values()).find(p => p.side === 'left');
    const rightPlayer = Array.from(room.players.values()).find(p => p.side === 'right');

    if (!leftPlayer) {
      playerSide = 'left';
      if (!room.gamemaster) room.gamemaster = playerId;
    } else if (!rightPlayer) {
      playerSide = 'right';
    }

    // Create player
    const player: Player = {
      id: playerId,
      side: playerSide,
      ws,
      roomId,
      lastSeen: Date.now()
    };

    // Add player to room and global players map
    room.players.set(playerId, player);
    this.players.set(playerId, player);

    // Send join confirmation
    ws.send(JSON.stringify({
      type: 'joined_room',
      data: {
        playerId,
        roomId,
        playerSide,
        isGameMaster: room.gamemaster === playerId,
        playerCount: room.players.size,
        gameState: room.gameState
      }
    }));

    // Notify other players
    this.broadcastToRoom(roomId, {
      type: 'player_joined',
      data: {
        playerId,
        playerSide,
        playerCount: room.players.size
      }
    }, playerId);

    console.log(`✅ Player ${playerId} joined as ${playerSide} (${room.players.size} total players)`);
  }

  private handlePaddleUpdate(playerId: string, data: any) {
    const player = this.players.get(playerId);
    if (!player) return;

    const room = this.rooms.get(player.roomId);
    if (!room) return;

    player.lastSeen = Date.now();

    // Update paddle position in game state
    if (player.side === 'left') {
      room.gameState.paddles.left.y = data.y;
      room.gameState.paddles.left.velocity = data.velocity || 0;
      room.gameState.paddles.left.targetY = data.targetY || data.y;
    } else if (player.side === 'right') {
      room.gameState.paddles.right.y = data.y;
      room.gameState.paddles.right.velocity = data.velocity || 0;
      room.gameState.paddles.right.targetY = data.targetY || data.y;
    }

    // Broadcast paddle update to other players
    this.broadcastToRoom(player.roomId, {
      type: 'paddle_updated',
      data: {
        side: player.side,
        y: data.y,
        velocity: data.velocity,
        targetY: data.targetY
      }
    }, playerId);
  }

  private handleGameStateUpdate(playerId: string, roomId: string, gameState: GameState) {
    const room = this.rooms.get(roomId);
    if (!room || room.gamemaster !== playerId) return;

    const player = this.players.get(playerId);
    if (player) player.lastSeen = Date.now();

    // Update room game state
    room.gameState = { ...gameState };
    room.lastUpdate = Date.now();

    // Broadcast to all other players
    this.broadcastToRoom(roomId, {
      type: 'game_state_updated',
      data: gameState
    }, playerId);
  }

  private handleResetRoom(playerId: string, roomId: string) {
    const room = this.rooms.get(roomId);
    if (!room || room.gamemaster !== playerId) return;

    // Reset game state
    room.gameState = this.createInitialGameState();
    room.lastUpdate = Date.now();

    // Broadcast reset to all players
    this.broadcastToRoom(roomId, {
      type: 'game_reset',
      data: room.gameState
    });

    console.log(`🔄 Room ${roomId} reset by gamemaster ${playerId}`);
  }

  private handlePlayerDisconnect(playerId: string) {
    const player = this.players.get(playerId);
    if (!player) return;

    const room = this.rooms.get(player.roomId);
    if (room) {
      room.players.delete(playerId);

      // If gamemaster left, assign new gamemaster
      if (room.gamemaster === playerId && room.players.size > 0) {
        const newGamemaster = Array.from(room.players.keys())[0];
        room.gamemaster = newGamemaster;

        // Notify new gamemaster
        const newGM = room.players.get(newGamemaster);
        if (newGM) {
          newGM.ws.send(JSON.stringify({
            type: 'gamemaster_assigned',
            data: { isGameMaster: true }
          }));
        }
      }

      // Clean up empty rooms
      if (room.players.size === 0) {
        this.rooms.delete(player.roomId);
        console.log(`🗑️ Empty room ${player.roomId} deleted`);
      } else {
        // Notify remaining players
        this.broadcastToRoom(player.roomId, {
          type: 'player_left',
          data: {
            playerId,
            playerCount: room.players.size
          }
        });
      }
    }

    this.players.delete(playerId);
    console.log(`👋 Player ${playerId} disconnected`);
  }

  private broadcastToRoom(roomId: string, message: any, excludePlayerId?: string) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const messageStr = JSON.stringify(message);
    room.players.forEach((player) => {
      if (player.id !== excludePlayerId && player.ws.readyState === 1) {
        try {
          player.ws.send(messageStr);
        } catch (error) {
          console.error(`❌ Error sending message to player ${player.id}:`, error);
        }
      }
    });
  }

  private createNewRoom(roomId: string): GameRoom {
    return {
      id: roomId,
      gameState: this.createInitialGameState(),
      players: new Map(),
      gamemaster: null,
      lastUpdate: Date.now(),
      isActive: true
    };
  }

  private createInitialGameState(): GameState {
    return {
      ball: {
        x: 400,
        y: 300,
        dx: 9,
        dy: 0,
        size: 8
      },
      paddles: {
        left: { y: 250, height: 100, width: 12, speed: 32, velocity: 0, targetY: 250 },
        right: { y: 250, height: 100, width: 12, speed: 32, velocity: 0, targetY: 250 }
      },
      score: {
        left: 0,
        right: 0
      },
      isPlaying: false,
      gameMode: 'multiplayer' as const,
      colorIndex: 0,
      isPaused: false,
      pauseEndTime: 0,
      decrunchEffect: {
        isActive: false,
        startTime: 0,
        duration: 0
      }
    };
  }

  private startCleanupInterval() {
    setInterval(() => {
      const now = Date.now();
      const timeout = 30000; // 30 seconds

      // Clean up inactive players
      this.players.forEach((player, playerId) => {
        if (now - player.lastSeen > timeout) {
          console.log(`🧹 Cleaning up inactive player ${playerId}`);
          this.handlePlayerDisconnect(playerId);
        }
      });

      // Clean up inactive rooms
      this.rooms.forEach((room, roomId) => {
        if (now - room.lastUpdate > timeout && room.players.size === 0) {
          console.log(`🧹 Cleaning up inactive room ${roomId}`);
          this.rooms.delete(roomId);
        }
      });
    }, 10000); // Check every 10 seconds
  }

  public start() {
    this.server.listen(this.port, '0.0.0.0', () => {
      console.log(`🚀 Pong WebSocket server running on port ${this.port}`);
      console.log(`🎮 Ready for Pong multiplayer connections!`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  }

  public getStats() {
    return {
      activeRooms: this.rooms.size,
      totalPlayers: this.players.size,
      roomDetails: Array.from(this.rooms.entries()).map(([roomId, room]) => ({
        roomId,
        players: room.players.size,
        gamemaster: room.gamemaster,
        isActive: room.isActive
      }))
    };
  }
}

// Start the server
const pongServer = new PongWebSocketServer();
pongServer.start();

// Log stats periodically
setInterval(() => {
  const stats = pongServer.getStats();
  if (stats.totalPlayers > 0 || stats.activeRooms > 0) {
    console.log('📊 Server Stats:', JSON.stringify(stats, null, 2));
  }
}, 30000);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM signal, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 Received SIGINT signal, shutting down gracefully...');
  process.exit(0);
});

export default pongServer;