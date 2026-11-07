import { expect } from 'chai';
import sinon from 'sinon';
import { EventEmitter, once } from 'node:events';
import WebSocket from 'ws';
import { atob } from 'node:buffer';
import { TextEncoder, TextDecoder } from 'node:util';
import WSServer from '../../src/websocket/WSServer.mjs';
import WSServerPubSub from '../../src/websocket/WSServerPubSub.mjs';
import WSServerRoomManager from '../../src/websocket/WSServerRoomManager.mjs';

function mockClient() {
  return Object.assign(new EventEmitter(), {
    readyState: WebSocket.OPEN,
    bufferedAmount: 0,
    send: sinon.spy(), close: sinon.spy(), terminate: sinon.spy(), ping: sinon.spy(),
  });
}

describe('WSServer security regressions', () => {
  let server;
  const sockets = [];
  let sandbox;
  beforeEach(() => {
    sandbox = sinon.createSandbox();
    sandbox.stub(global, 'atob').value(atob);
    sandbox.stub(global, 'TextEncoder').value(TextEncoder);
    sandbox.stub(global, 'TextDecoder').value(TextDecoder);
  });
  afterEach(() => {
    for (const socket of sockets.splice(0)) socket.terminate();
    server?.close();
    sandbox.restore();
  });

  for (const value of [undefined, null, true, 1, 'user', [], new Date()]) {
    it(`rejects invalid authentication metadata (${String(value)})`, () => {
      server = new WSServer({ logLevel: 'none', authCallback: () => value });
      const client = mockClient();
      expect(server.onConnection(client, { headers: {} })).to.equal(false);
      expect(server.clients.size).to.equal(0);
      expect(client.close).to.have.been.calledOnce;
      expect(() => client.emit('error', new Error('socket error'))).not.to.throw();
    });
  }

  for (const callback of [async () => false, async () => ({}), async () => { throw new Error('denied'); }]) {
    it('rejects async authentication callbacks and consumes promise rejections', async () => {
      server = new WSServer({ logLevel: 'none', authCallback: callback });
      const client = mockClient();
      expect(server.onConnection(client, { headers: {} })).to.equal(false);
      expect(server.clients.size).to.equal(0);
      await new Promise(resolve => setImmediate(resolve));
    });
  }

  it('rejects malformed base64 without invoking authentication or throwing', () => {
    const authCallback = sinon.spy(() => ({}));
    server = new WSServer({ logLevel: 'none', authCallback });
    const client = mockClient();
    expect(server.onConnection(client, { headers: { 'sec-websocket-protocol': 'wsmini, !' } })).to.equal(false);
    expect(authCallback).not.to.have.been.called;
    expect(client.close).to.have.been.calledOnce;
  });

  it('accepts plain authentication metadata including a null prototype', () => {
    server = new WSServer({ logLevel: 'none', authCallback: () => Object.assign(Object.create(null), { role: 'user' }) });
    const client = mockClient();
    server.onConnection(client, { headers: {} });
    expect(server.clients.get(client)).to.include({ role: 'user' });
    expect(server.clients.get(client).id).to.be.a('string');
  });

  for (const Server of [WSServer, WSServerPubSub]) {
    it(`${Server.name} counts incoming UTF-8 bytes before decoding`, () => {
      server = new Server({ logLevel: 'none', maxInputSize: 3 });
      const client = mockClient();
      server.onMessage(client, Buffer.from('éé'));
      expect(client.close).to.have.been.calledWith(1009, 'Message too large');
      expect(client.send).not.to.have.been.called;
    });
  }

  for (const maxPayload of [undefined, 0, 1000, 32]) {
    it(`caps transport payload size when maxPayload is ${maxPayload}`, () => {
      server = new WSServer({ logLevel: 'none', maxInputSize: 64 });
      server.start({ noServer: true, maxPayload });
      expect(server.server.options.maxPayload).to.equal(maxPayload === 32 ? 32 : 64);
    });
  }

  for (const Server of [WSServer, WSServerPubSub, WSServerRoomManager]) {
    it(`${Server.name} bounds outgoing queues and still delivers to healthy clients`, () => {
      server = new Server({ logLevel: 'none', maxBufferedAmount: 10 });
      const slow = mockClient();
      const healthy = mockClient();
      slow.bufferedAmount = 8;
      server.createClientMetadata(slow, {});
      server.createClientMetadata(healthy, {});
      server.broadcast('éé');
      expect(slow.terminate).to.have.been.calledOnce;
      expect(slow.send).not.to.have.been.called;
      expect(healthy.send).to.have.been.calledWith('éé');
    });
  }

  it('rejects null and non-object JSON messages without throwing', () => {
    server = new WSServerPubSub({ logLevel: 'none' });
    const client = mockClient();
    for (const message of ['null', 'true', '42', '"text"', '[]']) {
      expect(() => server.onMessage(client, Buffer.from(message))).not.to.throw();
    }
    expect(client.send.callCount).to.equal(5);
  });

  async function connect() {
    const socket = new WebSocket(`ws://127.0.0.1:${server.server.address().port}`);
    sockets.push(socket);
    await once(socket, 'message');
    return socket;
  }

  it('rejects oversized fragmented messages at transport level', async () => {
    server = new WSServer({ port: 0, logLevel: 'none', maxInputSize: 64 });
    server.start({ host: '127.0.0.1', maxPayload: 0 });
    await once(server.server, 'listening');
    const socket = await connect();
    const onMessage = sinon.spy(server, 'onMessage');
    const closed = once(socket, 'close');
    socket.send('é'.repeat(20), { fin: false });
    socket.send('é'.repeat(20), { fin: true });
    const [code] = await closed;
    expect(code).to.equal(1009);
    expect(onMessage).not.to.have.been.called;
  });

  it('preserves client metadata for unsubscribe hooks after a heartbeat timeout', async () => {
    server = new WSServerPubSub({ port: 0, logLevel: 'none' });
    let resolveDeparture;
    const departure = new Promise(resolve => { resolveDeparture = resolve; });
    const hookUnsub = sinon.spy(metadata => resolveDeparture(metadata));
    server.addChannel('speech', { hookUnsub });
    server.start({ host: '127.0.0.1' });
    await once(server.server, 'listening');
    const socket = await connect();
    const subscribed = once(socket, 'message');
    socket.send(JSON.stringify({ action: 'sub', chan: 'speech', id: 1 }));
    await subscribed;
    const [connection, metadata] = [...server.clients.entries()][0];
    connection.isAlive = false;
    const closed = once(socket, 'close');
    server.pingManagement();
    expect((await departure).id).to.equal(metadata.id);
    await closed;
    expect(hookUnsub).to.have.been.calledOnce;
    expect(server.clients.size).to.equal(0);
    expect(server.getChannel('speech').clients.size).to.equal(0);
  });
});
