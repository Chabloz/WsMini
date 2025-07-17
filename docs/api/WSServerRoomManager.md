# WSServerRoomManager API Documentation

The `WSServerRoomManager` class extends [`WSServerPubSub`](./WSServerPubSub.md) to provide room-based functionality for WebSocket communication. It allows clients to create, join, leave, and manage rooms with dedicated messaging and command systems. It's better to read the documentation for [`WSServerPubSub`](./WSServerPubSub.md) first to understand the PubSub and RPC features. You will find a complete example of a room-based WebSocket server in the [examples directory](../examples/index.md). It demonstrates how to create rooms, manage clients, and handle messages with custom hooks.

## Table of Contents

- [Constructor](#constructor)
- [Room Management](#room-management)
  - [createRoom](#createroomroomname-withhook)
  - [deleteRoom](#deleteroomroomname)
  - [getClientsOfRoom](#getclientsofroomroomname)
  - [isRoomFull](#isroomfullroomname)
  - [getRoomMeta](#getroometaroomname)
- [Room Broadcasting](#room-broadcasting)
  - [broadcastRoom](#broadcastroomroom-msg)
  - [broadcastRoomName](#broadcastroomnamereoomname-msg)
  - [broadcastRoomCmd](#broadcastroomcmdroom-cmd-data)
  - [broadcastRoomNameCmd](#broadcastroomnamecmdroomname-cmd-data)
  - [sendRoom](#sendroomroom-client-msg)
  - [sendRoomName](#sendroomnamereoomname-client-msg)
  - [sendRoomCmd](#sendroomcmdroom-client-cmd-data)
  - [sendRoomNameCmd](#sendroomnamecmdroomname-client-cmd-data)
- [Server Control](#server-control)
  - [start](#start)
  - [close](#close)
- [Room Class Hooks](#room-class-hooks)
  - [onCreate](#oncreate)
  - [onJoin](#onjoin)
  - [onMsg](#onmsg)
  - [onLeave](#onleave)
  - [onDispose](#ondispose)
  - [onSendClient](#onsendclient)
  - [onSendRoom](#onsendroom)
  - [onSendRoomsList](#onsendroomslist)
- [Internal Methods](#internal-methods)

## Constructor

### `new WSServerRoomManager(options)`

Creates a new WebSocket room manager server instance.
The server will handle room creation, joining, leaving, and broadcasting messages to clients in rooms.
The server will automatically manage room lifecycle, including cleanup of empty rooms and broadcasting room updates to clients as well as room listing and user management.
You can disable some of these features by setting the corresponding options to `false` in the `options` object.
For the details of the `roomClass` option, see the documentation of the [Room Class Hooks](#room-class-hooks) below.


**Parameters:**
- `options` (object): Server configuration options (inherits from `WSServerPubSub`)
  - `port` (number, optional): The port number to run the server on. Default: `443`
  - `maxNbOfClients` (number, optional): Maximum number of allowed clients. Default: `1000`
  - `maxInputSize` (number, optional): Maximum size of input messages in bytes. Default: `100000` (100KB)
  - `origins` (string, optional): Allowed origins. Default: `'*'`
  - `pingTimeout` (number, optional): The timeout in milliseconds for ping responses. Default: `30000`
  - `authCallback` (function, optional): Authentication callback function. Default: `(token, request, wsServer) => ({})`
  - `logLevel` (string, optional): Log level: 'none', 'error', 'warn', 'info', 'debug'. Default: `'info'`
  - `logger` (object, optional): External logger instance for logging. Default: `null`
  - `maxUsersByRoom` (number, optional): Maximum number of users per room. Default: `10`
  - `usersCanCreateRoom` (boolean, optional): Whether users can create rooms. Default: `true`
  - `usersCanNameRoom` (boolean, optional): Whether users can name rooms. Default: `true`
  - `usersCanListRooms` (boolean, optional): Whether users can list rooms. Default: `true`
  - `usersCanGetRoomUsers` (boolean, optional): Whether users can get room user lists. Default: `true`
  - `roomClass` (class, optional): Custom room class extending `WSServerRoom`. Default: `class extends WSServerRoom {}`
  - `autoJoinCreatedRoom` (boolean, optional): Whether room creators automatically join. Default: `true`
  - `autoDeleteEmptyRoom` (boolean, optional): Whether empty rooms are automatically deleted. Default: `true`
  - `autoSendRoomListOnUsersChange` (boolean, optional): Whether to send room list updates on user changes. Default: `true`
  - `syncMode` (string, optional): Synchronization mode: 'immediate', 'immediate-other', 'patch'. Default: `'immediate'` (or `'patch'` for game rooms)

**Example:**
```javascript
import { WSServerRoomManager, WSServerRoom, WSServerError } from 'wsmini';

const wsServer = new WSServerRoomManager({
  port: 8889,
  origins: '*',
  maxUsersByRoom: 10,
  usersCanCreateRoom: true,
  usersCanNameRoom: true,
  usersCanListRooms: true,
  roomClass: class extends WSServerRoom {
    onMsg(msg, clientMeta, client) {
      return {
        time: Date.now(),
        user: 'User-' + clientMeta.id.slice(0, 4),
        message: msg
      };
    }

    onCreate(name, msg, clientMeta, client) {
      return { createdAt: Date.now() };
    }
  }
});
```

## Room Management

### `createRoom(roomName, withHook)`

Creates a new room on the server.

**Parameters:**
- `roomName` (string, optional): The room name. If `null`, generates a UUID. Default: `null`
- `withHook` (boolean, optional): Whether to call the `onCreate` hook. Default: `false`

**Returns:** `string|false` - The room name if successful, `false` if room already exists or creation failed

**Example:**
```javascript
// Create room with auto-generated name
const roomName = wsServer.createRoom();

// Create room with specific name
const roomName = wsServer.createRoom('game-lobby');

// Create room with onCreate hook
const roomName = wsServer.createRoom('custom-room', true);
```

### `deleteRoom(roomName)`

Deletes a room from the server. All clients in the room will be removed.

**Parameters:**
- `roomName` (string): The room name to delete

**Returns:** `boolean` - `true` if room was deleted successfully, `false` if room doesn't exist

**Example:**
```javascript
// Delete a room
wsServer.deleteRoom('old-room');
```

### `getClientsOfRoom(roomName)`

Gets all clients in a specific room.

**Parameters:**
- `roomName` (string): The room name

**Returns:** `array` - Array of client metadata objects

**Example:**
```javascript
const clients = wsServer.getClientsOfRoom('game-lobby');
console.log(`Room has ${clients.length} clients`);
```

### `isRoomFull(roomName)`

Checks if a room is full (at maximum capacity).

**Parameters:**
- `roomName` (string): The room name

**Returns:** `boolean` - `true` if room is full, `false` otherwise

**Example:**
```javascript
if (wsServer.isRoomFull('game-lobby')) {
  console.log('Room is full');
}
```

### `getRoomMeta(roomName)`

Gets the metadata of a specific room.

**Parameters:**
- `roomName` (string): The room name

**Returns:** `object|false` - Room metadata object or `false` if room doesn't exist

**Example:**
```javascript
const meta = wsServer.getRoomMeta('game-lobby');
if (meta) {
  console.log('Room created at:', meta.createdAt);
}
```

## Room Broadcasting

### `broadcastRoom(room, msg)`

Broadcasts a message to all clients in a room.

**Parameters:**
- `room` (object): The room object
- `msg` (any): The message to broadcast

**Returns:** `boolean` - `true` if successful

**Example:**
```javascript
const room = wsServer.rooms.get('game-lobby');
wsServer.broadcastRoom(room, {
  type: 'announcement',
  message: 'Game starting in 30 seconds'
});
```

### `broadcastRoomName(roomName, msg)`

Broadcasts a message to all clients in a room by room name.

**Parameters:**
- `roomName` (string): The room name
- `msg` (any): The message to broadcast

**Returns:** `boolean` - `true` if successful, `false` if room doesn't exist

**Example:**
```javascript
wsServer.broadcastRoomName('game-lobby', {
  type: 'game-update',
  score: { player1: 10, player2: 8 }
});
```

### `broadcastRoomCmd(room, cmd, data)`

Broadcasts a command to all clients in a room.

**Parameters:**
- `room` (object): The room object
- `cmd` (string): The command name
- `data` (object, optional): The command data. Default: `{}`

**Returns:** `boolean` - `true` if successful

**Example:**
```javascript
const room = wsServer.rooms.get('game-lobby');
wsServer.broadcastRoomCmd(room, 'game-start', {
  mode: 'competitive',
  duration: 300
});
```

### `broadcastRoomNameCmd(roomName, cmd, data)`

Broadcasts a command to all clients in a room by room name.

**Parameters:**
- `roomName` (string): The room name
- `cmd` (string): The command name
- `data` (object, optional): The command data. Default: `{}`

**Returns:** `boolean` - `true` if successful, `false` if room doesn't exist

**Example:**
```javascript
wsServer.broadcastRoomNameCmd('game-lobby', 'timer-update', {
  timeLeft: 120
});
```

### `sendRoom(room, client, msg)`

Sends a message to a specific client in a room.

**Parameters:**
- `room` (object): The room object
- `client` (WebSocket): The client WebSocket connection
- `msg` (any): The message to send

**Returns:** `boolean` - `true` if successful, `false` if client not in room

**Example:**
```javascript
const room = wsServer.rooms.get('game-lobby');
wsServer.sendRoom(room, client, {
  type: 'private-message',
  message: 'You are the game moderator'
});
```

### `sendRoomName(roomName, client, msg)`

Sends a message to a specific client in a room by room name.

**Parameters:**
- `roomName` (string): The room name
- `client` (WebSocket): The client WebSocket connection
- `msg` (any): The message to send

**Returns:** `boolean` - `true` if successful, `false` if room doesn't exist or client not in room

**Example:**
```javascript
wsServer.sendRoomName('game-lobby', client, {
  type: 'role-assignment',
  role: 'spectator'
});
```

### `sendRoomCmd(room, client, cmd, data)`

Sends a command to a specific client in a room.

**Parameters:**
- `room` (object): The room object
- `client` (WebSocket): The client WebSocket connection
- `cmd` (string): The command name
- `data` (object, optional): The command data. Default: `{}`

**Returns:** `boolean` - `true` if successful, `false` if client not in room

**Example:**
```javascript
const room = wsServer.rooms.get('game-lobby');
wsServer.sendRoomCmd(room, client, 'turn-notification', {
  isYourTurn: true
});
```

### `sendRoomNameCmd(roomName, client, cmd, data)`

Sends a command to a specific client in a room by room name.

**Parameters:**
- `roomName` (string): The room name
- `client` (WebSocket): The client WebSocket connection
- `cmd` (string): The command name
- `data` (object, optional): The command data. Default: `{}`

**Returns:** `boolean` - `true` if successful, `false` if room doesn't exist or client not in room

**Example:**
```javascript
wsServer.sendRoomNameCmd('game-lobby', client, 'game-over', {
  winner: 'player1',
  score: { player1: 15, player2: 10 }
});
```

## Server Control

### `start()`

Starts the WebSocket server. Inherited from `WSServerPubSub`.

**Example:**
```javascript
wsServer.start();
console.log('Room manager server started');
```

### `close()`

Closes the WebSocket server and cleans up all rooms.

**Example:**
```javascript
wsServer.close();
```

## Room Class Hooks

When extending `WSServerRoom`, you can override these methods to customize room behavior. For real-time multiplayer games with fixed timestep simulation and world state synchronization, see the [`WSServerGameRoom`](./WSServerGameRoom.md) documentation which provides specialized game room functionality.

### `onCreate(name, msg, clientMeta, client)`

Called when a room is created. Returns room metadata or false to abort creation.
If the user does provided a name, it will be used as the room name.
If you return a `name` prop in the metadata, it will be used as the room name instead.
If no name is provided, a UUID will be generated as the room name.
You can throw a `WSServerError` to abort creation with an error message. The promise will reject with the error message on the client side.

**Parameters:**
- `name` (string): The room name
- `msg` (any): Additional data sent by the client
- `clientMeta` (object): Client metadata (null if created by server)
- `client` (WebSocket): Client connection (null if created by server)

**Returns:** `object|false` - Room metadata object or `false` to abort creation

**Example:**
```javascript
class CustomRoom extends WSServerRoom {
  onCreate(name, msg, clientMeta, client) {
    if (name === 'forbidden') {
      throw new WSServerError('Room name not allowed');
    }
    // do not forget to validate the input received from the client
    if (msg?.gameMode && !['normal', 'hardcore'].includes(msg.gameMode)) {
      throw new WSServerError('Invalid game mode');
    }
    return {
      createdAt: Date.now(),
      gameMode: msg.gameMode,
    };
  }
}
```

### `onJoin(msg, clientMeta, client)`

Called when a client joins the room.

**Parameters:**
- `msg` (any): Additional data sent by the client
- `clientMeta` (object): Client metadata
- `client` (WebSocket): Client connection

**Returns:** `object|false` - Additional client metadata or `false` to abort join

**Example:**
```javascript
class CustomRoom extends WSServerRoom {
  onJoin(msg, clientMeta, client) {
    if (msg?.team !== 'red' && msg?.team !== 'blue') {
      throw new WSServerError('Invalid team selection');
    }

    return {
      team: msg.team,
      joinedAt: Date.now()
    };
  }
}
```

### `onMsg(msg, clientMeta, client)`

Called when a client sends a message to the room.

**Parameters:**
- `msg` (any): The message from the client
- `clientMeta` (object): Client metadata
- `client` (WebSocket): Client connection

**Returns:** `any` - The message to broadcast to all room clients

**Example:**
```javascript
class CustomRoom extends WSServerRoom {
  onMsg(msg, clientMeta, client) {
    // Validate and transform message
    if (!msg.text || msg.text.length > 500) {
      throw new WSServerError('Invalid message');
    }

    return {
      time: Date.now(),
      user: clientMeta.nickname,
      team: clientMeta.team,
      text: msg.text
    };
  }
}
```

### `onLeave(clientMeta, client)`

Called when a client leaves the room.

**Parameters:**
- `clientMeta` (object): Client metadata
- `client` (WebSocket): Client connection

**Example:**
```javascript
class CustomRoom extends WSServerRoom {
  onLeave(clientMeta, client) {
    // Broadcast to other clients
    this.broadcastCmd('player-left', {
      playerId: clientMeta.id,
      nickname: clientMeta.nickname
    });
  }
}
```

### `onDispose()`

Called when the room is being deleted.

**Example:**
```javascript
class CustomRoom extends WSServerRoom {
  onDispose() {
    // Clean up timers, save game state, etc.
    if (this.gameTimer) {
      clearInterval(this.gameTimer);
    }
  }
}
```

### `onSendClient(clientMeta)`

Called when sending client metadata to clients.
You can use this to filter or transform the client metadata before the server sends it to other clients.

**Parameters:**
- `clientMeta` (object): The client metadata

**Returns:** `object` - The filtered client metadata to send

**Example:**
```javascript
class CustomRoom extends WSServerRoom {
  onSendClient(clientMeta) {
    // Hide sensitive information
    return {
      id: clientMeta.id,
      nickname: clientMeta.nickname,
      team: clientMeta.team,
      isReady: clientMeta.isReady
    };
  }
}
```

### `onSendRoom()`

Called when sending room metadata to clients.
You can use this to filter or transform the room metadata before the server sends it to clients.

**Returns:** `object` - The room metadata to send

**Example:**
```javascript
class CustomRoom extends WSServerRoom {
  onSendRoom() {
    return {
      name: this.name,
      gameMode: this.meta.gameMode,
      maxScore: this.meta.maxScore,
      status: this.meta.status || 'waiting'
    };
  }
}
```

### `onSendRoomsList(rooms)` (static)

Called when sending the room list to clients.
You can use this to filter or transform the room list before the server sends it to clients.
For example, you can hide full rooms, private rooms or running games.

**Parameters:**
- `rooms` (array): Array of room objects

**Returns:** `array` - The filtered room list to send

**Example:**
```javascript
class CustomRoom extends WSServerRoom {
  static onSendRoomsList(rooms) {
    // Hide full rooms or private rooms
    return rooms.filter(room =>
      room.nbUsers < room.maxUsers &&
      !room.meta.isPrivate
    );
  }
}
```
## Internal Methods

The following methods are used internally by the server and typically don't need to be called directly:

### Client RPC Handlers
- `clientCreateRoom(data, clientMeta, client)` - Handles room creation requests
- `clientJoinRoom(data, clientMeta, client)` - Handles room join requests
- `clientCreateOrJoinRoom(data, clientMeta, client)` - Handles create-or-join requests
- `clientLeaveRoom(data, clientMeta, client)` - Handles room leave requests
- `clientListRooms(data, clientMeta, client)` - Handles room list requests

### Room Management
- `addClientToRoom(roomName, clientMeta, client)` - Adds a client to a room
- `removeClientFromRoom(roomName, client)` - Removes a client from a room
- `prepareRoomList()` - Prepares room list for client consumption
- `prepareRoomClients(room)` - Prepares client list for a room
- `pubRoomList()` - Publishes room list updates
- `pubRoomClients(room)` - Publishes client list updates for a room

### Message Processing
- `manageRoomActions(client, data)` - Handles room-specific actions
- `onMessage(client, message)` - Processes incoming messages
- `onClose(client)` - Handles client disconnections
- `isActionValid(action)` - Validates action types
