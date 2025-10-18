# WSServer API Documentation

**⚠️ Important:** `WSServer` is a base class that should **not be used directly**. Instead, use one of its specialized implementations:
- [WSServerPubSub](./WSServerPubSub.md) - For Publish-Subscribe and RPC functionality
- [WSServerRoomManager](./WSServerRoomManager.md) - For room-based communication and game state management

This documentation is provided for reference to understand the underlying functionality inherited by the specialized server classes.

## Overview

The `WSServer` class provides the foundational WebSocket server functionality including:
- Client connection management with authentication
- Origin validation and client limits
- Automatic ping/pong keepalive mechanism
- Broadcasting capabilities
- Configurable logging system
- Message size validation

## Table of Contents

- [Constructor](#constructor)
- [Server Control](#server-control)
  - [start](#start)
  - [close](#close)
- [Client Management](#client-management)
  - [getClientSocket](#getclientsocketid)
  - [geClientsData](#geclientsdata)
- [Message Handling](#message-handling)
  - [send](#sendclient-message)
  - [broadcast](#broadcastmessage)
  - [broadcastOthers](#broadcastothersclient-message)
- [Authentication](#authentication)
  - [sendAuthSuccess](#sendauthsuccessclient)
  - [sendAuthFailed](#sendauthfailedclient)
- [Logging](#logging)
  - [log](#logmessage-level)
- [Internal Methods](#internal-methods)

## Constructor

### `new WSServer(options)`

Creates a new WebSocket server instance.

**Parameters:**
- `options` (object): Server configuration options
  - `port` (number, optional): The port number to run the server on. Default: `443`
  - `maxNbOfClients` (number, optional): Maximum number of allowed clients. Default: `1000`
  - `maxInputSize` (number, optional): Maximum size of input messages in bytes. Default: `100000` (100KB)
  - `origins` (string, optional): Allowed origins for CORS. Use `'*'` for any origin or specify allowed origins. Default: `'*'`
  - `pingTimeout` (number, optional): The timeout in milliseconds for ping/pong keepalive mechanism. Default: `30000`
  - `authCallback` (function, optional): Authentication callback function. Default: `(token, request, wsServer) => ({})`
    - Parameters: `(token, request, wsServer)`
      - `token` (string|null): Authentication token sent by client via subprotocol
      - `request` (http.IncomingMessage): The HTTP upgrade request
      - `wsServer` (WSServer): The server instance
    - Returns: Object with custom metadata to store for the client, or `false` to reject the connection
  - `logLevel` (string, optional): Log level: `'none'`, `'error'`, `'warn'`, `'info'`, `'debug'`. Default: `'info'`
  - `logger` (object, optional): External logger instance with methods: `error`, `warn`, `info`, `debug`. Default: `null`

## Server Control

### `start(options)`

Starts the WebSocket server and begins accepting client connections.

**Parameters:**
- `options` (object, optional): Additional options to pass to the underlying WebSocket server. These options are passed to the `ws` library's `WebSocketServer` constructor. See the [ws documentation](https://github.com/websockets/ws/blob/master/doc/ws.md#new-websocketserveroptions-callback) for available options.

**Note:** The `port`, `origins`, and `maxNbOfClients` properties set in the `WSServer` constructor will override any corresponding values in the `options` parameter.

**Common WebSocket Server Options:**
- `server` (http.Server|https.Server): A pre-created Node.js HTTP/S server
- `backlog` (number): Maximum length of the queue of pending connections
- `perMessageDeflate` (boolean|object): Enable/disable permessage-deflate compression


For a complete list of options, refer to the [ws library documentation](https://github.com/websockets/ws/blob/master/doc/ws.md#new-websocketserveroptions-callback).

**Example:**
```javascript
// Basic start
wsServer.start();

// Use with an existing HTTP server
import http from 'http';
const httpServer = http.createServer();
httpServer.listen(8080);

wsServer.start({
  server: httpServer,
  path: '/ws' // Optional: specify WebSocket path
});
```

For a complete example with HTTP server serving client files, see the [RPC with HTTP server example](../examples/server/rpc-http.mjs).

### `close()`

Closes the WebSocket server, disconnects all clients, and stops the ping interval.

**Example:**
```javascript
wsServer.close();
// All clients disconnected, server stopped
```

## Client Management

### `getClientSocket(id)`

Gets the WebSocket client connection by client ID.

**Parameters:**
- `id` (string): The client ID (UUID)

**Returns:** `WebSocket|null` - The WebSocket client object if found, `null` otherwise

**Example:**
```javascript
const clientId = 'some-uuid-here';
const clientSocket = wsServer.getClientSocket(clientId);

if (clientSocket) {
  wsServer.send(clientSocket, 'Hello specific client!');
}
```

### `geClientsData()`

Gets an array of all connected clients' metadata.

**Returns:** `Array` - Array of client metadata objects

**Example:**
```javascript
const allClients = wsServer.geClientsData();
console.log(`${allClients.length} clients connected`);

for (const client of allClients) {
  console.log(`Client ${client.id}: ${client.username}`);
}
```

## Message Handling

### `send(client, message)`

Sends a message to a specific client. Only sends if the client connection is open.

**Parameters:**
- `client` (WebSocket): The client WebSocket connection
- `message` (string): The message to send

**Example:**
```javascript
// Find client by ID
const client = wsServer.getClientSocket(clientId);
if (client) {
  wsServer.send(client, JSON.stringify({
    type: 'notification',
    text: 'Hello!'
  }));
}
```

### `broadcast(message)`

Broadcasts a message to all connected clients.

**Parameters:**
- `message` (string): The message to broadcast

**Example:**
```javascript
wsServer.broadcast(JSON.stringify({
  type: 'announcement',
  text: 'Server maintenance in 5 minutes'
}));
```

### `broadcastOthers(client, message)`

Broadcasts a message to all clients except the specified one.

**Parameters:**
- `client` (WebSocket): The client to exclude from the broadcast
- `message` (string): The message to broadcast

**Example:**
```javascript
// When a user joins, notify all other users
wsServer.broadcastOthers(client, JSON.stringify({
  type: 'user-joined',
  userId: wsServer.clients.get(client).id
}));
```

## Authentication

### `sendAuthSuccess(client)`

Sends an authentication success message to the client. Called automatically after successful authentication.

**Parameters:**
- `client` (WebSocket): The client WebSocket connection

**Message format:**
```json
{
  "action": "auth-success",
  "id": "client-uuid"
}
```

### `sendAuthFailed(client)`

Sends an authentication failure message to the client. Called automatically when authentication fails.

**Parameters:**
- `client` (WebSocket): The client WebSocket connection

**Message format:**
```json
{
  "action": "auth-failed"
}
```

## Logging

### `log(message, level)`

Logs a message with the specified level. Messages are only logged if they match or exceed the configured log level.

**Parameters:**
- `message` (string): The message to log
- `level` (string, optional): The log level: `'error'`, `'warn'`, `'info'`, `'debug'`. Default: `'info'`

**Log Format:**
- With external logger: `[WSS] ${message}`
- Without external logger: `[WSS][${timestamp}][${LEVEL}] ${message}`

**Example:**
```javascript
wsServer.log('Server started successfully', 'info');
wsServer.log('Configuration loaded', 'debug');
wsServer.log('Connection attempt failed', 'warn');
wsServer.log('Critical error occurred', 'error');
```

## Internal Methods

The following methods are used internally by the server and typically don't need to be called directly:

### `pingManagement()`
Manages the ping/pong keepalive mechanism. Automatically called at intervals defined by `pingTimeout`. Terminates clients that don't respond to pings.

### `createClientMetadata(client, customMetadata)`
Creates metadata for a new client connection, combining a generated UUID with custom metadata from `authCallback`.

**Parameters:**
- `client` (WebSocket): The client WebSocket connection
- `customMetadata` (object): Custom metadata returned by `authCallback`

### `onConnection(client, request)`
Handles new client connections, including:
- Extracting authentication token from subprotocol
- Calling `authCallback` for authentication
- Creating client metadata
- Setting up event listeners (message, close, error, pong)

### `onMessage(client, message)`
Handles incoming messages from clients. Default implementation broadcasts received messages to all clients. Override this method in subclasses for custom message handling.

### `onClose(client)`
Handles client disconnection and cleanup. Removes client from the clients Map.

### `onError(client, error)`
Handles client errors and closes the connection.

### `onPong(client)`
Handles pong responses from clients, marking them as alive for the keepalive mechanism.

## Properties

### `clients`
**Type:** `Map<WebSocket, Object>`

A Map containing all connected clients and their metadata. Each entry maps a WebSocket client to an object containing:
- `id` (string): Auto-generated UUID for the client
- Additional custom properties from `authCallback`

**Example:**
```javascript
for (const [socket, metadata] of wsServer.clients.entries()) {
  console.log(`Client ${metadata.id}:`, metadata);
}
```

### `server`
**Type:** `WebSocketServerOrigin|null`

The underlying WebSocket server instance. `null` when not started.

## Notes

- The default `onMessage` implementation simply broadcasts all messages to all clients
- Message size is validated against `maxInputSize` - oversized messages cause client disconnection
- The ping/pong mechanism automatically removes unresponsive clients
- Client IDs are auto-generated UUIDs - use `authCallback` to add custom identification
- Origin validation is handled by the underlying `WebSocketServerOrigin` class

## See Also

- [WSServerPubSub](./WSServerPubSub.md) - Recommended for PubSub/RPC applications
- [WSServerRoomManager](./WSServerRoomManager.md) - Recommended for room-based applications
