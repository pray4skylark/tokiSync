import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // 1. GitHub 환경변수에서 레포지토리 이름 자동 추출
  // 예: "user/my-repo" -> "my-repo"
  const repoName = process.env.GITHUB_REPOSITORY 
    ? process.env.GITHUB_REPOSITORY.split('/')[1] 
    : '';

  // 2. 배포 환경에 따른 Base 경로 결정
  let basepath = './'; // 로컬 개발 기본값

  if (process.env.GITHUB_ACTIONS) {
    // GitHub Actions 빌드 시: 
    // Push(Main) 이벤트면 '/레포명/dev/', 그 외(Release 등)면 '/레포명/'
    basepath = process.env.GITHUB_EVENT_NAME === 'push'
      ? `/${repoName}/dev/`
      : `/${repoName}/`;
  }

  return {
    plugins: [vue()],
    
    // index.html 위치 (사용자 설정 유지)
    root: './src/viewer', 
    
    // 계산된 동적 경로 적용
    base: basepath,

    server: {
      port: 3000,
      open: true,
      proxy: {
        // [v1.7.5] 로컬 CORS 이슈 해결을 위한 GAS 프록시 설정
        '/api/gas': {
          target: 'https://script.google.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/gas/, '')
        }
      }
    },

    resolve: {
      alias: {
        // @ 경로를 src/viewer 폴더로 매핑
        '@': path.resolve(__dirname, './src/viewer'),
      },
    },

    build: {
      // 루트 기준 docs 폴더로 빌드 결과물 내보내기
      outDir: '../../docs', 
      emptyOutDir: true,
      assetsDir: 'assets',
      rollupOptions: {
        output: {
          // 캐시 방지를 위해 해시값 없이 고정된 파일명 사용 (사용자 설정 유지)
          entryFileNames: `assets/[name].js`,
          chunkFileNames: `assets/[name].js`,
          assetFileNames: `assets/[name].[ext]`,
        },
      },
    },
  };
});