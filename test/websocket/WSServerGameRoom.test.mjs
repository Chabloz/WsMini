import sinon from 'sinon';
import { expect } from 'chai';

import WSServerGameRoom from '../../src/websocket/WSServerGameRoom.mjs';

// Test game room class extending WSServerGameRoom
class TestGameRoom extends WSServerGameRoom {
  constructor(name, wsServer) {
    super(name, wsServer);
    this.tickCount = 0;
    this.patchCount = 0;
    this.tickHistory = [];
    this.patchHistory = [];
    this.gameState = { players: [], score: 0 };
  }

  onTick(deltaTime, elapsedTime) {
    this.tickCount++;
    this.tickHistory.push({ deltaTime, elapsedTime, timestamp: Date.now() });

    // Simulate game logic
    this.gameState.score += 1;
  }

  onPatch(deltaTime, elapsedTime) {
    this.patchCount++;
    this.patchHistory.push({ deltaTime, elapsedTime, timestamp: Date.now() });

    // Return world state for broadcasting
    return {
      type: 'gameState',
      data: { ...this.gameState, tickCount: this.tickCount }
    };
  }

  reset() {
    this.tickCount = 0;
    this.patchCount = 0;
    this.tickHistory = [];
    this.patchHistory = [];
    this.gameState = { players: [], score: 0 };
  }
}

// Mock WebSocket server
const createMockWSServer = () => ({
  log: sinon.spy(),
  broadcast: sinon.spy(),
  broadcastRoomName: sinon.spy(),
  broadcastRoomNameCmd: sinon.spy(),
  sendRoomName: sinon.spy(),
  sendRoomNameCmd: sinon.spy(),
  clients: new Map()
});

describe('WSServerGameRoom', () => {
  let gameRoom;
  let mockWSServer;
  let sandbox;
  let clock;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    clock = sandbox.useFakeTimers();
    mockWSServer = createMockWSServer();
    gameRoom = new TestGameRoom('test-game', mockWSServer);
  });

  afterEach(() => {
    if (gameRoom) {
      gameRoom.dispose();
    }
    sandbox.restore();
  });

  describe('Constructor', () => {
    it('should create WSServerGameRoom with default settings', () => {
      expect(gameRoom.name).to.equal('test-game');
      expect(gameRoom.wsServer).to.equal(mockWSServer);
      expect(gameRoom.registredUpdate).to.be.instanceOf(Set);
      expect(gameRoom.updatePerSec).to.equal(60);
      expect(gameRoom.patchPerSec).to.equal(20);
      expect(gameRoom.timestep).to.equal(1000 / 60);
      expect(gameRoom.patchTimestep).to.equal(1000 / 20);
      expect(gameRoom.isRunning).to.be.false;
      expect(gameRoom.lastTickTime).to.equal(0);
      expect(gameRoom.elapsedTime).to.equal(0);
    });

    it('should initialize callback system', () => {
      expect(gameRoom.registredUpdate.size).to.equal(1); // patch callback is registered
      expect(typeof gameRoom.unregisterPatch).to.equal('function');
    });
  });

  describe('Simulation Configuration', () => {
    it('should set simulation per second', () => {
      gameRoom.setSimulationPerSec(30);
      expect(gameRoom.updatePerSec).to.equal(30);
      expect(gameRoom.timestep).to.equal(1000 / 30);
    });

    it('should set simulation step', () => {
      gameRoom.setSimulationStep(50); // 50ms = 20 FPS
      expect(gameRoom.updatePerSec).to.equal(20);
      expect(gameRoom.timestep).to.equal(50);
    });

    it('should set patch per second', () => {
      gameRoom.setPatchPerSec(10);
      expect(gameRoom.patchPerSec).to.equal(10);
      expect(gameRoom.patchTimestep).to.equal(1000 / 10);
    });

    it('should set patch timestep', () => {
      gameRoom.setPatchTimestep(100); // 100ms = 10 patches per second
      expect(gameRoom.patchPerSec).to.equal(10);
      expect(gameRoom.patchTimestep).to.equal(100);
    });

    it('should re-register patch callback when patch rate changes', () => {
      const initialSize = gameRoom.registredUpdate.size;
      gameRoom.setPatchPerSec(30);
      expect(gameRoom.registredUpdate.size).to.equal(initialSize); // Should still be same size
    });
  });

  describe('Main Loop Control', () => {
    it('should start main loop', () => {
      // Mock hrtimeMs to return predictable values
      const hrtimeStub = sandbox.stub(gameRoom, 'hrtimeMs').returns(1000);

      expect(gameRoom.isRunning).to.be.false;
      gameRoom.startMainLoop();
      expect(gameRoom.isRunning).to.be.true;
      expect(gameRoom.lastTickTime).to.equal(1000);

      hrtimeStub.restore();
    });

    it('should not start main loop if already running', () => {
      const hrtimeStub = sandbox.stub(gameRoom, 'hrtimeMs').returns(1000);

      gameRoom.startMainLoop();
      const firstStartTime = gameRoom.lastTickTime;

      // Try to start again
      gameRoom.startMainLoop();
      expect(gameRoom.lastTickTime).to.equal(firstStartTime);

      hrtimeStub.restore();
    });

    it('should stop main loop', () => {
      gameRoom.startMainLoop();
      expect(gameRoom.isRunning).to.be.true;

      gameRoom.stopMainLoop();
      expect(gameRoom.isRunning).to.be.false;
    });

    it('should not stop main loop if not running', () => {
      expect(gameRoom.isRunning).to.be.false;
      gameRoom.stopMainLoop(); // Should not throw
      expect(gameRoom.isRunning).to.be.false;
    });
  });

  describe('Callback Registration System', () => {
    it('should register callback', () => {
      const callback = sinon.spy();
      const initialSize = gameRoom.registredUpdate.size;

      const unregister = gameRoom.register(callback);
      expect(gameRoom.registredUpdate.size).to.equal(initialSize + 1);
      expect(gameRoom.registredUpdate.has(callback)).to.be.true;
      expect(typeof unregister).to.equal('function');
    });

    it('should unregister callback', () => {
      const callback = sinon.spy();
      const unregister = gameRoom.register(callback);

      unregister();
      expect(gameRoom.registredUpdate.has(callback)).to.be.false;
    });

    it('should register throttled callback', () => {
      const callback = sinon.spy();
      const delay = 100;

      const unregister = gameRoom.registerThrottle(callback, delay);
      expect(typeof unregister).to.equal('function');
      expect(gameRoom.registredUpdate.size).to.be.greaterThan(0);
    });

    it('should register timeout callback', () => {
      const callback = sinon.spy();
      const delay = 100;

      const unregister = gameRoom.registerTimeout(callback, delay);
      expect(typeof unregister).to.equal('function');
      expect(gameRoom.registredUpdate.size).to.be.greaterThan(0);
    });

    it('should auto-unregister timeout callback after delay', () => {
      const callback = sinon.spy();
      const delay = 100;

      // Mock hrtime to return predictable values
      const hrtimeStub = sandbox.stub(gameRoom, 'hrtimeMs');
      hrtimeStub.onCall(0).returns(0);    // Initial call in startMainLoop
      hrtimeStub.onCall(1).returns(50);   // First tick
      hrtimeStub.onCall(2).returns(100);  // Second tick
      hrtimeStub.onCall(3).returns(150);  // Third tick

      gameRoom.registerTimeout(callback, delay);
      gameRoom.startMainLoop();

      // Advance time to trigger timeout
      clock.tick(delay + 50);

      expect(callback.called).to.be.true;

      hrtimeStub.restore();
    });
  });

  describe('Game Loop Mechanics', () => {
    it('should execute tick callbacks at correct intervals', () => {
      // Mock hrtime to simulate time progression
      const hrtimeStub = sandbox.stub(gameRoom, 'hrtimeMs');
      hrtimeStub.onCall(0).returns(0);    // startMainLoop
      hrtimeStub.onCall(1).returns(100);  // First tick
      hrtimeStub.onCall(2).returns(200);  // Second tick
      hrtimeStub.onCall(3).returns(300);  // Third tick

      gameRoom.setSimulationPerSec(10); // 100ms per tick
      gameRoom.startMainLoop();

      // Advance time to trigger multiple ticks
      clock.tick(250); // Should trigger 2 ticks

      expect(gameRoom.tickCount).to.be.greaterThan(0);
      expect(gameRoom.tickHistory.length).to.be.greaterThan(0);

      hrtimeStub.restore();
    });

    it('should maintain fixed timestep', () => {
      // Mock hrtime to simulate time progression
      const hrtimeStub = sandbox.stub(gameRoom, 'hrtimeMs');
      hrtimeStub.onCall(0).returns(0);    // startMainLoop
      hrtimeStub.onCall(1).returns(100);  // First tick
      hrtimeStub.onCall(2).returns(200);  // Second tick
      hrtimeStub.onCall(3).returns(300);  // Third tick

      gameRoom.setSimulationPerSec(10); // 100ms timestep
      gameRoom.startMainLoop();

      clock.tick(250);

      // Check that all ticks have the correct timestep
      gameRoom.tickHistory.forEach(tick => {
        expect(tick.deltaTime).to.equal(100);
      });

      hrtimeStub.restore();
    });

    it('should handle slow performance with panic', () => {
      // Mock hrtime to simulate very slow performance
      const hrtimeStub = sandbox.stub(gameRoom, 'hrtimeMs');
      hrtimeStub.onCall(0).returns(0);     // startMainLoop
      hrtimeStub.onCall(1).returns(2000);  // Very slow first tick

      gameRoom.setSimulationPerSec(60); // Very fast simulation
      const panicSpy = sandbox.spy(gameRoom, 'panic');

      gameRoom.startMainLoop();

      // Simulate very slow performance
      clock.tick(100); // Small advance to trigger tick

      expect(panicSpy.called).to.be.true;
      expect(mockWSServer.log.called).to.be.true;
      expect(mockWSServer.log.firstCall.args[0]).to.include('running slow');

      hrtimeStub.restore();
    });

    it('should reset frame delta on panic', () => {
      const resetSpy = sandbox.spy(gameRoom, 'resetFrameDelta');

      gameRoom.panic(1000);

      expect(resetSpy.called).to.be.true;
      expect(gameRoom.frameDelta).to.equal(0);
    });
  });

  describe('Patch System', () => {
    it('should execute patch callbacks at correct intervals', () => {
      // Mock hrtime to simulate time progression
      const hrtimeStub = sandbox.stub(gameRoom, 'hrtimeMs');
      hrtimeStub.onCall(0).returns(0);    // startMainLoop
      hrtimeStub.onCall(1).returns(200);  // First tick
      hrtimeStub.onCall(2).returns(400);  // Second tick
      hrtimeStub.onCall(3).returns(600);  // Third tick

      gameRoom.setPatchPerSec(5); // 200ms per patch
      gameRoom.startMainLoop();

      clock.tick(500); // Should trigger 2-3 patches

      expect(gameRoom.patchCount).to.be.greaterThan(0);
      expect(gameRoom.patchHistory.length).to.be.greaterThan(0);

      hrtimeStub.restore();
    });

    it('should broadcast patch data', () => {
      const broadcastSpy = sandbox.spy(gameRoom, 'broadcast');

      gameRoom.patch(100, 1000);

      expect(broadcastSpy.called).to.be.true;
      expect(mockWSServer.broadcastRoomName.called).to.be.true;
      const broadcastData = mockWSServer.broadcastRoomName.firstCall.args[1];
      expect(broadcastData.type).to.equal('gameState');
      expect(broadcastData.data).to.have.property('tickCount');
    });

    it('should throttle patch calls correctly', () => {
      // Mock hrtime to simulate time progression
      const hrtimeStub = sandbox.stub(gameRoom, 'hrtimeMs');
      hrtimeStub.onCall(0).returns(0);     // startMainLoop
      hrtimeStub.onCall(1).returns(500);   // First tick
      hrtimeStub.onCall(2).returns(1000);  // Second tick
      hrtimeStub.onCall(3).returns(1500);  // Third tick

      gameRoom.setPatchPerSec(2); // 500ms per patch
      gameRoom.startMainLoop();

      clock.tick(1000); // 1 second

      // Should have approximately 2 patches
      expect(gameRoom.patchCount).to.be.at.most(3);

      hrtimeStub.restore();
    });
  });

  describe('Callback Timing', () => {
    it('should call throttled callback at correct intervals', () => {
      // Mock hrtime to simulate time progression
      const hrtimeStub = sandbox.stub(gameRoom, 'hrtimeMs');
      hrtimeStub.onCall(0).returns(0);    // startMainLoop
      hrtimeStub.onCall(1).returns(200);  // First tick
      hrtimeStub.onCall(2).returns(400);  // Second tick
      hrtimeStub.onCall(3).returns(600);  // Third tick

      const callback = sinon.spy();
      const delay = 200;

      gameRoom.registerThrottle(callback, delay);
      gameRoom.startMainLoop();

      clock.tick(500); // Should trigger callback 2 times

      expect(callback.callCount).to.be.at.least(1);
      expect(callback.callCount).to.be.at.most(3);

      hrtimeStub.restore();
    });

    it('should call timeout callback only once', () => {
      // Mock hrtime to simulate time progression
      const hrtimeStub = sandbox.stub(gameRoom, 'hrtimeMs');
      hrtimeStub.onCall(0).returns(0);    // startMainLoop
      hrtimeStub.onCall(1).returns(100);  // First tick
      hrtimeStub.onCall(2).returns(200);  // Second tick
      hrtimeStub.onCall(3).returns(300);  // Third tick

      const callback = sinon.spy();
      const delay = 100;

      gameRoom.registerTimeout(callback, delay);
      gameRoom.startMainLoop();

      clock.tick(300); // Well beyond timeout

      expect(callback.callCount).to.equal(1);

      hrtimeStub.restore();
    });

    it('should pass correct parameters to callbacks', () => {
      // Mock hrtime to simulate time progression
      const hrtimeStub = sandbox.stub(gameRoom, 'hrtimeMs');
      hrtimeStub.onCall(0).returns(0);    // startMainLoop
      hrtimeStub.onCall(1).returns(100);  // First tick

      const callback = sinon.spy();

      gameRoom.register(callback);
      gameRoom.startMainLoop();

      clock.tick(100);

      expect(callback.called).to.be.true;
      const args = callback.firstCall.args;
      expect(args[0]).to.be.a('number'); // deltaTime
      expect(args[1]).to.be.a('number'); // elapsedTime

      hrtimeStub.restore();
    });
  });

  describe('Game State Management', () => {
    it('should maintain elapsed time across ticks', () => {
      // Mock hrtime to simulate time progression
      const hrtimeStub = sandbox.stub(gameRoom, 'hrtimeMs');
      hrtimeStub.onCall(0).returns(0);    // startMainLoop
      hrtimeStub.onCall(1).returns(100);  // First tick
      hrtimeStub.onCall(2).returns(200);  // Second tick
      hrtimeStub.onCall(3).returns(300);  // Third tick

      gameRoom.setSimulationPerSec(10); // 100ms per tick
      gameRoom.startMainLoop();

      clock.tick(300); // 3 ticks

      expect(gameRoom.elapsedTime).to.be.greaterThan(0);
      expect(gameRoom.elapsedTime).to.be.approximately(300, 50);

      hrtimeStub.restore();
    });

    it('should update game state in onTick', () => {
      // Mock hrtime to simulate time progression
      const hrtimeStub = sandbox.stub(gameRoom, 'hrtimeMs');
      hrtimeStub.onCall(0).returns(0);    // startMainLoop
      hrtimeStub.onCall(1).returns(100);  // First tick
      hrtimeStub.onCall(2).returns(200);  // Second tick

      gameRoom.startMainLoop();

      clock.tick(200);

      expect(gameRoom.gameState.score).to.be.greaterThan(0);
      expect(gameRoom.tickCount).to.be.greaterThan(0);

      hrtimeStub.restore();
    });

    it('should provide world state in onPatch', () => {
      const worldState = gameRoom.onPatch(100, 1000);

      expect(worldState).to.have.property('type', 'gameState');
      expect(worldState.data).to.have.property('score');
      expect(worldState.data).to.have.property('tickCount');
    });
  });

  describe('Performance Monitoring', () => {
    it('should track frame timing', () => {
      // Mock hrtime to simulate time progression
      const hrtimeStub = sandbox.stub(gameRoom, 'hrtimeMs');
      hrtimeStub.onCall(0).returns(0);    // startMainLoop
      hrtimeStub.onCall(1).returns(100);  // First tick

      gameRoom.startMainLoop();

      clock.tick(100);

      // Verify timing is tracked by checking if ticks are executed
      expect(gameRoom.tickCount).to.be.greaterThan(0);
      expect(gameRoom.elapsedTime).to.be.greaterThan(0);

      hrtimeStub.restore();
    });

    it('should limit updates per frame', () => {
      // Mock hrtime to simulate very slow performance
      const hrtimeStub = sandbox.stub(gameRoom, 'hrtimeMs');
      hrtimeStub.onCall(0).returns(0);     // startMainLoop
      hrtimeStub.onCall(1).returns(2000);  // Very slow first tick

      gameRoom.setSimulationPerSec(1000); // Very high frequency
      const panicSpy = sandbox.spy(gameRoom, 'panic');
      gameRoom.startMainLoop();

      clock.tick(100); // Small advance to trigger tick

      // Should trigger panic when too many updates would be needed
      expect(panicSpy.called).to.be.true;
      expect(mockWSServer.log.called).to.be.true;

      hrtimeStub.restore();
    });
  });

  describe('Cleanup', () => {
    it('should dispose properly', () => {
      gameRoom.startMainLoop();

      gameRoom.dispose();

      expect(gameRoom.isRunning).to.be.false;
      expect(gameRoom.registredUpdate.size).to.equal(0);
    });

    it('should stop main loop on dispose', () => {
      gameRoom.startMainLoop();
      expect(gameRoom.isRunning).to.be.true;

      gameRoom.dispose();

      expect(gameRoom.isRunning).to.be.false;
    });

    it('should clear all registered callbacks on dispose', () => {
      const callback1 = sinon.spy();
      const callback2 = sinon.spy();

      gameRoom.register(callback1);
      gameRoom.register(callback2);

      expect(gameRoom.registredUpdate.size).to.be.greaterThan(0);

      gameRoom.dispose();

      expect(gameRoom.registredUpdate.size).to.equal(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero timestep gracefully', () => {
      expect(() => gameRoom.setSimulationPerSec(0)).to.not.throw;
    });

    it('should handle negative timestep gracefully', () => {
      expect(() => gameRoom.setSimulationPerSec(-10)).to.not.throw;
    });

    it('should handle very high simulation rates', () => {
      gameRoom.setSimulationPerSec(1000);
      expect(gameRoom.updatePerSec).to.equal(1000);
      expect(gameRoom.timestep).to.equal(1);
    });

    it('should handle callback registration after disposal', () => {
      gameRoom.dispose();

      const callback = sinon.spy();
      const unregister = gameRoom.register(callback);

      expect(typeof unregister).to.equal('function');
      expect(gameRoom.registredUpdate.size).to.equal(1);
    });
  });
});
