# WsMini

Minimalist WebSocket client and server for real-time applications with RPC, PubSub, Rooms and Game state synchronization based on WS https://github.com/websockets/ws

[![npm version](https://img.shields.io/npm/v/wsmini.svg)](https://www.npmjs.com/package/wsmini)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- 🚀 Lightweight and easy
- 📡 RPC - Remote Procedure Calls with built-in error handling
- 🎯 PubSub - Very simple Publish/Subscribe system (sends messages directly to connected clients without message queuing)
- 🏠 Room-based management system
- 🎮 Game-ready with fixed timestep game loop and state synchronization

## Getting Started

For a detailed guide on how to get started with WsMini, including setting up a server, connecting clients, and using RPC and PubSub features, please refer to the [Getting Started Guide](./docs/guides/getting-started.md).

## Documentation

[Documentation](./docs/index.md) is available in the `docs` directory and includes examples for both client and server usage, as well as advanced features like Room management and Game state synchronization.

## Scope & Use Cases

WsMini is designed for **small web games and real-time applications** with a focus on simplicity and ease of use:

- **Authentication & Security**: Supports token transmission during handshake and basic WebSocket security. User accounts, rate limiting, and additional security checks should be handled by your application
- **Scalability**: Targeted for small to medium applications, scaling features are outside the scope

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

## Examples

You will find complete examples demonstrating some of the features of WsMini in the `docs/examples` directory. Each example includes both server and client code with HTML interfaces. For more details, see the [Examples Documentation](./docs/examples/index.md).

## Testing

WsMini includes a test suite with more than 300 tests covering all components and features.

### Running Tests

```bash
# Install dependencies
npm install
# Run all tests
npm test
# Run tests with coverage
npm run test:coverage
# Run tests in watch mode
npm run test:watch
```

For detailed testing information, see the [Test Documentation](./test/README.md).