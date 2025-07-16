import { expect } from 'chai';
import sinon from 'sinon';
import WSServerPubSub from '../../src/websocket/WSServerPubSub.mjs';
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
        const hookSub = () => true;
        const hookUnsub = () => null;

        const result = server.addChannel('custom-channel', {
          usersCanPub: false,
          usersCanSub: false,
          hookPub,
          hookSub,
          hookUnsub
        });

        expect(result).to.be.true;

        const channel = server.channels.get('custom-channel');
        expect(channel.usersCanPub).to.be.false;
        expect(channel.usersCanSub).to.be.false;
        expect(channel.hookPub).to.equal(hookPub);
        expect(channel.hookSub).to.equal(hookSub);
        expect(channel.hookUnsub).to.equal(hookUnsub);
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
});
