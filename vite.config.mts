import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// npm run dev: 화면만 띄우고 /api는 배포된 서버로 보냄 (API 키 없이 확인할 때)
// API까지 내 컴퓨터에서 돌리려면 npx vercel dev (이때는 이 설정 대신 Vercel이 /api를 처리)
const apiTarget = process.env.API_PROXY || 'https://before-digging.vercel.app';

export default defineConfig({
    plugins: [react()],
    server: {
        proxy: {
            '/api': { target: apiTarget, changeOrigin: true }
        }
    }
});
