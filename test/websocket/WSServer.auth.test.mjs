import { expect } from 'chai';
import sinon from 'sinon';
import { EventEmitter, once } from 'node:events';
import WebSocket from 'ws';
import WSServer from '../../src/websocket/WSServer.mjs';
import WSServerPubSub from '../../src/websocket/WSServerPubSub.mjs';
import WSServerRoomManager from '../../src/websocket/WSServerRoomManager.mjs';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function mockClient() {
  return Object.assign(new EventEmitter(), {
    readyState: WebSocket.OPEN, bufferedAmount: 0,
    send: sinon.spy(), close: sinon.spy(), terminate: sinon.spy(),
  });
}

describe('Asynchronous authentication', () => {
  let server, sandbox;
  const sockets = [];
  beforeEach(() => { sandbox = sinon.createSandbox(); });
  afterEach(() => {
    sockets.splice(0).forEach(socket => socket.terminate());
    server?.close();
    sandbox.restore();
  });

  for (const Server of [WSServer, WSServerPubSub, WSServerRoomManager]) {
    it(`${Server.name} accepts async metadata and forwards the timeout option`, async () => {
      server = new Server({ logLevel: 'none', authTimeout: 1234, authCallback: async () => ({ role: 'reader' }) });
      const client = mockClient();
      await server.onConnection(client, { headers: {} });
      expect(server.authTimeout).to.equal(1234);
      expect(server.clients.get(client)).to.include({ role: 'reader' });
      expect(JSON.parse(client.send.firstCall.args[0]).action).to.equal('auth-success');
      expect(server.pendingAuth.size).to.equal(0);
    });
  }

  for (const value of [null, undefined, true, []]) {
    it(`rejects invalid resolved metadata (${String(value)})`, async () => {
      server = new WSServer({ logLevel: 'none', authCallback: async () => value });
      const client = mockClient();
      expect(await server.onConnection(client, { headers: {} })).to.equal(false);
      expect(client.close).to.have.been.calledOnce;
      expect(server.clients.size).to.equal(0);
    });
  }

  it('ignores messages until authentication completes and cleans up listeners', async () => {
    const auth = deferred();
    server = new WSServer({ logLevel: 'none', authCallback: () => auth.promise });
    const client = mockClient();
    const onMessage = sandbox.spy(server, 'onMessage');
    const connecting = server.onConnection(client, { headers: {} });
    client.emit('message', Buffer.from('before authentication'));
    expect(onMessage).not.to.have.been.called;
    expect(client.send).not.to.have.been.called;
    auth.resolve({});
    await connecting;
    client.emit('message', Buffer.from('after authentication'));
    expect(onMessage).to.have.been.calledOnce;
    expect(client.listenerCount('close')).to.equal(1);
    expect(server.pendingAuth.size).to.equal(0);
  });

  for (const lateOutcome of ['resolve', 'reject']) {
    it(`times out and safely handles a late ${lateOutcome}`, async () => {
      const clock = sandbox.useFakeTimers();
      const auth = deferred();
      server = new WSServer({ logLevel: 'none', authTimeout: 50, authCallback: () => auth.promise });
      const client = mockClient();
      const connecting = server.onConnection(client, { headers: {} });
      await clock.tickAsync(50);
      expect(await connecting).to.equal(false);
      expect(client.terminate).to.have.been.calledOnce;
      expect(server.pendingAuth.size).to.equal(0);
      expect(client.listenerCount('close')).to.equal(0);
      auth[lateOutcome](lateOutcome === 'resolve' ? {} : new Error('late failure'));
      await clock.tickAsync(0);
      expect(server.clients.size).to.equal(0);
      expect(client.send).to.have.been.calledOnce;
      expect(JSON.parse(client.send.firstCall.args[0]).action).to.equal('auth-failed');
      expect(clock.countTimers()).to.equal(0);
    });
  }

  it('cancels a pending authentication on client disconnection', async () => {
    const auth = deferred();
    server = new WSServer({ logLevel: 'none', authCallback: () => auth.promise });
    const client = mockClient();
    const connecting = server.onConnection(client, { headers: {} });
    client.readyState = WebSocket.CLOSED;
    client.emit('close');
    expect(await connecting).to.equal(false);
    auth.resolve({ role: 'reader' });
    await Promise.resolve();
    expect(server.clients.size).to.equal(0);
    expect(server.pendingAuth.size).to.equal(0);
    expect(client.send).not.to.have.been.called;
  });

  it('cancels pending sockets on shutdown and prevents late authentication', async () => {
    const auth = deferred();
    server = new WSServer({ logLevel: 'none', authCallback: () => auth.promise });
    server.start({ noServer: true });
    const client = mockClient();
    const connecting = server.onConnection(client, { headers: {} });
    server.close();
    // Simulate restarting before the old callback returns.
    server.start({ noServer: true });
    auth.resolve({});
    expect(await connecting).to.equal(false);
    expect(client.terminate).to.have.been.calledOnce;
    expect(client.send).not.to.have.been.called;
    expect(server.clients.size).to.equal(0);
    expect(server.pendingAuth.size).to.equal(0);
  });

  it('handles unexpected onConnection promise rejections from the event listener', async () => {
    server = new WSServer({ logLevel: 'none' });
    server.start({ noServer: true });
    sandbox.stub(server, 'onConnection').rejects(new Error('unexpected failure'));
    const client = mockClient();
    server.server.emit('connection', client, { headers: {} });
    await new Promise(resolve => setImmediate(resolve));
    expect(client.terminate).to.have.been.calledOnce;
  });

  it('keeps actual WebSocket requests inactive until async authentication succeeds', async () => {
    const auth = deferred();
    server = new WSServerPubSub({ port: 0, logLevel: 'none', authCallback: () => auth.promise });
    const rpc = sinon.spy(() => 'ok');
    server.addRpc('secret', rpc);
    server.start({ host: '127.0.0.1' });
    await once(server.server, 'listening');
    const connected = once(server.server, 'connection');
    const socket = new WebSocket(`ws://127.0.0.1:${server.server.address().port}`);
    sockets.push(socket);
    const authenticated = once(socket, 'message');
    await once(socket, 'open');
    const [connection] = await connected;
    const received = once(connection, 'message');
    socket.send(JSON.stringify({ action: 'rpc', name: 'secret', data: null, id: 1 }));
    await received;
    expect(rpc).not.to.have.been.called;
    auth.resolve({ role: 'reader' });
    expect(JSON.parse((await authenticated)[0]).action).to.equal('auth-success');
    const response = once(socket, 'message');
    socket.send(JSON.stringify({ action: 'rpc', name: 'secret', data: null, id: 2 }));
    expect(JSON.parse((await response)[0])).to.include({ action: 'rpc', id: 2, type: 'success', response: 'ok' });
    expect(rpc).to.have.been.calledOnce;
    expect(server.clients.get(connection).role).to.equal('reader');
  });

  for (const authTimeout of [0, -1, Infinity, 1.5, 2147483648]) {
    it(`rejects an invalid authentication timeout (${authTimeout})`, () => {
      expect(() => new WSServer({ authTimeout })).to.throw('authTimeout');
    });
  }
});
