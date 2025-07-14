# WSClient API Documentation

The `WSClient` class provides a WebSocket client for real-time communication with WsMini servers. It supports RPC calls, PubSub messaging, and server commands. Look at [WSClientRoom](./WSClientRoom.md) for room-based management features.


## Table of Contents

## Table of Contents

- [Constructor](#constructor)
- [Connection Management](#connection-management)
  - [connect](#connecttoken)
  - [close](#close)
- [Remote Procedure Calls (RPC)](#remote-procedure-calls-rpc)
  - [rpc](#rpcname-data-timeout)
- [Publish/Subscribe (PubSub)](#publishsubscribe-pubsub)
  - [pub](#pubchan-msg-timeout)
  - [pubSimple](#pubsimplechan-msg)
  - [sub](#subchan-callback-timeout)
  - [unsub](#unsubchan-callback-timeout)
- [Server Commands](#server-commands)
  - [onCmd](#oncmdcmd-callback)
- [Close Event](#close-event)

## Constructor

### `new WSClient(url, defaultTimeout)`

Creates a new WebSocket client instance.

**Parameters:**
- `url` (string, optional): The WebSocket server URL. If `null`, automatically determined from current domain and scheme.
- `defaultTimeout` (number, optional): Default timeout in milliseconds for operations. Default: `5000`.

**Example:**
```javascript
import { WSClient } from 'wsmini';

// Connect to specific server
const wsClient = new WSClient('ws://localhost:8888');

// Auto-detect URL from current page
const wsClient = new WSClient();

// With custom timeout
const wsClient = new WSClient('ws://localhost:8888', 10000);
```

## Connection Management

### `connect(token)`

Establishes connection to the WebSocket server.

**Parameters:**
- `token` (string, optional): Authentication token for server authentication.

**Returns:** `Promise` - Resolves when connection is established, rejects on error.

**Example:**
```javascript
// Connect without authentication
await wsClient.connect();

// Connect with authentication token
await wsClient.connect('my-auth-token');

// Handle connection errors
await wsClient.connect().catch(err => {
  console.error('Connection failed:', err.message);
});
```

### `close()`

Closes the WebSocket connection and cleans up resources.

**Example:**
```javascript
wsClient.close();
```

## Remote Procedure Calls (RPC)

### `rpc(name, data, timeout)`

Calls a remote procedure on the server.

**Parameters:**
- `name` (string): The name of the remote procedure.
- `data` (object, optional): Data to send to the remote procedure. Default: `{}`.
- `timeout` (number, optional): Timeout in milliseconds. Default: `defaultTimeout`.

**Returns:** `Promise` - Resolves with server response, rejects on error or timeout.

**Example:**
```javascript
// Simple RPC call
const result = await wsClient.rpc('add', {n1: 5, n2: 3});
console.log('Result:', result); // Result: 8

// RPC with custom timeout
const user = await wsClient.rpc('get-user', {id: 123}, 10000);

// Handle RPC errors
const result = await wsClient.rpc('divide', {a: 10, b: 0}).catch(error => {
  console.error('RPC failed:', error.message);
});

```

## Publish/Subscribe (PubSub)

### `pub(chan, msg, timeout)`

Publishes a message to a channel with confirmation.
You can await the confirmation to ensure the message was received by the server or simply publish without waiting the promise to resolve.

**Parameters:**
- `chan` (string): The channel name.
- `msg` (object): The message to publish.
- `timeout` (number, optional): Timeout in milliseconds. Default: `defaultTimeout`.

**Returns:** `Promise` - Resolves with server confirmation, rejects on error.

**Example:**
```javascript
wsClient.pub('chat', {message: 'Hello, World!'});

// Publish with custom timeout, await confirmation and handle errors
await wsClient.pub('notifications', {type: 'alert', text: 'Important!'}, 3000).catch(error => {
  console.error('Publish failed:', error.message);
});
```

### `pubSimple(chan, msg)`

Publishes a message without waiting for confirmation (fire-and-forget).

**Parameters:**
- `chan` (string): The channel name.
- `msg` (object): The message to publish.

**Example:**
```javascript
// Fast publishing without confirmation (the server will not respond and no promise will be returned)
wsClient.pubSimple('chat', {message: 'Quick message'});
```

### `sub(chan, callback, timeout)`

Subscribes to a channel to receive messages.
You can subscribe multiple times to the same channel with different callbacks.

**Parameters:**
- `chan` (string): The channel name.
- `callback` (function): Function called when messages are received.
- `timeout` (number, optional): Timeout in milliseconds. Default: `defaultTimeout`.

**Returns:** `Promise` - Resolves when subscription is established.

**Example:**
```javascript
// Subscribe to chat messages without error handling
wsClient.sub('chat', (message) => console.log(message));

// Subscribe to chat messages with error handling and await confirmation
await wsClient.sub('chat', (message) => {
  console.log('New message:', message);
}).catch(error => {
  console.error('Subscription failed:', error.message);
});

// Multiple Subscribe
wsClient.sub('notifications', handleNotification);
wsClient.sub('notifications', anotherHandleNotification);
```

### `unsub(chan, callback, timeout)`

Unsubscribes from a channel.

**Parameters:**
- `chan` (string): The channel name.
- `callback` (function, optional): Specific callback to remove. If `null`, removes all callbacks.
- `timeout` (number, optional): Timeout in milliseconds. Default: `defaultTimeout`.

**Returns:** `Promise` - Resolves when unsubscription is complete.

**Example:**
```javascript
// Unsubscribe from all callbacks
await wsClient.unsub('chat');

// Unsubscribe specific callback
await wsClient.unsub('chat', specificCallback);
```

## Server Commands

### `onCmd(cmd, callback)`

Registers a callback for server-sent commands.

**Parameters:**
- `cmd` (string): The command name to listen for.
- `callback` (function): Function called when the command is received.

**Returns:** `function` - Event listener function for potential removal.

**Example:**
```javascript
// Listen for server notifications
wsClient.onCmd('notification', (data) => {
  console.log('Server notification:', data);
});

// Listen for server updates
wsClient.onCmd('update', (data) => {
  updateUI(data);
});

// Remove command listener
const removeCmdTestListener = wsClient.onCmd('test', handler);
// Later...
removeCmdTestListener();
```

## Close Event

The `close` event is fired when the WebSocket connection is closed, either by the client, server, or due to network issues.

**Example:**
```javascript
// Listen for connection close
wsClient.on('close', () => {
  console.log('Connection closed');
});

// Implement reconnection logic on close
wsClient.on('close', () => {
  console.log('Connection lost. Attempting to reconnect...');
  setTimeout(() => reconnect(), 2000);
});
```