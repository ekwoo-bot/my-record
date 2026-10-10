// ===== 브라우저 안 저장소(IndexedDB)를 다루는 파일 =====
// IndexedDB는 브라우저에 들어 있는 작은 데이터베이스예요.
// 서버 없이도 새로고침하거나 앱을 껐다 켜도 데이터가 남아 있어요.

const DB_NAME = 'my-record-db';
const DB_VERSION = 2; // 저장소 구조를 바꿀 때마다 1씩 올려요

// 백업 파일에 들어가는 저장소 목록 (새 저장소를 만들면 여기에도 추가해요)
// 'meta'(앱 설정)는 기기마다 다른 정보라서 백업에 넣지 않아요.
const DATA_STORES = ['records'];

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
      if (oldVersion < 2) {
        // 버전 2: 앱 설정 저장소 (마지막 백업 날짜 등)
        db.createObjectStore('meta', { keyPath: 'key' });
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      // 다른 탭에서 새 버전의 앱이 열리면 이 탭의 연결을 닫아 업그레이드를 막지 않게 해요
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      alert('다른 탭에 이 앱이 열려 있어요. 다른 탭을 닫고 새로고침해 주세요.');
    };
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

// 트랜잭션(여러 작업 묶음)이 끝날 때까지 기다리는 도우미
function waitForTransaction(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// 저장소 하나를 열어서 꺼내 주는 도우미
async function getStore(storeName, mode) {
  const db = await openDB();
  return db.transaction(storeName, mode).objectStore(storeName);
}

// ----- 이력 -----

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

// ----- 앱 설정 (meta) -----

async function getMeta(key) {
  const store = await getStore('meta', 'readonly');
  const row = await promisifyRequest(store.get(key));
  return row ? row.value : undefined;
}

async function setMeta(key, value) {
  const store = await getStore('meta', 'readwrite');
  return promisifyRequest(store.put({ key, value }));
}

// ----- 백업용: 전체 데이터 읽기 / 바꾸기 -----

// 백업 대상 저장소의 데이터를 모두 읽어서 { records: [...], ... } 모양으로 돌려줘요
async function readAllData() {
  const db = await openDB();
  const tx = db.transaction(DATA_STORES, 'readonly');
  const result = {};
  await Promise.all(DATA_STORES.map(async (name) => {
    result[name] = await promisifyRequest(tx.objectStore(name).getAll());
  }));
  return result;
}

// 백업 대상 저장소를 모두 비우고 data 내용으로 바꿔요.
// 하나의 트랜잭션으로 처리해서, 중간에 실패하면 아무것도 바뀌지 않아요.
// snapshot을 주면 "바꾸기 직전 상태"로 함께 보관하고, null이면 보관본을 지워요.
async function replaceAllData(data, snapshot) {
  const db = await openDB();
  const tx = db.transaction([...DATA_STORES, 'meta'], 'readwrite');
  const done = waitForTransaction(tx);

  try {
    for (const name of DATA_STORES) {
      const store = tx.objectStore(name);
      store.clear();
      for (const item of data[name] || []) store.put(item);
    }
    const meta = tx.objectStore('meta');
    if (snapshot) meta.put({ key: 'preImportSnapshot', value: snapshot });
    else meta.delete('preImportSnapshot');
  } catch (e) {
    tx.abort(); // 잘못된 데이터가 있으면 전부 취소
    done.catch(() => {});
    throw e;
  }

  return done;
}
