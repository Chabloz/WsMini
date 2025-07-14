import { WSServerError, WSServerPubSub } from '../../../src/node.js';

const wsServer = new WSServerPubSub({
  port: 8888,
  origins: '*', // Change this to your domain
});

wsServer.addRpc('add', (data) => {
  // Validate the input data
  // You can throw an WSServerError to reject the RPC call
  // It will be sent back to the client and the client will receive it as a rejected promise
  if (typeof data?.n1 != 'number' || isNaN(data?.n1)) {
    throw new WSServerError('n1 must be a number');
  }
  if (typeof data?.n2 != 'number' || isNaN(data?.n2)) {
    throw new WSServerError('n2 must be a number');
  }
  return data.n1 + data.n2;
});

wsServer.start();

// You can also send commands to the clients
// This will send a command 'foo' to all connected clients every 5 seconds
// The clients can listen to this command using wsClient.onCmd('foo', callback)
setInterval(() => wsServer.broadcastCmd('foo', {foo: 'bar'}), 5000);