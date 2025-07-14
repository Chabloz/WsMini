# Getting Started with WsMini

This guide will help you get started with WsMini, a lightweight WebSocket library for real-time applications.

## Installation

Install WsMini using npm:

```bash
npm install wsmini
```

## Basic Usage

### Setting up a Server

```javascript
import { WSServerPubSub } from 'wsmini';

const wsServer = new WSServerPubSub({
  // Set your server options, e.g., port, allowed origins, max number of clients, ...
  // See the server documentation for the complete list of options
  port: 8888,
});

wsServer.start();
```
### Starting the Server with Node.js

```bash
node path/to/your/server/file.js
```

### Connecting from a Browser JS Client

```javascript
import { WSClient } from 'wsmini';

// Create a WebSocket client
// If no url specified, it will be determined based on the current domain and scheme
const ws = new WSClient('ws://localhost:8888');

// Connect to the WebSocket server and handle connection errors
await ws.connect().catch(err => {
  console.error('Cannot connect to server. Try again later.');
  throw err;
});
console.log('Connection established!');
```

## RPC (Remote Procedure Call)

### Server-side RPC

```javascript
import { WSServerPubSub, WSServerError } from 'wsmini';

const wsServer = new WSServerPubSub({ port: 8888 });

// Add somme RPC endpoints
wsServer.addRpc('add', (data) => {
  if (typeof data?.n1 != 'number') throw new WSServerError('n1 must be a number');
  if (typeof data?.n2 != 'number') throw new WSServerError('n2 must be a number');
  return data.n1 + data.n2;
});

wsServer.addRpc('getMeteo', (data) => {
  return {
    temperature: 20,
    condition: 'Sunny',
    location: data?.location || 'Unknown'
  };
});

wsServer.start();
```

### Client-side RPC

```javascript
import { WSClient } from 'wsmini';

const ws = new WSClient('ws://localhost:8888');
await ws.connect().catch(err => {
  console.error('Cannot connect to server. Try again later.');
  throw err;
});
console.log('Connection established!');

const meteo = await ws.rpc('getMeteo', { location: 'London' });
console.log(`Weather in ${meteo.location}: ${meteo.temperature}°C, ${meteo.condition}`);

// Or with error handling
ws.rpc('add', {n1: 3, n2: 'a'}) // The promise will reject with an error because n2 is not a number
  .then(response => console.log(`Result: ${response}`))
  .catch(err => console.error('RPC Error:', err.message));
```

## PubSub (Publish/Subscribe)

### Server-side PubSub

```javascript
import { WSServerPubSub, WSServerError } from 'wsmini';

const wsServer = new WSServerPubSub({ port: 8888 });

// Add a meteo channel, users can subscribe but not publish
wsServer.addChannel('meteo', { usersCanPub: false});

// Add a chat channel (anyone can publish and subscribe)
wsServer.addChannel('chat', {
  // See the server documentation for the complete list of options

  // You can hook on pub, sub and unsub
  // Instead of true you can return false to deny the subscription (do it on some condition)
  hookSub: (clientMetadata, wsServer) => true,

  // Do cleanup if needed when a user unsubscribes
  hookUnsub: (clientMetadata, wsServer) => null,

  // For the pub hook, you can modify the message before the broadcast to all subscribers  (e.g. add a timestamp, user info, msg moderation, etc.)
  hookPub: (msg, clientMetadata, wsServer) => {
    // If you want to forbid publishing, on some condition, throw an WSServerError
    if (msg.length > 100) throw new WSServerError('Message too long');
    return {
      time: Date.now(),
      user: clientMetadata.id,
      msg
    }
  }
});

// Send some meteo test data every 10 seconds
setInterval(() => {
  wsServer.pub('meteo', {location: 'London', temperature: (Math.random() * 30).toFixed(1), condition: 'Sunny'});
}, 10000);

wsServer.start();
```

### Client-side PubSub

```javascript
import { WSClient } from 'wsmini';

const ws = new WSClient('ws://localhost:8888');
await ws.connect().catch(err => {
  console.error('Cannot connect to server. Try again later.');
  throw err;
});

// Subscribe to channels
await ws.sub('meteo', (data) => {
  console.log(`Meteo update: ${data.temperature}°C, ${data.condition}`);
});

await ws.sub('chat', (message) => {
  console.log(`${message.user} (${new Date(message.time).toLocaleTimeString()}): ${message.msg}`);
});

// Publish to a channel
ws.pub('chat', 'Hello, world!');
// This will throw an error, users cannot publish to the 'meteo' channel
ws.pub('meteo', 'This will not work');
```

## Next Steps

Now that you understand the basics, you can explore more advanced features by looking at the [Examples](../examples/index.md) section.
There, you'll find complete examples for RPC, PubSub, Room management, Game state synchronization, and more.