import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiPort = env.VITE_API_PORT || '4000'
  return {
    server: {
      port: 5173,
      proxy: {
        '/api': `http://localhost:${apiPort}`
      }
    }
  }
})
