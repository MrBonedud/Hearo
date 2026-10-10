import { mergeConfig } from 'vite';
import appConfig from '../vite.config';

// Test-only equivalent of the shared preview router: browser requests retain
// their real /api path, upload body, and response envelope.
export default mergeConfig(appConfig, {
  server: {
    proxy: { '/api': { target: 'http://127.0.0.1:4175' } },
  },
});
