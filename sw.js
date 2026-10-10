// ===== 서비스 워커: 인터넷이 끊겨도 앱이 열리게 해 주는 파일 =====
// 앱 파일을 휴대폰에 복사(캐시)해 두었다가, 인터넷이 안 될 때 꺼내 써요.
// 인터넷이 되면 항상 최신 파일을 먼저 받아 오기 때문에, 앱을 고치면 바로 반영돼요.
// (내 기록 데이터는 IndexedDB에 따로 저장되어 있어서, 이 파일과는 상관없어요)

const CACHE_NAME = 'my-record-v1';

// 처음 설치할 때 미리 저장해 둘 앱 파일들 (새 파일을 만들면 여기에도 추가해요)
const APP_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/db.js',
  './js/backup.js',
  './js/attachments.js',
  './js/storage.js',
  './js/tags.js',
  './js/moments.js',
  './js/periods.js',
  './js/app.js',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// 설치: 앱 파일 미리 저장
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting())
  );
});

// 활성화: 예전 이름의 저장본 정리
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

// 파일 요청: 인터넷에서 먼저 받아 오고(받으면 저장본도 갱신), 실패하면 저장본 사용
self.addEventListener('fetch', (event) => {
  const request = event.request;
  // 이 앱의 파일만 다뤄요 (다른 사이트 링크 등은 그대로 통과)
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request, { ignoreSearch: true }))
  );
});
