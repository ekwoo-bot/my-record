// ===== 브라우저 안 저장소(IndexedDB)를 다루는 파일 =====
// IndexedDB는 브라우저에 들어 있는 작은 데이터베이스예요.
// 서버 없이도 새로고침하거나 앱을 껐다 켜도 데이터가 남아 있어요.

const DB_NAME = 'my-record-db';
const DB_VERSION = 1; // 저장소 구조를 바꿀 때마다 1씩 올려요

let dbPromise = null;

// 데이터베이스 열기 (처음 한 번만 실제로 열고, 그다음부터는 재사용)
function openDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    // 처음 만들거나 버전이 올라갔을 때 실행돼요.
    // oldVersion을 보고 필요한 저장소만 추가하므로, 기존 데이터는 그대로 남아요.
    request.onupgradeneeded = (event) => {
      const db = request.result;
      const oldVersion = event.oldVersion;

      if (oldVersion < 1) {
        // 버전 1: 이력 저장소
        db.createObjectStore('records', { keyPath: 'id' });
      }
      // 이후 단계에서 저장소가 더 필요하면 여기에 if (oldVersion < 2) { ... } 를 추가해요.
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

// IndexedDB 요청을 Promise로 바꿔 주는 도우미 (await로 쓰기 편하게)
function promisifyRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// 저장소 하나를 열어서 꺼내 주는 도우미
async function getStore(storeName, mode) {
  const db = await openDB();
  return db.transaction(storeName, mode).objectStore(storeName);
}

// 모든 이력 가져오기
async function getAllRecords() {
  const store = await getStore('records', 'readonly');
  return promisifyRequest(store.getAll());
}

// 이력 저장하기 (같은 id가 있으면 수정, 없으면 새로 추가)
async function saveRecord(record) {
  const store = await getStore('records', 'readwrite');
  return promisifyRequest(store.put(record));
}

// 이력 삭제하기
async function deleteRecord(id) {
  const store = await getStore('records', 'readwrite');
  return promisifyRequest(store.delete(id));
}
