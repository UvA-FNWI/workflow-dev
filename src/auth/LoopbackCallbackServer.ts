import { createServer, Server } from 'node:http';
import { SURFCONEXT_REDIRECT_URI } from './OidcClient.js';
import { logger } from '../logger.js';

export class LoopbackCallbackServer {
  private server: Server | undefined;
  private readonly redirectUri = new URL(SURFCONEXT_REDIRECT_URI);

  public start(onCallback: (callbackUrl: URL) => void): Promise<{ dispose(): void }> {
    if (this.server) {
      throw new Error('The SURFconext callback listener is already running.');
    }

    return new Promise((resolve, reject) => {
      let handled = false;
      const server = createServer((request, response) => {
        const callbackUrl = new URL(request.url ?? '/', this.redirectUri);
        if (request.method !== 'GET' || callbackUrl.pathname !== this.redirectUri.pathname) {
          logger.warn('Rejected an unexpected request to the loopback callback listener.');
          response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          response.end('Not found.');
          return;
        }
        if (handled) {
          logger.warn('Rejected a duplicate loopback callback.');
          response.writeHead(409, { 'Content-Type': 'text/plain; charset=utf-8' });
          response.end('This sign-in callback has already been handled.');
          return;
        }

        handled = true;
        logger.info('Received the SURFconext loopback callback.');
        response.writeHead(200, {
          'Cache-Control': 'no-store',
          'Content-Type': 'text/plain; charset=utf-8',
        });
        response.end('Sign-in returned to VS Code. You can close this browser tab.');
        onCallback(callbackUrl);
      });

      const fail = (error: Error): void => {
        logger.error('Could not start the loopback callback listener.');
        this.server = undefined;
        reject(error);
      };
      server.once('error', fail);
      server.listen(this.port(), this.redirectUri.hostname, () => {
        server.off('error', fail);
        server.on('error', () => undefined);
        this.server = server;
        logger.info(`Listening for the SURFconext callback at ${SURFCONEXT_REDIRECT_URI}.`);
        resolve({
          dispose: () => {
            if (this.server === server) {
              this.server = undefined;
            }
            server.close();
            logger.info('Stopped the SURFconext callback listener.');
          },
        });
      });
    });
  }

  private port(): number {
    return this.redirectUri.port ? Number(this.redirectUri.port) : 80;
  }
}
