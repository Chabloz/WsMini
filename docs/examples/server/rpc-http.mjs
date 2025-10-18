import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WSServerError, WSServerPubSub } from '../../../src/node.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
};

const httpServer = http.createServer((req, res) => {
  const routes = {
    '/': '../client/rpc.html',
    '/rpc.js': '../client/rpc.js',
    '/src/browser.js': '../../../src/browser.js'
  };

  // Serve websocket dependencies (event.js, String.mjs, etc.)
  if (req.url.startsWith('/src/websocket/')) {
    routes[req.url] = `../../../src/websocket/${path.basename(req.url)}`;
  }

  const filePath = routes[req.url];
  if (!filePath) {
    res.writeHead(404).end('Not found');
    return;
  }

  fs.readFile(path.join(__dirname, filePath), (err, content) => {
    if (err) {
      res.writeHead(500).end('Error loading file');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
    res.end(content);
  });
});

const wsServer = new WSServerPubSub({ origins: 'localhost' });
wsServer.addRpc('add', (data) => {
  if (typeof data?.n1 != 'number' || isNaN(data?.n1)) throw new WSServerError('n1 must be a number');
  if (typeof data?.n2 != 'number' || isNaN(data?.n2)) throw new WSServerError('n2 must be a number');
  return data.n1 + data.n2;
});

httpServer.listen(8888);
wsServer.start({ server: httpServer });