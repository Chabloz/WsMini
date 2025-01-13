export default {

  mixinEvent() {
    this.listeners = new Map();
  },

  on(event, callback) {
    return this.addListener(event, callback);
  },

  once(event, callback) {
    const callbackOnce = data => {
      this.removeListener(event, callbackOnce);
      callback(data);
    }
    this.addListener(event, callbackOnce);
    return () => this.removeListener(event, callbackOnce);
  },

  hasListener(event) {
    return this.listeners.has(event) && this.listeners.get(event).size > 0;
  },

  addListener(event, callback) {
    let callbackSet = this.listeners.get(event);
    if (!callbackSet) {
      callbackSet = new Set();
      this.listeners.set(event, callbackSet);
    }
    callbackSet.add(callback);
    // Return a removeListener function for conveniance
    return () => this.removeListener(event, callback);
  },

  off(event, callback) {
    this.removeListener(event, callback);
  },

  clear(event) {
    this.listeners.delete(event);
  },

  removeListener(event, callback) {
    const callbackSet = this.listeners.get(event);
    if (!callbackSet) return false;
    callbackSet.delete(callback);
    return true;
  },

  emit(event, data = {}) {
    const callbackSet = this.listeners.get(event);
    if (!callbackSet) return;
    // we need to copy the set to avoid concurrency issues
    // because callback might add or remove listeners
    const toCalls = [...callbackSet];
    for (const callback of toCalls) {
      callback(data);
    }
  }

};