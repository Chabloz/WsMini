# WsMini

Minimalist WebSocket client and server for real-time applications with RPC, PubSub, Rooms and Game state synchronization based on WS https://github.com/websockets/ws

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- 🚀 Lightweight and easy
- 📡 RPC - Remote Procedure Calls with built-in error handling
- 🎯 PubSub - Very simple Publish/Subscribe system
- 🏠 Room-based management system
- 🎮 Game-ready with fixed timestep game loop and state synchronization

## Getting Started

For a detailed guide on how to get started with WsMini, including setting up a server, connecting clients, and using RPC and PubSub features, please refer to the [Getting Started Guide](./docs/guides/getting-started.md).

## Documentation

Documentation is available in the `docs` directory and includes examples for both client and server usage, as well as advanced features like Room management and Game state synchronization: [docs](./docs/index.md).

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