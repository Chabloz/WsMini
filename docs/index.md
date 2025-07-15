# WsMini Documentation

Welcome to the documentation for WsMini, a lightweight WebSocket library for real-time applications with RPC, PubSub, Rooms and Game state synchronization.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Documentation

- [Getting Started](./guides/getting-started.md)
- [Examples](./examples/index.md)

### API Reference

#### Client API

- [WSClient](./api/WSClient.md) - Core WebSocket client for RPC, PubSub, and server commands
- [WSClientRoom](./api/WSClientRoom.md) - Room-based WebSocket client extending WSClient

#### Server API

- [WSServerPubSub](./api/WSServerPubSub.md) - WebSocket server with PubSub/RPC capabilities
- [WSServerRoomManager](./api/WSServerRoomManager.md) - Room-based WebSocket server extending WSServerPubSub
- [WSServerGameRoom](./api/WSServerGameRoom.md) - Game room with fixed timestep loop and state synchronization

## License

This project is licensed under the MIT License - see the [LICENSE](../LICENSE) file for details.
