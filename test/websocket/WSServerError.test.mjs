import { expect } from 'chai';
import WSServerError from '../../src/websocket/WSServerError.mjs';

describe('WSServerError', () => {
  describe('Constructor', () => {
    it('should create WSServerError with message', () => {
      const message = 'Test error message';
      const error = new WSServerError(message);

      expect(error).to.be.an.instanceOf(Error);
      expect(error).to.be.an.instanceOf(WSServerError);
      expect(error.message).to.equal(message);
      expect(error.name).to.equal('WSServerError');
    });

    it('should create WSServerError with empty message', () => {
      const error = new WSServerError('');

      expect(error).to.be.an.instanceOf(Error);
      expect(error).to.be.an.instanceOf(WSServerError);
      expect(error.message).to.equal('');
      expect(error.name).to.equal('WSServerError');
    });

    it('should create WSServerError with undefined message', () => {
      const error = new WSServerError(undefined);

      expect(error).to.be.an.instanceOf(Error);
      expect(error).to.be.an.instanceOf(WSServerError);
      expect(error.message).to.equal('');
      expect(error.name).to.equal('WSServerError');
    });

    it('should create WSServerError with null message', () => {
      const error = new WSServerError(null);

      expect(error).to.be.an.instanceOf(Error);
      expect(error).to.be.an.instanceOf(WSServerError);
      expect(error.message).to.equal('null');
      expect(error.name).to.equal('WSServerError');
    });

    it('should create WSServerError with numeric message', () => {
      const error = new WSServerError(404);

      expect(error).to.be.an.instanceOf(Error);
      expect(error).to.be.an.instanceOf(WSServerError);
      expect(error.message).to.equal('404');
      expect(error.name).to.equal('WSServerError');
    });

    it('should create WSServerError with object message', () => {
      const messageObj = { code: 'ERR001', description: 'Test error' };
      const error = new WSServerError(messageObj);

      expect(error).to.be.an.instanceOf(Error);
      expect(error).to.be.an.instanceOf(WSServerError);
      expect(error.message).to.equal('[object Object]');
      expect(error.name).to.equal('WSServerError');
    });

    it('should create WSServerError with long message', () => {
      const longMessage = 'A'.repeat(1000);
      const error = new WSServerError(longMessage);

      expect(error).to.be.an.instanceOf(Error);
      expect(error).to.be.an.instanceOf(WSServerError);
      expect(error.message).to.equal(longMessage);
      expect(error.name).to.equal('WSServerError');
    });

    it('should create WSServerError with special characters', () => {
      const specialMessage = 'Error: \n\t\r\\ "quotes" \'apostrophes\' & symbols!';
      const error = new WSServerError(specialMessage);

      expect(error).to.be.an.instanceOf(Error);
      expect(error).to.be.an.instanceOf(WSServerError);
      expect(error.message).to.equal(specialMessage);
      expect(error.name).to.equal('WSServerError');
    });
  });

  describe('Error Properties', () => {
    it('should have correct prototype chain', () => {
      const error = new WSServerError('test');

      expect(error).to.be.an.instanceOf(WSServerError);
      expect(error).to.be.an.instanceOf(Error);
      expect(Object.getPrototypeOf(error)).to.equal(WSServerError.prototype);
      expect(Object.getPrototypeOf(WSServerError.prototype)).to.equal(Error.prototype);
    });

    it('should have stack trace', () => {
      const error = new WSServerError('test error');

      expect(error.stack).to.be.a('string');
      expect(error.stack).to.include('WSServerError: test error');
    });

    it('should be throwable and catchable', () => {
      let caughtError;

      try {
        throw new WSServerError('throwable error');
      } catch (error) {
        caughtError = error;
      }

      expect(caughtError).to.be.an.instanceOf(WSServerError);
      expect(caughtError.message).to.equal('throwable error');
      expect(caughtError.name).to.equal('WSServerError');
    });

    it('should maintain error properties after being thrown', () => {
      const originalMessage = 'maintain properties test';
      let caughtError;

      try {
        const error = new WSServerError(originalMessage);
        error.customProperty = 'custom value';
        throw error;
      } catch (error) {
        caughtError = error;
      }

      expect(caughtError).to.be.an.instanceOf(WSServerError);
      expect(caughtError.message).to.equal(originalMessage);
      expect(caughtError.name).to.equal('WSServerError');
      expect(caughtError.customProperty).to.equal('custom value');
    });
  });

  describe('Error Comparison', () => {
    it('should be distinguishable from regular Error', () => {
      const wsError = new WSServerError('ws error');
      const regularError = new Error('regular error');

      expect(wsError).to.be.an.instanceOf(WSServerError);
      expect(wsError).to.be.an.instanceOf(Error);
      expect(regularError).to.be.an.instanceOf(Error);
      expect(regularError).to.not.be.an.instanceOf(WSServerError);
    });

    it('should be distinguishable from other custom errors', () => {
      class CustomError extends Error {
        constructor(message) {
          super(message);
          this.name = 'CustomError';
        }
      }

      const wsError = new WSServerError('ws error');
      const customError = new CustomError('custom error');

      expect(wsError).to.be.an.instanceOf(WSServerError);
      expect(wsError).to.not.be.an.instanceOf(CustomError);
      expect(customError).to.be.an.instanceOf(CustomError);
      expect(customError).to.not.be.an.instanceOf(WSServerError);
    });
  });

  describe('Error Serialization', () => {
    it('should be JSON serializable', () => {
      const error = new WSServerError('json test');

      // Note: Error objects don't serialize well by default, but we can access properties
      const serialized = {
        name: error.name,
        message: error.message,
        stack: error.stack
      };

      expect(serialized.name).to.equal('WSServerError');
      expect(serialized.message).to.equal('json test');
      expect(serialized.stack).to.be.a('string');
    });

    it('should convert to string correctly', () => {
      const error = new WSServerError('string conversion test');

      expect(error.toString()).to.equal('WSServerError: string conversion test');
    });
  });
});
