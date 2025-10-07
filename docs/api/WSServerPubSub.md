# WSServerPubSub API Documentation

The `WSServerPubSub` class extends `WSServer` to provide Publish-Subscribe (PubSub) functionality and Remote Procedure Call (RPC) capabilities for WebSocket communication. It allows clients to subscribe to channels, publish messages, and call server-side functions. Look at [WSServerRoomManager](./WSServerRoomManager.md) for room-based management features.

**Note:** The PubSub implementation sends messages directly to connected clients and does not use any message queuing system.

## Table of Contents

- [Constructor](#constructor)
- [Channel Management](#channel-management)
  - [addChannel](#addchannel-name-options)
  - [hasChannel](#haschannelchanname)
  - [getChannel](#getchannelchanname)
  - [getChannelClients](#getchannelclientschanname)
  - [getChannelClientsData](#getchannelclientsdatachanname)
  - [removeChannel](#removechannelchanname)
  - [pub](#pubchanname-msg)
- [RPC Management](#rpc-management)
  - [addRpc](#addrpcname-callback)
  - [removeRpc](#removerpcname)
- [Command Broadcasting](#command-broadcasting)
  - [sendCmd](#sendcmdclient-cmd-data)
  - [broadcastCmd](#broadcastcmdcmd-data)
  - [broadcastOthersCmd](#broadcastotherscmdclient-cmd-data)
- [Server Control](#server-control)
  - [start](#start)
  - [stop](#stop)
  - [close](#close)
- [Internal Methods](#internal-methods)

## Constructor

### `new WSServerPubSub(options)`

Creates a new WebSocket PubSub server instance.

**Parameters:**
- `options` (object): Server configuration options (inherits from `WSServer`)
  - `port` (number, optional): The port number to run the server on. Default: `443`
  - `maxNbOfClients` (number, optional): Maximum number of allowed clients. Default: `1000`
  - `maxInputSize` (number, optional): Maximum size of input messages in bytes. Default: `100000` (100KB)
  - `origins` (string, optional): Allowed origins. Default: `'*'`
  - `pingTimeout` (number, optional): The timeout in milliseconds for ping responses. Default: `30000`
  - `authCallback` (function, optional): Authentication callback function `(token, request, wsServer) => {}`. Default: `(token, request, wsServer) => ({})`
  - `logLevel` (string, optional): Log level: 'none', 'error', 'warn', 'info', 'debug'. Default: `'info'`
  - `logger` (object, optional): External logger instance for logging. Default: `null`

**authCallback**: This function is called when a client connects. It must return an object with user metadata if authentication is successful, or `false` if authentication fails. The metadata will be added to the client object and can be used in RPCs and PubSub hooks. An `id` metadata will be automatically generated for the client if not provided.

**Example:**
```javascript
import { WSServerPubSub, WSServerError } from 'wsmini';

const wsServer = new WSServerPubSub({
  port: 8887,
  origins: '*',
  maxNbOfClients: 500,
  maxInputSize: 50000,
  pingTimeout: 30000,
  logLevel: 'info',
  authCallback: (token, request, wsServer) => {
    // Return user metadata or false if authentication fails
    // Token validation is not implemented here, just an example
    if (token !== 'valid-token') return false;
    return { nickname: 'user123', role: 'admin' };
  }
});
```

## Channel Management

### `addChannel(name, options)`

Adds a new channel to the server. Channels allow clients to subscribe and publish messages.

**Parameters:**
- `name` (string): The channel name
- `options` (object, optional): Channel configuration options
  - `usersCanPub` (boolean, optional): Whether users can publish to this channel. Default: `true`
  - `usersCanSub` (boolean, optional): Whether users can subscribe to this channel. Default: `true`
  - `hookPub` (function, optional): Hook called before publishing a message. Should return the transformed message or throw `WSServerError` to reject the publication (this will cause the client's promise to be rejected). Default: `(msg, client, wsServer) => msg`
  - `hookPubPost` (function, optional): Hook called after a successful publication. Errors thrown in this hook are logged but do not affect the publication. Default: `(msg, client, wsServer) => null`
  - `hookSub` (function, optional): Hook called before subscribing a client. MUST return `true` to accept the subscription or `false` to reject it. Default: `(client, wsServer) => true`
  - `hookSubPost` (function, optional): Hook called after a successful subscription. Errors thrown in this hook are logged but do not affect the subscription. Default: `(client, wsServer) => null`
  - `hookUnsub` (function, optional): Hook called before unsubscribing a client. Default: `(client, wsServer) => null`

**Returns:** `boolean` - `true` if channel was added successfully, `false` if channel already exists

**Example:**
```javascript
// Basic channel
wsServer.addChannel('chat');

// Advanced channel with hooks
wsServer.addChannel('admin-chat', {
  usersCanPub: true,
  usersCanSub: true,
  hookPub: (msg, client, wsServer) => {
    // Validate message content
    if (!msg.content || msg.content.trim().length === 0) {
      throw new WSServerError('Message content cannot be empty');
    }

    // Check user permissions
    if (msg.type === 'admin' && !client.isAdmin) {
      throw new WSServerError('Insufficient permissions for admin message');
    }

    // Transform message before broadcasting
    return {
      ...msg,
      from: client.userId,
      timestamp: Date.now()
    };
  },
  hookPubPost: (msg, client, wsServer) => {
    // Called after successful publication
    console.log(`User ${client.id} published to admin chat`);
    
    // Log for analytics
    analytics.track('message_sent', {
      userId: client.id,
      channel: 'admin-chat',
      messageId: msg.id
    });
  },
  hookSub: (client, wsServer) => {
    // MUST return true to accept subscription, false to reject
    return client.isAdmin; // Accept subscription for admin users
  },
  hookSubPost: (client, wsServer) => {
    // Called after successful subscription
    console.log(`User ${client.id} joined admin chat`);
    
    // Send welcome message
    wsServer.sendCmd(client.ws, 'welcome', { 
      channel: 'admin-chat',
      message: 'Welcome to admin chat!' 
    });
    
    // Notify other users
    wsServer.broadcastOthersCmd(client.ws, 'user-joined', {
      userId: client.id,
      channel: 'admin-chat'
    });
  },
  hookUnsub: (client, wsServer) => {
    console.log(`User ${client.userId} unsubscribed from admin chat`);
  }
});
```

### `hasChannel(chanName)`

Checks if a channel exists.

**Parameters:**
- `chanName` (string): The channel name to check

**Returns:** `boolean` - `true` if channel exists, `false` otherwise

**Example:**
```javascript
if (wsServer.hasChannel('chat')) {
  console.log('Chat channel exists');
}
```

### `getChannel(chanName)`

Gets a channel object by name.

**Parameters:**
- `chanName` (string): The channel name to retrieve

**Returns:** `object|null` - The channel object if it exists, `null` otherwise

The returned channel object contains:
- `usersCanPub` (boolean): Whether users can publish to this channel
- `usersCanSub` (boolean): Whether users can subscribe to this channel
- `hookPub` (function): The publish hook function
- `hookSub` (function): The subscribe hook function
- `hookUnsub` (function): The unsubscribe hook function
- `clients` (Set): Set of WebSocket clients subscribed to this channel

**Example:**
```javascript
const channel = wsServer.getChannel('chat');
if (channel) {
  console.log(`Channel has ${channel.clients.size} subscribers`);
  console.log(`Can publish: ${channel.usersCanPub}`);
  console.log(`Can subscribe: ${channel.usersCanSub}`);
}
```

### `getChannelClients(chanName)`

Gets an array of clients subscribed to a specific channel.

**Parameters:**
- `chanName` (string): The channel name

**Returns:** `Array|null` - Array of WebSocket client objects subscribed to the channel, or `null` if channel doesn't exist

**Example:**
```javascript
const clients = wsServer.getChannelClients('chat');
if (clients) {
  console.log(`${clients.length} clients are subscribed to chat`);

  // Iterate through all clients
  for (const client of clients) {
    const metadata = wsServer.clients.get(client);
    console.log(`Client ${metadata.id} is subscribed`);
  }

  // Send a message to all subscribers
  clients.forEach(client => {
    wsServer.sendCmd(client, 'special-notification', {
      message: 'Hello subscriber!'
    });
  });
}
```

### `getChannelClientsData(chanName)`

Gets an array of client metadata objects for all clients subscribed to a specific channel.

**Parameters:**
- `chanName` (string): The channel name

**Returns:** `Array|null` - Array of client metadata objects, or `null` if channel doesn't exist

**Example:**
```javascript
const clientsData = wsServer.getChannelClientsData('chat');
if (clientsData) {
  console.log(`${clientsData.length} clients are subscribed to chat`);
  for (const clientData of clientsData) {
    console.log(`Client ${clientData.id} with role ${clientData.role`);
  }
}
```

### `removeChannel(chanName)`

Removes a channel from the server. All subscribed clients will be unsubscribed.

**Parameters:**
- `chanName` (string): The channel name to remove

**Returns:** `boolean` - `true` if channel was removed successfully, `false` if channel doesn't exist

**Example:**
```javascript
// Remove a channel
wsServer.removeChannel('old-channel');
```

### `pub(chanName, msg)`

Publishes a message to all subscribers of a channel. This is a server-side publish that bypasses the `hookPub` function.

**Parameters:**
- `chanName` (string): The channel name
- `msg` (any): The message to publish

**Returns:** `boolean` - `true` if message was published successfully, `false` if channel doesn't exist

**Example:**
```javascript
// Publish a server message
wsServer.pub('chat', {
  user: 'System',
  message: 'Server maintenance in 5 minutes',
  timestamp: Date.now()
});

// Bot message example
setInterval(() => {
  wsServer.pub('chat', {
    user: 'Bot',
    message: 'Automated message',
    timestamp: Date.now()
  });
}, 30000);
```

## RPC Management

### `addRpc(name, callback)`

Adds a Remote Procedure Call (RPC) endpoint that clients can invoke.

**Parameters:**
- `name` (string): The RPC name
- `callback` (function): The RPC callback function
  - Parameters: `(data, clientMetadata, client, wsServer)`
  - Returns: The response to send back to the client
  - Can throw `WSServerError` to send an error response (The promise will then be rejected with the error message on the client side)

**Returns:** `boolean` - `true` if RPC was added successfully, `false` if RPC already exists

**Example:**
```javascript
import { WSServerError } from 'wsmini';

// Simple RPC
wsServer.addRpc('add', (data, clientMetadata, client, wsServer) => {
  if (typeof data.a !== 'number' || typeof data.b !== 'number') {
    throw new WSServerError('Both a and b must be numbers');
  }
  return data.a + data.b;
});

// Complex RPC with rights check
wsServer.addRpc('getUserData', (data, clientMetadata, client, wsServer) => {
  if (!clientMetadata.isAdmin) {
    throw new WSServerError('Authentication required');
  }

  // Simulate database lookup
  return {
    id: clientMetadata.id,
    profile: { /* user profile data */ }
  };
});
```

### `removeRpc(name)`

Removes an RPC endpoint from the server.

**Parameters:**
- `name` (string): The RPC name to remove

**Returns:** `boolean` - `true` if RPC was removed successfully, `false` if RPC doesn't exist

**Example:**
```javascript
// Remove an RPC
wsServer.removeRpc('getUserData');
```

## Command Broadcasting

### `sendCmd(client, cmd, data)`

Sends a command to a specific client.

**Parameters:**
- `client` (WebSocket): The client WebSocket connection
- `cmd` (string): The command name
- `data` (object, optional): The command data. Default: `{}`

**Example:**
```javascript
// Send command to specific client
wsServer.sendCmd(client, 'notification', {
  type: 'info',
  message: 'Welcome to the server!'
});
```

### `broadcastCmd(cmd, data)`

Broadcasts a command to all connected clients.

**Parameters:**
- `cmd` (string): The command name
- `data` (object, optional): The command data. Default: `{}`

**Example:**
```javascript
// Broadcast server announcement
wsServer.broadcastCmd('announcement', {
  message: 'Server will restart in 5 minutes',
  priority: 'high'
});

```

### `broadcastOthersCmd(client, cmd, data)`

Broadcasts a command to all clients except the specified one.

**Parameters:**
- `client` (WebSocket): The client to exclude from the broadcast
- `cmd` (string): The command name
- `data` (object, optional): The command data. Default: `{}`

**Example:**
```javascript
// Notify others when a user joins
wsServer.broadcastOthersCmd(client, 'user-joined', {
  id: clientMetadata.id,
  timestamp: Date.now()
});
```

## Server Control

### `start()`

Starts the WebSocket server. Inherited from `WSServer`.

**Example:**
```javascript
wsServer.start();
```

### `stop()`

Stops the WebSocket server. Inherited from `WSServer`.

**Example:**
```javascript
wsServer.stop();
```

### `close()`

Closes the WebSocket server and cleans up all channels and RPCs.

**Example:**
```javascript
wsServer.close();
```

## Internal Methods

The following methods are used internally by the server and typically don't need to be called directly:

### `managePubSub(client, data)`
Handles PubSub actions (`sub`, `unsub`, `pub`, `pub-simple`) from clients.

### `manageRpc(client, data)`
Handles RPC calls from clients.

### `onMessage(client, message)`
Processes incoming messages from clients.

### `onClose(client)`
Handles client disconnections and cleanup.

### `isActionValid(action)`
Validates if an action is supported by the server.

### Response Methods
- `sendError(client, msg)`
- `sendRpcError(client, id, name, response)`
- `sendRpcSuccess(client, id, name, response)`
- `sendSubError(client, id, chan, response)`
- `sendSubSuccess(client, id, chan, response)`
- `sendPubError(client, id, chan, response)`
- `sendPubSuccess(client, id, chan, response)`
- `sendJson(client, data)`
