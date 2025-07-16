import EventMixins from './event.js';
import { bytesBase64Encode } from './String.mjs';

export default class WSClient {
  rpcId = 0;
  pubId = 0;
  subId = 0;
  unsubId = 0;

/**
 *  A WebSocket PubSub client to interact with the WS PubSub server.
 *
 * @param {string} [url=null] - The WebSocket server URL.
 * If null, the URL will be determined based on the current domain and scheme.
 * @example
 * const wsClient = new WSClient('ws://localhost:8001');
 */
  constructor(url = null, defaultTimeout = 5000) {
    if (url === null) {
      const hostname = window.location.hostname;
      const mustBeSecure = window.location.protocol == 'https:';
      const port = mustBeSecure ? 443 : 80;
      this.url = `${mustBeSecure ? 'wss' : 'ws'}://${hostname}:${port}`;
    } else {
      this.url = url
    }
    this.wsClient = null;
    this.defaultTimeout = defaultTimeout;

    Object.assign(this, EventMixins);
    this.mixinEvent();
  }

  /**
   * Connect to the WebSocket server.
   *
   * @param {string} [token=null] - The authentication token.
   * @returns {Promise} - A promise that resolves when the connection is established or rejects if an error occurs.
   * @example
   * await wsClient.connect('secret').catch(console.error);
   */
  connect(token = null) {
    // Leverage the subprotocol to pass the authentication token
    if (token != null && typeof token != 'string') {
      return Promise.reject(new Error('The auth token must be a string.'));
    }
    const subprotocols = ['ws.mini'];
    if (typeof token === 'string') {
      subprotocols.push(bytesBase64Encode(token));
    }

    this.wsClient = new WebSocket(this.url, subprotocols);
    this.wsClient.addEventListener('message', (event) => this.onMessage(event));

    return new Promise((resolve, reject) => {
      this.once('ws:auth:success', () => resolve());
      this.once('ws:auth:failed', () => reject(new Error('WS auth failed')));
      this.wsClient.addEventListener('error', () => reject(new Error('WS connection error')));
      this.wsClient.addEventListener('close', () => {
        this.close();
        reject(new Error('WS connection closed.'));
      });
    });
  }

  close() {
    if (this.wsClient === null) return;
    this.wsClient.close();
    this.wsClient = null;
    this.emit('close');
  }

  onMessage(event) {
    const data = JSON.parse(event.data);

    if (data.action === 'sub') {
      this.emit(`ws:sub:${data.chan}`, {
        response: data.response,
        type: data.type,
        id: data.id,
      });
      return;
    }

    if (data.action === 'unsub') {
      this.emit(`ws:unsub:${data.chan}`, {
        response: data.response,
        type: data.type,
        id: data.id,
      });
      return;
    }

    if (data.action === 'pub-confirm') {
      this.emit(`ws:pub:${data.chan}`, {
        response: data.response,
        type: data.type,
        id: data.id,
      });
      return;
    }

    if (data.action === 'pub') {
      this.emit(`ws:chan:${data.chan}`, data.msg);
      return;
    }

    if (data.action === 'pub-cmd') {
      this.emit(`ws:chan-cmd:${data.msg.cmd}:${data.chan}`, data.msg.data);
      return;
    }

    if (data.action === 'rpc') {
      this.emit(`ws:rpc:${data.name}`, {
        response: data.response,
        type: data.type,
        id: data.id,
      });
      return;
    }

    if (data.action === 'error') {
      this.emit(`ws:error`, data.msg);
      return;
    }

    if (data.action === 'auth-failed') {
      this.emit('ws:auth:failed');
      this.close();
      return;
    }

    if (data.action === 'auth-success') {
      this.emit('ws:auth:success');
      return;
    }

    if (data.action === 'cmd') {
      this.emit(`ws:cmd:${data.cmd}`, data.data);
      return;
    }
  }

  /**
   * Call a remote procedure.
   *
   * @param {string} name - The name of the remote procedure.
   * @param {object} [data={}] - The data to send to the remote procedure.
   * @param {number} [timeout=5000] - The timeout in milliseconds.
   * @returns {Promise} - A promise that resolves with the response or rejects if an error occurs.
   * @example
   * const user = await wsClient.rpc('get-user', {id: 1}).catch(console.error);
   */
  rpc(name, data = {}, timeout = this.defaultTimeout) {
    return new Promise((resolve, reject) => {
      const id = this.rpcId++;

      const timer = setTimeout(() => {
        this.off(`ws:rpc:${name}`, callback);
        reject(new Error('WS RPC Timeout for ' + name + ' (rpc id: ' + id + ')'));
      }, timeout);

      const callback = (resp) => {
        if (resp.id !== id) return;
        clearTimeout(timer);
        this.off(`ws:rpc:${name}`, callback);
        if (resp.type === 'success') {
          resolve(resp.response)
        } else {
          reject(new Error(resp.response));
        }
      };

      this.on(`ws:rpc:${name}`, callback);
      this.wsClient.send(JSON.stringify({action: 'rpc', name, data, id}));
    });
  }

  /**
   * Publish a message to a channel.
   *
   * @param {string} chan - The channel name.
   * @param {object} msg - The message to publish
   * @param {number} [timeout=5000] - The timeout in milliseconds.
   * @returns {Promise} - A promise that resolves with the response or rejects if an error occurs.
   * @example
   * wsClient.pub('chat', {message: 'Hello, World!'});
   */
  pub(chan, msg, timeout = this.defaultTimeout) {
    return new Promise((resolve, reject) => {
      const id = this.pubId++;

      const timer = setTimeout(() => {
        this.off(`ws:pub:${chan}`, callback);
        reject(new Error('WS Pub Timeout for ' + chan + ' (pub id: ' + id + ')'));
      }, timeout);

      const callback = (resp) => {
        if (resp.id !== id) return;
        clearTimeout(timer);
        this.off(`ws:pub:${chan}`, callback);
        if (resp.type === 'success') {
          resolve(resp.response)
        } else {
          reject(new Error(resp.response));
        }
      };

      this.on(`ws:pub:${chan}`, callback);
      this.wsClient.send(JSON.stringify({action: 'pub', chan, id, msg}));
    });
  }

  /**
   * Publish a message to a channel without timeout management or error handling
   *
   * @param {string} chan - The channel name.
   * @param {object} msg - The message to publish.
   * @example
   * wsClient.pubSimple('chat', {message: 'Hello, World!'});
   */
  pubSimple(chan, msg) {
    const id = this.pubId++;
    this.wsClient.send(JSON.stringify({action: 'pub-simple', chan, id, msg}));
  }

  /**
   * Subscribe to a channel.
   *
   * @param {string} chan - The channel name.
   * @param {function} callback - The callback to call when a message is received.
   * @param {number} [timeout=5000] - The timeout in milliseconds.
   * @returns {Promise} - A promise that resolves when the subscription is established or rejects if an error occurs.
   * @example
   * wsClient.sub('chat', (msg) => console.log(msg));
   */
  sub(chan, callback, timeout = this.defaultTimeout) {
    if (!this.hasListener(`ws:chan:${chan}`)) {
      this.on(`ws:chan:${chan}`, callback);
      return new Promise((resolve, reject) => {
        const id = this.subId++;

        const timer = setTimeout(() => {
          this.off(`ws:sub:${chan}`, subCallback);
          reject(new Error('WS Sub Timeout for ' + chan + ' (sub id: ' + id + ')'));
        }, timeout);

        const subCallback = (resp) => {
          if (resp.id !== id) return;
          clearTimeout(timer);
          this.off(`ws:sub:${chan}`, subCallback);
          if (resp.type === 'success') {
            resolve(resp.response)
          } else {
            this.off(`ws:chan:${chan}`, callback);
            reject(new Error(resp.response));
          }
        };

        this.on(`ws:sub:${chan}`, subCallback);
        this.wsClient.send(JSON.stringify({action: 'sub', chan, id}));
      });
    }
    this.on(`ws:chan:${chan}`, callback);
    return Promise.resolve('Subscribed');
  }

  /**
   * Unsubscribe from a channel.
   *
   * @param {string} chan - The channel name.
   * @param {function} [callback=null] - The callback to remove or null to remove all callbacks.
   * @param {number} [timeout=5000] - The timeout in milliseconds.
   * @returns {Promise} - A promise that resolves when the unsubscription is established or rejects if an error occurs.
   * @example
   * wsClient.unsub('chat');
   */
  unsub(chan, callback = null, timeout = this.defaultTimeout) {
    if (callback !== null) {
      this.off(`ws:chan:${chan}`, callback);
    } else {
      this.clear(`ws:chan:${chan}`);
    }

    if (!this.hasListener(`ws:chan:${chan}`)) {
      return new Promise((resolve, reject) => {
        const id = this.unsubId++;

        const timer = setTimeout(() => {
          this.off(`ws:unsub:${chan}`, unsubCallback);
          reject(new Error('WS Unsub Timeout for ' + chan + ' (unsub id: ' + id + ')'));
        }, timeout);

        const unsubCallback = (resp) => {
          if (resp.id !== id) return;
          clearTimeout(timer);
          this.off(`ws:unsub:${chan}`, unsubCallback);
          if (resp.type === 'success') {
            resolve(resp.response);
          } else {
            reject(new Error(resp.response));
          }
        };

        this.on(`ws:unsub:${chan}`, unsubCallback);
        this.wsClient.send(JSON.stringify({action: 'unsub', chan, id}));
      });
    }

    return Promise.resolve('Unsubscribed');
  }

  /**
   * Register a callback for server commands.
   *
   * @param {string} cmd - The command name to listen for.
   * @param {function} callback - The callback function to execute when the command is received.
   * @returns {function} - Returns a function for removing the command listener.
   * @example
   * wsClient.onCmd('notification', (data) => {
   *   console.log('Received notification:', data);
   * });
   *
   */
  onCmd(cmd, callback) {
    return this.on(`ws:cmd:${cmd}`, callback);
  }

}