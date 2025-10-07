import WSServer from "./WSServer.mjs";
import WSServerError from "./WSServerError.mjs";

export default class WSServerPubSub extends WSServer {
  channels = new Map();
  rpcs = new Map();
  actionsRpc = ['rpc'];
  actionsPubSub = ['sub', 'pub', 'pub-simple', 'unsub'];

  /**
   * Add a channel to the server
   *
   * @param {string} chan - The channel name
   * @param {object} options - The channel options
   * @param {boolean} [options.usersCanPub=true] - If users can publish on this channel
   * @param {boolean} [options.usersCanSub=true] - If users can subscribe to this channel
   * @param {function} [options.hookPub=(msg, client, wsServer) => msg] - The hook to call before publishing a message
   * It must return the message to send to the all clients of the channel.
   * The callback is called with the message to publish, the client metadata and the server instance.
   * It can throw a WSServerError to send an error to the client
   * @param {function} [options.hookPubPost=(msg, client, wsServer) => null] - The hook to call after a successful publication
   * The callback is called with the transformed message, the client metadata and the server instance.
   * Errors thrown in this hook are logged but do not affect the publication.
   * @param {function} [options.hookSub=(client, wsServer) => true] - The hook to call before subscribing a client to the channel
   * It must return true if the client can subscribe to the channel, false otherwise.
   * The callback is called with the client metadata and the server instance
   * @param {function} [options.hookSubPost=(client, wsServer) => null] - The hook to call after a successful subscription
   * The callback is called with the client metadata and the server instance.
   * Errors thrown in this hook are logged but do not affect the subscription.
   * @param {function} [options.hookUnsub=(client, wsServer) => null] - The hook to call before unsubscribing a client to the channel
   * The return value does not matter.
   * The callback is called with the client metadata and the server instance
   *
   * @example
   * wsServer.addChannel('chat', {
   *   usersCanPub: true,
   *   usersCanSub: true,
   *   hookPub: (msg, client, wsServer) => {
   *     return {...msg, from: client.username, time: Date.now()}
   *   },
   *   hookPubPost: (msg, client, wsServer) => {
   *     console.log(`User ${client.id} published message to chat`);
   *   },
   *   hookSubPost: (client, wsServer) => {
   *     console.log(`User ${client.id} joined chat`);
   *   }
   * });
   */
  addChannel(chan, {
    usersCanPub = true,
    usersCanSub = true,
    hookPub = (msg, client, wsServer) => msg,
    hookPubPost = (msg, client, wsServer) => null,
    hookSub = (client, wsServer) => true,
    hookSubPost = (client, wsServer) => null,
    hookUnsub = (client, wsServer) => null,
  } = {}) {
    if (this.channels.has(chan)) return false;
    this.channels.set(chan, {
      usersCanPub,
      usersCanSub,
      hookPub,
      hookPubPost,
      hookSub,
      hookSubPost,
      hookUnsub,
      clients: new Set(),
    });
    return true;
  }

  /**
   * Check if a channel exists
   * @param {string} chanName - The channel name
   * @returns {boolean} - True if the channel exists, false otherwise
   * @example
   * wsServer.hasChannel('chat'); // true or false
   */
  hasChannel(chanName) {
    return this.channels.has(chanName);
  }

  /**
   * Get a channel by name
   * @param {string} chanName - The channel name
   * @returns {object|null} - The channel object if it exists, null otherwise
   * @example
   * const channel = wsServer.getChannel('chat');
   * if (channel) {
   *   console.log(channel.clients.size); // Number of subscribers
   * }
   */
  getChannel(chanName) {
    if (!this.channels.has(chanName)) return null;
    return this.channels.get(chanName);
  }

  /**
   * Get the clients subscribed to a channel
   * @param {string} chanName - The channel name
   * @returns {Array|null} - The array of clients subscribed to the channel, or null if channel doesn't exist
   * @example
   * const clients = wsServer.getChannelClients('chat');
   * if (clients) {
   *   console.log(`${clients.length} clients are subscribed to chat`);
   *   for (const client of clients) {
   *     console.log(wsServer.clients.get(client).id);
   *   }
   * }
   */
  getChannelClients(chanName) {
    if (!this.channels.has(chanName)) return null;
    const channel = this.getChannel(chanName);
    return channel ? Array.from(channel.clients) : null;
  }

  /**
   * Get the metadata of all clients subscribed to a channel
   * @param {string} chanName - The channel name
   * @returns {Array|null} - The array of client metadata objects, or null if channel doesn't exist
   * @example
   * const clientsData = wsServer.getChannelClientsData('chat');
   * if (clientsData) {
   *   console.log(`${clientsData.length} clients are subscribed to chat`);
   *   for (const clientData of clientsData) {
   *     console.log(`Client ${clientData.id} with role ${clientData.role}`);
   *   }
   * }
   */
  getChannelClientsData(chanName) {
    const clients = this.getChannelClients(chanName);
    if (!clients) return null;
    return clients.map(client => this.clients.get(client)).filter(Boolean);
  }

  /**
   * Add a RPC to the server
   *
   * @param {string} name - The RPC name
   * @param {function} callback - The RPC callback. It must return the response to the client.
   * The callback is called with the data sent by the client, the client metadata, the ws client and the server instance.
   * The callback can throw a WSServerError to send an error to the client
   *
   * @example
   * wsServer.addRpc('hello', (data, clientMetadata, client, wsServer) => {
   *   if (!data?.name) throw new WSServerError('Name is required');
   *   return `Hello from WS server ${data.name}`;
   * });
   */
  addRpc(name, callback) {
    if (this.rpcs.has(name)) return false;
    this.rpcs.set(name, callback);
    return true;
  }

  removeChannel(chanName) {
    if (!this.channels.has(chanName)) return false;
    const chan = this.channels.get(chanName);
    // Call the unsub hook for all clients
    for (const client of chan.clients) {
      chan.hookUnsub(this.clients.get(client), this);
    }
    this.channels.delete(chanName);
    return true;
  }

  removeRpc(name) {
    if (!this.rpcs.has(name)) return false;
    this.rpcs.delete(name);
    return true;
  }

  isActionValid(action) {
    return this.actionsPubSub.includes(action) || this.actionsRpc.includes(action);
  }

  onMessage(client, message) {
    message = message.toString();
    if (message.length > this.maxInputSize) {
      this.log(`Client ${this.clients.get(client)?.id} sent a message that is too large`, 'warn');
      client.close();
      return false;
    }

    try {
      var data = JSON.parse(message);
    } catch (e) {
      return this.sendError(client, 'Invalid data');
    }

    if (!this.isActionValid(data.action)) {
      return this.sendError(client, 'Invalid action');
    }

    if (this.actionsRpc.includes(data.action)) {
      return this.manageRpc(client, data);
    }
    if (this.actionsPubSub.includes(data.action)) {
      return this.managePubSub(client, data);
    }
    return data;
  }

  managePubSub(client, data) {
    if (typeof data?.chan !== 'string') {
      return this.sendError(client, 'Invalid chan');
    }

    if (data.action !== 'pub-simple' && typeof data?.id !== 'number') {
      return this.sendError(client, 'Invalid id or id is missing');
    }

    if (data.action === 'unsub') {
      if (!this.channels.has(data.chan)) {
        return this.sendUnsubError(client, data.id, data.chan, 'Unknown chan');
      };
      const chan = this.channels.get(data.chan);

      if (!chan.clients.has(client)) {
        return this.sendUnsubError(client, data.id, data.chan, 'Not subscribed');
      }

      chan.hookUnsub(this.clients.get(client), this);
      chan.clients.delete(client);
      return this.sendUnsubSuccess(client, data.id, data.chan, 'Unsubscribed');
    }

    if (data.action === 'sub') {
      if (!this.channels.has(data.chan)) {
        return this.sendSubError(client, data.id, data.chan, 'Unknown chan');
      }

      const chan = this.channels.get(data.chan);

      if (!chan.usersCanSub) {
        return this.sendSubError(client, data.id, data.chan, 'Users cannot sub on this chan');
      }

      if (!chan.hookSub(this.clients.get(client), this)) {
        return this.sendSubError(client, data.id, data.chan, 'Subscription denied');
      }

      chan.clients.add(client);

      try {
        chan.hookSubPost(this.clients.get(client), this);
      } catch (e) {
        this.log('hookSubPost error: ' + e.message, 'error');
      }

      return this.sendSubSuccess(client, data.id, data.chan, 'Subscribed');
    }

    if (data.action === 'pub') {
      if (!this.channels.has(data.chan)) {
        return this.sendPubError(client, data.id, data.chan, 'Unknown chan');
      };

      const chan = this.channels.get(data.chan);

      if (!chan.usersCanPub) {
        return this.sendPubError(client, data.id, data.chan, 'Users cannot pub on this chan');
      }

      try {
        var dataToSend = chan.hookPub(data.msg, this.clients.get(client), this);
      } catch (e) {
        if (!(e instanceof WSServerError)) this.log(e.name + ': ' + e.message, 'error');
        const response = e instanceof WSServerError ? e.message : 'Server error';
        return this.sendPubError(client, data.id, data.chan, response);
      }

      this.sendPubSuccess(client, data.id, data.chan, 'Message sent');
      
      try {
        chan.hookPubPost(dataToSend, this.clients.get(client), this);
      } catch (e) {
        this.log('hookPubPost error: ' + e.message, 'error');
      }
      
      return this.pub(data.chan, dataToSend);
    }

    if (data.action === 'pub-simple') {
      if (!this.channels.has(data.chan)) return false;
      const chan = this.channels.get(data.chan);
      if (!chan.usersCanPub) return false;
      let dataToSend;
      try {
        dataToSend = chan.hookPub(data.msg, this.clients.get(client), this);
      } catch (e) {
        if (!(e instanceof WSServerError)) this.log(e.name + ': ' + e.message, 'error');
        return false;
      }
      return this.pub(data.chan, dataToSend);
    }
  }

  manageRpc(client, data) {
    if (typeof data?.name !== 'string') {
      return this.sendError(client, 'Invalid rpc name');
    }
    if (!data?.data) {
      return this.sendError(client, 'Data is required');
    }
    if (typeof data?.id !== 'number') {
      return this.sendError(client, 'Invalid rpc id');
    }

    const rpc = this.rpcs.get(data.name);

    if (!rpc) {
      return this.sendRpcError(client, data.id, data.name, 'Unknown rpc');
    }

    let response;
    try {
      response = rpc(data.data, this.clients.get(client), client, this);
    } catch (e) {
      if (!(e instanceof WSServerError)) this.log(e.name +': ' + e.message, 'error');
      const response = e instanceof WSServerError ? e.message : 'Server error';
      return this.sendRpcError(client, data.id, data.name, response);
    }

    return this.sendRpcSuccess(client, data.id, data.name, response);
  }

  pub(chanName, msg) {
    const chan = this.channels.get(chanName);
    if (!chan) return false;

    const message = JSON.stringify({action: 'pub', chan: chanName, msg});
    for (const client of chan.clients) {
      this.send(client, message);
    }

    return true;
  }

  onClose(client) {
    for (const chan of this.channels.values()) {
      if (chan.clients.has(client)) {
        chan.hookUnsub(this.clients.get(client), this);
        chan.clients.delete(client);
      }
    }
    super.onClose(client);
  }

  close() {
    this.channels.clear();
    this.rpcs.clear();
    super.close();
  }

  sendError(client, msg) {
    this.sendJson(client, {action: 'error', msg});
    return false;
  }

  sendRpcError(client, id, name, response) {
    this.sendRpc(client, id, name, response, 'error');
    return false;
  }

  sendRpcSuccess(client, id, name, response) {
    this.sendRpc(client, id, name, response);
    return true;
  }

  sendRpc(client, id, name, response, type = 'success') {
    this.sendJson(client, {action: 'rpc', id, name, type, response});
  }

  sendSubError(client, id, chan, response) {
    this.sendSubConfirm(client, id, chan, response, 'error');
    return false;
  }

  sendSubSuccess(client, id, chan, response) {
    this.sendSubConfirm(client, id, chan, response);
    return true;
  }

  sendSubConfirm(client, id, chan, response, type = 'success') {
    this.sendJson(client, {action: 'sub', id, chan, type, response});
  }

  sendUnsubError(client, id, chan, response) {
    this.sendUnsubConfirm(client, id, chan, response, 'error');
    return false;
  }

  sendUnsubSuccess(client, id, chan, response) {
    this.sendUnsubConfirm(client, id, chan, response);
    return true;
  }

  sendUnsubConfirm(client, id, chan, response, type = 'success') {
    this.sendJson(client, {action: 'unsub', id, chan, type, response});
  }

  sendPubError(client, id, chan, response) {
    this.sendPubConfirm(client, id, chan, response, 'error');
    return false;
  }

  sendPubSuccess(client, id, chan, response) {
    this.sendPubConfirm(client, id, chan, response);
    return true;
  }

  sendPubConfirm(client, id, chan, response, type = 'success') {
    this.sendJson(client, {action: 'pub-confirm', id, chan, type, response});
  }

  sendAuthFailed(client) {
    this.sendJson(client, {action: 'auth-failed'});
  }

  sendAuthSuccess(client) {
    this.sendJson(client, {
      action: 'auth-success',
      id: this.clients.get(client)?.id ?? null,
    });
  }

  sendCmd(client, cmd, data = {}) {
    this.sendJson(client, {action: 'cmd', cmd, data});
  }

  broadcastCmd(cmd, data = {}) {
    const message = JSON.stringify({action: 'cmd', cmd, data});
    this.broadcast(message);
  }

  broadcastOthersCmd(client, cmd, data = {}) {
    const message = JSON.stringify({action: 'cmd', cmd, data});
    this.broadcastOthers(client, message);
  }

  sendJson(client, data) {
    this.send(client, JSON.stringify(data));
  }

}