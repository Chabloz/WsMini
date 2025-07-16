import { config, use } from 'chai';
import sinonChai from 'sinon-chai';

config.truncateThreshold = 0;
config.includeStack = true;

use(sinonChai);

process.on('unhandledRejection', (err) => {
  console.error('Unhandled promise rejection:', err);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  process.exit(1);
});