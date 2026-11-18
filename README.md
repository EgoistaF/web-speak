# Видеособеседование 1 на 1 (WebRTC + TypeScript)

## Локально
```bash
npm install
npm run dev
```
Открыть адрес из консоли в двух окнах браузера и в каждом нажать «Начать звонок».

## Деплой на GitHub Pages
1. Залить репозиторий на GitHub (ветка `main`).
2. Settings → Pages → Source: **GitHub Actions**.
3. Workflow `.github/workflows/deploy.yml` сам соберёт и опубликует `dist/`.
