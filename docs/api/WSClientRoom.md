# WSClientRoom API Documentation

The `WSClientRoom` class extends [`WSClient`](./WSClient.md) to provide room-based functionality for WebSocket communication. It allows clients to create, join, and manage rooms with dedicated messaging and command systems.

## Table of Contents

- [Constructor](#constructor)
- [Room Management](#room-management)
  - [roomCreateOrJoin](#roomcreateorjoinname-data-timeout)
  - [roomCreate](#roomcreatename-data-timeout)
  - [roomJoin](#roomjoinname-data-timeout)
  - [roomLeave](#roomleavename-timeout)
  - [roomOnRooms](#roomonroomscallback)
- [Room Object](#room-object)
  - [Room Properties](#room-properties)
  - [Room Methods](#room-methods)
    - [send](#senddata)
    - [sendCmd](#endcmdcmd-data)
    - [leave](#leave)
    - [onMessage](#onmessagecallback)
    - [onCmd](#oncmdcmd-callback)
    - [onClients](#onclientscallback)
- [Other Methods of WSClientRoom](#other-methods-of-wsclientroom)
  - [roomOnClients](#roomonclientsname-callback)
  - [roomSend](#roomsendname-data)
  - [roomSendCmd](#roomsendcmdname-cmd-data)
  - [roomOnMessage](#roomonmessagename-callback)
  - [roomOnCmd](#roomoncmdname-cmd-callback)

## Constructor

### `new WSClientRoom(url, defaultTimeout)`

Creates a new WebSocket room client instance. Inherits all functionality from `WSClient`.

**Parameters:**
- `url` (string, optional): The WebSocket server URL. If `null`, automatically determined from current domain and scheme.
- `defaultTimeout` (number, optional): Default timeout in milliseconds for operations. Default: `5000`.

**Example:**
```javascript
import { WSClientRoom } from 'wsmini';

const wsClient = new WSClientRoom('ws://localhost:8889');
await wsClient.connect();
```

## Room Management

### `roomCreateOrJoin(name, data, timeout)`

Creates a new room or joins an existing room with the specified name.

**Parameters:**
- `name` (string, optional): The room name. If `null`, server generates a name.
- `data` (object, optional): Additional data to send with the request. Default: `{}`.
- `timeout` (number, optional): Timeout in milliseconds. Default: `defaultTimeout`.

**Returns:** `Promise<Room>` - Resolves with a Room object when successful.

**Example:**
```javascript
// Create or join a room with auto-generated name
const room = await wsClient.roomCreateOrJoin();

// Create or join a specific room
const room = await wsClient.roomCreateOrJoin('game-lobby');

// With additional data
const room = await wsClient.roomCreateOrJoin('chat-room', {
  userInfo: { nickname: 'Player1' }
});
```

### `roomCreate(name, data, timeout)`

Creates a new room with the specified name. Fails if room already exists.

**Parameters:**
- `name` (string, optional): The room name. If `null`, server generates a name.
- `data` (object, optional): Additional data to send with the request. Default: `{}`.
- `timeout` (number, optional): Timeout in milliseconds. Default: `defaultTimeout`.

**Returns:** `Promise<Room>` - Resolves with a Room object when successful.

**Example:**
```javascript
// Create a room with auto-generated name
const room = await wsClient.roomCreate();

// Create a specific room
const room = await wsClient.roomCreate('my-private-room');

// Handle room creation errors
try {
  const room = await wsClient.roomCreate('existing-room');
} catch (error) {
  console.error('Room creation failed:', error.message);
}
```

### `roomJoin(name, data, timeout)`

Joins an existing room. Fails if room doesn't exist.

**Parameters:**
- `name` (string): The room name to join.
- `data` (object, optional): Additional data to send with the request. Default: `{}`.
- `timeout` (number, optional): Timeout in milliseconds. Default: `defaultTimeout`.

**Returns:** `Promise<Room>` - Resolves with a Room object when successful.

**Example:**
```javascript
// Join an existing room
const room = await wsClient.roomJoin('game-lobby');

// Join with user data
const room = await wsClient.roomJoin('chat-room', {
  userInfo: { nickname: 'Player2', avatar: 'avatar1.png' }
});
```

### `roomLeave(name, timeout)`

Leaves a room and cleans up associated event listeners.

**Parameters:**
- `name` (string): The room name to leave.
- `timeout` (number, optional): Timeout in milliseconds. Default: `defaultTimeout`.

**Returns:** `Promise` - Resolves when successfully left the room.

**Example:**
```javascript
// Leave a specific room without waiting for confirmation
wsClient.roomLeave('game-lobby');
// Leave a room
await wsClient.roomLeave('game-lobby');
```

### `roomOnRooms(callback)`

Registers a callback for room list updates and gets the current room list.

**Parameters:**
- `callback` (function): Function called with the room list.

**Returns:** `Promise` - Resolves with subscription confirmation.

**Example:**
```javascript
// Get room list and listen for updates
wsClient.roomOnRooms((rooms) => {
  console.log('Available rooms:', rooms);
  updateRoomListUI(rooms);
});
```

## Room Object

When you successfully join or create a room, you receive a `Room` object that provides convenient methods for room interaction.

### Room Properties

- `name` (string): The room name
- `meta` (object): Room metadata from the server
- `clients` (array): List of clients in the room (contains client IDs and metadata send by the server)
- `wsClient` (WSClientRoom): Reference to the parent WSClientRoom instance

### Room Methods

#### `send(data)`

Sends a message to the room.

**Parameters:**
- `data` (object): The message data to send.

**Example:**
```javascript
const room = await wsClient.roomJoin('chat-room');
room.send({ message: 'Hello chat room!' });
```

#### `sendCmd(cmd, data)`

Sends a command to the room (fire and forget). The command is processed by the server and can trigger specific actions.
It will fail if the command is not recognized by the server.

**Parameters:**
- `cmd` (string): The command name.
- `data` (object, optional): The command data. Default: `{}`.

**Example:**
```javascript
const room = await wsClient.roomJoin('game-room');
room.sendCmd('ready', { checkboardSide: 'white' });
```

#### `leave()`

Leaves the room. This will clean up all associated event listeners and remove the client from the room.

**Example:**
```javascript
const room = await wsClient.roomJoin('temporary-room');
// Later...
room.leave();
```

#### `onMessage(callback)`

Registers a callback for room messages.

**Parameters:**
- `callback` (function): Function called when messages are received.

**Returns:** `function` - A function for potential removal of the listener.

**Example:**
```javascript
const room = await wsClient.roomJoin('chat-room');
const removeListener = room.onMessage((message) => {
  console.log('Message in room:', message);
});
// Later, to remove this specific listener if needed (leaving the room will also remove all listeners)
removeListener();
```

#### `onCmd(cmd, callback)`

Registers a callback for specific room commands.

**Parameters:**
- `cmd` (string): The command name to listen for.
- `callback` (function): Function called when the command is received.

**Returns:** `function` - A function for potential removal of the listener.

**Example:**
```javascript
const room = await wsClient.roomJoin('game-room');
room.onCmd('game-over', (data) => console.log('Game over:', data));
```

#### `onClients(callback)`

Registers a callback for client list updates and immediately calls it with current clients.

**Parameters:**
- `callback` (function): Function called with the client list.

**Returns:** `function` - A function for potential removal of the listener.

**Example:**
```javascript
const room = await wsClient.roomJoin('game-room');
room.onClients((clients) => {
  console.log('Room has', clients.length, 'clients');
});
```

### Other Methods of `WSClientRoom`

If you dont want to use the room object, you can also use the following methods directly on the `WSClientRoom` instance.
But you will need to provide the room name explicitly.

### `roomOnClients(name, callback)`

Registers a callback for client list updates in a room.

**Parameters:**
- `name` (string): The room name.
- `callback` (function): Function called with the client list.

**Returns:** `function` -  A function for potential removal of the listener.

**Example:**
```javascript
// Listen for client list changes
wsClient.roomOnClients('game-room', (clients) => {
  console.log('Room clients:', clients);
  updatePlayerListUI(clients);
});
```

### `roomSend(name, data)`

Sends a message to all clients in a room (fire-and-forget).

**Parameters:**
- `name` (string): The room name.
- `data` (object, optional): The message data to send. Default: `{}`.

**Example:**
```javascript
// Send a simple message
wsClient.roomSend('chat-room', { message: 'Hello everyone!' });

// Send structured data
wsClient.roomSend('game-room', {
  type: 'player-move',
  position: { x: 100, y: 200 },
  timestamp: Date.now()
});
```

### `roomSendCmd(name, cmd, data)`

Sends a command to the room (fire and forget). The command is processed by the server and can trigger specific actions.
It will fail if the command is not recognized by the server.

**Parameters:**
- `name` (string): The room name.
- `cmd` (string): The command name.
- `data` (object, optional): The command data to send. Default: `{}`.

**Example:**
```javascript
// Send a command to start a game
wsClient.roomSendCmd('game-room', 'start-game', {
  gameMode: 'competitive'
});
```

### `roomOnMessage(name, callback)`

Registers a callback for room messages.

**Parameters:**
- `name` (string): The room name.
- `callback` (function): Function called when messages are received.

**Returns:** `function` - A function for potential removal of the listener.

**Example:**
```javascript
// Listen for room messages
wsClient.roomOnMessage('chat-room', (message) => {
  console.log('Room message:', message);
});

// Remove message listener
const removeListener = wsClient.roomOnMessage('game-room', handleGameMessage);
// Later...
removeListener();
```

### `roomOnCmd(name, cmd, callback)`

Registers a callback for specific room commands sent by the server.

**Parameters:**
- `name` (string): The room name.
- `cmd` (string): The command name to listen for.
- `callback` (function): Function called when the command is received.

**Returns:** `function` - A function for potential removal of the listener.

**Example:**
```javascript
// Listen for game start commands
wsClient.roomOnCmd('game-room', 'start-game', (data) => {
  console.log('Game starting with mode:', data.gameMode);
});

// Listen for player actions
wsClient.roomOnCmd('game-room', 'player-action', (data) => {
  handlePlayerAction(data.action, data.playerId);
});
```
