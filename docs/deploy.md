# 배포 (GitHub Pages)

- 빌드 결과는 정적 파일(`dist/`)이고 `vite.config.ts`의 `base: './'` 덕분에 어떤 하위 경로에서도 동작한다.
- `.github/workflows/deploy.yml`: `main`에 push하면 GitHub Actions가 `npm ci && npm run build` 후 Pages로 배포한다.

처음 한 번:
1. GitHub에 공개 저장소를 만들고 이 폴더를 push한다.
2. 저장소 Settings → Pages → Source를 "GitHub Actions"로 둔다 (`gh api`로도 설정 가능).
3. 주소: https://madplayer-inc.github.io/blackhole-simulator/

- 조직 요금제가 Free이면 Pages는 공개 저장소에서만 쓸 수 있다.
- 공유 미리보기 이미지(`og:image`)와 `og:url`은 위 주소의 절대 경로로 `index.html`에 적혀 있다. 저장소 이름이나 주소가 바뀌면 함께 고친다.
