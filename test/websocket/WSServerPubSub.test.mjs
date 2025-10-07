import { expect } from 'chai';
import sinon from 'sinon';
import WSServerPubSub from '../../src/websocket/WSServerPubSub.mjs';
import WSServerError from '../../src/websocket/WSServerError.mjs';
import { createMockClient } from '../helpers/testUtils.mjs';

describe('WSServerPubSub', () => {
  let server;
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    server = new WSServerPubSub({ logLevel: 'none' });
  });

  afterEach(() => {
    if (server) {
      server.close();
    }
    sandbox.restore();
  });

  describe('Constructor', () => {
    it('should create WSServerPubSub with default options', () => {
      server = new WSServerPubSub();

      expect(server.channels).to.be.instanceOf(Map);
      expect(server.rpcs).to.be.instanceOf(Map);
      expect(server.actionsRpc).to.deep.equal(['rpc']);
      expect(server.actionsPubSub).to.deep.equal(['sub', 'pub', 'pub-simple', 'unsub']);
    });

    it('should inherit from WSServer', () => {
      expect(server.clients).to.be.instanceOf(Map);
      expect(server.server).to.be.null;
    });
  });

  describe('Channel Management', () => {
    describe('addChannel', () => {
      it('should add a channel with default options', () => {
        const result = server.addChannel('test-channel');

        expect(result).to.be.true;
        expect(server.channels.has('test-channel')).to.be.true;

        const channel = server.channels.get('test-channel');
        expect(channel.usersCanPub).to.be.true;
        expect(channel.usersCanSub).to.be.true;
        expect(channel.clients).to.be.instanceOf(Set);
      });

      it('should add a channel with custom options', () => {
        const hookPub = (msg) => ({ ...msg, modified: true });
        const hookPubPost = () => null;
        const hookSub = () => true;
        const hookSubPost = () => null;
        const hookUnsub = () => null;
        const hookUnsubPost = () => null;

        const result = server.addChannel('custom-channel', {
          usersCanPub: false,
          usersCanSub: false,
          hookPub,
          hookPubPost,
          hookSub,
          hookSubPost,
          hookUnsub,
          hookUnsubPost
        });

        expect(result).to.be.true;

        const channel = server.channels.get('custom-channel');
        expect(channel.usersCanPub).to.be.false;
        expect(channel.usersCanSub).to.be.false;
        expect(channel.hookPub).to.equal(hookPub);
        expect(channel.hookPubPost).to.equal(hookPubPost);
        expect(channel.hookSub).to.equal(hookSub);
        expect(channel.hookSubPost).to.equal(hookSubPost);
        expect(channel.hookUnsub).to.equal(hookUnsub);
        expect(channel.hookUnsubPost).to.equal(hookUnsubPost);
      });

      it('should return false for duplicate channel', () => {
        server.addChannel('duplicate-channel');
        const result = server.addChannel('duplicate-channel');

        expect(result).to.be.false;
      });
    });

    describe('hasChannel', () => {
      it('should return true for existing channel', () => {
        server.addChannel('existing-channel');

        expect(server.hasChannel('existing-channel')).to.be.true;
      });

      it('should return false for non-existing channel', () => {
        expect(server.hasChannel('non-existing')).to.be.false;
      });
    });

    describe('getChannel', () => {
      it('should return channel object for existing channel', () => {
        server.addChannel('test-channel', {
          usersCanPub: false,
          usersCanSub: true
        });

        const channel = server.getChannel('test-channel');

        expect(channel).to.not.be.null;
        expect(channel.usersCanPub).to.be.false;
        expect(channel.usersCanSub).to.be.true;
        expect(channel.clients).to.be.instanceOf(Set);
      });

      it('should return null for non-existing channel', () => {
        const channel = server.getChannel('non-existing');

        expect(channel).to.be.null;
      });
    });

    describe('getChannelClients', () => {
      it('should return array of clients for existing channel', () => {
        server.addChannel('test-channel');
        const client1 = createMockClient();
        const client2 = createMockClient();

        const channel = server.channels.get('test-channel');
        channel.clients.add(client1);
        channel.clients.add(client2);

        const clients = server.getChannelClients('test-channel');

        expect(clients).to.be.an('array');
        expect(clients).to.have.length(2);
        expect(clients).to.include(client1);
        expect(clients).to.include(client2);
      });

      it('should return empty array for channel with no clients', () => {
        server.addChannel('empty-channel');

        const clients = server.getChannelClients('empty-channel');

        expect(clients).to.be.an('array');
        expect(clients).to.have.length(0);
      });

      it('should return null for non-existing channel', () => {
        const clients = server.getChannelClients('non-existing');

        expect(clients).to.be.null;
      });
    });

    describe('getChannelClientsData', () => {
      it('should return array of client metadata for existing channel', () => {
        server.addChannel('test-channel');
        const client1 = createMockClient();
        const client2 = createMockClient();
        const clientMeta1 = { id: 'client1', role: 'admin' };
        const clientMeta2 = { id: 'client2', role: 'user' };

        server.clients.set(client1, clientMeta1);
        server.clients.set(client2, clientMeta2);

        const channel = server.channels.get('test-channel');
        channel.clients.add(client1);
        channel.clients.add(client2);

        const clientsData = server.getChannelClientsData('test-channel');

        expect(clientsData).to.be.an('array');
        expect(clientsData).to.have.length(2);
        expect(clientsData).to.include(clientMeta1);
        expect(clientsData).to.include(clientMeta2);
      });

      it('should return empty array for channel with no clients', () => {
        server.addChannel('empty-channel');

        const clientsData = server.getChannelClientsData('empty-channel');

        expect(clientsData).to.be.an('array');
        expect(clientsData).to.have.length(0);
      });

      it('should filter out clients without metadata', () => {
        server.addChannel('test-channel');
        const client1 = createMockClient();
        const client2 = createMockClient();
        const clientMeta1 = { id: 'client1', role: 'admin' };

        server.clients.set(client1, clientMeta1);
        // client2 has no metadata

        const channel = server.channels.get('test-channel');
        channel.clients.add(client1);
        channel.clients.add(client2);

        const clientsData = server.getChannelClientsData('test-channel');

        expect(clientsData).to.be.an('array');
        expect(clientsData).to.have.length(1);
        expect(clientsData).to.include(clientMeta1);
      });

      it('should return null for non-existing channel', () => {
        const clientsData = server.getChannelClientsData('non-existing');

        expect(clientsData).to.be.null;
      });
    });

    describe('removeChannel', () => {
      it('should remove existing channel', () => {
        server.addChannel('removable-channel');

        const result = server.removeChannel('removable-channel');

        expect(result).to.be.true;
        expect(server.channels.has('removable-channel')).to.be.false;
      });

      it('should call hookUnsub for all clients when removing channel', () => {
        const hookUnsub = sandbox.spy();
        server.addChannel('hooked-channel', { hookUnsub });

        const client = createMockClient();
        const clientMeta = { id: 'test-client' };
        server.clients.set(client, clientMeta);

        const channel = server.channels.get('hooked-channel');
        channel.clients.add(client);

        server.removeChannel('hooked-channel');

        expect(hookUnsub).to.have.been.calledWith(clientMeta, server);
      });

      it('should return false for non-existing channel', () => {
        const result = server.removeChannel('non-existing');

        expect(result).to.be.false;
      });
    });
  });

  describe('RPC Management', () => {
    describe('addRpc', () => {
      it('should add RPC endpoint', () => {
        const callback = (data) => `Hello ${data.name}`;
        const result = server.addRpc('test-rpc', callback);

        expect(result).to.be.true;
        expect(server.rpcs.has('test-rpc')).to.be.true;
        expect(server.rpcs.get('test-rpc')).to.equal(callback);
      });

      it('should return false for duplicate RPC', () => {
        const callback = () => 'test';
        server.addRpc('duplicate-rpc', callback);

        const result = server.addRpc('duplicate-rpc', callback);

        expect(result).to.be.false;
      });
    });

    describe('removeRpc', () => {
      it('should remove existing RPC', () => {
        server.addRpc('removable-rpc', () => 'test');

        const result = server.removeRpc('removable-rpc');

        expect(result).to.be.true;
        expect(server.rpcs.has('removable-rpc')).to.be.false;
      });

      it('should return false for non-existing RPC', () => {
        const result = server.removeRpc('non-existing');

        expect(result).to.be.false;
      });
    });
  });

  describe('Action Validation', () => {
    it('should validate PubSub actions', () => {
      expect(server.isActionValid('sub')).to.be.true;
      expect(server.isActionValid('pub')).to.be.true;
      expect(server.isActionValid('pub-simple')).to.be.true;
      expect(server.isActionValid('unsub')).to.be.true;
    });

    it('should validate RPC actions', () => {
      expect(server.isActionValid('rpc')).to.be.true;
    });

    it('should return false for invalid actions', () => {
      expect(server.isActionValid('invalid-action')).to.be.false;
    });
  });

  describe('Message Processing', () => {
    it('should process subscription messages', () => {
      server.addChannel('test-channel');
      const client = createMockClient();
      server.clients.set(client, { id: 'test-client' });

      const message = JSON.stringify({
        action: 'sub',
        chan: 'test-channel',
        id: 1
      });

      const result = server.onMessage(client, Buffer.from(message));

      expect(result).to.be.true;
      expect(server.channels.get('test-channel').clients.has(client)).to.be.true;
    });

    it('should process publication messages', () => {
      server.addChannel('test-channel');
      const client = createMockClient();
      server.clients.set(client, { id: 'test-client' });

      // Subscribe client first
      const channel = server.channels.get('test-channel');
      channel.clients.add(client);

      const message = JSON.stringify({
        action: 'pub',
        chan: 'test-channel',
        msg: 'Hello World',
        id: 1
      });

      const result = server.onMessage(client, Buffer.from(message));

      expect(result).to.be.true;
      expect(client.send).to.have.been.called;
    });

    it('should process RPC messages', () => {
      server.addRpc('test-rpc', (data) => `Hello ${data.name}`);
      const client = createMockClient();
      server.clients.set(client, { id: 'test-client' });

      const message = JSON.stringify({
        action: 'rpc',
        name: 'test-rpc',
        data: { name: 'World' },
        id: 1
      });

      const result = server.onMessage(client, Buffer.from(message));

      expect(result).to.be.true;
      expect(client.send).to.have.been.called;
    });

    it('should handle invalid JSON messages', () => {
      const client = createMockClient();
      server.clients.set(client, { id: 'test-client' });

      const result = server.onMessage(client, Buffer.from('invalid json'));

      expect(result).to.be.false;
      expect(client.send).to.have.been.calledWith(
        JSON.stringify({
          action: 'error',
          msg: 'Invalid data'
        })
      );
    });
  });

  describe('Client Cleanup', () => {
    it('should remove client from all channels on disconnect', () => {
      server.addChannel('channel1');
      server.addChannel('channel2');

      const client = createMockClient();
      const clientMeta = { id: 'test-client' };
      server.clients.set(client, clientMeta);

      // Subscribe to both channels
      const channel1 = server.channels.get('channel1');
      const channel2 = server.channels.get('channel2');
      channel1.clients.add(client);
      channel2.clients.add(client);

      server.onClose(client);

      expect(channel1.clients.has(client)).to.be.false;
      expect(channel2.clients.has(client)).to.be.false;
    });

    it('should call hookUnsub for each channel on disconnect', () => {
      const hookUnsub1 = sandbox.spy();
      const hookUnsub2 = sandbox.spy();

      server.addChannel('channel1', { hookUnsub: hookUnsub1 });
      server.addChannel('channel2', { hookUnsub: hookUnsub2 });

      const client = createMockClient();
      const clientMeta = { id: 'test-client' };
      server.clients.set(client, clientMeta);

      // Subscribe to both channels
      const channel1 = server.channels.get('channel1');
      const channel2 = server.channels.get('channel2');
      channel1.clients.add(client);
      channel2.clients.add(client);

      server.onClose(client);

      expect(hookUnsub1).to.have.been.calledWith(clientMeta, server);
      expect(hookUnsub2).to.have.been.calledWith(clientMeta, server);
    });
  });

  describe('Publishing Methods', () => {
    it('should publish to channel using pub method', () => {
      server.addChannel('test-channel');
      const client = createMockClient();
      server.clients.set(client, { id: 'test-client' });

      const channel = server.channels.get('test-channel');
      channel.clients.add(client);

      const result = server.pub('test-channel', 'Hello World');

      expect(result).to.be.true;
      expect(client.send).to.have.been.calledWith(
        JSON.stringify({
          action: 'pub',
          chan: 'test-channel',
          msg: 'Hello World'
        })
      );
    });

    it('should return false for non-existing channel', () => {
      const result = server.pub('non-existing', 'Hello World');

      expect(result).to.be.false;
    });
  });

  describe('Authentication Methods', () => {
    it('should send auth failed message', () => {
      const client = createMockClient();

      server.sendAuthFailed(client);

      expect(client.send).to.have.been.calledWith(
        JSON.stringify({ action: 'auth-failed' })
      );
    });

    it('should send auth success message', () => {
      const client = createMockClient();
      server.clients.set(client, { id: 'client-id' });

      server.sendAuthSuccess(client);

      expect(client.send).to.have.been.calledWith(
        JSON.stringify({ action: 'auth-success', id: 'client-id' })
      );
    });
  });

  describe('Command Methods', () => {
    it('should send command to specific client', () => {
      const client = createMockClient();

      server.sendCmd(client, 'test-command', { value: 123 });

      expect(client.send).to.have.been.calledWith(
        JSON.stringify({ action: 'cmd', cmd: 'test-command', data: { value: 123 } })
      );
    });

    it('should send command to specific client with empty data', () => {
      const client = createMockClient();

      server.sendCmd(client, 'test-command');

      expect(client.send).to.have.been.calledWith(
        JSON.stringify({ action: 'cmd', cmd: 'test-command', data: {} })
      );
    });

    it('should broadcast command to all clients', () => {
      const client1 = createMockClient();
      const client2 = createMockClient();

      server.clients.set(client1, { id: 'client1' });
      server.clients.set(client2, { id: 'client2' });

      // Mock the broadcast method
      const broadcastSpy = sandbox.spy(server, 'broadcast');

      server.broadcastCmd('global-command', { message: 'hello' });

      expect(broadcastSpy).to.have.been.calledWith(
        JSON.stringify({ action: 'cmd', cmd: 'global-command', data: { message: 'hello' } })
      );
    });

    it('should broadcast command to all clients with empty data', () => {
      const broadcastSpy = sandbox.spy(server, 'broadcast');

      server.broadcastCmd('global-command');

      expect(broadcastSpy).to.have.been.calledWith(
        JSON.stringify({ action: 'cmd', cmd: 'global-command', data: {} })
      );
    });

    it('should broadcast command to all clients except sender', () => {
      const client1 = createMockClient();
      const client2 = createMockClient();

      server.clients.set(client1, { id: 'client1' });
      server.clients.set(client2, { id: 'client2' });

      // Mock the broadcastOthers method
      const broadcastOthersSpy = sandbox.spy(server, 'broadcastOthers');

      server.broadcastOthersCmd(client1, 'other-command', { excluded: 'client1' });

      expect(broadcastOthersSpy).to.have.been.calledWith(
        client1,
        JSON.stringify({ action: 'cmd', cmd: 'other-command', data: { excluded: 'client1' } })
      );
    });

    it('should broadcast command to others with empty data', () => {
      const client1 = createMockClient();
      const broadcastOthersSpy = sandbox.spy(server, 'broadcastOthers');

      server.broadcastOthersCmd(client1, 'other-command');

      expect(broadcastOthersSpy).to.have.been.calledWith(
        client1,
        JSON.stringify({ action: 'cmd', cmd: 'other-command', data: {} })
      );
    });
  });

  describe('Pub-Simple Action', () => {
    it('should handle pub-simple action successfully', () => {
      server.addChannel('test-channel');
      const client = createMockClient();
      const subscriber = createMockClient();

      server.clients.set(client, { id: 'publisher' });
      server.clients.set(subscriber, { id: 'subscriber' });

      const channel = server.channels.get('test-channel');
      channel.clients.add(subscriber);

      const message = JSON.stringify({
        action: 'pub-simple',
        chan: 'test-channel',
        msg: 'Simple message'
      });

      const result = server.onMessage(client, Buffer.from(message));

      expect(result).to.be.true;
      expect(subscriber.send).to.have.been.calledWith(
        JSON.stringify({
          action: 'pub',
          chan: 'test-channel',
          msg: 'Simple message'
        })
      );
    });

    it('should return false for pub-simple with non-existing channel', () => {
      const client = createMockClient();
      server.clients.set(client, { id: 'publisher' });

      const message = JSON.stringify({
        action: 'pub-simple',
        chan: 'non-existing',
        msg: 'Simple message'
      });

      const result = server.onMessage(client, Buffer.from(message));

      expect(result).to.be.false;
    });

    it('should return false for pub-simple when users cannot publish', () => {
      server.addChannel('restricted-channel', { usersCanPub: false });
      const client = createMockClient();
      server.clients.set(client, { id: 'publisher' });

      const message = JSON.stringify({
        action: 'pub-simple',
        chan: 'restricted-channel',
        msg: 'Simple message'
      });

      const result = server.onMessage(client, Buffer.from(message));

      expect(result).to.be.false;
    });

    it('should return false for pub-simple when hookPub throws WSServerError', () => {
      const hookPub = sandbox.stub().throws(new WSServerError('Hook error'));
      server.addChannel('error-channel', { hookPub });

      const client = createMockClient();
      server.clients.set(client, { id: 'publisher' });

      const message = JSON.stringify({
        action: 'pub-simple',
        chan: 'error-channel',
        msg: 'Simple message'
      });

      const result = server.onMessage(client, Buffer.from(message));

      expect(result).to.be.false;
    });

    it('should return false and log error for pub-simple when hookPub throws non-WSServerError', () => {
      const hookPub = sandbox.stub().throws(new Error('Generic error'));
      server.addChannel('error-channel', { hookPub });

      const client = createMockClient();
      server.clients.set(client, { id: 'publisher' });

      const logSpy = sandbox.spy(server, 'log');

      const message = JSON.stringify({
        action: 'pub-simple',
        chan: 'error-channel',
        msg: 'Simple message'
      });

      const result = server.onMessage(client, Buffer.from(message));

      expect(result).to.be.false;
      expect(logSpy).to.have.been.calledWith('Error: Generic error', 'error');
    });
  });

  describe('RPC Error Handling', () => {
    it('should handle RPC errors when callback throws WSServerError', () => {
      const rpcCallback = sandbox.stub().throws(new (WSServerError || Error)('RPC error'));
      server.addRpc('error-rpc', rpcCallback);

      const client = createMockClient();
      server.clients.set(client, { id: 'client' });

      const message = JSON.stringify({
        action: 'rpc',
        name: 'error-rpc',
        data: { test: 'data' },
        id: 1
      });

      const result = server.onMessage(client, Buffer.from(message));

      expect(result).to.be.false;
      expect(client.send).to.have.been.calledWith(
        JSON.stringify({
          action: 'rpc',
          id: 1,
          name: 'error-rpc',
          type: 'error',
          response: 'RPC error'
        })
      );
    });

    it('should handle RPC errors when callback throws non-WSServerError', () => {
      const rpcCallback = sandbox.stub().throws(new Error('Generic RPC error'));
      server.addRpc('error-rpc', rpcCallback);

      const client = createMockClient();
      server.clients.set(client, { id: 'client' });

      const logSpy = sandbox.spy(server, 'log');

      const message = JSON.stringify({
        action: 'rpc',
        name: 'error-rpc',
        data: { test: 'data' },
        id: 1
      });

      const result = server.onMessage(client, Buffer.from(message));

      expect(result).to.be.false;
      expect(logSpy).to.have.been.calledWith('Error: Generic RPC error', 'error');
      expect(client.send).to.have.been.calledWith(
        JSON.stringify({
          action: 'rpc',
          id: 1,
          name: 'error-rpc',
          type: 'error',
          response: 'Server error'
        })
      );
    });

    it('should handle missing RPC data', () => {
      const client = createMockClient();
      server.clients.set(client, { id: 'client' });

      const message = JSON.stringify({
        action: 'rpc',
        name: 'test-rpc',
        id: 1
      });

      const result = server.onMessage(client, Buffer.from(message));

      expect(result).to.be.false;
      expect(client.send).to.have.been.calledWith(
        JSON.stringify({
          action: 'error',
          msg: 'Data is required'
        })
      );
    });

    it('should handle invalid RPC name', () => {
      const client = createMockClient();
      server.clients.set(client, { id: 'client' });

      const message = JSON.stringify({
        action: 'rpc',
        name: 123,
        data: { test: 'data' },
        id: 1
      });

      const result = server.onMessage(client, Buffer.from(message));

      expect(result).to.be.false;
      expect(client.send).to.have.been.calledWith(
        JSON.stringify({
          action: 'error',
          msg: 'Invalid rpc name'
        })
      );
    });

    it('should handle invalid RPC id', () => {
      const client = createMockClient();
      server.clients.set(client, { id: 'client' });

      const message = JSON.stringify({
        action: 'rpc',
        name: 'test-rpc',
        data: { test: 'data' },
        id: 'invalid'
      });

      const result = server.onMessage(client, Buffer.from(message));

      expect(result).to.be.false;
      expect(client.send).to.have.been.calledWith(
        JSON.stringify({
          action: 'error',
          msg: 'Invalid rpc id'
        })
      );
    });
  });

  describe('Pub Action Error Handling', () => {
    it('should handle pub errors when hookPub throws WSServerError', () => {
      const hookPub = sandbox.stub().throws(new (WSServerError || Error)('Pub hook error'));
      server.addChannel('error-channel', { hookPub });

      const client = createMockClient();
      server.clients.set(client, { id: 'publisher' });

      const message = JSON.stringify({
        action: 'pub',
        chan: 'error-channel',
        msg: 'Test message',
        id: 1
      });

      const result = server.onMessage(client, Buffer.from(message));

      expect(result).to.be.false;
      expect(client.send).to.have.been.calledWith(
        JSON.stringify({
          action: 'pub-confirm',
          id: 1,
          chan: 'error-channel',
          type: 'error',
          response: 'Pub hook error'
        })
      );
    });

    it('should handle pub errors when hookPub throws non-WSServerError', () => {
      const hookPub = sandbox.stub().throws(new Error('Generic pub error'));
      server.addChannel('error-channel', { hookPub });

      const client = createMockClient();
      server.clients.set(client, { id: 'publisher' });

      const logSpy = sandbox.spy(server, 'log');

      const message = JSON.stringify({
        action: 'pub',
        chan: 'error-channel',
        msg: 'Test message',
        id: 1
      });

      const result = server.onMessage(client, Buffer.from(message));

      expect(result).to.be.false;
      expect(logSpy).to.have.been.calledWith('Error: Generic pub error', 'error');
      expect(client.send).to.have.been.calledWith(
        JSON.stringify({
          action: 'pub-confirm',
          id: 1,
          chan: 'error-channel',
          type: 'error',
          response: 'Server error'
        })
      );
    });
  });

  describe('Additional Edge Cases', () => {
    it('should handle oversized messages', () => {
      const client = createMockClient();
      server.clients.set(client, { id: 'test-client' });

      const logSpy = sandbox.spy(server, 'log');

      // Create a message larger than maxInputSize
      const largeMessage = 'x'.repeat(server.maxInputSize + 1);

      const result = server.onMessage(client, Buffer.from(largeMessage));

      expect(result).to.be.false;
      expect(logSpy).to.have.been.calledWith(
        'Client test-client sent a message that is too large',
        'warn'
      );
      expect(client.close).to.have.been.called;
    });

    it('should handle invalid channel type in managePubSub', () => {
      const client = createMockClient();
      server.clients.set(client, { id: 'test-client' });

      const message = JSON.stringify({
        action: 'sub',
        chan: 123,
        id: 1
      });

      const result = server.onMessage(client, Buffer.from(message));

      expect(result).to.be.false;
      expect(client.send).to.have.been.calledWith(
        JSON.stringify({
          action: 'error',
          msg: 'Invalid chan'
        })
      );
    });

    it('should handle missing id in managePubSub', () => {
      const client = createMockClient();
      server.clients.set(client, { id: 'test-client' });

      const message = JSON.stringify({
        action: 'sub',
        chan: 'test-channel'
      });

      const result = server.onMessage(client, Buffer.from(message));

      expect(result).to.be.false;
      expect(client.send).to.have.been.calledWith(
        JSON.stringify({
          action: 'error',
          msg: 'Invalid id or id is missing'
        })
      );
    });

    it('should handle unsubscribe from channel client is not subscribed to', () => {
      server.addChannel('test-channel');
      const client = createMockClient();
      server.clients.set(client, { id: 'test-client' });

      const message = JSON.stringify({
        action: 'unsub',
        chan: 'test-channel',
        id: 1
      });

      const result = server.onMessage(client, Buffer.from(message));

      expect(result).to.be.false;
      expect(client.send).to.have.been.calledWith(
        JSON.stringify({
          action: 'unsub',
          id: 1,
          chan: 'test-channel',
          type: 'error',
          response: 'Not subscribed'
        })
      );
    });

    it('should call hookUnsubPost after successful unsubscription', () => {
      const hookUnsubPost = sandbox.stub();
      server.addChannel('hooked-channel', { hookUnsubPost });

      const client = createMockClient();
      const clientData = { id: 'test-client', username: 'testuser' };
      server.clients.set(client, clientData);

      // First subscribe
      const channel = server.channels.get('hooked-channel');
      channel.clients.add(client);

      const message = JSON.stringify({
        action: 'unsub',
        chan: 'hooked-channel',
        id: 1
      });

      const result = server.onMessage(client, Buffer.from(message));

      expect(result).to.be.true;
      expect(hookUnsubPost).to.have.been.calledOnce;
      expect(hookUnsubPost).to.have.been.calledWith(clientData, server);
      expect(client.send).to.have.been.calledWith(
        JSON.stringify({
          action: 'unsub',
          id: 1,
          chan: 'hooked-channel',
          type: 'success',
          response: 'Unsubscribed'
        })
      );
    });

    it('should not call hookUnsubPost when unsubscription fails', () => {
      const hookUnsubPost = sandbox.stub();
      server.addChannel('hooked-channel', { hookUnsubPost });

      const client = createMockClient();
      server.clients.set(client, { id: 'test-client' });

      // Don't subscribe first
      const message = JSON.stringify({
        action: 'unsub',
        chan: 'hooked-channel',
        id: 1
      });

      const result = server.onMessage(client, Buffer.from(message));

      expect(result).to.be.false;
      expect(hookUnsubPost).to.not.have.been.called;
    });

    it('should log error if hookUnsubPost throws but still complete unsubscription', () => {
      const logSpy = sandbox.spy(server, 'log');
      const hookUnsubPost = sandbox.stub().throws(new Error('Post hook error'));
      server.addChannel('hooked-channel', { hookUnsubPost });

      const client = createMockClient();
      server.clients.set(client, { id: 'test-client' });

      // First subscribe
      const channel = server.channels.get('hooked-channel');
      channel.clients.add(client);

      const message = JSON.stringify({
        action: 'unsub',
        chan: 'hooked-channel',
        id: 1
      });

      const result = server.onMessage(client, Buffer.from(message));

      expect(result).to.be.true;
      expect(hookUnsubPost).to.have.been.calledOnce;
      expect(logSpy).to.have.been.calledWith('hookUnsubPost error: Post hook error', 'error');
      // Unsubscription should still succeed
      expect(client.send).to.have.been.calledWith(
        JSON.stringify({
          action: 'unsub',
          id: 1,
          chan: 'hooked-channel',
          type: 'success',
          response: 'Unsubscribed'
        })
      );
      expect(channel.clients.has(client)).to.be.false;
    });

    it('should handle subscribe to channel where usersCanSub is false', () => {
      server.addChannel('restricted-channel', { usersCanSub: false });
      const client = createMockClient();
      server.clients.set(client, { id: 'test-client' });

      const message = JSON.stringify({
        action: 'sub',
        chan: 'restricted-channel',
        id: 1
      });

      const result = server.onMessage(client, Buffer.from(message));

      expect(result).to.be.false;
      expect(client.send).to.have.been.calledWith(
        JSON.stringify({
          action: 'sub',
          id: 1,
          chan: 'restricted-channel',
          type: 'error',
          response: 'Users cannot sub on this chan'
        })
      );
    });

    it('should handle subscribe denied by hookSub', () => {
      const hookSub = sandbox.stub().returns(false);
      server.addChannel('hooked-channel', { hookSub });

      const client = createMockClient();
      server.clients.set(client, { id: 'test-client' });

      const message = JSON.stringify({
        action: 'sub',
        chan: 'hooked-channel',
        id: 1
      });

      const result = server.onMessage(client, Buffer.from(message));

      expect(result).to.be.false;
      expect(client.send).to.have.been.calledWith(
        JSON.stringify({
          action: 'sub',
          id: 1,
          chan: 'hooked-channel',
          type: 'error',
          response: 'Subscription denied'
        })
      );
    });

    it('should call hookSubPost after successful subscription', () => {
      const hookSubPost = sandbox.stub();
      server.addChannel('hooked-channel', { hookSubPost });

      const client = createMockClient();
      const clientData = { id: 'test-client', username: 'testuser' };
      server.clients.set(client, clientData);

      const message = JSON.stringify({
        action: 'sub',
        chan: 'hooked-channel',
        id: 1
      });

      const result = server.onMessage(client, Buffer.from(message));

      expect(result).to.be.true;
      expect(hookSubPost).to.have.been.calledOnce;
      expect(hookSubPost).to.have.been.calledWith(clientData, server);
      expect(client.send).to.have.been.calledWith(
        JSON.stringify({
          action: 'sub',
          id: 1,
          chan: 'hooked-channel',
          type: 'success',
          response: 'Subscribed'
        })
      );
    });

    it('should not call hookSubPost when subscription fails', () => {
      const hookSubPost = sandbox.stub();
      const hookSub = sandbox.stub().returns(false);
      server.addChannel('hooked-channel', { hookSub, hookSubPost });

      const client = createMockClient();
      server.clients.set(client, { id: 'test-client' });

      const message = JSON.stringify({
        action: 'sub',
        chan: 'hooked-channel',
        id: 1
      });

      const result = server.onMessage(client, Buffer.from(message));

      expect(result).to.be.false;
      expect(hookSubPost).to.not.have.been.called;
    });

    it('should log error if hookSubPost throws but still complete subscription', () => {
      const logSpy = sandbox.spy(server, 'log');
      const hookSubPost = sandbox.stub().throws(new Error('Post hook error'));
      server.addChannel('hooked-channel', { hookSubPost });

      const client = createMockClient();
      server.clients.set(client, { id: 'test-client' });

      const message = JSON.stringify({
        action: 'sub',
        chan: 'hooked-channel',
        id: 1
      });

      const result = server.onMessage(client, Buffer.from(message));

      expect(result).to.be.true;
      expect(hookSubPost).to.have.been.calledOnce;
      expect(logSpy).to.have.been.calledWith('hookSubPost error: Post hook error', 'error');
      // Subscription should still succeed
      expect(client.send).to.have.been.calledWith(
        JSON.stringify({
          action: 'sub',
          id: 1,
          chan: 'hooked-channel',
          type: 'success',
          response: 'Subscribed'
        })
      );
      const channel = server.channels.get('hooked-channel');
      expect(channel.clients.has(client)).to.be.true;
    });

    it('should handle publish to channel where usersCanPub is false', () => {
      server.addChannel('restricted-channel', { usersCanPub: false });
      const client = createMockClient();
      server.clients.set(client, { id: 'test-client' });

      const message = JSON.stringify({
        action: 'pub',
        chan: 'restricted-channel',
        msg: 'Test message',
        id: 1
      });

      const result = server.onMessage(client, Buffer.from(message));

      expect(result).to.be.false;
      expect(client.send).to.have.been.calledWith(
        JSON.stringify({
          action: 'pub-confirm',
          id: 1,
          chan: 'restricted-channel',
          type: 'error',
          response: 'Users cannot pub on this chan'
        })
      );
    });

    it('should call hookPubPost after successful publication', () => {
      const hookPubPost = sandbox.stub();
      server.addChannel('hooked-channel', { hookPubPost });

      const client = createMockClient();
      const clientData = { id: 'test-client', username: 'testuser' };
      server.clients.set(client, clientData);

      const testMsg = { content: 'Hello world' };
      const message = JSON.stringify({
        action: 'pub',
        chan: 'hooked-channel',
        msg: testMsg,
        id: 1
      });

      const result = server.onMessage(client, Buffer.from(message));

      expect(result).to.be.true;
      expect(hookPubPost).to.have.been.calledOnce;
      expect(hookPubPost).to.have.been.calledWith(testMsg, clientData, server);
      expect(client.send).to.have.been.calledWith(
        JSON.stringify({
          action: 'pub-confirm',
          id: 1,
          chan: 'hooked-channel',
          type: 'success',
          response: 'Message sent'
        })
      );
    });

    it('should not call hookPubPost when publication fails', () => {
      const hookPubPost = sandbox.stub();
      const hookPub = sandbox.stub().throws(new WSServerError('Validation failed'));
      server.addChannel('hooked-channel', { hookPub, hookPubPost });

      const client = createMockClient();
      server.clients.set(client, { id: 'test-client' });

      const message = JSON.stringify({
        action: 'pub',
        chan: 'hooked-channel',
        msg: 'Test message',
        id: 1
      });

      const result = server.onMessage(client, Buffer.from(message));

      expect(result).to.be.false;
      expect(hookPubPost).to.not.have.been.called;
    });

    it('should log error if hookPubPost throws but still complete publication', () => {
      const logSpy = sandbox.spy(server, 'log');
      const hookPubPost = sandbox.stub().throws(new Error('Post hook error'));
      server.addChannel('hooked-channel', { hookPubPost });

      const client = createMockClient();
      server.clients.set(client, { id: 'test-client' });

      const message = JSON.stringify({
        action: 'pub',
        chan: 'hooked-channel',
        msg: 'Test message',
        id: 1
      });

      const result = server.onMessage(client, Buffer.from(message));

      expect(result).to.be.true;
      expect(hookPubPost).to.have.been.calledOnce;
      expect(logSpy).to.have.been.calledWith('hookPubPost error: Post hook error', 'error');
      // Publication should still succeed
      expect(client.send).to.have.been.calledWith(
        JSON.stringify({
          action: 'pub-confirm',
          id: 1,
          chan: 'hooked-channel',
          type: 'success',
          response: 'Message sent'
        })
      );
    });
  });
});
