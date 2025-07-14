# WsMini

Minimalist WebSocket client and server for real-time applications with RPC, PubSub, Rooms and Game state synchronization based on WS https://github.com/websockets/ws

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- 🚀 Lightweight and easy
- 📡 RPC - Remote Procedure Calls with built-in error handling
- 🎯 PubSub - Very simple Publish/Subscribe system
- 🏠 Room-based management system
- 🎮 Game-ready with fixed timestep game loop and state synchronization

## Installation

```bash
npm install wsmini
```

## Usage

### For Browser (Client-side)
In browsers, use the client classes:

```javascript
import { WSClient, WSClientRoom } from 'wsmini';
```

### For Node.js (Server-side)
In Node.js, use the server classes:

```javascript
import { WSServerPubSub, WSServerRoomManager, WSServerRoom, WSServerGameRoom, WSServerError } from 'wsmini';
```

## Getting Started

For a detailed guide on how to get started with WsMini, including setting up a server, connecting clients, and using RPC and PubSub features, please refer to the [Getting Started Guide](./docs/guides/getting-started.md). The full documentation is available in the `docs` directory and includes examples for both client and server usage, as well as advanced features like Room management and Game state synchronization: [docs](./docs/index.md).

## Examples

### Running the Examples
To run the examples, you need to have Node.js installed. You can run the server examples using the following command:

```bash
node docs/examples/server/games.mjs
```

Then, serve the client examples using a simple HTTP server (not included in this package to keep it lightweight). Client examples are located in `docs/examples/client/`.

### 1. RPC - Remote Procedure Calls
Simple request/response pattern with error handling.

Complete server example located in [docs/examples/server/rpc.mjs](docs/examples/server/rpc.mjs).
```js
import { WSServerPubSub, WSServerError } from 'wsmini';
const wsServer = new WSServerPubSub({ port: 8888 });
wsServer.addRpc('add', (data) => {
  if (typeof data?.n1 != 'number') throw new WSServerError('n1 must be a number');
  if (typeof data?.n2 != 'number') throw new WSServerError('n2 must be a number');
  return data.n1 + data.n2;
});
wsServer.start();
```

Complete client example located in [docs/examples/client/rpc.js](docs/examples/client/rpc.js).
```javascript
import { WSClient } from 'wsmini';
const ws = new WSClient('ws://localhost:8888');
await ws.connect();
const result = await ws.rpc('add', {n1: 5, n2: 3});
console.log(result);
```

### 2. PubSub - Channel Based Messaging
Subscribe to channels and broadcast messages.

Complete server example located in [docs/examples/server/chat.mjs](docs/examples/server/chat.mjs).
```javascript
import { WSServerPubSub } from 'wsmini';
const wsServer = new WSServerPubSub({ port: 8887 });
wsServer.addChannel('chat', {
  hookPub: (msg, user) => ({
    time: Date.now(),
    user: 'Anon. ' + user.id.slice(0, 4),
    msg,
  }),
});
wsServer.start();
```

Complete client example located in [docs/examples/client/chat.js](docs/examples/client/chat.js).
```javascript
import { WSClient } from 'wsmini';
const ws = new WSClient('ws://localhost:8887');
await ws.connect();
ws.sub('chat', msg => console.log(`${msg.user}: ${msg.msg}`));
ws.pub('chat', 'Hello everyone!');
```

### 3. Room Management
Create/join rooms with built-in message handling.

Complete server example located in [docs/examples/server/room.mjs](docs/examples/server/rooms.mjs).
```javascript
import { WSServerRoomManager, WSServerRoom } from 'wsmini';
const wsServer = new WSServerRoomManager({
  port: 8889,
  maxUsersByRoom: 10,
  roomClass: class extends WSServerRoom {
    onMsg(msg, clientMeta, client) {
      return {
        time: Date.now(),
        msg,
      };
    }
  },
});
```

Complete client example located in [docs/examples/client/rooms.js](docs/examples/client/rooms.js).
```javascript
import { WSClientRoom } from 'wsmini';
const ws = new WSClientRoom('ws://localhost:8889');
const room1 = await ws.roomCreateOrJoin('room 1');
room1.onMessage(data => console.log(data.msg, data.time));
room1.send('Hello room 1!');
```

### 4. Game State Synchronization
- Main loop with fixed timestep
- Register custom commands and patches.
- Game list and player list synchronization.

Complete server example located in [docs/examples/server/games.mjs](docs/examples/server/games.mjs).
```javascript
import { WSServerRoomManager, WSServerGameRoom } from 'wsmini';

class Player {

  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.isMov = false;
  }

  tick(dt) {
    if (!this.isMov) return;
    // update the player data (take dt into account)
  }
}

const wsServer = new WSServerRoomManager({
  maxUsersByRoom: 2,
  roomClass: class extends WSServerGameRoom {
    onCreate(roomName) {
      // Initialize the world as you see fit
      this.world = {
        players: [
          new Player(0, 0),
          new Player(10, 10),
        ],
      };
      this.startMainLoop();
    }

    // define custom commands
    onCmdMove(msg, clientMeta) {
      // update player state
    }

    onTick(dt) {
      for (const player of this.world.players) player.tick(dt);
    }

    onPatch() {
      return this.world;
    }
  },
});

wsServer.start();
```

complete client example located in [docs/examples/client/games.js](docs/examples/client/games.js).
And a client with interpolation located in [docs/examples/client/gamesWithInterpolation.js](docs/examples/client/gamesWithInterpolation.js).
```javascript
import { WSClientRoom } from 'wsmini';
const ws = new WSClientRoom('wss://localhost');
const game1 = await ws.roomJoin('game1');
game1.onMessage(world => {
  // update the game state on the client side
});
document.addEventListener('keydown', e => {
  // Send custom command
  if (e.code === 'ArrowUp') game1.sendCmd('move', {dir: 'up'});
  if (e.code === 'ArrowDown') game1.sendCmd('move', {dir: 'down'});
  if (e.code === 'ArrowLeft') game1.sendCmd('move', {dir: 'left'});
  if (e.code === 'ArrowRight') game1.sendCmd('move', {dir: 'right'});
});

function render() {
  requestAnimationFrame(render);
  // render the game state
}
requestAnimationFrame(render);
```
