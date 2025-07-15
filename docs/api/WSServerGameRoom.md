# WSServerGameRoom API Documentation

The `WSServerGameRoom` class extends [`WSServerRoom`](./WSServerRoomManager.md#room-class-hooks) to provide game-specific functionality with a fixed timestep game loop, world state patching system, and command handling for real-time multiplayer games. For a complete working example, see the [games.mjs server example](../examples/server/games.mjs) which demonstrates a simple multiplayer movement game with real-time synchronization.

## Table of Contents

- [Overview](#overview)
- [Constructor](#constructor)
- [Game Loop System](#game-loop-system)
  - [setSimulationPerSec](#setsimulationpersecsimulationpersec)
  - [setSimulationStep](#setsimulationsteptimestep)
  - [setPatchPerSec](#setPatchPerSecpatchPerSec)
  - [setPatchTimestep](#setPatchTimesteppatchTimestep)
  - [startMainLoop](#startmainloop)
  - [stopMainLoop](#stopmainloop)
- [Callback System](#callback-system)
  - [register](#registercallback)
  - [registerThrottle](#registerthrottlecallback-delay)
  - [registerTimeout](#registertimeoutcallback-delay)
  - [unregister](#unregistercallback)
- [Game Room Hooks](#game-room-hooks)
  - [onTick](#ontickdeltatime-elapsedtime)
  - [onPatch](#onpatchdeltatime-elapsedtime)
  - [onCmdXxx](#oncmdxxx-command-methods)
  - [panic](#panicframedelta)

## Overview

`WSServerGameRoom` provides a foundation for small real-time multiplayer games by implementing:

- **Fixed Timestep Game Loop**: Ensures consistent simulation regardless of frame rate
- **World State Patching**: Automatically broadcasts game state to clients at configurable intervals
- **Command System**: Handle player actions through structured command methods
- **Callback Management**: Register timed callbacks for game events
- **Performance Monitoring**: Automatic detection of slow-running games

This class is designed for small games that require precise timing and regular state synchronization between clients.

## Constructor

### `new WSServerGameRoom(name, wsServer)`

Creates a new game room instance. This constructor is typically called automatically by `WSServerRoomManager` when using a custom room class.
Before reading this documentation, it's recommended to read the [`WSServerRoomManager`](./WSServerRoomManager.md) documentation to understand how rooms are managed.
You will have to provide a custom room class that extends `WSServerGameRoom` in the options of `WSServerRoomManager` during server initialization.

**Parameters:**
- `name` (string): The room name
- `wsServer` (WSServerRoomManager): The parent room manager instance

**Default Configuration:**
- Simulation rate: 60 ticks per second (~16.67ms timestep)
- Patch rate: 20 patches per second (50ms interval)
- Game loop: Stopped (call `startMainLoop()` to begin)

If the client is not using any interpolation, the patch rate should be set to 60 or higher to ensure smooth updates. You can set the patch rate to 60 or higher in the `onCreate` method of your custom room class (see below).

For the simulation rate, the default value (60 ticks per second) is suitable for most games. However, games with fast-moving objects, precise collision detection, or complex physics may benefit from higher simulation rates (120 or 240 ticks per second). Higher simulation rates help prevent:

- **Collision clipping**: Fast-moving objects passing through walls or other objects
- **Tunneling effects**: Bullets or projectiles skipping over targets
- **Physics instabilities**: Jittery or unstable object interactions

The trade-off is increased CPU usage, so choose the lowest rate that provides acceptable physics quality for your game. If your game requires a different rate, you can adjust it in the `onCreate` method.

## Game Loop System

### `setSimulationPerSec(simulationPerSec)`

Sets the simulation tick rate (how often `onTick` is called).
This is normally done in the `onCreate` method of your custom room class.
You'll find the doc of the `onCreate` method in the [`WSServerRoomManager`](./WSServerRoomManager.md#room-class-hooks) documentation.


**Parameters:**
- `simulationPerSec` (number): Ticks per second

**Example:**
```javascript
class MyGameRoom extends WSServerGameRoom {
  onCreate() {
    this.setSimulationPerSec(60); // 60 ticks per second
    this.startMainLoop();
  }
}

// For a fast-paced game with precise collision detection
class FastPacedGameRoom extends WSServerGameRoom {
  onCreate() {
    this.setSimulationPerSec(120); // 120 ticks per second for better physics
    this.setPatchPerSec(60); // Still send updates 60 times per second
    this.startMainLoop();
  }
}
```

### `setSimulationStep(timestep)`

Sets the simulation timestep in milliseconds.
This is a convenience method equivalent to `setSimulationPerSec(1000 / timestep)`.

**Parameters:**
- `timestep` (number): Milliseconds between ticks

**Example:**
```javascript
// Equivalent to setSimulationPerSec(60)
this.setSimulationStep(16.67); // ~16.67ms per tick
```

### `setPatchPerSec(patchPerSec)`

Sets the patch rate (how often world state is sent to clients).

**Parameters:**
- `patchPerSec` (number): Patches per second

**Example:**
```javascript
class MyGameRoom extends WSServerGameRoom {
  onCreate() {
    this.setPatchPerSec(20); // Send world state 20 times per second
    this.startMainLoop();
  }
}
```

### `setPatchTimestep(patchTimestep)`

Sets the patch interval in milliseconds.
This is a convenience method equivalent to `setPatchPerSec(1000 / patchTimestep)`.

**Parameters:**
- `patchTimestep` (number): Milliseconds between patches

**Example:**
```javascript
// Equivalent to setPatchPerSec(20)
this.setPatchTimestep(50); // Send world state every 50ms
```

### `startMainLoop()`

Starts the game loop. Call this after setting up your game world.

**Note:** You may want to delay starting the game loop until all players are ready to play. For example, in games with a lobby system or readiness checks, start the loop only after receiving "ready" confirmations from all players rather than immediately in `onCreate()`.


**Example:**
```javascript
class MyGameRoom extends WSServerGameRoom {
  onCreate() {
    this.world = { players: [], bullets: [] };
    this.setSimulationPerSec(60);
    this.setPatchPerSec(20);
    this.startMainLoop(); // Begin game simulation
  }
}

// Example with readiness check
class LobbyGameRoom extends WSServerGameRoom {
  onCreate() {
    this.world = { players: [], bullets: [] };
    this.playersReady = new Set();
    this.setSimulationPerSec(60);
    this.setPatchPerSec(20);
    // Don't start loop immediately - wait for all players to be ready
  }

  onCmdReady(msg, clientMeta, client) {
    this.playersReady.add(client.id);
    if (this.playersReady.size !== this.clients.length) return;
    // Start game when all players are ready
    this.broadcastCmd('game-starting', { countdown: 3 });
    setTimeout(() => this.startMainLoop(), 3000);
  }
}
```

### `stopMainLoop()`

Stops the game loop. Useful for pausing games.

**Example:**
```javascript
class MyGameRoom extends WSServerGameRoom {
  onCmdPause(msg, clientMeta, client) {
    if (!clientMeta?.isHost) return; // Only the host can pause the game
    this.stopMainLoop();
    this.broadcastCmd('game-paused', {});
  }
}
```

## Callback System

All callbacks are registered to be called only when the game loop is running.
Do not use setTimeout or setInterval directly in your game room code, as they will not be synchronized with the game loop.

### `register(callback)`

Registers a callback to be called every simulation tick.
The dt can be used to adjust game logic based on the time since the last tick.

**Parameters:**
- `callback` (function): Function called with `(deltaTime, elapsedTime)`

**Returns:** `function` - Unregister function

**Example:**
```javascript
class MyGameRoom extends WSServerGameRoom {
  onCreate() {
    // Register a callback for a mob spawning system
    this.unregisterMobSpawner = this.register((dt, elapsed) => {
      this.spawnMobs(dt);
    });
  }
}
```

### `registerThrottle(callback, delay)`

Registers a throttled callback that runs at most once per delay period.

**Parameters:**
- `callback` (function): Function to call
- `delay` (number): Minimum delay in milliseconds between calls

**Returns:** `function` - Unregister function

**Example:**
```javascript
class MyGameRoom extends WSServerGameRoom {
  onCreate() {
    // Every player will lose 1 health every second
    this.registerThrottle((dt, elapsed) => {
      for (const player of this.world.players) {
        player.loseHealth(1);
      }
    }, 1000);
  }
}
```

### `registerTimeout(callback, delay)`

Registers a callback to run once after a delay.

**Parameters:**
- `callback` (function): Function to call
- `delay` (number): Delay in milliseconds

**Returns:** `function` - Unregister function

**Example:**
```javascript
class MyGameRoom extends WSServerGameRoom {
  onCreate() {
    this.world = { players: [], gamePhase: 'normal' };

    // Trigger sudden death mode after 5 minutes
    this.registerTimeout((dt, elapsed) => {
      this.world.gamePhase = 'sudden-death';
      this.broadcastCmd('sudden-death-started', {msg: 'Sudden Death!'});
    }, 300000);

    this.startMainLoop();
  }
}
```

### `unregister(callback)`

Unregisters a previously registered callback.

**Parameters:**
- `callback` (function): The callback to unregister

**Returns:** `boolean` - `true` if callback was found and removed

## Game Room Hooks

### `onTick(deltaTime, elapsedTime)`

Called every simulation tick. Use this for game logic updates.

**Parameters:**
- `deltaTime` (number): Time since last tick in milliseconds
- `elapsedTime` (number): Total elapsed time since game start

**Example:**
```javascript
class MyGameRoom extends WSServerGameRoom {
  onTick(deltaTime, elapsedTime) {
    // Update player positions
    for (const player of this.world.players) {
      player.update(deltaTime);
    }

    // Update bullets
    for (const bullet of this.world.bullets) {
      bullet.update(deltaTime);
    }

    // Check collisions
    this.checkCollisions();
  }
}
```

### `onPatch(deltaTime, elapsedTime)`

Called at the patch rate. Return the world state to send to clients.

**Parameters:**
- `deltaTime` (number): Time since last patch in milliseconds
- `elapsedTime` (number): Total elapsed time since game start

**Returns:** `object` - World state to broadcast to clients

**Example:**
```javascript

// Simple patch that sends the entire world state to all clients
class MyGameRoom extends WSServerGameRoom {
  // ... other methods ...
  onPatch() {
    return this.world;
  }
}

class MyGameRoom extends WSServerGameRoom {
  // ... other methods ...
  onPatch(deltaTime, elapsedTime) {
    // Send only necessary data to clients
    return {
      timestamp: elapsedTime,
      players: this.world.players.map(p => ({
        id: p.id,
        x: p.x,
        y: p.y,
        angle: p.angle,
        health: p.health
      })),
      bullets: this.world.bullets.map(b => ({
        x: b.x,
        y: b.y,
        angle: b.angle
      }))
    };
  }
}
```

### `onCmdXxx` (Command Methods)

Handle client commands by creating methods with the prefix `onCmd` followed by the command name (first letter capitalized).

**Parameters:**
- `msg` (any): Command data from client
- `clientMeta` (object): Client metadata
- `client` (WebSocket): Client connection

**Example:**
```javascript
class MyGameRoom extends WSServerGameRoom {
  // Handle "move" command. Client code example: room.sendCmd('move', {direction: 'up'})
  onCmdMove(msg, clientMeta, client) {
    const player = clientMeta.player;
    if (!player) return;

    // Validate input
    if (!['up', 'down', 'left', 'right'].includes(msg.direction)) {
      throw new WSServerError('Invalid direction');
    }

    // Update player state (actual movement happens in onTick)
    player.direction = msg.direction;
    player.isMoving = true;
  }

  // Handle "shoot" command. Client code example: room.sendCmd('shoot', {angle: 1.57})
  onCmdShoot(msg, clientMeta, client) {
    const player = clientMeta.player;
    if (!player || !player.canShoot) return;

    // Create bullet
    this.world.bullets.push(new Bullet(player.x, player.y, msg.angle));
    player.canShoot = false;

    // Reset shoot cooldown
    this.registerTimeout(() => player.canShoot = true, 500);
  }
}
```

### `panic(frameDelta)`

Called when the game loop detects performance issues (simulation running slow).
The default implementation just resets the frame delta (by dropping the accumulated time).
But you can override this method to implement custom logic, such as reducing simulation.

**Parameters:**
- `frameDelta` (number): Accumulated frame time that couldn't be processed

**Example:**
```javascript
class MyGameRoom extends WSServerGameRoom {
  panic(frameDelta) {
    console.log(`Game ${this.name} is running slow, dropping ${frameDelta}ms`);
    // Could implement catch-up logic or reduce simulation quality
    this.resetFrameDelta(); // Reset to prevent cascade failures
  }
}
```