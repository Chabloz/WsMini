# WsMini Examples

This directory contains complete examples demonstrating some of the features of WsMini. Each example includes both server and client code with HTML interfaces.

## Overview

The examples showcase:
- **RPC (Remote Procedure Calls)**: Simple request/response pattern with error handling
- **PubSub (Publish/Subscribe)**: Channel-based messaging system
- **Room Management**: Create/join rooms with built-in message handling
- **Game State Synchronization**: Real-time multiplayer games with fixed timestep and interpolation

## Running the Examples

### Prerequisites
- Node.js installed
- A simple HTTP server to serve client files (like `python -m http.server` or VS Code Live Server)

### Steps
1. **Clone or fork the repository**:
   ```bash
   # Clone the repository
   git clone https://github.com/Chabloz/WsMini.git
   cd WsMini

   # Or fork it first on GitHub, then clone your fork
   git clone https://github.com/YOUR-USERNAME/WsMini.git
   cd WsMini
   ```

2. **Start a server example**:
   ```bash
   node docs/examples/server/rpc.mjs
   ```
   You can change rpc.mjs to any other example server file.

3. **Serve the client files**:
   From the root of the repository
   ```bash
   npx serve . -p 8080
   ```
   and go to  http://localhost:8080/docs/examples/client/rpc.html for the client interface (you can change rpc.html to any other example client file).

## Examples

### 1. RPC (Remote Procedure Calls)

**Server**: [`server/rpc.mjs`](./server/rpc.mjs) - Port 8888
**Client**: [`client/rpc.html`](./client/rpc.html) + [`client/rpc.js`](./client/rpc.js)

Demonstrates:
- Simple RPC calls with validation
- Error handling using `WSServerError`
- Broadcasting commands to all clients
- Client-side promise handling

**Features**:
- Add two numbers with server-side validation
- Real-time error messages
- Server broadcasts a command every 5 seconds

```javascript
// Server
wsServer.addRpc('add', (data) => {
  if (typeof data?.n1 != 'number') throw new WSServerError('n1 must be a number');
  if (typeof data?.n2 != 'number') throw new WSServerError('n2 must be a number');
  return data.n1 + data.n2;
});

// Client
const result = await ws.rpc('add', {n1: 5, n2: 3});
```

### 2. Chat (PubSub)

**Server**: [`server/chat.mjs`](./server/chat.mjs) - Port 8887
**Client**: [`client/chat.html`](./client/chat.html) + [`client/chat.js`](./client/chat.js)

Demonstrates:
- Channel-based messaging
- User metadata handling
- Message transformation hooks
- Real-time chat interface

```javascript
// Server
wsServer.addChannel('chat', {
  hookPub: (msg, user) => ({
    time: Date.now(),
    user: 'Anon. ' + user.id.slice(0, 4),
    color: user.color,
    msg,
  }),
});

// Client
ws.sub('chat', data => {
  // Display message with timestamp and user color
});
```

### 3. Rooms Management

**Server**: [`server/rooms.mjs`](./server/rooms.mjs) - Port 8889
**Client**: [`client/rooms.html`](./client/rooms.html) + [`client/rooms.js`](./client/rooms.js)

Demonstrates:
- Room creation and joining
- Room-specific messaging
- Client list management
- Room lifecycle hooks

**Features**:
- Create or join existing rooms
- List all available rooms
- Real-time user count per room
- Room-specific commands and messages
- Automatic room cleanup

```javascript
// Server
roomClass: class extends WSServerRoom {
  onMsg(msg, clientMeta, client) {
    return {
      time: Date.now(),
      user: 'Anon. ' + clientMeta.id.slice(0, 4),
      msg,
    };
  }
}

// Client
const room = await ws.roomCreateOrJoin('my-room');
room.onMessage(data => console.log(data));
room.send('Hello room!');
```

### 4. Game State Synchronization

**Server**: [`server/games.mjs`](./server/games.mjs) - Port 8890
**Client**: [`client/games.html`](./client/games.html) + [`client/games.js`](./client/games.js)

Demonstrates:
- Real-time multiplayer game mechanics
- Fixed timestep game loop
- Player movement
- Game state synchronization

**Advanced Client**: [`client/gamesWithInterpolation.html`](./client/gamesWithInterpolation.html) + [`client/gamesWithInterpolation.js`](./client/gamesWithInterpolation.js)

Shows client-side interpolation for smooth movement.

## File Structure

```
docs/examples/
├── server/
│   ├── rpc.mjs         # RPC server example
│   ├── chat.mjs        # Chat server with PubSub
│   ├── rooms.mjs       # Room management server
│   └── games.mjs       # Game server with state sync
└── client/
    ├── rpc.html        # RPC client interface
    ├── rpc.js          # RPC client logic
    ├── chat.html       # Chat client interface
    ├── chat.js         # Chat client logic
    ├── rooms.html      # Rooms client interface
    ├── rooms.js        # Rooms client logic
    ├── games.html      # Game client interface
    ├── games.js        # Game client logic
    ├── gamesWithInterpolation.html  # Advanced game client
    └── gamesWithInterpolation.js    # With interpolation
```

## Next Steps

1. Start with the **RPC example** to understand basic client-server communication
2. Explore the **Chat example** to learn about PubSub and channels
3. Try the **Rooms example** to see room management in action
4. Build upon the **Game example** to create your own multiplayer game

Each example builds upon the previous concepts, so it's recommended to explore them in order.