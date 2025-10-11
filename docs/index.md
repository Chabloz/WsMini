# WsMini Documentation

Welcome to the documentation for WsMini, a lightweight WebSocket library for real-time applications with RPC, PubSub, Rooms and Game state synchronization. WsMini is designed for small web games and real-time applications with a focus on simplicity and ease of use:

- **Authentication & Security**: Supports token transmission during handshake and basic WebSocket security. User accounts, rate limiting, and additional security checks should be handled by your application
- **Scalability**: Targeted for small to medium applications, scaling features are outside the scope

[![npm version](https://img.shields.io/npm/v/wsmini.svg)](https://www.npmjs.com/package/wsmini)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Security Considerations

WsMini provides basic security features but requires additional implementation for production use:

- **Origin Validation**: The library includes origin checking capabilities to prevent unauthorized cross-origin connections. This should always be configured in production environments.
- **Rate Limiting**: Not included in WsMini - implement rate limiting at the application or reverse proxy level to prevent abuse.
- **Token Authentication**: Supports token transmission during WebSocket handshake. Tokens can be JWT tokens or any string format that your application uses for user authentication. Token validation logic must be implemented in your application.

## Documentation

- [Getting Started](./guides/getting-started.md)
- [Examples](./examples/index.md)
- [Test Suite](../test/README.md)

### API Reference

#### Client API

- [WSClient](./api/WSClient.md) - Core WebSocket client for RPC, PubSub, and server commands
- [WSClientRoom](./api/WSClientRoom.md) - Room-based WebSocket client extending WSClient

#### Server API

- [WSServer](./api/WSServer.md) - Base WebSocket server class (use WSServerPubSub or WSServerRoomManager instead)
- [WSServerPubSub](./api/WSServerPubSub.md) - WebSocket server with PubSub/RPC capabilities
- [WSServerRoomManager](./api/WSServerRoomManager.md) - Room-based WebSocket server extending WSServerPubSub
- [WSServerGameRoom](./api/WSServerGameRoom.md) - Game room with fixed timestep loop and state synchronization

## License

This project is licensed under the MIT License - see the [LICENSE](../LICENSE) file for details.
