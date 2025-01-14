import WSServerError from '../../websocket/WSServerError.mjs';
import WSServerPubSub from '../../websocket/WSServerPubSub.mjs';

const wsServer = new WSServerPubSub({
  port: 8888,
  origins: '*', // Change this to your domain
});

wsServer.addRpc('add', (data) => {
  if (typeof data?.n1 != 'number' || isNaN(data?.n1)) {
    throw new WSServerError('n1 must be a number');
  }
  if (typeof data?.n2 != 'number' || isNaN(data?.n2)) {
    throw new WSServerError('n2 must be a number');
  }
  return data.n1 + data.n2;
});

wsServer.start();