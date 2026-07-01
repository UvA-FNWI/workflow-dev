const prefix = '[workflow-dev]';

export const logger = {
  info(message: string): void {
    console.log(`${prefix} ${message}`);
  },

  warn(message: string): void {
    console.warn(`${prefix} ${message}`);
  },

  error(message: string, error?: unknown): void {
    console.error(`${prefix} ${message}`, ...(error === undefined ? [] : [error]));
  },
};
