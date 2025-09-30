import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Force redeploy - 2025-09-26T16:47:00Z - Root directory already empty, forcing webhook

// 🎯 CENTRALIZED COLLISION DETECTION SYSTEM (Server-side)
// Import the same collision detection logic used by the client
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import collision detection from client-side module
// We'll need to create a compatible interface since we can't directly import TypeScript modules
interface CollisionObject {
  x: number;
  y: number;
  width: number;
  height: number;
  vx?: number; // velocity for continuous collision detection
  vy?: number;
}

interface Ball extends CollisionObject {
  size: number; // width and height are the same for balls
  lastTouchedBy?: string;
}

interface Paddle extends CollisionObject {
  side: 'left' | 'right' | 'top' | 'bottom';
  playerId?: string;
  height: number;
}

interface CollisionResult {
  hit: boolean;
  object1: CollisionObject;
  object2: CollisionObject;
  point: { x: number; y: number };
  normal: { x: number; y: number }; // collision normal vector
  penetration: number;
  side: 'left' | 'right' | 'top' | 'bottom';
  hitPosition: number; // 0-1 for paddles (where on the paddle was hit)
  continuous: boolean; // was this detected via continuous collision detection
}

// Server-side Collision Detector using the same logic as client
// 🏓 CENTRALIZED PADDLE DIMENSIONS - matches client-side constants
const PADDLE_LENGTH = 140; // Length of paddles in their movement direction
const PADDLE_THICKNESS = 12; // Thickness of all paddles (matches border thickness)

class ServerCollisionDetector {
  private static readonly COLLISION_BUFFER = 0; // No buffer for pixel-perfect collision detection

  // 🏓 Ball-paddle collision with hit position calculation
  static detectBallPaddle(ball: Ball, paddle: Paddle): CollisionResult {
    // Use continuous collision detection for moving balls
    const ballObj: CollisionObject = {
      x: ball.x,
      y: ball.y,
      width: ball.size,
      height: ball.size,
      vx: ball.vx,
      vy: ball.vy
    };

    const result = this.detectContinuous(ballObj, paddle, this.COLLISION_BUFFER);

    if (!result.hit) {
      return result;
    }

    // Calculate hit position (0 = start edge, 1 = end edge, 0.5 = center)
    let hitPosition: number;

    if (paddle.side === 'left' || paddle.side === 'right') {
      // Vertical paddles: hit position along Y axis
      const ballCenterY = ball.y + ball.size / 2;
      const paddleCenterY = paddle.y + paddle.height / 2;
      const relativeHit = (ballCenterY - paddleCenterY) / (paddle.height / 2);
      hitPosition = Math.max(0, Math.min(1, (relativeHit + 1) / 2));
    } else {
      // Horizontal paddles: hit position along X axis
      const ballCenterX = ball.x + ball.size / 2;
      const paddleCenterX = paddle.x + paddle.width / 2;
      const relativeHit = (ballCenterX - paddleCenterX) / (paddle.width / 2);
      hitPosition = Math.max(0, Math.min(1, (relativeHit + 1) / 2));
    }

    return {
      ...result,
      hitPosition
    };
  }

  // 🚀 Continuous collision detection for fast-moving objects
  static detectContinuous(
    obj1: CollisionObject,
    obj2: CollisionObject,
    buffer: number = 0
  ): CollisionResult {
    // Check if object has velocity (checking for existence AND non-zero)
    if (!obj1.vx && !obj1.vy) {
      return this.detectAABB(obj1, obj2, buffer);
    }

    // Calculate next position
    const nextObj1 = {
      ...obj1,
      x: obj1.x + (obj1.vx || 0),
      y: obj1.y + (obj1.vy || 0)
    };

    // Check if trajectory would cross the object
    const currentResult = this.detectAABB(obj1, obj2, buffer);
    const nextResult = this.detectAABB(nextObj1, obj2, buffer);

    if (nextResult.hit || currentResult.hit) {
      const result = nextResult.hit ? nextResult : currentResult;
      return {
        ...result,
        continuous: true
      };
    }

    return currentResult;
  }

  // 🎯 AABB collision detection with buffer
  static detectAABB(obj1: CollisionObject, obj2: CollisionObject, buffer: number = 0): CollisionResult {
    const bounds1 = {
      left: obj1.x,
      right: obj1.x + obj1.width,
      top: obj1.y,
      bottom: obj1.y + obj1.height
    };
    const bounds2 = {
      left: obj2.x,
      right: obj2.x + obj2.width,
      top: obj2.y,
      bottom: obj2.y + obj2.height
    };

    const hit = bounds1.right + buffer > bounds2.left - buffer &&
                bounds1.left - buffer < bounds2.right + buffer &&
                bounds1.bottom + buffer > bounds2.top - buffer &&
                bounds1.top - buffer < bounds2.bottom + buffer;

    if (!hit) {
      return {
        hit: false,
        object1: obj1,
        object2: obj2,
        point: { x: 0, y: 0 },
        normal: { x: 0, y: 0 },
        penetration: 0,
        side: 'left',
        hitPosition: 0,
        continuous: false
      };
    }

    // Calculate collision details
    const overlapLeft = bounds1.right - bounds2.left;
    const overlapRight = bounds2.right - bounds1.left;
    const overlapTop = bounds1.bottom - bounds2.top;
    const overlapBottom = bounds2.bottom - bounds1.top;

    // Find minimum overlap to determine collision side
    const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);

    let side: 'left' | 'right' | 'top' | 'bottom';
    let normal: { x: number; y: number };

    if (minOverlap === overlapLeft) {
      side = 'right';
      normal = { x: -1, y: 0 };
    } else if (minOverlap === overlapRight) {
      side = 'left';
      normal = { x: 1, y: 0 };
    } else if (minOverlap === overlapTop) {
      side = 'bottom';
      normal = { x: 0, y: -1 };
    } else {
      side = 'top';
      normal = { x: 0, y: 1 };
    }

    const collisionPoint = {
      x: (bounds1.left + bounds1.right + bounds2.left + bounds2.right) / 4,
      y: (bounds1.top + bounds1.bottom + bounds2.top + bounds2.bottom) / 4
    };

    return {
      hit: true,
      object1: obj1,
      object2: obj2,
      point: collisionPoint,
      normal,
      penetration: minOverlap,
      side,
      hitPosition: 0.5, // Default to center, calculated specifically for paddles
      continuous: false
    };
  }

  // 🏆 Ball-wall collision detection for scoring
  static detectBallWall(ball: Ball, canvasWidth: number, canvasHeight: number): CollisionResult | null {
    // Check each wall boundary
    if (ball.x + ball.size < -ball.size) {
      return this.createWallCollisionResult(ball, 'left', canvasWidth, canvasHeight);
    }

    if (ball.x > canvasWidth + ball.size) {
      return this.createWallCollisionResult(ball, 'right', canvasWidth, canvasHeight);
    }

    if (ball.y + ball.size < -ball.size) {
      return this.createWallCollisionResult(ball, 'top', canvasWidth, canvasHeight);
    }

    if (ball.y > canvasHeight + ball.size) {
      return this.createWallCollisionResult(ball, 'bottom', canvasWidth, canvasHeight);
    }

    return null;
  }

  private static createWallCollisionResult(
    ball: Ball,
    side: 'left' | 'right' | 'top' | 'bottom',
    canvasWidth: number,
    canvasHeight: number
  ): CollisionResult {
    const wallObj: CollisionObject = {
      x: side === 'left' ? 0 : side === 'right' ? canvasWidth : 0,
      y: side === 'top' ? 0 : side === 'bottom' ? canvasHeight : 0,
      width: side === 'top' || side === 'bottom' ? canvasWidth : 1,
      height: side === 'left' || side === 'right' ? canvasHeight : 1
    };

    return {
      hit: true,
      object1: ball,
      object2: wallObj,
      point: { x: ball.x + ball.size / 2, y: ball.y + ball.size / 2 },
      normal: side === 'left' ? { x: 1, y: 0 } :
              side === 'right' ? { x: -1, y: 0 } :
              side === 'top' ? { x: 0, y: 1 } : { x: 0, y: -1 },
      penetration: 0,
      side,
      hitPosition: 0.5,
      continuous: false
    };
  }
}

// Server-side collision detection constants (match client-side values)
const COLLISION_BUFFER = 0; // No buffer for pixel-perfect collision detection
const BORDER_THICKNESS = 12; // Border thickness to match client-side visual rendering
const SPEED_BOOST = 1.02; // Speed boost for collision excitement

// Types for game entities
interface Pickup {
  id: string;
  x: number;
  y: number;
  type: 'speed_up' | 'speed_down' | 'big_ball' | 'small_ball' | 'drunk_ball' | 'grow_paddle' | 'shrink_paddle' | 'reverse_controls' | 'invisible_ball' | 'multi_ball' | 'freeze_opponent' | 'super_speed' | 'coin_shower' | 'teleport_ball' | 'gravity_in_space' | 'super_striker' | 'sticky_paddles' | 'machine_gun' | 'dynamic_playfield' | 'switch_sides' | 'blocker' | 'time_warp' | 'portal_ball' | 'mirror_mode' | 'quantum_ball' | 'black_hole' | 'lightning_storm' | 'invisible_paddles' | 'ball_trail_mine' | 'paddle_swap' | 'disco_mode' | 'pac_man' | 'banana_peel' | 'rubber_ball' | 'drunk_paddles' | 'magnet_ball' | 'balloon_ball' | 'earthquake' | 'confetti_cannon' | 'hypno_ball' | 'conga_line' | 'arkanoid' | 'attractor' | 'repulsor';
  createdAt: number;
  size?: number;
}

interface Coin {
  id: string;
  x: number;
  y: number;
  createdAt: number;
  size: number;
}

interface ActiveEffect {
  type: 'speed_up' | 'speed_down' | 'big_ball' | 'small_ball' | 'drunk_ball' | 'grow_paddle' | 'shrink_paddle' | 'reverse_controls' | 'invisible_ball' | 'multi_ball' | 'freeze_opponent' | 'super_speed' | 'coin_shower' | 'teleport_ball' | 'gravity_in_space' | 'super_striker' | 'sticky_paddles' | 'machine_gun' | 'dynamic_playfield' | 'switch_sides' | 'blocker' | 'time_warp' | 'portal_ball' | 'mirror_mode' | 'quantum_ball' | 'black_hole' | 'lightning_storm' | 'invisible_paddles' | 'ball_trail_mine' | 'paddle_swap' | 'disco_mode' | 'pac_man' | 'banana_peel' | 'rubber_ball' | 'drunk_paddles' | 'magnet_ball' | 'balloon_ball' | 'earthquake' | 'confetti_cannon' | 'hypno_ball' | 'conga_line' | 'arkanoid' | 'attractor' | 'repulsor';
  startTime: number;
  duration: number;
  originalValue?: any;
  side?: string;
  x?: number; // Position for force fields
  y?: number;
}

interface GameState {
  ball: {
    x: number;
    y: number;
    dx: number;
    dy: number;
    size: number;
    originalSize: number;
    isDrunk: boolean;
    drunkAngle: number;
    isTeleporting: boolean;
    lastTeleportTime: number;
    stuckCheckStartTime: number;
    stuckCheckStartX: number;
    lastTouchedBy: 'left' | 'right' | 'top' | 'bottom' | null;
    previousTouchedBy: 'left' | 'right' | 'top' | 'bottom' | null;
    hasGravity: boolean;
    isAiming: boolean;
    aimStartTime: number;
    aimX: number;
    aimY: number;
    aimTargetX: number;
    aimTargetY: number;
    // New pickup properties
    isStuck: boolean;
    stuckToPaddle: 'left' | 'right' | 'top' | 'bottom' | null;
    stuckStartTime: number;
    stuckOffset: { x: number; y: number };
    hasPortal: boolean;
    portalX: number;
    portalY: number;
    isMirror: boolean;
    mirrorBalls: any[];
    isQuantum: boolean;
    quantumPositions: { x: number; y: number }[];
    hasTrailMines: boolean;
    trailMines: any[];
    isSlippery: boolean;
    bounciness: number;
    isMagnetic: boolean;
    isFloating: boolean;
    isHypnotic: boolean;
  };
  paddles: {
    left: { y: number; height: number; width: number; speed: number; velocity: number; targetY: number; originalHeight: number };
    right: { y: number; height: number; width: number; speed: number; velocity: number; targetY: number; originalHeight: number };
    top: { x: number; height: number; width: number; speed: number; velocity: number; targetX: number; originalWidth: number };
    bottom: { x: number; height: number; width: number; speed: number; velocity: number; targetX: number; originalWidth: number };
  };
  score: {
    left: number;
    right: number;
    top: number;
    bottom: number;
  };
  isPlaying: boolean;
  showStartScreen: boolean;
  gameMode: 'auto' | 'player' | 'multiplayer';
  colorIndex: number;
  isPaused: boolean;
  pauseEndTime: number;
  winner: 'left' | 'right' | 'top' | 'bottom' | null;
  gameEnded: boolean;
  decrunchEffect: {
    isActive: boolean;
    startTime: number;
    duration: number;
  };
  pickups: Pickup[];
  coins: Coin[];
  nextPickupTime: number;
  activeEffects: ActiveEffect[];
  pickupEffect: {
    isActive: boolean;
    startTime: number;
    x: number;
    y: number;
  };
  rumbleEffect: {
    isActive: boolean;
    startTime: number;
    intensity: number;
  };
  // New pickup effect properties
  machineGunBalls: any[];
  machineGunActive: boolean;
  machineGunStartTime: number;
  machineGunShooter: 'left' | 'right' | 'top' | 'bottom' | null;
  stickyPaddlesActive: boolean;
  playfieldScale: number;
  playfieldScaleTarget: number;
  playfieldScaleStart: number;
  playfieldScaleTime: number;
  walls: any[];
  timeWarpActive: boolean;
  timeWarpFactor: number;
  blackHoles: any[];
  lightningStrikes: any[];
  paddleVisibility: { left: number; right: number; top: number; bottom: number };
  discoMode: boolean;
  discoStartTime: number;
  sidesSwitched: boolean;
  paddleSwapActive: boolean;
  nextPaddleSwapTime: number;
  pacMans: any[];
  paddlesDrunk: boolean;
  drunkStartTime: number;
  earthquakeActive: boolean;
  earthquakeStartTime: number;
  confetti: any[];
  hypnoStartTime: number;
  congaBalls: any[];
  extraBalls: any[];
  // Arkanoid mode properties
  arkanoidBricks: any[];
  arkanoidActive: boolean;
  arkanoidMode: boolean;
  arkanoidBricksHit: number;
}

interface Player {
  id: string;
  side: 'left' | 'right' | 'top' | 'bottom' | 'spectator';
  ws: any;
  roomId: string;
  lastSeen: number;
  lastPaddleSequence?: number; // Track sequence to ignore out-of-order updates
}

interface GameRoom {
  id: string;
  gameState: GameState;
  players: Map<string, Player>;
  gamemaster: string | null;
  lastUpdate: number;
  isActive: boolean;
  canvasSize: { width: number; height: number };
}

class PongWebSocketServer {
  private wss: WebSocketServer;
  private server: any;
  private rooms: Map<string, GameRoom> = new Map();
  private players: Map<string, Player> = new Map();
  private port: number;
  private instanceId: string;
  private lastLogTime: number = 0;

  constructor(port = 3002) {
    this.port = port;
    this.instanceId = Math.random().toString(36).substr(2, 9);
    this.server = createServer();

    // Handle port already in use error before starting
    this.server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`[✖] Port ${this.port} is already in use!`);
        console.error(`[✖] Another WebSocket server is already running.`);
        console.error(`[✖] Please stop the existing server before starting a new one.`);
        process.exit(1);
      } else {
        console.error(`[✖] Server error:`, err);
        process.exit(1);
      }
    });

    this.wss = new WebSocketServer({
      server: this.server,
      perMessageDeflate: true, // Enable compression for better network performance
      maxPayload: 1024 * 1024 // 1MB
    });
    this.setupWebSocketHandlers();
    this.createPersistentMainRoom();
    this.startCleanupInterval();
    this.startGameLoop();
  }

  private setupWebSocketHandlers() {
    this.wss.on('connection', (ws) => {
      const connectionTime = Date.now();
      console.log('[▶] New WebSocket connection at', new Date().toISOString());
      let playerId: string | null = null;

      // Enhanced connection tracking
      (ws as any)._connectionTime = connectionTime;

      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message.toString());
          // console.log('📨 Received message:', data);
          this.handleMessage(ws, data);
          playerId = data.playerId || playerId;
        } catch (error) {
          console.error('[X] Error parsing message:', error);
          ws.send(JSON.stringify({ error: 'Invalid JSON' }));
        }
      });

      ws.on('close', (code, reason) => {
        const closeTime = Date.now();
        const connectionDuration = closeTime - (ws as any)._connectionTime;
        console.log('🔌 WebSocket disconnected');
        console.log(`   ├─ Close code: ${code}`);
        console.log(`   ├─ Reason: ${reason ? reason.toString() : 'none'}`);
        console.log(`   ├─ Connection duration: ${connectionDuration}ms`);
        console.log(`   └─ Player ID: ${playerId || 'none'}`);

        if (playerId) {
          this.handlePlayerDisconnect(playerId);
        }
      });

      ws.on('error', (error) => {
        console.error('[X] WebSocket error:', error);
      });
    });
  }

  private handleMessage(ws: any, message: any) {
    // Support both old and new compact message formats
    const type = message.type || message.t;
    const playerId = message.playerId || message.p;
    const roomId = message.roomId || message.r;
    const data = message.data || message.d;

    // Map compact types to full types
    const fullType = {
      'up': 'update_paddle',
      'ugsd': 'update_game_state_delta',
      'jr': 'join_room',
      'ugs': 'update_game_state',
      'rr': 'reset_room'
    }[type] || type;

    switch (fullType) {
      case 'join_room':
        this.handleJoinRoom(ws, playerId, roomId, data?.forceSpectator);
        break;
      case 'update_paddle':
        // Handle compact paddle data format
        const paddleData = data?.v !== undefined ? {
          y: data.y,
          velocity: data.v,
          targetY: data.tY
        } : data;
        this.handlePaddleUpdate(playerId, paddleData);
        break;
      case 'update_game_state':
        this.handleGameStateUpdate(playerId, roomId, data);
        break;
      case 'update_game_state_delta':
        this.handleGameStateDeltaUpdate(playerId, roomId, data);
        break;
      case 'reset_room':
        this.handleResetRoom(playerId, roomId);
        break;
      case 'ping':
        // Respond to ping with pong to keep connection alive
        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        if (playerId) {
          const player = this.players.get(playerId);
          if (player) player.lastSeen = Date.now();
        }
        break;
      default:
        console.log('[?] Unknown message type:', fullType, 'original:', type);
    }
  }

  private handleJoinRoom(ws: any, playerId: string, roomId: string, forceSpectator?: boolean) {
    console.log(`🏓 Player ${playerId} joining room ${roomId} (Instance: ${this.instanceId})`);
    console.log(`   ├─ Current rooms: ${this.rooms.size}`);
    console.log(`   ├─ Current players: ${this.players.size}`);

    // Get or create room
    let room = this.rooms.get(roomId);
    if (!room) {
      console.log(`   ├─ Creating new room: ${roomId}`);
      room = this.createNewRoom(roomId);
      this.rooms.set(roomId, room);
    } else {
      console.log(`   ├─ Found existing room with ${room.players.size} players`);
    }

    // Determine player side
    let playerSide: 'left' | 'right' | 'top' | 'bottom' | 'spectator' = 'spectator';

    // DISABLED: Force spectator mode for main room (was for 4-AI testing environment)
    if (false && roomId === 'main') {
      console.log(`   ├─ Main room detected - forcing spectator mode for 4-AI testing`);
      playerSide = 'spectator';
    } else if (forceSpectator) {
      console.log(`   ├─ Player ${playerId} forced to spectator mode`);
      playerSide = 'spectator';
    } else {
      const leftPlayer = Array.from(room.players.values()).find(p => p.side === 'left');
      const rightPlayer = Array.from(room.players.values()).find(p => p.side === 'right');
      const topPlayer = Array.from(room.players.values()).find(p => p.side === 'top');
      const bottomPlayer = Array.from(room.players.values()).find(p => p.side === 'bottom');

      if (!rightPlayer) {
        playerSide = 'right';
        if (!room.gamemaster) room.gamemaster = playerId;
      } else if (!leftPlayer) {
        playerSide = 'left';
      } else if (!topPlayer) {
        playerSide = 'top';
      } else if (!bottomPlayer) {
        playerSide = 'bottom';
      } else {
        // All 4 positions are taken, join as spectator
        playerSide = 'spectator';
        console.log(`   ├─ All 4 positions taken, player ${playerId} joining as spectator`);
      }
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

    console.log(`[✓] Player ${playerId} joined as ${playerSide} (${room.players.size} total players)`);

    // RESET and START fresh game when human players join (server-authoritative)
    if (room.players.size >= 1) {
      // Activate room for game loop processing
      room.isActive = true;

      // Reset all game state for fresh human game
      room.gameState.score = { left: 0, right: 0, top: 0, bottom: 0 };
      room.gameState.winner = null;
      room.gameState.gameEnded = false;
      room.gameState.isPlaying = true;
      room.gameState.showStartScreen = false;
      room.gameState.gameMode = 'multiplayer';
      room.gameState.isPaused = false;
      room.gameState.pauseEndTime = 0;
      // Reset ball to center
      room.gameState.ball.x = 400;
      room.gameState.ball.y = 300;
      // Reduce ball velocity to make gameplay more reasonable (was 10, now 3)
      room.gameState.ball.dx = Math.random() > 0.5 ? 3 : -3;
      room.gameState.ball.dy = Math.random() > 0.5 ? 3 : -3;
      console.log(`🎮 FRESH GAME STARTED in room ${roomId} with ${room.players.size} player(s) - All scores reset to 0-0-0-0`);
    }
  }

  private handlePaddleUpdate(playerId: string, data: any) {
    const player = this.players.get(playerId);
    if (!player) return;

    const room = this.rooms.get(player.roomId);
    if (!room) return;

    // Check sequence number to ignore out-of-order updates
    if (data.seq && player.lastPaddleSequence && data.seq <= player.lastPaddleSequence) {
      // This is an old update that arrived out of order - ignore it
      return;
    }
    player.lastPaddleSequence = data.seq;

    player.lastSeen = Date.now();

    // Save old position before update
    const oldPositions = {
      left: { x: room.gameState.paddles.left.x, y: room.gameState.paddles.left.y },
      right: { x: room.gameState.paddles.right.x, y: room.gameState.paddles.right.y },
      top: { x: room.gameState.paddles.top.x, y: room.gameState.paddles.top.y },
      bottom: { x: room.gameState.paddles.bottom.x, y: room.gameState.paddles.bottom.y }
    };

    // Update paddle position in game state
    if (player.side === 'left') {
      room.gameState.paddles.left.y = data.y;
      room.gameState.paddles.left.velocity = data.velocity || 0;
      room.gameState.paddles.left.targetY = data.targetY || data.y;
    } else if (player.side === 'right') {
      room.gameState.paddles.right.y = data.y;
      room.gameState.paddles.right.velocity = data.velocity || 0;
      room.gameState.paddles.right.targetY = data.targetY || data.y;
    } else if (player.side === 'top') {
      room.gameState.paddles.top.x = data.x;
      room.gameState.paddles.top.velocity = data.velocity || 0;
      room.gameState.paddles.top.targetX = data.targetX || data.x;
    } else if (player.side === 'bottom') {
      room.gameState.paddles.bottom.x = data.x;
      room.gameState.paddles.bottom.velocity = data.velocity || 0;
      room.gameState.paddles.bottom.targetX = data.targetX || data.x;
    }

    // Check for paddle collisions after player movement
    const checkPaddleCollision = (p1: any, p2: any) => {
      return p1.x < p2.x + p2.width &&
             p1.x + p1.width > p2.x &&
             p1.y < p2.y + p2.height &&
             p1.y + p1.height > p2.y;
    };

    // Check collision between player paddle and other paddles
    if (player.side === 'left') {
      if (checkPaddleCollision(room.gameState.paddles.left, room.gameState.paddles.top)) {
        room.gameState.paddles.left.y = oldPositions.left.y;
        console.log(`⚔️ Player LEFT blocked by TOP at corner`);
      }
      if (checkPaddleCollision(room.gameState.paddles.left, room.gameState.paddles.bottom)) {
        room.gameState.paddles.left.y = oldPositions.left.y;
        console.log(`⚔️ Player LEFT blocked by BOTTOM at corner`);
      }
    } else if (player.side === 'right') {
      if (checkPaddleCollision(room.gameState.paddles.right, room.gameState.paddles.top)) {
        room.gameState.paddles.right.y = oldPositions.right.y;
        console.log(`⚔️ Player RIGHT blocked by TOP at corner`);
      }
      if (checkPaddleCollision(room.gameState.paddles.right, room.gameState.paddles.bottom)) {
        room.gameState.paddles.right.y = oldPositions.right.y;
        console.log(`⚔️ Player RIGHT blocked by BOTTOM at corner`);
      }
    } else if (player.side === 'top') {
      if (checkPaddleCollision(room.gameState.paddles.top, room.gameState.paddles.left)) {
        room.gameState.paddles.top.x = oldPositions.top.x;
        console.log(`⚔️ Player TOP blocked by LEFT at corner`);
      }
      if (checkPaddleCollision(room.gameState.paddles.top, room.gameState.paddles.right)) {
        room.gameState.paddles.top.x = oldPositions.top.x;
        console.log(`⚔️ Player TOP blocked by RIGHT at corner`);
      }
    } else if (player.side === 'bottom') {
      if (checkPaddleCollision(room.gameState.paddles.bottom, room.gameState.paddles.left)) {
        room.gameState.paddles.bottom.x = oldPositions.bottom.x;
        console.log(`⚔️ Player BOTTOM blocked by LEFT at corner`);
      }
      if (checkPaddleCollision(room.gameState.paddles.bottom, room.gameState.paddles.right)) {
        room.gameState.paddles.bottom.x = oldPositions.bottom.x;
        console.log(`⚔️ Player BOTTOM blocked by RIGHT at corner`);
      }
    }

    // Broadcast paddle update to other players
    // Use the actual game state position (which may have been reverted by collision detection)
    const updateData: any = {
      side: player.side,
      velocity: data.velocity
    };

    // Add appropriate position data based on paddle side (from game state, not from client data)
    if (player.side === 'left') {
      updateData.y = room.gameState.paddles.left.y;
      updateData.targetY = room.gameState.paddles.left.targetY;
    } else if (player.side === 'right') {
      updateData.y = room.gameState.paddles.right.y;
      updateData.targetY = room.gameState.paddles.right.targetY;
    } else if (player.side === 'top') {
      updateData.x = room.gameState.paddles.top.x;
      updateData.targetX = room.gameState.paddles.top.targetX;
    } else if (player.side === 'bottom') {
      updateData.x = room.gameState.paddles.bottom.x;
      updateData.targetX = room.gameState.paddles.bottom.targetX;
    }

    this.broadcastToRoom(player.roomId, {
      type: 'paddle_updated',
      data: updateData
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

  private handleGameStateDeltaUpdate(playerId: string, roomId: string, deltaData: any) {
    const room = this.rooms.get(roomId);
    if (!room || room.gamemaster !== playerId) return;

    const player = this.players.get(playerId);
    if (player) player.lastSeen = Date.now();

    // Apply delta to room game state
    if (deltaData.ball) {
      room.gameState.ball = { ...room.gameState.ball, ...deltaData.ball };
    }

    // CRITICAL FIX: Server is authoritative for scoring - never accept score updates from clients
    // Clients should never send score data in a server-authoritative architecture
    // All scoring is handled by server-side ball physics and collision detection
    if (deltaData.score) {
      console.log('🚨 IGNORED: Client attempted to send score update - server is authoritative for scoring');
      console.log('   ├─ Attempted score update:', deltaData.score);
      console.log('   ├─ Current server score:', room.gameState.score);
      // Do not apply client score updates
    }

    if (deltaData.isPlaying !== undefined) room.gameState.isPlaying = deltaData.isPlaying;
    if (deltaData.showStartScreen !== undefined) room.gameState.showStartScreen = deltaData.showStartScreen;
    if (deltaData.isPaused !== undefined) room.gameState.isPaused = deltaData.isPaused;
    if (deltaData.winner !== undefined) room.gameState.winner = deltaData.winner;
    if (deltaData.gameEnded !== undefined) room.gameState.gameEnded = deltaData.gameEnded;

    if (deltaData.pickups) room.gameState.pickups = deltaData.pickups;
    if (deltaData.coins) room.gameState.coins = deltaData.coins;
    if (deltaData.nextPickupTime !== undefined) room.gameState.nextPickupTime = deltaData.nextPickupTime;

    if (deltaData.activeEffects) room.gameState.activeEffects = deltaData.activeEffects;

    if (deltaData.pickupEffect) room.gameState.pickupEffect = deltaData.pickupEffect;
    if (deltaData.decrunchEffect) room.gameState.decrunchEffect = deltaData.decrunchEffect;

    room.lastUpdate = Date.now();

    // Broadcast delta to all other players
    this.broadcastToRoom(roomId, {
      type: 'update_game_state_delta',
      data: deltaData
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

    console.log(`[↻] Room ${roomId} reset by gamemaster ${playerId}`);
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

      // Check if we need to promote a spectator to fill the leaving player's position
      let promotedSpectator = false;
      let replacementType = 'ai';

      if (player.side !== 'spectator') {
        // Find a spectator to promote to the leaving player's position
        const spectators = Array.from(room.players.values()).filter(p => p.side === 'spectator');
        if (spectators.length > 0) {
          const spectator = spectators[0];
          spectator.side = player.side;
          promotedSpectator = true;
          replacementType = 'spectator';

          // Notify the promoted spectator
          spectator.ws.send(JSON.stringify({
            type: 'joined_room',
            data: {
              playerSide: player.side,
              isGameMaster: false,
              playerCount: room.players.size
            }
          }));

          console.log(`[↻] Spectator ${spectator.id} promoted to ${player.side} position`);
        }
      }

      // Clean up empty rooms (except main room which is persistent)
      if (room.players.size === 0 && player.roomId !== 'main') {
        this.rooms.delete(player.roomId);
        console.log(`🗑️ Empty room ${player.roomId} deleted`);
      } else if (room.players.size === 0 && player.roomId === 'main') {
        console.log(`[⌂] Main room kept alive (empty but persistent)`);
      } else {
        // Notify remaining players
        this.broadcastToRoom(player.roomId, {
          type: 'player_left',
          data: {
            playerId,
            playerSide: player.side,
            playerCount: room.players.size,
            replacementType,
            promotedSpectator
          }
        });
      }

      // Stop game when last human player disconnects (save server resources)
      if (room.players.size === 0) {
        room.gameState.isPlaying = false;
        room.gameState.isPaused = false;
        room.gameState.pauseEndTime = 0;
        console.log(`⏸️ Game stopped in room ${player.roomId} - no human players remaining`);
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
          console.error(`[X] Error sending message to player ${player.id}:`, error);
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
      isActive: false, // Start inactive - activate when first player joins
      canvasSize: { width: 800, height: 800 }
    };
  }

  private createInitialGameState(): GameState {
    return {
      ball: {
        x: 400,
        y: 300,
        dx: 10,
        dy: Math.random() > 0.5 ? 10 : -10, // Random vertical direction
        size: 12,
        originalSize: 12,
        isDrunk: false,
        drunkAngle: 0,
        isTeleporting: false,
        lastTeleportTime: 0,
        stuckCheckStartTime: 0,
        stuckCheckStartX: 0,
        lastTouchedBy: null,
        previousTouchedBy: null,
        hasGravity: false,
        isAiming: false,
        aimStartTime: 0,
        aimX: 0,
        aimY: 0,
        aimTargetX: 0,
        aimTargetY: 0,
        // Extended ball properties
        isStuck: false,
        stuckToPaddle: null,
        stuckStartTime: 0,
        stuckOffset: { x: 0, y: 0 },
        hasPortal: false,
        portalX: 0,
        portalY: 0,
        isMirror: false,
        mirrorBalls: [],
        isQuantum: false,
        quantumPositions: [],
        hasTrailMines: false,
        trailMines: [],
        isSlippery: false,
        bounciness: 1,
        isMagnetic: false,
        isFloating: false,
        isHypnotic: false
      },
      paddles: {
        left: { x: BORDER_THICKNESS * 2, y: 250, height: PADDLE_LENGTH, width: PADDLE_THICKNESS, speed: 32, velocity: 0, targetY: 250, originalHeight: PADDLE_LENGTH },
        right: { x: 800 - PADDLE_THICKNESS - (BORDER_THICKNESS * 2), y: 250, height: PADDLE_LENGTH, width: PADDLE_THICKNESS, speed: 32, velocity: 0, targetY: 250, originalHeight: PADDLE_LENGTH },
        top: { x: 360, y: BORDER_THICKNESS * 2, height: PADDLE_THICKNESS, width: PADDLE_LENGTH, speed: 32, velocity: 0, targetX: 360, originalWidth: PADDLE_LENGTH },
        bottom: { x: 360, y: 800 - PADDLE_THICKNESS - (BORDER_THICKNESS * 2), height: PADDLE_THICKNESS, width: PADDLE_LENGTH, speed: 32, velocity: 0, targetX: 360, originalWidth: PADDLE_LENGTH }
      },
      score: {
        left: 0,
        right: 0,
        top: 0,
        bottom: 0
      },
      isPlaying: true, // Auto-start for 4-AI testing (skip start screen)
      showStartScreen: false, // Skip start screen for testing
      gameMode: 'multiplayer' as const,
      colorIndex: 0,
      isPaused: false,
      pauseEndTime: 0,
      winner: null,
      gameEnded: false,
      decrunchEffect: {
        isActive: false,
        startTime: 0,
        duration: 0
      },
      pickups: [],
      coins: [],
      nextPickupTime: Date.now() + 5000, // First pickup in 5 seconds
      activeEffects: [],
      pickupEffect: {
        isActive: false,
        startTime: 0,
        x: 0,
        y: 0
      },
      rumbleEffect: {
        isActive: false,
        startTime: 0,
        intensity: 0
      },
      // Pickup effect properties
      machineGunBalls: [],
      machineGunActive: false,
      machineGunStartTime: 0,
      machineGunShooter: null,
      stickyPaddlesActive: false,
      playfieldScale: 1,
      playfieldScaleTarget: 1,
      playfieldScaleStart: 1,
      playfieldScaleTime: 0,
      walls: [],
      timeWarpActive: false,
      timeWarpFactor: 1,
      blackHoles: [],
      lightningStrikes: [],
      paddleVisibility: { left: 1, right: 1, top: 1, bottom: 1 },
      discoMode: false,
      discoStartTime: 0,
      sidesSwitched: false,
      paddleSwapActive: false,
      nextPaddleSwapTime: 0,
      pacMans: [],
      paddlesDrunk: false,
      drunkStartTime: 0,
      earthquakeActive: false,
      earthquakeStartTime: 0,
      confetti: [],
      hypnoStartTime: 0,
      congaBalls: [],
      extraBalls: [],
      // Arkanoid mode properties
      arkanoidBricks: [],
      arkanoidActive: false,
      arkanoidMode: false,
      arkanoidBricksHit: 0
    };
  }


  private startCleanupInterval() {
    setInterval(() => {
      const now = Date.now();
      const timeout = 30000; // 30 seconds

      // Clean up inactive players
      this.players.forEach((player, playerId) => {
        if (now - player.lastSeen > timeout) {
          console.log(`[~] Cleaning up inactive player ${playerId}`);
          this.handlePlayerDisconnect(playerId);
        }
      });

      // Deactivate rooms with no players (except main room which persists)
      this.rooms.forEach((room, roomId) => {
        if (room.players.size === 0 && room.isActive) {
          console.log(`[~] Deactivating empty room ${roomId}`);
          room.isActive = false;
          room.gameState.isPlaying = false;
        }

        // Clean up non-main rooms after timeout
        if (roomId !== 'main' && now - room.lastUpdate > timeout && room.players.size === 0) {
          console.log(`[~] Cleaning up inactive room ${roomId}`);
          this.rooms.delete(roomId);
        }
      });
    }, 10000); // Check every 10 seconds
  }

  private createPersistentMainRoom() {
    // Create the main room that persists even when empty
    const mainRoom = this.createNewRoom('main');
    this.rooms.set('main', mainRoom);

    // Don't auto-start game - wait for players to join
    mainRoom.isActive = false;
    mainRoom.gameState.isPlaying = false;
    console.log(`[⌂] Persistent main room created (idle until players join)`);
  }

  private startGameLoop() {
    // Server-side game loop running at 60 FPS for smooth physics
    const GAME_LOOP_FPS = 60;
    const GAME_LOOP_INTERVAL = 1000 / GAME_LOOP_FPS;

    setInterval(() => {
      this.updateGameLogic();
    }, GAME_LOOP_INTERVAL);

    console.log(`[↻] Server game loop started at ${GAME_LOOP_FPS} FPS`);
  }

  private updateGameLogic() {
    const now = Date.now();

    this.rooms.forEach((room, roomId) => {
      // Only update active game rooms - allow AI-only games for testing
      if (!room.isActive) return;

      const gameState = room.gameState;
      const canvasSize = room.canvasSize;

      // Check if pause timer has expired
      if (gameState.isPaused && gameState.pauseEndTime > 0 && Date.now() >= gameState.pauseEndTime) {
        gameState.isPaused = false;
        gameState.pauseEndTime = 0;
        console.log('⏰ Pause timer expired, resuming game');
      }

      // Minimal server status logging
      if (this.lastLogTime === 0) this.lastLogTime = now;
      // Reduced logging frequency to every 5 seconds
      if (now - this.lastLogTime > 5000) {
        console.log('⚡ Server Status:', {
          ballPos: gameState.ball.x + ',' + gameState.ball.y,
          isPlaying: gameState.isPlaying,
          players: room.players.size
        });
        this.lastLogTime = now;
      }

      let gameStateChanged = false;

      // Only update ball/pickup/effect physics if game is playing and not paused
      if (gameState.isPlaying && !gameState.isPaused && !gameState.gameEnded) {
        // Update ball physics
        const ballPhysicsChanged = this.updateBallPhysics(gameState, canvasSize);
        if (ballPhysicsChanged) {
          gameStateChanged = true;
        }

        // Physics debug removed for cleaner console

        // Handle pickups generation and collision
        if (this.updatePickups(gameState, canvasSize, now)) {
          gameStateChanged = true;
        }

        // Update active effects
        if (this.updateActiveEffects(gameState, now)) {
          gameStateChanged = true;
        }
      }

      // Broadcast debug removed for cleaner console

      // ALWAYS broadcast paddle positions - players should be able to move at all times
      // Force broadcast every frame to ensure smooth client updates
      // (Since client runs at 90 FPS and server at 60 FPS, we need frequent updates)
      this.broadcastToRoom(roomId, {
        type: 'server_game_update',
        data: {
          ball: gameState.ball,
          paddles: gameState.paddles, // Always include paddle positions so players can move
          score: gameState.score,
          pickups: gameState.pickups,
          coins: gameState.coins,
          activeEffects: gameState.activeEffects,
          pickupEffect: gameState.pickupEffect,
          rumbleEffect: gameState.rumbleEffect,
          winner: gameState.winner,
          gameEnded: gameState.gameEnded,
          isPlaying: gameState.isPlaying,
          isPaused: gameState.isPaused,
          showStartScreen: gameState.showStartScreen,
          colorIndex: gameState.colorIndex
        }
      });

      room.lastUpdate = now;
    });
  }

  private updateBallPhysics(gameState: GameState, canvasSize: { width: number; height: number }): boolean {
    let ballChanged = false;

    // 🎯 COMPREHENSIVE BALL DEBUG OUTPUT
    const ballCenterX = gameState.ball.x + gameState.ball.size / 2;
    const ballCenterY = gameState.ball.y + gameState.ball.size / 2;

    // Log current ball state every few frames for tracking
    const frameCount = Date.now();
    if (frameCount % 300 < 50) { // Every ~5 frames at 60fps
      console.log(`\n📍 BALL STATE: pos(${gameState.ball.x.toFixed(1)}, ${gameState.ball.y.toFixed(1)}) center(${ballCenterX.toFixed(1)}, ${ballCenterY.toFixed(1)}) vel(${gameState.ball.dx.toFixed(2)}, ${gameState.ball.dy.toFixed(2)})`);

      // Show ball boundaries
      const ballBounds = {
        left: gameState.ball.x,
        right: gameState.ball.x + gameState.ball.size,
        top: gameState.ball.y,
        bottom: gameState.ball.y + gameState.ball.size
      };
      console.log(`🎯 BALL BOUNDS: L=${ballBounds.left.toFixed(1)} R=${ballBounds.right.toFixed(1)} T=${ballBounds.top.toFixed(1)} B=${ballBounds.bottom.toFixed(1)}`);

      // Show canvas boundaries and paddle zones
      console.log(`🏟️  CANVAS: ${canvasSize.width}x${canvasSize.height}`);
      console.log(`🚧 PADDLE ZONES: Left[x≤44] Right[x≥${canvasSize.width-44}] Top[y≤44] Bottom[y≥${canvasSize.height-44}]`);
    }

    // Update AI paddles to track the ball
    const topPaddleCenter = gameState.paddles.top.x + gameState.paddles.top.width / 2;
    const bottomPaddleCenter = gameState.paddles.bottom.x + gameState.paddles.bottom.width / 2;
    const leftPaddleCenter = gameState.paddles.left.y + gameState.paddles.left.height / 2;
    const rightPaddleCenter = gameState.paddles.right.y + gameState.paddles.right.height / 2;

    // Advanced AI with trajectory prediction and wall bounces
    const predictBallPosition = (
      ballX: number,
      ballY: number,
      ballDX: number,
      ballDY: number,
      targetX: number,
      canvasWidth: number,
      canvasHeight: number,
      isHorizontal: boolean
    ): number => {
      // Simulate ball movement until it reaches the target X or Y coordinate
      let x = ballX;
      let y = ballY;
      let dx = ballDX;
      let dy = ballDY;
      const maxIterations = 200; // Prevent infinite loops
      let iterations = 0;

      while (iterations < maxIterations) {
        // Move ball one step
        x += dx;
        y += dy;

        // Bounce off walls
        if (y <= 0 || y >= canvasHeight) {
          dy = -dy;
          y = Math.max(0, Math.min(canvasHeight, y));
        }
        if (x <= 0 || x >= canvasWidth) {
          dx = -dx;
          x = Math.max(0, Math.min(canvasWidth, x));
        }

        // Check if we've reached the target
        if (isHorizontal) {
          // For horizontal paddles (top/bottom), track along Y axis, return X position
          if ((dy > 0 && y >= targetX) || (dy < 0 && y <= targetX)) {
            return x; // Return predicted X position when ball reaches target Y
          }
        } else {
          // For vertical paddles (left/right), track along X axis, return Y position
          if ((dx > 0 && x >= targetX) || (dx < 0 && x <= targetX)) {
            return y; // Return predicted Y position when ball reaches target X
          }
        }

        iterations++;
      }

      // Fallback: return current ball position
      return isHorizontal ? ballY : ballX;
    };

    const updatePaddleAI = (
      paddleName: 'left' | 'right' | 'top' | 'bottom',
      paddle: any,
      canvasWidth: number,
      canvasHeight: number
    ) => {
      const isVertical = paddleName === 'left' || paddleName === 'right';
      const axis = isVertical ? 'y' : 'x';
      const paddleSize = isVertical ? paddle.height : paddle.width;
      const canvasDimension = isVertical ? canvasHeight : canvasWidth;

      // Determine if ball is approaching this paddle
      const isApproaching = (
        (paddleName === 'left' && gameState.ball.dx < 0) ||
        (paddleName === 'right' && gameState.ball.dx > 0) ||
        (paddleName === 'top' && gameState.ball.dy < 0) ||
        (paddleName === 'bottom' && gameState.ball.dy > 0)
      );

      if (!isApproaching) return; // Don't move if ball is moving away

      const oldPos = paddle[axis];

      // Predict where ball will be
      const targetCoord = paddleName === 'left' ? 32 :
                          paddleName === 'right' ? canvasWidth - 32 :
                          paddleName === 'top' ? 32 :
                          canvasHeight - 32;

      const predictedPos = predictBallPosition(
        gameState.ball.x,
        gameState.ball.y,
        gameState.ball.dx,
        gameState.ball.dy,
        targetCoord,
        canvasWidth,
        canvasHeight,
        !isVertical
      );

      // Store target if not exists or recalculate if ball direction/position changed significantly
      if (!paddle.targetPos || Math.abs(paddle.lastPredictedPos - predictedPos) > 20) {
        // Add large imperfection to prevent AI loops
        const imperfection = (Math.random() - 0.5) * 80; // Increased from 40 to 80 for more variety

        // 20% chance AI makes a significant mistake (helps break loops)
        const makeMistake = Math.random() < 0.2;
        const mistakeOffset = makeMistake ? (Math.random() - 0.5) * 150 : 0;

        paddle.targetPos = predictedPos + imperfection + mistakeOffset - (paddleSize / 2);
        paddle.lastPredictedPos = predictedPos;
      }

      const targetPos = paddle.targetPos;

      // Calculate distance and speed
      const paddleCenter = paddle[axis] + (paddleSize / 2);
      const distance = Math.abs(targetPos + (paddleSize / 2) - paddleCenter);

      // Dynamic speed: faster when far, slower when close
      // Reduced AI speed to make it less perfect
      const minSpeed = 1.5; // Reduced from 2.0
      const maxSpeed = 6.0; // Reduced from 8.0
      const speedMultiplier = Math.min(1, distance / 100); // Scale based on distance
      const speed = minSpeed + (maxSpeed - minSpeed) * speedMultiplier;

      // Only move if distance is significant (deadzone larger than max speed to prevent oscillation)
      const deadzone = 15; // Increased from 10 to make AI less twitchy
      if (distance > deadzone) {
        const direction = (targetPos + (paddleSize / 2)) > paddleCenter ? 1 : -1;
        const movement = direction * speed;

        // Prevent overshoot: don't move past the target
        if (Math.abs(movement) > distance) {
          paddle[axis] = targetPos;
        } else {
          paddle[axis] += movement;
        }

        // No clamping - paddles can move freely across entire canvas
        // Border is purely visual, only ball needs boundary checking for scoring

        const newPos = paddle[axis];
        const delta = newPos - oldPos;
        console.log(`🤖 ${paddleName.toUpperCase()}: ${oldPos.toFixed(1)} → ${newPos.toFixed(1)} (Δ${delta.toFixed(1)}) predicted=${predictedPos.toFixed(1)} speed=${speed.toFixed(1)}`);
      }
    };

    // Save old positions before AI updates
    const oldPositions = {
      left: { x: gameState.paddles.left.x, y: gameState.paddles.left.y },
      right: { x: gameState.paddles.right.x, y: gameState.paddles.right.y },
      top: { x: gameState.paddles.top.x, y: gameState.paddles.top.y },
      bottom: { x: gameState.paddles.bottom.x, y: gameState.paddles.bottom.y }
    };

    // Update all AI paddles with trajectory prediction
    updatePaddleAI('left', gameState.paddles.left, canvasSize.width, canvasSize.height);
    updatePaddleAI('right', gameState.paddles.right, canvasSize.width, canvasSize.height);
    updatePaddleAI('top', gameState.paddles.top, canvasSize.width, canvasSize.height);
    updatePaddleAI('bottom', gameState.paddles.bottom, canvasSize.width, canvasSize.height);

    // Paddle-to-paddle collision detection with proper resolution
    const checkPaddleCollision = (p1: any, p2: any) => {
      return p1.x < p2.x + p2.width &&
             p1.x + p1.width > p2.x &&
             p1.y < p2.y + p2.height &&
             p1.y + p1.height > p2.y;
    };

    // Resolve collisions by reverting to old position and clamping
    const resolveCollision = (paddle1Name: string, paddle2Name: string, paddle1: any, paddle2: any, old1: any, old2: any) => {
      if (checkPaddleCollision(paddle1, paddle2)) {
        // Determine which paddle moved most recently or more significantly
        const p1Movement = Math.abs(paddle1.x - old1.x) + Math.abs(paddle1.y - old1.y);
        const p2Movement = Math.abs(paddle2.x - old2.x) + Math.abs(paddle2.y - old2.y);

        if (p1Movement > p2Movement) {
          // Paddle 1 moved more, revert it
          paddle1.x = old1.x;
          paddle1.y = old1.y;
          console.log(`⚔️ ${paddle1Name}-${paddle2Name} collision: ${paddle1Name} reverted to (${old1.x.toFixed(1)}, ${old1.y.toFixed(1)})`);
        } else {
          // Paddle 2 moved more (or equal), revert it
          paddle2.x = old2.x;
          paddle2.y = old2.y;
          console.log(`⚔️ ${paddle1Name}-${paddle2Name} collision: ${paddle2Name} reverted to (${old2.x.toFixed(1)}, ${old2.y.toFixed(1)})`);
        }

        // Check again after revert - if still colliding, revert both
        if (checkPaddleCollision(paddle1, paddle2)) {
          paddle1.x = old1.x;
          paddle1.y = old1.y;
          paddle2.x = old2.x;
          paddle2.y = old2.y;
          console.log(`⚔️ ${paddle1Name}-${paddle2Name} STUCK: Both reverted`);
        }
      }
    };

    // Check all corner collision combinations
    resolveCollision('left', 'top', gameState.paddles.left, gameState.paddles.top, oldPositions.left, oldPositions.top);
    resolveCollision('left', 'bottom', gameState.paddles.left, gameState.paddles.bottom, oldPositions.left, oldPositions.bottom);
    resolveCollision('right', 'top', gameState.paddles.right, gameState.paddles.top, oldPositions.right, oldPositions.top);
    resolveCollision('right', 'bottom', gameState.paddles.right, gameState.paddles.bottom, oldPositions.right, oldPositions.bottom);

    // Apply gravity effects
    if (gameState.ball.hasGravity) {
      const gravity = 0.3; // Gravity acceleration
      gameState.ball.dy += gravity; // Apply downward gravity
      ballChanged = true;
    }

    // Apply attractor and repulsor force fields
    const ballCenterForForces = {
      x: gameState.ball.x + gameState.ball.size / 2,
      y: gameState.ball.y + gameState.ball.size / 2
    };

    for (const effect of gameState.activeEffects) {
      if ((effect.type === 'attractor' || effect.type === 'repulsor') && effect.x !== undefined && effect.y !== undefined) {
        // Calculate distance from ball to force field center
        const dx = effect.x - ballCenterForForces.x;
        const dy = effect.y - ballCenterForForces.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Maximum interaction distance (increased for stronger effect)
        const maxDistance = 400;

        if (distance > 0 && distance < maxDistance) {
          // Force strength inversely proportional to distance (stronger when close)
          // Using squared falloff for more dramatic effect
          const forceMagnitude = (effect.type === 'attractor' ? 150 : -150) * (1 - (distance / maxDistance) ** 2);

          // Normalize direction vector
          const dirX = dx / distance;
          const dirY = dy / distance;

          // Apply force to ball velocity
          const forceX = dirX * forceMagnitude * 0.01;
          const forceY = dirY * forceMagnitude * 0.01;

          gameState.ball.dx += forceX;
          gameState.ball.dy += forceY;
          ballChanged = true;

          // Clamp ball velocity to prevent it from getting too fast
          const maxVelocity = 25;
          const currentSpeed = Math.sqrt(gameState.ball.dx ** 2 + gameState.ball.dy ** 2);
          if (currentSpeed > maxVelocity) {
            const scale = maxVelocity / currentSpeed;
            gameState.ball.dx *= scale;
            gameState.ball.dy *= scale;
          }
        }
      }
    }

    // Handle Super Striker aiming mode
    if (gameState.ball.isAiming) {
      const now = Date.now();
      const aimElapsed = now - gameState.ball.aimStartTime;
      if (aimElapsed >= 4000) { // 4 seconds aiming time
        // Time's up, launch the ball
        const aimDx = gameState.ball.aimTargetX - gameState.ball.x;
        const aimDy = gameState.ball.aimTargetY - gameState.ball.y;
        const aimDistance = Math.sqrt(aimDx * aimDx + aimDy * aimDy);
        if (aimDistance > 0) {
          const speed = 10; // Server ball speed
          gameState.ball.dx = (aimDx / aimDistance) * speed;
          gameState.ball.dy = (aimDy / aimDistance) * speed;
        } else {
          // Default direction if no aim target
          gameState.ball.dx = 10;
          gameState.ball.dy = 0;
        }
        gameState.ball.isAiming = false;
        ballChanged = true;
      }
    }

    // Calculate where the ball WILL BE after this frame
    const nextX = gameState.ball.isAiming ? gameState.ball.x : gameState.ball.x + gameState.ball.dx;
    const nextY = gameState.ball.isAiming ? gameState.ball.y : gameState.ball.y + gameState.ball.dy;

    // Current position (before moving)
    const currentLeft = gameState.ball.x;
    const currentRight = gameState.ball.x + gameState.ball.size;
    const currentTop = gameState.ball.y;
    const currentBottom = gameState.ball.y + gameState.ball.size;

    // Next position (after moving)
    const nextLeft = nextX;
    const nextRight = nextX + gameState.ball.size;
    const nextTop = nextY;
    const nextBottom = nextY + gameState.ball.size;

    // 🎯 CENTRALIZED COLLISION DETECTION (Server-side)
    // Use the same collision detection logic as the client for consistency

    // Create ball object for collision detection
    const ballForCollision: Ball = {
      x: gameState.ball.x,
      y: gameState.ball.y,
      size: gameState.ball.size,
      width: gameState.ball.size,
      height: gameState.ball.size,
      vx: gameState.ball.dx,
      vy: gameState.ball.dy,
      lastTouchedBy: gameState.ball.lastTouchedBy
    };

    // Create paddle objects
    const leftPaddle: Paddle = {
      x: BORDER_THICKNESS * 2,
      y: gameState.paddles.left.y,
      width: gameState.paddles.left.width,
      height: gameState.paddles.left.height,
      side: 'left'
    };

    const rightPaddle: Paddle = {
      x: canvasSize.width - gameState.paddles.right.width - (BORDER_THICKNESS * 2),
      y: gameState.paddles.right.y,
      width: gameState.paddles.right.width,
      height: gameState.paddles.right.height,
      side: 'right'
    };

    const topPaddle: Paddle = {
      x: gameState.paddles.top.x,
      y: BORDER_THICKNESS * 2,
      width: gameState.paddles.top.width,
      height: gameState.paddles.top.height,
      side: 'top'
    };

    const bottomPaddle: Paddle = {
      x: gameState.paddles.bottom.x,
      y: canvasSize.height - gameState.paddles.bottom.height - (BORDER_THICKNESS * 2),
      width: gameState.paddles.bottom.width,
      height: gameState.paddles.bottom.height,
      side: 'bottom'
    };

    // 🎯 DETAILED PADDLE DEBUG OUTPUT
    if (frameCount % 600 < 100) { // Every ~10 frames at 60fps - less frequent than ball state
      console.log(`\n🏓 PADDLE BOUNDARIES:`);
      console.log(`  LEFT: x=${leftPaddle.x}-${leftPaddle.x + leftPaddle.width} y=${leftPaddle.y.toFixed(1)}-${(leftPaddle.y + leftPaddle.height).toFixed(1)}`);
      console.log(`  RIGHT: x=${rightPaddle.x}-${rightPaddle.x + rightPaddle.width} y=${rightPaddle.y.toFixed(1)}-${(rightPaddle.y + rightPaddle.height).toFixed(1)}`);
      console.log(`  TOP: x=${topPaddle.x.toFixed(1)}-${(topPaddle.x + topPaddle.width).toFixed(1)} y=${topPaddle.y}-${topPaddle.y + topPaddle.height}`);
      console.log(`  BOTTOM: x=${bottomPaddle.x.toFixed(1)}-${(bottomPaddle.x + bottomPaddle.width).toFixed(1)} y=${bottomPaddle.y}-${bottomPaddle.y + bottomPaddle.height}`);
    }

    // Check all paddle collisions using centralized detection
    const paddles = [leftPaddle, rightPaddle, topPaddle, bottomPaddle];

    // Add collision cooldown to prevent multiple collisions per frame
    const now = Date.now();
    if (!gameState.ball.lastCollisionTime) gameState.ball.lastCollisionTime = 0;
    const collisionCooldown = 50; // 50ms cooldown - short enough to catch fast balls

    // 🚨 COLLISION DETECTION WITH EXTENSIVE DEBUGGING
    let collisionDetected = false;
    if (now - gameState.ball.lastCollisionTime > collisionCooldown) {
      for (const paddle of paddles) {
        const collision = ServerCollisionDetector.detectBallPaddle(ballForCollision, paddle);

        // Log collision attempts for debugging
        if (frameCount % 1000 < 100) { // Less frequent collision attempt logging
          const distance = Math.abs(
            paddle.side === 'left' || paddle.side === 'right'
              ? ballCenterX - (paddle.x + paddle.width/2)
              : ballCenterY - (paddle.y + paddle.height/2)
          );
          console.log(`🔍 ${paddle.side.toUpperCase()} collision check: hit=${collision.hit}, distance=${distance.toFixed(1)}`);
        }

        if (collision.hit) {
          console.log(`\n🚨 ${paddle.side.toUpperCase()} PADDLE COLLISION DETECTED!`);
          console.log(`  📍 Ball: pos(${gameState.ball.x.toFixed(1)}, ${gameState.ball.y.toFixed(1)}) vel(${gameState.ball.dx.toFixed(2)}, ${gameState.ball.dy.toFixed(2)})`);
          console.log(`  🏓 Paddle: x=${paddle.x}-${paddle.x + paddle.width} y=${paddle.y.toFixed(1)}-${(paddle.y + paddle.height).toFixed(1)}`);
          console.log(`  🎯 Hit position: ${collision.hitPosition.toFixed(3)} (0=edge, 0.5=center, 1=edge)`);
          console.log(`  ⏱️  Collision cooldown: ${now - gameState.ball.lastCollisionTime}ms since last`);
          collisionDetected = true;

          // Set collision cooldown
          gameState.ball.lastCollisionTime = now;

        // Improved angle calculation with better control
        const hitPosition = collision.hitPosition;
        const clampedHitPosition = Math.max(0, Math.min(1, hitPosition));

        // Convert to range [-1, 1] where 0 is center
        let normalizedPosition = (clampedHitPosition - 0.5) * 2;

        // Anti-loop protection: if ball hits too close to center, add minimum deflection
        const centerThreshold = 0.15; // If within 15% of center
        if (Math.abs(normalizedPosition) < centerThreshold) {
          // Add small random deflection to prevent perfect straight bounces
          const minDeflection = 0.2; // Minimum 20% deflection
          const randomSign = Math.random() > 0.5 ? 1 : -1;
          normalizedPosition = randomSign * (minDeflection + Math.random() * 0.1);
          console.log(`🎯 Anti-loop: Adding deflection ${normalizedPosition.toFixed(3)} to prevent bounce loop`);
        }

        // Direct angle calculation with better control curve
        // Use a quadratic curve for smoother angle progression
        const baseSpeed = 10; // Server ball speed
        const maxAngle = Math.PI / 2.2; // ~82 degrees maximum deflection (increased for more interesting gameplay)
        const deflectionAngle = normalizedPosition * maxAngle * Math.abs(normalizedPosition); // Quadratic curve

        // Apply velocity based on paddle side (same as client)
        if (paddle.side === 'left') {
          gameState.ball.dx = Math.cos(deflectionAngle) * baseSpeed;
          gameState.ball.dy = Math.sin(deflectionAngle) * baseSpeed;
          gameState.ball.x = paddle.x + paddle.width + 1;
        } else if (paddle.side === 'right') {
          gameState.ball.dx = -Math.cos(deflectionAngle) * baseSpeed;
          gameState.ball.dy = Math.sin(deflectionAngle) * baseSpeed;
          gameState.ball.x = paddle.x - gameState.ball.size - 1;
        } else if (paddle.side === 'top') {
          gameState.ball.dx = Math.sin(deflectionAngle) * baseSpeed;
          gameState.ball.dy = Math.cos(deflectionAngle) * baseSpeed;
          gameState.ball.y = paddle.y + paddle.height + 1;
        } else if (paddle.side === 'bottom') {
          gameState.ball.dx = Math.sin(deflectionAngle) * baseSpeed;
          gameState.ball.dy = -Math.cos(deflectionAngle) * baseSpeed;
          gameState.ball.y = paddle.y - gameState.ball.size - 1;
        }

        // Add speed variation based on distance from center (same as client)
        const distanceFromCenter = Math.abs(clampedHitPosition - 0.5) * 2;
        const speedVariation = 1 + (distanceFromCenter * 0.2); // 0-20% speed increase
        gameState.ball.dx *= speedVariation;
        gameState.ball.dy *= speedVariation;

        // Optional: Add slight speed boost on collision for excitement (same as client)
        gameState.ball.dx *= SPEED_BOOST;
        gameState.ball.dy *= SPEED_BOOST;

        // Track ball touch for scoring system
        gameState.ball.lastTouchedBy = paddle.side;

        // Trigger rumble effect for paddle collision (more discrete)
        gameState.rumbleEffect.isActive = true;
        gameState.rumbleEffect.startTime = now;
        gameState.rumbleEffect.intensity = 4; // Reduced from 8 to 4 for more discrete rumble

        // Cycle through ball colors on paddle collision (0-7)
        gameState.colorIndex = (gameState.colorIndex + 1) % 8;
        console.log(`🎨 Ball color cycled to index: ${gameState.colorIndex}`);

        ballChanged = true;

        // Only process first collision to avoid multiple collisions per frame
        break;
      }
    }
    } // Close collision cooldown check

    // Arkanoid brick collision detection
    if (gameState.arkanoidActive && gameState.arkanoidBricks && gameState.arkanoidBricks.length > 0) {
      for (let i = gameState.arkanoidBricks.length - 1; i >= 0; i--) {
        const brick = gameState.arkanoidBricks[i];

        // Check collision with brick - define ball bounds
        const ballLeft = gameState.ball.x;
        const ballRight = gameState.ball.x + gameState.ball.size;
        const ballTop = gameState.ball.y;
        const ballBottom = gameState.ball.y + gameState.ball.size;

        const brickCollision = ballRight >= brick.x &&
                              ballLeft <= brick.x + brick.width &&
                              ballBottom >= brick.y &&
                              ballTop <= brick.y + brick.height;

        if (brickCollision) {
          // Remove the brick
          gameState.arkanoidBricks.splice(i, 1);
          gameState.arkanoidBricksHit++;

          // Score every 4th brick hit
          if (gameState.arkanoidBricksHit % 4 === 0) {
            // Award point to the player who last touched the ball
            if (gameState.ball.lastTouchedBy) {
              gameState.score[gameState.ball.lastTouchedBy]++;
            }
          }

          // Determine collision direction and bounce appropriately
          const brickCenterX = brick.x + brick.width / 2;
          const brickCenterY = brick.y + brick.height / 2;
          const ballCenterXCurrent = gameState.ball.x + gameState.ball.size / 2;
          const ballCenterYCurrent = gameState.ball.y + gameState.ball.size / 2;

          const prevBallCenterX = ballCenterXCurrent - gameState.ball.dx;
          const prevBallCenterY = ballCenterYCurrent - gameState.ball.dy;

          // Determine which side of the brick was hit
          const deltaX = ballCenterXCurrent - brickCenterX;
          const deltaY = ballCenterYCurrent - brickCenterY;
          const absX = Math.abs(deltaX);
          const absY = Math.abs(deltaY);

          // Hit from left or right side
          if (absX > absY) {
            gameState.ball.dx = -gameState.ball.dx;
            // Position ball outside the brick
            if (deltaX > 0) {
              gameState.ball.x = brick.x + brick.width + 1;
            } else {
              gameState.ball.x = brick.x - gameState.ball.size - 1;
            }
          }
          // Hit from top or bottom
          else {
            gameState.ball.dy = -gameState.ball.dy;
            // Position ball outside the brick
            if (deltaY > 0) {
              gameState.ball.y = brick.y + brick.height + 1;
            } else {
              gameState.ball.y = brick.y - gameState.ball.size - 1;
            }
          }

          ballChanged = true;

          // Check if all bricks are cleared
          if (gameState.arkanoidBricks.length === 0) {
            // End Arkanoid mode
            gameState.arkanoidActive = false;
            gameState.arkanoidMode = false;

            // Remove the effect
            gameState.activeEffects = gameState.activeEffects.filter(
              effect => effect.type !== 'arkanoid'
            );

            // Bonus points for clearing all bricks
            if (gameState.ball.lastTouchedBy) {
              gameState.score[gameState.ball.lastTouchedBy] += 2; // 2 bonus points
            }
          }

          // Only handle one brick collision per frame
          break;
        }
      }
    }

    // 🚀 BALL MOVEMENT WITH COMPREHENSIVE DEBUG TRACKING
    if (!gameState.ball.isAiming) {
      const prevX = gameState.ball.x;
      const prevY = gameState.ball.y;

      gameState.ball.x += gameState.ball.dx;
      gameState.ball.y += gameState.ball.dy;

      // Log ball movement every few frames for tracking trajectory
      if (frameCount % 400 < 50) { // Every ~7 frames at 60fps
        console.log(`🚀 BALL MOVEMENT: (${prevX.toFixed(1)}, ${prevY.toFixed(1)}) → (${gameState.ball.x.toFixed(1)}, ${gameState.ball.y.toFixed(1)}) | Δ(${gameState.ball.dx.toFixed(2)}, ${gameState.ball.dy.toFixed(2)})`);

        // Check distance from boundaries
        const distToLeft = gameState.ball.x;
        const distToRight = canvasSize.width - (gameState.ball.x + gameState.ball.size);
        const distToTop = gameState.ball.y;
        const distToBottom = canvasSize.height - (gameState.ball.y + gameState.ball.size);
        console.log(`🌍 BOUNDARY DISTANCES: L=${distToLeft.toFixed(1)} R=${distToRight.toFixed(1)} T=${distToTop.toFixed(1)} B=${distToBottom.toFixed(1)}`);

        // Check if ball is approaching boundaries
        const approachingLeft = gameState.ball.dx < 0 && distToLeft < 100;
        const approachingRight = gameState.ball.dx > 0 && distToRight < 100;
        const approachingTop = gameState.ball.dy < 0 && distToTop < 100;
        const approachingBottom = gameState.ball.dy > 0 && distToBottom < 100;

        if (approachingLeft || approachingRight || approachingTop || approachingBottom) {
          console.log(`⚠️ BOUNDARY APPROACH: Left=${approachingLeft} Right=${approachingRight} Top=${approachingTop} Bottom=${approachingBottom}`);
        }
      }

      // 🛡️ SAFETY LIMITS: Prevent extreme ball velocities and positions
      const MAX_VELOCITY = 20; // Maximum allowed velocity
      const MAX_POSITION = 2000; // Maximum position (well outside normal canvas)

      // Clamp velocities to prevent runaway acceleration
      if (Math.abs(gameState.ball.dx) > MAX_VELOCITY) {
        console.warn(`⚠️ Ball velocity too high: dx=${gameState.ball.dx}, clamping to ${MAX_VELOCITY}`);
        gameState.ball.dx = Math.sign(gameState.ball.dx) * MAX_VELOCITY;
      }
      if (Math.abs(gameState.ball.dy) > MAX_VELOCITY) {
        console.warn(`⚠️ Ball velocity too high: dy=${gameState.ball.dy}, clamping to ${MAX_VELOCITY}`);
        gameState.ball.dy = Math.sign(gameState.ball.dy) * MAX_VELOCITY;
      }

      // Clamp positions to prevent extreme coordinates
      if (Math.abs(gameState.ball.x) > MAX_POSITION || Math.abs(gameState.ball.y) > MAX_POSITION) {
        console.warn(`⚠️ Ball position too extreme: (${gameState.ball.x},${gameState.ball.y}), resetting ball`);
        this.resetBall(gameState);
        ballChanged = true;
      }
    }

    // 🎯 CENTRALIZED BALL BOUNDARY COLLISION DETECTION FOR SCORING
    // Update ball object with current position for boundary detection
    ballForCollision.x = gameState.ball.x;
    ballForCollision.y = gameState.ball.y;
    ballForCollision.vx = gameState.ball.dx;
    ballForCollision.vy = gameState.ball.dy;

    // 🏆 COMPREHENSIVE BOUNDARY COLLISION DETECTION WITH DEBUG LOGGING
    const wallCollision = ServerCollisionDetector.detectBallWall(ballForCollision, canvasSize.width, canvasSize.height);

    // Always log boundary check results for debugging
    if (frameCount % 800 < 100) { // Every ~13 frames at 60fps - less frequent than other logs
      const ballBounds = {
        left: ballForCollision.x,
        right: ballForCollision.x + ballForCollision.size,
        top: ballForCollision.y,
        bottom: ballForCollision.y + ballForCollision.size
      };
      console.log(`🏆 BOUNDARY CHECK: Ball bounds L=${ballBounds.left.toFixed(1)} R=${ballBounds.right.toFixed(1)} T=${ballBounds.top.toFixed(1)} B=${ballBounds.bottom.toFixed(1)}`);
      console.log(`🏆 CANVAS BOUNDS: 0-${canvasSize.width} x 0-${canvasSize.height} | Collision detected: ${wallCollision ? wallCollision.side : 'NONE'}`);
    }

    if (wallCollision && wallCollision.hit) {
      // Use the same collision cooldown as paddle collisions
      const now = Date.now();
      if (!gameState.ball.lastCollisionTime) gameState.ball.lastCollisionTime = 0;
      const collisionCooldown = 200; // 200ms cooldown between collisions (increased to reduce loops)

      console.log(`\n🏆 BOUNDARY COLLISION DETECTED!`);
      console.log(`  📍 Ball: pos(${gameState.ball.x.toFixed(1)}, ${gameState.ball.y.toFixed(1)}) vel(${gameState.ball.dx.toFixed(2)}, ${gameState.ball.dy.toFixed(2)})`);
      console.log(`  🌍 Canvas: ${canvasSize.width}x${canvasSize.height}`);
      console.log(`  💥 Boundary hit: ${wallCollision.side.toUpperCase()}`);
      console.log(`  ⏱️  Time since last collision: ${now - gameState.ball.lastCollisionTime}ms`);

      // Only process boundary collision if cooldown has passed
      if (now - gameState.ball.lastCollisionTime > collisionCooldown) {
        console.log(`🏆 PROCESSING SCORING EVENT: Ball hit ${wallCollision.side} boundary`);

        // Set collision cooldown to prevent multiple boundary detections
        gameState.ball.lastCollisionTime = now;

        // Handle scoring immediately
        this.handleScoring(gameState, wallCollision.side);
        ballChanged = true;
      }
    }

    return ballChanged;
  }

  private handleScoring(gameState: GameState, boundaryHit: 'left' | 'right' | 'top' | 'bottom'): void {
    let scoringPlayer: 'left' | 'right' | 'top' | 'bottom';

    // Determine who gets the score based on last touch
    if (gameState.ball.lastTouchedBy) {
      // Check for self-goal (player hit ball into their own wall)
      const isSelfGoal = gameState.ball.lastTouchedBy === boundaryHit;
      if (isSelfGoal && gameState.ball.previousTouchedBy) {
        // Self-goal: previous player gets the score
        scoringPlayer = gameState.ball.previousTouchedBy;
      } else if (!isSelfGoal) {
        // Normal goal: last toucher gets the score
        scoringPlayer = gameState.ball.lastTouchedBy;
      } else {
        // Self-goal with no previous player - default opposite wall
        scoringPlayer = boundaryHit === 'left' ? 'right' :
                      boundaryHit === 'right' ? 'left' :
                      boundaryHit === 'top' ? 'bottom' : 'top';
      }
    } else {
      // No one touched the ball - default opposite wall scoring
      scoringPlayer = boundaryHit === 'left' ? 'right' :
                    boundaryHit === 'right' ? 'left' :
                    boundaryHit === 'top' ? 'bottom' : 'top';
    }

    // Award the score
    gameState.score[scoringPlayer]++;
    console.log(`🏆 SERVER SCORING: ${scoringPlayer} scores! New scores:`, gameState.score);

    // Check for winner (first to 1000 points)
    if (gameState.score[scoringPlayer] >= 1000) {
      gameState.winner = scoringPlayer;
      gameState.gameEnded = true;
      gameState.isPlaying = false;
      console.log(`🎉 Game Over! Winner: ${scoringPlayer}`);
    } else {
      // Pause for goal celebration (2 seconds)
      gameState.isPaused = true;
      gameState.pauseEndTime = Date.now() + 2000;
      console.log(`⏸️ Pausing for goal celebration, resuming in 2 seconds`);
    }

    // Reset ball position
    this.resetBall(gameState);
  }

  private resetBall(gameState: GameState): void {
    gameState.ball.x = 400;
    gameState.ball.y = 300;
    // Reduce ball velocity to make gameplay more reasonable (was 10, now 3)
    gameState.ball.dx = Math.random() > 0.5 ? 3 : -3;
    gameState.ball.dy = Math.random() > 0.5 ? 3 : -3;
    gameState.ball.lastTouchedBy = null;
    gameState.ball.previousTouchedBy = null;
    gameState.ball.hasGravity = false;
    gameState.ball.isAiming = false;
    gameState.ball.aimStartTime = 0;
    gameState.ball.aimX = 0;
    gameState.ball.aimY = 0;
    gameState.ball.aimTargetX = 0;
    gameState.ball.aimTargetY = 0;
  }

  private updatePickups(gameState: GameState, canvasSize: { width: number; height: number }, now: number): boolean {
    let pickupsChanged = false;

    // Generate new pickups (max 2 on playfield, less frequent)
    if (now >= gameState.nextPickupTime && gameState.pickups.length < 2) {
      this.generatePickup(gameState, canvasSize);

      // Slower pickup frequency (starts at 15s, decreases to 10s)
      const gameTime = now - (gameState.nextPickupTime - 5000); // Game start time estimation
      const baseInterval = 15000; // 15 seconds (increased from 8s)
      const minInterval = 10000; // 10 seconds minimum (increased from 4s)
      const progressionRate = gameTime / 60000; // Over 1 minute
      const currentInterval = Math.max(minInterval, baseInterval - (progressionRate * 5000));

      gameState.nextPickupTime = now + currentInterval;
      pickupsChanged = true;
    }

    // Check ball collision with pickups (reverse loop to avoid index issues when splicing)
    for (let i = gameState.pickups.length - 1; i >= 0; i--) {
      const pickup = gameState.pickups[i];
      const pickupCenterX = pickup.x + (pickup.size || 72) / 2;
      const pickupCenterY = pickup.y + (pickup.size || 72) / 2;
      let collected = false;

      // Check main ball collision
      const ballCenterX = gameState.ball.x + gameState.ball.size / 2;
      const ballCenterY = gameState.ball.y + gameState.ball.size / 2;
      const ballDistance = Math.sqrt(
        Math.pow(ballCenterX - pickupCenterX, 2) + Math.pow(ballCenterY - pickupCenterY, 2)
      );

      if (ballDistance < (gameState.ball.size + (pickup.size || 72)) / 2) {
        collected = true;
      }

      // Check extra balls collision
      if (!collected && gameState.extraBalls) {
        for (const extraBall of gameState.extraBalls) {
          const extraBallCenterX = extraBall.x + extraBall.size / 2;
          const extraBallCenterY = extraBall.y + extraBall.size / 2;
          const extraBallDistance = Math.sqrt(
            Math.pow(extraBallCenterX - pickupCenterX, 2) + Math.pow(extraBallCenterY - pickupCenterY, 2)
          );

          if (extraBallDistance < (extraBall.size + (pickup.size || 72)) / 2) {
            collected = true;
            break;
          }
        }
      }

      if (collected) {
        // Pickup collected!
        this.applyPickupEffect(gameState, pickup);
        gameState.pickups.splice(i, 1);

        // Create pickup effect animation
        gameState.pickupEffect = {
          isActive: true,
          startTime: now,
          x: pickup.x,
          y: pickup.y
        };

        pickupsChanged = true;
      }
    }

    return pickupsChanged;
  }

  private generatePickup(gameState: GameState, canvasSize: { width: number; height: number }): void {
    const pickupTypes: Pickup['type'][] = [
      'speed_up', 'speed_down', 'big_ball', 'small_ball', 'drunk_ball', 'grow_paddle', 'shrink_paddle',
      'reverse_controls', 'invisible_ball', 'freeze_opponent', 'multi_ball', 'super_speed', 'coin_shower',
      'teleport_ball', 'gravity_in_space', 'super_striker', 'sticky_paddles', 'machine_gun', 'dynamic_playfield',
      'switch_sides', 'blocker', 'time_warp', 'portal_ball', 'mirror_mode', 'quantum_ball', 'black_hole',
      'lightning_storm', 'invisible_paddles', 'ball_trail_mine', 'paddle_swap', 'disco_mode', 'pac_man',
      'banana_peel', 'rubber_ball', 'drunk_paddles', 'magnet_ball', 'balloon_ball', 'earthquake',
      'confetti_cannon', 'hypno_ball', 'conga_line', 'arkanoid', 'attractor', 'repulsor', 'great_wall'
    ];
    const type = pickupTypes[Math.floor(Math.random() * pickupTypes.length)];

    // Pickup size is 72x72 (6 pixels at 12x12 scale)
    // Paddles are at edges with 44px safe zone (per paddle collision code)
    // Add 72px for pickup size to avoid spawning on paddles
    const padding = 116; // 44px paddle zone + 72px pickup size

    const pickup: Pickup = {
      id: Math.random().toString(36).substr(2, 9),
      x: Math.random() * (canvasSize.width - padding * 2) + padding,
      y: Math.random() * (canvasSize.height - padding * 2) + padding,
      type,
      createdAt: Date.now(),
      size: 72
    };

    gameState.pickups.push(pickup);
  }

  private applyPickupEffect(gameState: GameState, pickup: Pickup): void {
    const effect: ActiveEffect = {
      type: pickup.type,
      startTime: Date.now(),
      duration: 5000 // 5 seconds
    };

    gameState.activeEffects.push(effect);

    // Apply immediate effects based on pickup type
    switch (pickup.type) {
      case 'speed_up':
        gameState.ball.dx *= 1.5;
        gameState.ball.dy *= 1.5;
        effect.duration = 6000;
        break;
      case 'speed_down':
        gameState.ball.dx *= 0.4;
        gameState.ball.dy *= 0.4;
        effect.duration = 6000;
        break;
      case 'big_ball':
        effect.originalValue = gameState.ball.size;
        gameState.ball.size = 18;
        break;
      case 'small_ball':
        effect.originalValue = gameState.ball.size;
        gameState.ball.size = 6;
        break;
      case 'drunk_ball':
        gameState.ball.isDrunk = true;
        gameState.ball.drunkAngle = 0;
        effect.duration = 4000;
        break;
      case 'grow_paddle':
        const targetSide = Math.random() > 0.5 ? 'left' : 'right';
        effect.side = targetSide;
        effect.originalValue = gameState.paddles[targetSide].height;
        gameState.paddles[targetSide].height = Math.min(150, gameState.paddles[targetSide].height * 1.5);
        break;
      case 'shrink_paddle':
        const shrinkSide = Math.random() > 0.5 ? 'left' : 'right';
        effect.side = shrinkSide;
        effect.originalValue = gameState.paddles[shrinkSide].height;
        gameState.paddles[shrinkSide].height = Math.max(30, gameState.paddles[shrinkSide].height * 0.6);
        break;
      case 'reverse_controls':
        // This will be handled in the input logic on client side
        break;
      case 'invisible_ball':
        // Visual effect handled on client side
        effect.duration = 4000;
        break;
      case 'freeze_opponent':
        effect.side = Math.random() > 0.5 ? 'left' : 'right';
        effect.duration = 3000;
        break;
      case 'super_speed':
        gameState.ball.dx *= 2.5;
        gameState.ball.dy *= 2.5;
        effect.duration = 3000;
        break;
      case 'sticky_paddles':
        // Ball will stick to paddles for 3 seconds before shooting
        gameState.stickyPaddlesActive = true;
        effect.duration = 15000; // Effect lasts 15 seconds
        break;
      case 'machine_gun':
        // Rapidly fire balls for 3 seconds
        gameState.machineGunActive = true;
        gameState.machineGunStartTime = Date.now();
        gameState.machineGunShooter = gameState.ball.lastTouchedBy;
        effect.duration = 3000; // 3 seconds of machine gun
        break;
      case 'dynamic_playfield':
        // Grow and shrink playfield with easing for 15 seconds
        gameState.playfieldScaleStart = gameState.playfieldScale;
        gameState.playfieldScaleTarget = 0.7 + Math.random() * 0.6; // Scale between 0.7-1.3
        gameState.playfieldScaleTime = Date.now();
        effect.duration = 15000; // 15 seconds
        break;
      case 'switch_sides':
        // All players switch sides and keep their scores
        const tempLeftScore = gameState.score.left;
        const tempRightScore = gameState.score.right;
        const tempTopScore = gameState.score.top;
        const tempBottomScore = gameState.score.bottom;
        gameState.score.left = tempRightScore;
        gameState.score.right = tempLeftScore;
        gameState.score.top = tempBottomScore;
        gameState.score.bottom = tempTopScore;
        gameState.sidesSwitched = !gameState.sidesSwitched;
        effect.duration = 3000; // Show effect for 3 seconds
        break;
      case 'time_warp':
        // Slow down or speed up time
        gameState.timeWarpActive = true;
        gameState.timeWarpFactor = Math.random() > 0.5 ? 0.5 : 2.0; // Half speed or double speed
        effect.duration = 8000; // 8 seconds
        break;
      case 'gravity_in_space':
        gameState.ball.hasGravity = true;
        effect.duration = 10000; // 10 seconds of gravity
        break;
      case 'super_striker':
        // Pause the ball and enter aiming mode
        gameState.ball.isAiming = true;
        gameState.ball.aimStartTime = Date.now();
        gameState.ball.aimX = gameState.ball.x;
        gameState.ball.aimY = gameState.ball.y;
        gameState.ball.dx = 0; // Stop the ball
        gameState.ball.dy = 0;
        effect.duration = 4000; // 4 seconds to aim
        break;
      case 'arkanoid':
        // Create arkanoid bricks in + formation
        gameState.arkanoidBricks = [];
        gameState.arkanoidActive = true;
        gameState.arkanoidMode = true;
        gameState.arkanoidBricksHit = 0;

        // Create + formation with 16 bricks (7 horizontal + 9 vertical, center overlaps)
        const centerX = 400; // Center of 800px canvas
        const centerY = 300; // Center of 600px canvas
        const brickWidth = 40;
        const brickHeight = 20;
        const spacing = 5;

        // Horizontal line of the + (7 bricks)
        for (let i = -3; i <= 3; i++) {
          gameState.arkanoidBricks.push({
            x: centerX + i * (brickWidth + spacing) - brickWidth / 2,
            y: centerY - brickHeight / 2,
            width: brickWidth,
            height: brickHeight,
            id: `h_${i}`,
            life: 1
          });
        }

        // Vertical line of the + (9 bricks, excluding center overlap)
        for (let i = -4; i <= 4; i++) {
          if (i !== 0) { // Skip center to avoid overlap
            gameState.arkanoidBricks.push({
              x: centerX - brickWidth / 2,
              y: centerY + i * (brickHeight + spacing) - brickHeight / 2,
              width: brickWidth,
              height: brickHeight,
              id: `v_${i}`,
              life: 1
            });
          }
        }

        effect.duration = 30000; // 30 seconds or until all bricks destroyed
        break;
      case 'multi_ball':
        // Add extra balls to the game
        for (let i = 0; i < 2; i++) {
          gameState.extraBalls.push({
            x: gameState.ball.x + (i * 10),
            y: gameState.ball.y + (i * 10),
            dx: gameState.ball.dx * (0.8 + i * 0.2),
            dy: gameState.ball.dy * (0.8 + i * 0.2),
            size: gameState.ball.size,
            id: `extra_${Date.now()}_${i}`
          });
        }
        effect.duration = 15000; // 15 seconds
        break;
      case 'teleport_ball':
        // Teleport ball to random location
        gameState.ball.x = 200 + Math.random() * 400;
        gameState.ball.y = 150 + Math.random() * 300;
        gameState.ball.isTeleporting = true;
        gameState.ball.lastTeleportTime = Date.now();
        effect.duration = 2000; // Visual effect for 2 seconds
        break;
      case 'rubber_ball':
        // Increase ball bounciness
        effect.originalValue = gameState.ball.bounciness;
        gameState.ball.bounciness = 1.5;
        gameState.ball.isSlippery = false; // Ensure clean state
        effect.duration = 10000; // 10 seconds
        break;
      case 'balloon_ball':
        // Make ball float and bounce gently
        gameState.ball.isFloating = true;
        effect.originalValue = gameState.ball.bounciness;
        gameState.ball.bounciness = 0.8;
        effect.duration = 8000; // 8 seconds
        break;
      case 'magnet_ball':
        // Ball attracted to paddles
        gameState.ball.isMagnetic = true;
        effect.duration = 12000; // 12 seconds
        break;
      case 'attractor':
        // Create an attractor force field that pulls the ball towards it
        effect.x = pickup.x + (pickup.size || 72) / 2;
        effect.y = pickup.y + (pickup.size || 72) / 2;
        effect.duration = 10000; // 10 seconds
        console.log(`🧲 Attractor created at (${effect.x}, ${effect.y})`);
        break;
      case 'repulsor':
        // Create a repulsor force field that pushes the ball away
        effect.x = pickup.x + (pickup.size || 72) / 2;
        effect.y = pickup.y + (pickup.size || 72) / 2;
        effect.duration = 10000; // 10 seconds
        console.log(`💨 Repulsor created at (${effect.x}, ${effect.y})`);
        break;
      case 'invisible_paddles':
        // Make paddles partially invisible
        gameState.paddleVisibility = { left: 0.2, right: 0.2, top: 0.2, bottom: 0.2 };
        effect.duration = 8000; // 8 seconds
        break;
      case 'drunk_paddles':
        // Make paddles move erratically
        gameState.paddlesDrunk = true;
        gameState.drunkStartTime = Date.now();
        effect.duration = 10000; // 10 seconds
        break;
      case 'earthquake':
        // Shake the playfield
        gameState.earthquakeActive = true;
        gameState.earthquakeStartTime = Date.now();
        effect.duration = 6000; // 6 seconds
        break;
      case 'hypno_ball':
        // Ball hypnotic effect
        gameState.ball.isHypnotic = true;
        gameState.hypnoStartTime = Date.now();
        effect.duration = 8000; // 8 seconds
        break;
      case 'disco_mode':
        // Disco effect
        gameState.discoMode = true;
        gameState.discoStartTime = Date.now();
        effect.duration = 15000; // 15 seconds
        break;
      case 'conga_line':
        // Create a line of balls following the main ball
        gameState.congaBalls = [];
        for (let i = 0; i < 3; i++) {
          gameState.congaBalls.push({
            x: gameState.ball.x - (i + 1) * 20,
            y: gameState.ball.y,
            targetX: gameState.ball.x,
            targetY: gameState.ball.y,
            id: `conga_${i}`
          });
        }
        effect.duration = 12000; // 12 seconds
        break;
      case 'confetti_cannon':
        // Create confetti particles
        gameState.confetti = [];
        for (let i = 0; i < 20; i++) {
          gameState.confetti.push({
            x: gameState.ball.x,
            y: gameState.ball.y,
            dx: (Math.random() - 0.5) * 10,
            dy: (Math.random() - 0.5) * 10,
            color: `hsl(${Math.random() * 360}, 70%, 60%)`,
            life: 3000,
            id: `confetti_${i}`
          });
        }
        effect.duration = 3000; // 3 seconds
        break;
      case 'coin_shower':
        // Create coins for collection
        gameState.coins = [];
        for (let i = 0; i < 10; i++) {
          gameState.coins.push({
            id: `coin_${Date.now()}_${i}`,
            x: Math.random() * 600 + 100,
            y: Math.random() * 400 + 100,
            createdAt: Date.now(),
            size: 12
          });
        }
        effect.duration = 15000; // 15 seconds
        break;
      case 'blocker':
        // Create walls/blockers
        gameState.walls = [];
        for (let i = 0; i < 3; i++) {
          gameState.walls.push({
            x: Math.random() * 600 + 100,
            y: Math.random() * 400 + 100,
            width: 20,
            height: 60,
            id: `wall_${i}`
          });
        }
        effect.duration = 20000; // 20 seconds
        break;
      case 'portal_ball':
        // Create portals for ball teleportation
        gameState.ball.hasPortal = true;
        gameState.ball.portalX = Math.random() * 600 + 100;
        gameState.ball.portalY = Math.random() * 400 + 100;
        effect.duration = 15000; // 15 seconds
        break;
      case 'mirror_mode':
        // Create mirror balls
        gameState.ball.isMirror = true;
        gameState.ball.mirrorBalls = [];
        for (let i = 0; i < 2; i++) {
          gameState.ball.mirrorBalls.push({
            x: 800 - gameState.ball.x,
            y: 600 - gameState.ball.y,
            dx: -gameState.ball.dx,
            dy: -gameState.ball.dy,
            id: `mirror_${i}`
          });
        }
        effect.duration = 12000; // 12 seconds
        break;
      case 'quantum_ball':
        // Create quantum positions
        gameState.ball.isQuantum = true;
        gameState.ball.quantumPositions = [];
        for (let i = 0; i < 3; i++) {
          gameState.ball.quantumPositions.push({
            x: Math.random() * 600 + 100,
            y: Math.random() * 400 + 100
          });
        }
        effect.duration = 8000; // 8 seconds
        break;
      case 'black_hole':
        // Create black holes
        gameState.blackHoles = [];
        for (let i = 0; i < 2; i++) {
          gameState.blackHoles.push({
            x: Math.random() * 600 + 100,
            y: Math.random() * 400 + 100,
            radius: 40,
            strength: 150,
            id: `blackhole_${i}`
          });
        }
        effect.duration = 15000; // 15 seconds
        break;
      case 'lightning_storm':
        // Create lightning strikes
        gameState.lightningStrikes = [];
        effect.duration = 10000; // 10 seconds
        break;
      case 'ball_trail_mine':
        // Enable trail mines
        gameState.ball.hasTrailMines = true;
        gameState.ball.trailMines = [];
        effect.duration = 15000; // 15 seconds
        break;
      case 'paddle_swap':
        // Swap paddle positions
        gameState.paddleSwapActive = true;
        gameState.nextPaddleSwapTime = Date.now() + 2000; // First swap in 2 seconds
        effect.duration = 10000; // 10 seconds
        break;
      case 'pac_man':
        // Create pac-man enemies
        gameState.pacMans = [];
        for (let i = 0; i < 3; i++) {
          gameState.pacMans.push({
            x: Math.random() * 600 + 100,
            y: Math.random() * 400 + 100,
            dx: (Math.random() - 0.5) * 4,
            dy: (Math.random() - 0.5) * 4,
            id: `pacman_${i}`,
            size: 20
          });
        }
        effect.duration = 15000; // 15 seconds
        break;
      case 'banana_peel':
        // Make ball slippery
        gameState.ball.isSlippery = true;
        effect.originalValue = gameState.ball.bounciness;
        gameState.ball.bounciness = 1.2;
        effect.duration = 8000; // 8 seconds
        break;
      default:
        // For any unimplemented pickup, give it a default 5 second duration
        effect.duration = 5000;
        break;
    }
  }

  private updateActiveEffects(gameState: GameState, now: number): boolean {
    let effectsChanged = false;

    // Remove expired effects
    const initialLength = gameState.activeEffects.length;
    gameState.activeEffects = gameState.activeEffects.filter(effect => {
      const isExpired = now - effect.startTime > effect.duration;

      if (isExpired) {
        // Reverse effect when it expires
        this.reversePickupEffect(gameState, effect);
      }

      return !isExpired;
    });

    if (gameState.activeEffects.length !== initialLength) {
      effectsChanged = true;
    }

    // Update pickup effect animation
    if (gameState.pickupEffect.isActive && now - gameState.pickupEffect.startTime > 1000) {
      gameState.pickupEffect.isActive = false;
      effectsChanged = true;
    }

    // Update rumble effect
    if (gameState.rumbleEffect.isActive && now - gameState.rumbleEffect.startTime > 500) {
      gameState.rumbleEffect.isActive = false;
      effectsChanged = true;
    }

    return effectsChanged;
  }

  private reversePickupEffect(gameState: GameState, effect: ActiveEffect): void {
    switch (effect.type) {
      case 'big_ball':
      case 'small_ball':
        if (effect.originalValue !== undefined) {
          gameState.ball.size = effect.originalValue;
        }
        break;

      case 'drunk_ball':
        gameState.ball.isDrunk = false;
        gameState.ball.drunkAngle = 0;
        break;

      case 'grow_paddle':
      case 'shrink_paddle':
        if (effect.side && effect.originalValue !== undefined) {
          gameState.paddles[effect.side as keyof typeof gameState.paddles].height = effect.originalValue;
        }
        break;

      case 'gravity_in_space':
        gameState.ball.hasGravity = false;
        break;

      case 'super_striker':
        gameState.ball.isAiming = false;
        // If still aiming when time expires, launch ball in default direction
        if (gameState.ball.isAiming) {
          gameState.ball.dx = 10;
          gameState.ball.dy = 0;
        }
        break;

      case 'sticky_paddles':
        gameState.stickyPaddlesActive = false;
        break;

      case 'machine_gun':
        gameState.machineGunActive = false;
        gameState.machineGunBalls = [];
        break;

      case 'dynamic_playfield':
        gameState.playfieldScale = 1.0;
        gameState.playfieldScaleTarget = 1.0;
        break;

      case 'time_warp':
        gameState.timeWarpActive = false;
        gameState.timeWarpFactor = 1.0;
        break;

      case 'arkanoid':
        gameState.arkanoidBricks = [];
        gameState.arkanoidActive = false;
        gameState.arkanoidMode = false;
        gameState.arkanoidBricksHit = 0;
        break;

      case 'multi_ball':
        gameState.extraBalls = [];
        break;

      case 'teleport_ball':
        gameState.ball.isTeleporting = false;
        break;

      case 'rubber_ball':
        if (effect.originalValue !== undefined) {
          gameState.ball.bounciness = effect.originalValue;
        }
        gameState.ball.isSlippery = false;
        break;

      case 'balloon_ball':
        gameState.ball.isFloating = false;
        if (effect.originalValue !== undefined) {
          gameState.ball.bounciness = effect.originalValue;
        }
        break;

      case 'magnet_ball':
        gameState.ball.isMagnetic = false;
        break;

      case 'invisible_paddles':
        gameState.paddleVisibility = { left: 1, right: 1, top: 1, bottom: 1 };
        break;

      case 'drunk_paddles':
        gameState.paddlesDrunk = false;
        break;

      case 'earthquake':
        gameState.earthquakeActive = false;
        break;

      case 'hypno_ball':
        gameState.ball.isHypnotic = false;
        break;

      case 'disco_mode':
        gameState.discoMode = false;
        break;

      case 'conga_line':
        gameState.congaBalls = [];
        break;

      case 'confetti_cannon':
        gameState.confetti = [];
        break;

      case 'coin_shower':
        gameState.coins = [];
        break;

      case 'blocker':
        gameState.walls = [];
        break;

      case 'portal_ball':
        gameState.ball.hasPortal = false;
        break;

      case 'mirror_mode':
        gameState.ball.isMirror = false;
        gameState.ball.mirrorBalls = [];
        break;

      case 'quantum_ball':
        gameState.ball.isQuantum = false;
        gameState.ball.quantumPositions = [];
        break;

      case 'black_hole':
        gameState.blackHoles = [];
        break;

      case 'lightning_storm':
        gameState.lightningStrikes = [];
        break;

      case 'ball_trail_mine':
        gameState.ball.hasTrailMines = false;
        gameState.ball.trailMines = [];
        break;

      case 'paddle_swap':
        gameState.paddleSwapActive = false;
        break;

      case 'pac_man':
        gameState.pacMans = [];
        break;

      case 'banana_peel':
        gameState.ball.isSlippery = false;
        if (effect.originalValue !== undefined) {
          gameState.ball.bounciness = effect.originalValue;
        }
        break;

      // For other effects, no cleanup needed (visual effects, etc.)
      default:
        break;
    }
  }

  private lineIntersectsRect(x1: number, y1: number, x2: number, y2: number, rx: number, ry: number, rw: number, rh: number): boolean {
    // Check if line intersects with rectangle
    const left = rx;
    const right = rx + rw;
    const top = ry;
    const bottom = ry + rh;

    // Check intersection with each edge of the rectangle
    return (
      this.lineIntersectsLine(x1, y1, x2, y2, left, top, right, top) ||    // Top edge
      this.lineIntersectsLine(x1, y1, x2, y2, right, top, right, bottom) || // Right edge
      this.lineIntersectsLine(x1, y1, x2, y2, right, bottom, left, bottom) || // Bottom edge
      this.lineIntersectsLine(x1, y1, x2, y2, left, bottom, left, top)       // Left edge
    );
  }

  private lineIntersectsLine(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, x4: number, y4: number): boolean {
    const denominator = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (denominator === 0) return false;

    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denominator;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denominator;

    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
  }

  public start() {
    // Add health check endpoint
    this.server.on('request', (req, res) => {
      if (req.url === '/health') {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET',
          'Access-Control-Allow-Headers': 'Content-Type'
        });
        res.end(JSON.stringify({
          status: 'ok',
          timestamp: Date.now(),
          serverInstanceId: this.instanceId,
          rooms: this.rooms.size,
          players: this.players.size
        }));
        return;
      }

      // Default response for other requests
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('WebSocket server running');
    });

    this.server.listen(this.port, '0.0.0.0', () => {
      console.log(`[▲] Pong WebSocket server running on http://0.0.0.0:${this.port}`);
      console.log(`[💓] Health endpoint available at http://0.0.0.0:${this.port}/health`);
      console.log(`[▶] Ready for Pong multiplayer connections!`);
      console.log(`[#] Server Instance ID: ${this.instanceId}`);
    }).on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`[✗] ERROR: Port ${this.port} is already in use. Another server is running.`);
        console.error(`[✗] Kill existing server first: lsof -ti:${this.port} | xargs kill -9`);
        process.exit(1);
      } else {
        console.error(`[✗] Server error:`, err);
        process.exit(1);
      }
    });

    // Send periodic heartbeat to all connected clients
    setInterval(() => {
      // Skip heartbeat if no players connected
      if (this.players.size === 0) return;

      this.players.forEach((player) => {
        if (player.ws.readyState === 1) { // WebSocket.OPEN
          try {
            player.ws.send(JSON.stringify({
              type: 'heartbeat',
              timestamp: Date.now(),
              serverInstanceId: this.instanceId
            }));
          } catch (error) {
            console.error(`[X] Error sending heartbeat to player ${player.id}:`, error);
          }
        }
      });
    }, 30000); // Send heartbeat every 30 seconds
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
const port = process.env.PORT ? parseInt(process.env.PORT) : 3002;
const pongServer = new PongWebSocketServer(port);
pongServer.start();

// Log stats periodically
setInterval(() => {
  const stats = pongServer.getStats();
  if (stats.totalPlayers > 0 || stats.activeRooms > 0) {
    console.log('📊 Server Stats:', JSON.stringify(stats, null, 2));
  }
}, 30000);

export default pongServer;