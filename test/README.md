# WsMini Test Suite

This directory contains unit and integration tests

## Test Structure

```
test/
├── helpers/
│   └── testUtils.mjs          # Test utilities and helper functions
├── websocket/
│   ├── WSClient.test.mjs      # Unit tests for WSClient browser class
│   ├── WSClientRoom.test.mjs  # Unit tests for WSClientRoom browser class
│   ├── WSServer.test.mjs      # Unit tests for WSServer base class
│   ├── WSServer.integration.test.mjs  # Integration tests for WSServer
│   ├── WSClientServer.integration.test.mjs  # Client-Server integration tests
│   ├── WSServerPubSub.test.mjs        # Unit tests for WSServerPubSub
│   ├── WSServerRoomManager.test.mjs   # Unit tests for WSServerRoomManager
│   ├── WSServerGameRoom.test.mjs      # Unit tests for WSServerGameRoom
│   ├── WebSocketServerOrigin.test.mjs # Unit tests for WebSocketServerOrigin
│   └── WSServerError.test.mjs         # Unit tests for WSServerError
├── setup.mjs                  # Global test setup
└── README.md                  # This file
```

## Running Tests

### Install Dependencies

```bash
npm install
```

### Run All Tests

```bash
npm test
```

### Run Tests in Watch Mode

```bash
npm run test:watch
```

### Run Tests with Coverage

```bash
npm run test:coverage
```

## Test Categories

### Client Tests (`WSClient.test.mjs`)

Tests the browser WebSocket client functionality:

- **Constructor**: Tests client creation with URL and timeout configuration
- **Connection Management**: Tests WebSocket connection with/without authentication tokens
- **Message Handling**: Tests processing of different message types (pub, sub, rpc, cmd, error)
- **RPC Functionality**: Tests remote procedure calls with success/error/timeout scenarios
- **Pub/Sub Functionality**: Tests publishing and subscribing to channels
- **Command Handling**: Tests command registration and callback management
- **Edge Cases**: Tests malformed messages, unknown actions, and rapid operations

### Client Room Tests (`WSClientRoom.test.mjs`)

Tests the room-based browser WebSocket client functionality:

- **Constructor**: Tests WSClientRoom inheritance and initialization
- **Room Actions**: Tests room creation, joining, and leaving operations
- **Room Communication**: Tests sending messages and commands to rooms
- **Room Event Listeners**: Tests message, command, and client list listeners
- **Room Class**: Tests the Room helper class functionality
- **Cleanup**: Tests proper resource cleanup when leaving rooms
- **Error Handling**: Tests error responses for room operations

### Unit Tests (`WSServer.test.mjs`)

Tests individual methods and functionality of the WSServer base class in isolation:

- **Constructor**: Tests default and custom configuration options
- **Logging**: Tests logging functionality with different levels and external loggers
- **Client Management**: Tests client metadata creation, retrieval, and management
- **Broadcasting**: Tests message broadcasting to all clients or specific subsets
- **Authentication**: Tests auth success/failure message sending
- **Message Processing**: Tests message validation and processing
- **Ping Management**: Tests ping/pong mechanism for client liveness
- **Error Handling**: Tests error handling and client disconnection
- **Server Lifecycle**: Tests server startup and shutdown

### Integration Tests (`WSServer.integration.test.mjs`)

Tests the WSServer class in more realistic scenarios:

- **Server Connection Lifecycle**: Tests client connections, authentication flow
- **Message Flow**: Tests actual message broadcasting between clients
- **Ping/Pong Mechanism**: Tests the keepalive mechanism

### Client-Server Integration Tests (`WSClientServer.integration.test.mjs`)

Tests real communication between WSClient/WSClientRoom and WSServerRoomManager:

- **Connection Management**: Tests client connection to actual server with authentication
- **Room Operations**: Tests room creation, joining, and messaging with real server
- **Message Flow**: Tests sending and receiving messages through rooms
- **RPC Communication**: Tests remote procedure calls between client and server
- **Pub/Sub Operations**: Tests publish/subscribe messaging between client and server
- **Real WebSocket**: Uses actual WebSocket connections (not mocks) for end-to-end testing

### PubSub Tests (`WSServerPubSub.test.mjs`)

Tests the publish-subscribe functionality extending WSServer:

- **Constructor**: Tests PubSub server creation and inheritance
- **Channel Management**: Tests channel creation, validation, and removal
- **Channel Access Methods**: Tests getChannel(), getChannelClients(), and getChannelClientsData() methods
- **RPC Management**: Tests RPC endpoint registration and removal
- **Action Validation**: Tests message action validation for PubSub and RPC
- **Message Processing**: Tests subscription, publication, and RPC message handling
- **Client Cleanup**: Tests automatic cleanup when clients disconnect
- **Publishing Methods**: Tests direct publishing to channels
- **Authentication Methods**: Tests sendAuthFailed and sendAuthSuccess functionality
- **Command Methods**: Tests sendCmd, broadcastCmd, and broadcastOthersCmd
- **Channel Management**: Tests getChannel(), getChannelClients(), and getChannelClientsData() methods
- **Pub-Simple Action**: Tests pub-simple message handling with success and error cases
- **RPC Error Handling**: Tests RPC error scenarios with WSServerError and generic errors
- **Pub Action Error Handling**: Tests publication error scenarios
- **Additional Edge Cases**: Tests oversized messages, invalid data, and various error conditions

### Room Manager Tests (`WSServerRoomManager.test.mjs`)

Tests the room-based WebSocket server functionality:

- **Constructor**: Tests room manager creation with different configurations
- **Room Management**: Tests room creation, deletion, and metadata management
- **Client Management**: Tests adding/removing clients from rooms
- **Room Messages**: Tests `pub-room` and `pub-room-cmd` message handling
- **Room Broadcasting**: Tests various broadcasting methods (all clients, others, specific clients)
- **Message Validation**: Tests validation of room messages and commands
- **Error Handling**: Tests error responses for invalid messages
- **Client Cleanup on Close**: Tests client removal from all rooms on disconnect
- **Server Cleanup**: Tests room cleanup when server closes
- **Room Messaging by Name**: Tests sendRoomName and sendRoom methods for individual client messaging
- **Room Commands by Name**: Tests sendRoomNameCmd and sendRoomCmd methods for individual client commands

### Game Room Tests (`WSServerGameRoom.test.mjs`)

Tests the game loop and real-time functionality extending WSServerRoom:

- **Constructor**: Tests game room creation with timing configurations
- **Simulation Configuration**: Tests FPS, timestep, and patch rate settings
- **Main Loop Control**: Tests starting/stopping the game loop
- **Callback Registration**: Tests callback system (regular, throttled, timeout)
- **Game Loop Mechanics**: Tests fixed timestep execution and performance monitoring
- **Patch System**: Tests world state broadcasting and throttling
- **Timing & Callbacks**: Tests precise timing control and callback execution
- **Game State Management**: Tests elapsed time tracking and state updates
- **Performance Monitoring**: Tests frame timing and update limiting
- **Cleanup & Disposal**: Tests proper resource cleanup
- **Edge Cases**: Tests robustness with extreme configurations

### WebSocket Server Origin Tests (`WebSocketServerOrigin.test.mjs`)

Tests the WebSocket server origin validation and client limit functionality:

- **Constructor**: Tests server creation with origin validation and client limits
- **Option Validation**: Tests error handling for missing/invalid origins and maxNbOfClients
- **Origin Validation**: Tests the checkOrigin method with various origin formats
- **Protocol Handling**: Tests protocol stripping for flexible origin matching
- **Port Handling**: Tests port stripping for flexible origin matching
- **Wildcard Support**: Tests wildcard origin matching
- **Client Limit Enforcement**: Tests handleUpgrade method with client capacity limits
- **Error Responses**: Tests proper HTTP error responses for invalid origins and full server

### WSServer Error Tests (`WSServerError.test.mjs`)

Tests the custom WSServerError class:

- **Constructor**: Tests error creation with various message types
- **Error Properties**: Tests inheritance from Error class and proper properties
- **Stack Traces**: Tests error stack trace generation
- **Throwability**: Tests error throwing and catching behavior
- **Error Comparison**: Tests distinguishing from other error types
- **Serialization**: Tests error serialization and string conversion

## Test Utilities

The `testUtils.mjs` file provides helper functions for:

- Creating mock WebSocket clients
- Creating mock HTTP requests
- Creating mock loggers
- Waiting for async operations
- Common assertions for server state

### Client Test Setup

Client tests use additional mocking infrastructure:

- **JSDOM**: Provides browser environment simulation with `window`, `document`, and `location` globals
- **MockWebSocket**: Custom WebSocket implementation for testing browser client functionality
- **TextEncoder/TextDecoder**: String encoding utilities for browser compatibility
- **Base64 utilities**: `btoa`/`atob` functions for authentication token encoding

## Coverage

The test suite provides comprehensive coverage of all WebSocket components with **93.3% overall statement coverage**:

### Coverage Summary
- **All files**: 93.3% statements, 89.93% branches, 92.77% functions, 93.3% lines
- **WebSocketServerOrigin**: 100% coverage (41 comprehensive tests)
- **WSServerError**: 100% coverage (17 tests covering all error scenarios)
- **WSServerPubSub**: 95.55% coverage (extensive authentication, command, and error handling tests)
- **WSServerRoomManager**: 82.5% coverage (room management, cleanup, and messaging tests)
- **WSServer**: 99.05% coverage (comprehensive base functionality tests)
- **WSClient**: 98.78% coverage (browser client functionality tests)
- **WSClientRoom**: 100% coverage (room-based client functionality tests)
- **WSServerGameRoom**: 96.81% coverage (game loop and timing tests)
- **WSServerRoom**: 87.5% coverage (room base class tests)

### WSClient Browser Class
- ✅ Connection management with authentication
- ✅ Message processing and event handling
- ✅ RPC calls with timeout and error handling
- ✅ Pub/Sub operations and channel management
- ✅ Command registration and callback system
- ✅ Edge cases and error scenarios

### WSClientRoom Browser Class
- ✅ Room creation, joining, and leaving
- ✅ Room-based message and command sending
- ✅ Event listeners for room updates
- ✅ Room helper class functionality
- ✅ Resource cleanup and error handling

### WSServer Base Class
- ✅ All public methods and configuration options
- ✅ Error conditions and edge cases
- ✅ Client lifecycle management
- ✅ Message processing and broadcasting
- ✅ Authentication flows
- ✅ Ping/pong mechanism

### WSServerPubSub
- ✅ Channel and RPC management
- ✅ Channel access methods (getChannel, getChannelClients, getChannelClientsData)
- ✅ Subscription and publication flows
- ✅ Message validation and processing
- ✅ Client cleanup and unsubscription
- ✅ Direct publishing methods
- ✅ Authentication methods (sendAuthFailed, sendAuthSuccess)
- ✅ Command methods (sendCmd, broadcastCmd, broadcastOthersCmd)
- ✅ Pub-simple action handling with success and error cases
- ✅ RPC error handling scenarios
- ✅ Comprehensive error handling and edge cases

### WSServerRoomManager
- ✅ Room creation and management
- ✅ Client-to-room assignment
- ✅ Room-based message broadcasting
- ✅ Command processing and validation
- ✅ Error handling and edge cases
- ✅ Client cleanup on disconnect
- ✅ Server cleanup and resource management
- ✅ Room messaging by name (sendRoomName, sendRoom)
- ✅ Room commands by name (sendRoomNameCmd, sendRoomCmd)
- ✅ Individual client messaging within rooms

### WSServerGameRoom
- ✅ Game loop timing and execution
- ✅ Callback registration and management
- ✅ Performance monitoring and panic handling
- ✅ World state patching and broadcasting
- ✅ Resource cleanup and disposal

### WebSocketServerOrigin
- ✅ Origin validation and protocol handling
- ✅ Client limit enforcement
- ✅ Configuration validation and error handling
- ✅ HTTP upgrade request processing
- ✅ Wildcard and flexible origin matching

### WSServerError
- ✅ Custom error class functionality
- ✅ Error inheritance and properties
- ✅ Stack trace generation
- ✅ Error throwing and catching
- ✅ Error serialization and comparison

**Total Test Count**: 312 tests across all components (40+ client tests, 30+ client room tests, 5 client-server integration tests, 150+ server tests, 41 origin tests, 17 error tests)

## Dependencies

- **Mocha**: Test framework
- **Chai**: Assertion library
- **Sinon**: Mocking and spying library
- **JSDOM**: Browser environment simulation for client tests
- **c8**: Code coverage tool
