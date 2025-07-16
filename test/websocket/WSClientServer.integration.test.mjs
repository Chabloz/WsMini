import { expect } from 'chai';
import { JSDOM } from 'jsdom';
import WebSocket from 'ws';
import WSServerRoomManager from '../../src/websocket/WSServerRoomManager.mjs';
import WSClient from '../../src/websocket/WSClient.js';
import WSClientRoom from '../../src/websocket/WSClientRoom.js';

describe('WSClient-WSServer Integration Tests', () => {
    let server;
    let serverPort = 8080;
    let dom;
    let client;
    let clientRoom;

    // Setup browser environment
    before(() => {
        dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
            url: 'http://localhost:8080',
            pretendToBeVisual: true,
            resources: 'usable'
        });
        global.window = dom.window;
        global.document = dom.window.document;
        global.WebSocket = WebSocket;
        global.btoa = (str) => Buffer.from(str).toString('base64');
        global.atob = (str) => Buffer.from(str, 'base64').toString();
        global.TextEncoder = TextEncoder;
        global.TextDecoder = TextDecoder;
    });

    after(() => {
        if (dom) {
            dom.window.close();
        }
        delete global.window;
        delete global.document;
        delete global.WebSocket;
        delete global.btoa;
        delete global.atob;
        delete global.TextEncoder;
        delete global.TextDecoder;
    });

    beforeEach(async () => {
        // Start server (synchronous)
        server = new WSServerRoomManager({ port: serverPort });

        // Add test RPC
        server.addRpc('echo', (data) => data);

        // Add test channel
        server.addChannel('test-channel');

        server.start();

        // Wait for server to be ready
        await new Promise(resolve => setTimeout(resolve, 100));

        // Create client
        client = new WSClient(`ws://localhost:${serverPort}`);
        clientRoom = new WSClientRoom(`ws://localhost:${serverPort}`);

        // Connect client with timeout
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Connection timeout'));
            }, 5000);

            client.on('ws:auth:success', () => {
                clearTimeout(timeout);
                resolve();
            });
            client.on('ws:auth:failed', () => {
                clearTimeout(timeout);
                reject(new Error('Authentication failed'));
            });
            client.on('ws:error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });
            client.connect();
        });

        // Connect clientRoom with timeout
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('ClientRoom connection timeout'));
            }, 5000);

            clientRoom.on('ws:auth:success', () => {
                clearTimeout(timeout);
                resolve();
            });
            clientRoom.on('ws:auth:failed', () => {
                clearTimeout(timeout);
                reject(new Error('ClientRoom authentication failed'));
            });
            clientRoom.on('ws:error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });
            clientRoom.connect();
        });
    });

    afterEach(async () => {
        if (client) {
            client.close();
        }
        if (clientRoom) {
            clientRoom.close();
        }
        if (server) {
            server.close();
        }
        // Give time for cleanup
        await new Promise(resolve => setTimeout(resolve, 50));
    });

    it('should connect client to server', async () => {
        expect(client.wsClient.readyState).to.equal(WebSocket.OPEN);
    });

    it('should create a room', async function() {
        this.timeout(10000);

        const roomId = 'test-room';
        const room = await clientRoom.roomCreate(roomId);
        expect(room.name).to.equal(roomId);
    });

    it('should send and receive messages', async function() {
        this.timeout(10000);

        const roomId = 'test-room';
        const testMessage = 'Hello from client';

        // Create room
        const room = await clientRoom.roomCreate(roomId);

        // Listen for messages
        const messagePromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Message timeout'));
            }, 5000);

            room.onMessage((message) => {
                clearTimeout(timeout);
                expect(message).to.equal(testMessage);
                resolve();
            });
        });

        // Send message
        room.send(testMessage);

        // Wait for message
        await messagePromise;
    });

    it('should handle RPC calls', async function() {
        this.timeout(10000);

        const result = await client.rpc('echo', 'test message');
        expect(result).to.equal('test message');
    });

    it('should handle pub/sub', async function() {
        this.timeout(10000);

        const channel = 'test-channel';
        const message = 'test message';

        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Pub/sub timeout'));
            }, 5000);

            client.sub(channel, (receivedMessage) => {
                clearTimeout(timeout);
                expect(receivedMessage).to.equal(message);
                resolve();
            });

            setTimeout(() => {
                client.pub(channel, message);
            }, 100);
        });
    });
});
