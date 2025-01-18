import WSServerRoom from "./WSServerRoom.mjs";

export default class WSServerGameRoom extends WSServerRoom {

  constructor(name, wsServer) {
    super(name, wsServer);

    // Manage a set to handle all the callbacks with the same loop
    // thus avoiding to create a setTimeout for each callback
    this.registredUpdate = new Set();

    this.unregisterPatch = () => {};
    this.setSimulationPerSec(60);
    this.setPatchPerSec(20);
    this.lastTickTime = 0;
    this.isRunning = false;

    // Those var are only relevant inside of _tick(),
    // but a reference is held externally.
    // This is for skipping the creation of a new variable each tick.
    this.loop = null;
    this.callback = null;
    this.deltaTime = 0;
    this.frameDelta = 0;
    this.numUpdate = 0;
    this.elapsedTime = 0;
  }

  onTick(deltaTime, elapsedTime) {
    // to be overriden
  }

  onPatch(deltaTime, elapsedTime) {
    // to be overriden
    return {};
  }

  setSimulationPerSec(updatePerSec) {
    this.updatePerSec = updatePerSec;
    this.timestep = 1000 / this.updatePerSec;
  }

  setSimulationStep(timestep) {
    this.setSimulationPerSec(1000 / timestep);
  }

  setPatchPerSec(patchPerSec) {
    this.patchPerSec = patchPerSec;
    this.patchTimestep = 1000 / this.patchPerSec;
    this.unregisterPatch();
    this.unregisterPatch = this.registerThrottle((dt, t) => this.patch(dt, t), this.patchTimestep);
  }

  setPatchTimestep(patchTimestep) {
    this.setPatchPerSec(1000 / patchTimestep);
  }

  hrtimeMs() {
    const time = process.hrtime();
    return time[0] * 1000 + time[1] / 1000000;
  }

  startMainLoop() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTickTime = this.hrtimeMs();
    this.loop = setTimeout(() => this._tick(), 0);
  }

  stopMainLoop() {
    if (!this.isRunning) return;
    clearTimeout(this.loop);
    this.isRunning = false;
  }

  patch(deltaTime, elapsedTime) {
    const worldState = this.onPatch(deltaTime, elapsedTime);
    this.broadcast(worldState);
  }

  register(callback) {
    this.registredUpdate.add(callback);
    return () => this.unregister(callback);
  }

  registerThrottle(callback, delay) {
    let elapsed = 0;
    const callbackThrottle = (dt, t) => {
      elapsed += dt;
      if (elapsed < delay) return;
      callback(elapsed, t);
      elapsed -= delay;
    };
    return this.register(callbackThrottle);
  }

  registerTimeout(callback, delay) {
    let elapsed = 0;
    let unregister = null;
    const callbackTimeout = (dt, t) => {
      elapsed += dt;
      if (elapsed < delay) return;
      callback(elapsed, t);
      unregister();
    };
    unregister = this.register(callbackTimeout);
    return unregister;
  }

  unregister(callback) {
    console.log('unregister');
    return this.registredUpdate.delete(callback);
  }

  resetFrameDelta() {
    this.frameDelta = 0;
  }

  _tick() {
    const now = this.hrtimeMs();
    this.deltaTime = now - this.lastTickTime;
    this.timeout = Math.max(0, this.timestep - this.deltaTime);
    this.loop = setTimeout(() => this._tick(), this.timeout);

    this.frameDelta += this.deltaTime;
    this.lastTickTime = now;

    // Fixed simulation steps
    this.numUpdate = 0;
    while (this.frameDelta >= this.timestep && this.numUpdate <= this.updatePerSec) {
      this.elapsedTime += this.timestep;
      for (this.callback of this.registredUpdate) {
        this.callback(this.timestep, this.elapsedTime);
      }
      this.onTick(this.timestep, this.elapsedTime);
      this.frameDelta -= this.timestep;
      this.numUpdate++;
    }

    // We run the update more than 1 second !
    if (this.numUpdate > this.updatePerSec) {
      this.wsServer.log(`Game '${this.name}' is running slow`);
      this.panic(this.frameDelta);
    }
  }

  dispose() {
    this.stopMainLoop();
    this.registredUpdate.clear();
  }

}