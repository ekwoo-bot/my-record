// ===== 브라우저 안 저장소(IndexedDB)를 다루는 파일 =====
// IndexedDB는 브라우저에 들어 있는 작은 데이터베이스예요.
// 서버 없이도 새로고침하거나 앱을 껐다 켜도 데이터가 남아 있어요.

const DB_NAME = 'my-record-db';
const DB_VERSION = 5; // 저장소 구조를 바꿀 때마다 1씩 올려요

// 백업 파일에 들어가는 저장소 목록 (새 저장소를 만들면 여기에도 추가해요)
// 'meta'(앱 설정)는 기기마다 다른 정보라서 백업에 넣지 않아요.
const DATA_STORES = ['records', 'attachments', 'tags', 'moments'];

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
      if (oldVersion < 3) {
        // 버전 3: 첨부 파일 저장소. ownerId(어느 이력의 첨부인지)로 찾을 수 있게 색인을 만들어요
        const attachments = db.createObjectStore('attachments', { keyPath: 'id' });
        attachments.createIndex('ownerId', 'ownerId');
      }
      if (oldVersion < 4) {
        // 버전 4: 내가 직접 만든 역량 태그 저장소 (기본 태그는 코드에 들어 있어요)
        db.createObjectStore('tags', { keyPath: 'name' });
      }
      if (oldVersion < 5) {
        // 버전 5: 의미 있는 순간 저장소 (사진은 attachments 저장소에 함께 보관)
        db.createObjectStore('moments', { keyPath: 'id' });
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

// ----- 첨부가 달리는 항목(이력, 의미 있는 순간) 공통 -----

// 항목 저장하기 (같은 id가 있으면 수정, 없으면 새로 추가)
// 새로 추가한 첨부(added)와 지운 첨부(removedIds)도 한꺼번에 처리해요.
async function saveWithAttachments(storeName, item, added = [], removedIds = []) {
  const db = await openDB();
  const tx = db.transaction([storeName, 'attachments'], 'readwrite');
  const done = waitForTransaction(tx);
  tx.objectStore(storeName).put(item);
  const attachments = tx.objectStore('attachments');
  for (const attachment of added) attachments.put(attachment);
  for (const id of removedIds) attachments.delete(id);
  return done;
}

// 항목 삭제하기 (그 항목의 첨부 파일도 함께 삭제)
async function deleteWithAttachments(storeName, id) {
  const db = await openDB();
  const tx = db.transaction([storeName, 'attachments'], 'readwrite');
  const done = waitForTransaction(tx);
  tx.objectStore(storeName).delete(id);
  const index = tx.objectStore('attachments').index('ownerId');
  index.openCursor(IDBKeyRange.only(id)).onsuccess = (event) => {
    const cursor = event.target.result;
    if (cursor) {
      cursor.delete();
      cursor.continue();
    }
  };
  return done;
}

// ----- 이력 -----

async function getAllRecords() {
  const store = await getStore('records', 'readonly');
  return promisifyRequest(store.getAll());
}

function saveRecord(record, added, removedIds) {
  return saveWithAttachments('records', record, added, removedIds);
}

function deleteRecord(id) {
  return deleteWithAttachments('records', id);
}

// ----- 의미 있는 순간 -----

async function getAllMoments() {
  const store = await getStore('moments', 'readonly');
  return promisifyRequest(store.getAll());
}

function saveMoment(moment, added, removedIds) {
  return saveWithAttachments('moments', moment, added, removedIds);
}

function deleteMoment(id) {
  return deleteWithAttachments('moments', id);
}

// ----- 첨부 파일 -----

// 이력 하나에 달린 첨부 목록 가져오기
async function getAttachmentsByOwner(ownerId) {
  const store = await getStore('attachments', 'readonly');
  const list = await promisifyRequest(store.index('ownerId').getAll(ownerId));
  return list.sort((a, b) => a.createdAt - b.createdAt);
}

// 이력마다 첨부가 몇 개인지 세기 (파일 내용은 읽지 않아서 빨라요)
async function countAttachmentsByOwner() {
  const store = await getStore('attachments', 'readonly');
  const counts = new Map();
  return new Promise((resolve, reject) => {
    const request = store.index('ownerId').openKeyCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return resolve(counts);
      counts.set(cursor.key, (counts.get(cursor.key) || 0) + 1);
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
  });
}

// ----- 직접 만든 태그 -----

async function getAllTags() {
  const store = await getStore('tags', 'readonly');
  return promisifyRequest(store.getAll());
}

async function saveTag(tag) {
  const store = await getStore('tags', 'readwrite');
  return promisifyRequest(store.put(tag));
}

// 태그를 지우고, 그 태그가 달린 모든 이력에서도 빼요
async function deleteTagEverywhere(name) {
  const db = await openDB();
  const tx = db.transaction(['tags', 'records'], 'readwrite');
  const done = waitForTransaction(tx);
  tx.objectStore('tags').delete(name);
  tx.objectStore('records').openCursor().onsuccess = (event) => {
    const cursor = event.target.result;
    if (!cursor) return;
    const record = cursor.value;
    if (Array.isArray(record.tags) && record.tags.includes(name)) {
      cursor.update({ ...record, tags: record.tags.filter((t) => t !== name) });
    }
    cursor.continue();
  };
  return done;
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
