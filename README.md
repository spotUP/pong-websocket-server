# RetroRanks Pong WebSocket Server

Production WebSocket server for RetroRanks Pong multiplayer functionality.

## Features

- Real-time multiplayer Pong game support
- Room-based gameplay with automatic player assignment
- Gamemaster system for game state synchronization
- Automatic cleanup of inactive players and rooms
- Health check endpoint for monitoring
- CORS support for cross-origin connections

## Railway Deployment

This server is configured for deployment on Railway with:

- Automatic builds using TypeScript
- Health check endpoint at `/health`
- Environment-based port configuration
- Graceful shutdown handling

## Environment Variables

- `PORT` - Server port (defaults to 3002)
- `NODE_ENV` - Environment (production/development)

## API Endpoints

### WebSocket Connection
Connect to `wss://your-railway-app.railway.app/`

### Health Check
`GET /health` - Returns server status and statistics

## Message Types

The WebSocket server supports these message types:

- `join_room` - Join a game room
- `update_paddle` - Update paddle position
- `update_game_state` - Update complete game state (gamemaster only)
- `reset_room` - Reset game room (gamemaster only)

## Local Development

```bash
npm install
npm run dev
```

## Production Build

```bash
npm run build
npm start
```