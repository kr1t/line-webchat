import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  it('returns ok', () => {
    expect(new HealthController().check()).toEqual({ status: 'ok' });
  });
});
