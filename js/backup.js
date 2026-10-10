// ===== 백업 내보내기 / 불러오기 =====
// 모든 데이터를 JSON 파일 하나로 만들어요.
// 사진 같은 첨부 파일(Blob)은 글자(base64)로 바꿔서 같은 파일에 넣어요.

const BACKUP_APP_ID = 'my-record';
const BACKUP_FORMAT_VERSION = 1;
const BACKUP_REMIND_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

let pendingShareFile = null; // 공유 창을 다시 열어야 할 때 쓸 파일

// ----- 날짜 도우미 -----

// Date → "2026-10-10" (휴대폰에 설정된 시간 기준)
function dateToString(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// ----- 첨부 파일(Blob) ↔ 글자 변환 -----

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    // 결과는 "data:image/jpeg;base64,XXXX" 모양이라 쉼표 뒤만 가져와요
    reader.onload = () => resolve(reader.result.split(',')[1] || '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(base64, type) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

// 데이터 안의 Blob을 찾아서 { __blob: true, type, data } 모양으로 바꿔요
async function packValue(value) {
  if (value instanceof Blob) {
    return { __blob: true, type: value.type, data: await blobToBase64(value) };
  }
  if (Array.isArray(value)) {
    const out = [];
    for (const item of value) out.push(await packValue(item));
    return out;
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value)) out[key] = await packValue(item);
    return out;
  }
  return value;
}

// packValue의 반대: { __blob: true, ... }를 다시 Blob으로 되돌려요
function unpackValue(value) {
  if (Array.isArray(value)) return value.map(unpackValue);
  if (value && typeof value === 'object') {
    if (value.__blob === true) return base64ToBlob(value.data, value.type);
    const out = {};
    for (const [key, item] of Object.entries(value)) out[key] = unpackValue(item);
    return out;
  }
  return value;
}

// ----- 내보내기 -----

async function buildBackupJson() {
  const data = await readAllData();
  const packed = {};
  for (const name of DATA_STORES) packed[name] = await packValue(data[name]);

  return JSON.stringify({
    app: BACKUP_APP_ID,
    formatVersion: BACKUP_FORMAT_VERSION,
    dbVersion: DB_VERSION,
    exportedAt: new Date().toISOString(),
    data: packed,
  });
}

// 공유 창에 넣을 수 있는 파일 고르기. 공유 창을 쓰지 않을 때는 null
function pickShareableFile(json, baseName) {
  if (!navigator.share || !navigator.canShare) return null;
  // 컴퓨터(마우스)에서는 공유 창 대신 바로 다운로드해요
  if (!window.matchMedia('(pointer: coarse)').matches) return null;

  const candidates = [
    new File([json], baseName + '.json', { type: 'application/json' }),
    // 안드로이드 Chrome 공유 창은 .json 파일을 받지 않아서, 같은 내용을 .txt로도 준비해요
    new File([json], baseName + '.txt', { type: 'text/plain' }),
  ];
  for (const file of candidates) {
    try {
      if (navigator.canShare({ files: [file] })) return file;
    } catch (e) {
      // 이 형식은 공유 불가 → 다음 후보 시도
    }
  }
  return null;
}

function downloadFile(file) {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60 * 1000);
}

async function markBackedUp() {
  await setMeta('lastBackupAt', Date.now());
  document.getElementById('backup-banner').hidden = true;
  await refreshBackupInfo();
}

function setBackupStatus(message) {
  const el = document.getElementById('backup-status');
  el.textContent = message;
  el.hidden = !message;
}

async function shareBackupFile(file) {
  const shareAgainBtn = document.getElementById('share-again-btn');
  try {
    await navigator.share({ files: [file], title: file.name });
    pendingShareFile = null;
    shareAgainBtn.hidden = true;
    setBackupStatus('');
    await markBackedUp();
    showToast('백업 파일을 공유했어요.');
  } catch (e) {
    if (e.name === 'AbortError') {
      // 사용자가 공유 창을 닫음
      setBackupStatus('공유를 취소했어요. 아직 백업되지 않았어요.');
    } else if (e.name === 'NotAllowedError') {
      // 파일을 만드는 데 시간이 걸려서 브라우저가 공유 창을 막은 경우 → 버튼을 한 번 더 누르게 해요
      pendingShareFile = file;
      shareAgainBtn.hidden = false;
      setBackupStatus('백업 파일이 준비됐어요. 아래 "공유 창 열기"를 눌러 저장해 주세요.');
    } else {
      // 그 밖의 문제는 다운로드로 대신해요
      console.error(e);
      downloadFile(file);
      setBackupStatus('');
      await markBackedUp();
      showToast('백업 파일을 다운로드했어요.');
    }
  }
}

async function handleExport() {
  const exportBtn = document.getElementById('export-btn');
  exportBtn.disabled = true;
  document.getElementById('share-again-btn').hidden = true;
  setBackupStatus('백업 파일을 만드는 중이에요...');

  try {
    const json = await buildBackupJson();
    const baseName = `나의기록_백업_${dateToString(new Date())}`;
    const shareFile = pickShareableFile(json, baseName);

    if (shareFile) {
      await shareBackupFile(shareFile);
    } else {
      downloadFile(new File([json], baseName + '.json', { type: 'application/json' }));
      setBackupStatus('');
      await markBackedUp();
      showToast('백업 파일을 다운로드했어요.');
    }
  } catch (e) {
    console.error(e);
    setBackupStatus('백업 파일을 만들지 못했어요. 다시 시도해 주세요.');
  } finally {
    exportBtn.disabled = false;
  }
}

// ----- 불러오기 -----

async function handleImportFile(file) {
  let backup;
  try {
    backup = JSON.parse(await file.text());
  } catch (e) {
    alert('백업 파일을 읽지 못했어요. "나의기록_백업_날짜" 파일이 맞는지 확인해 주세요.');
    return;
  }

  if (!backup || backup.app !== BACKUP_APP_ID || !backup.data || typeof backup.data !== 'object') {
    alert('이 앱의 백업 파일이 아니에요. "나의기록_백업_날짜" 파일을 골라 주세요.');
    return;
  }

  const backupDate = backup.exportedAt ? dateToString(new Date(backup.exportedAt)) : '알 수 없음';
  const countOf = (name) => (Array.isArray(backup.data[name]) ? backup.data[name].length : 0);
  const ok = confirm(
    '지금 데이터가 덮어써집니다.\n\n' +
    `백업 날짜: ${backupDate}\n` +
    `이력: ${countOf('records')}개, 첨부: ${countOf('attachments')}개\n\n` +
    '불러오기 직전 상태는 자동으로 보관되어, 설정 화면에서 되돌릴 수 있어요.\n계속할까요?'
  );
  if (!ok) return;

  try {
    const newData = {};
    for (const name of DATA_STORES) {
      newData[name] = Array.isArray(backup.data[name]) ? unpackValue(backup.data[name]) : [];
    }
    // 덮어쓰기 직전 상태를 함께 보관해요
    const snapshot = { createdAt: Date.now(), data: await readAllData() };
    await replaceAllData(newData, snapshot);

    await loadRecords();
    await refreshBackupInfo();
    showToast('백업 파일을 불러왔어요.');
  } catch (e) {
    console.error(e);
    alert('불러오지 못했어요. 지금 데이터는 바뀌지 않았어요.\n백업 파일이 손상되었을 수 있어요.');
  }
}

// 불러오기 직전 상태로 되돌리기
async function handleRestoreSnapshot() {
  const snapshot = await getMeta('preImportSnapshot');
  if (!snapshot) return;

  const ok = confirm(
    `${dateToString(new Date(snapshot.createdAt))}에 불러오기 직전 상태로 되돌릴까요?\n` +
    '지금 데이터는 그 상태로 바뀌어요.'
  );
  if (!ok) return;

  try {
    await replaceAllData(snapshot.data, null);
    await loadRecords();
    await refreshBackupInfo();
    showToast('불러오기 전 상태로 되돌렸어요.');
  } catch (e) {
    console.error(e);
    alert('되돌리지 못했어요. 다시 시도해 주세요.');
  }
}

// ----- 설정 화면 정보 / 백업 알림 -----

async function refreshBackupInfo() {
  const lastBackupAt = await getMeta('lastBackupAt');
  document.getElementById('last-backup-text').textContent = lastBackupAt
    ? formatDate(dateToString(new Date(lastBackupAt)))
    : '아직 백업한 적이 없어요';

  const snapshot = await getMeta('preImportSnapshot');
  const restoreBtn = document.getElementById('restore-btn');
  restoreBtn.hidden = !snapshot;
  if (snapshot) {
    restoreBtn.textContent = `불러오기 전으로 되돌리기 (${formatDate(dateToString(new Date(snapshot.createdAt)))} 보관)`;
  }
}

// 앱을 열 때: 마지막 백업 후 30일이 지났으면 알림 띄우기
// 한 번도 백업하지 않았다면 가장 먼저 쓴 이력의 날짜부터 계산해요.
async function checkBackupReminder(recordList) {
  if (recordList.length === 0) return;

  const lastBackupAt = await getMeta('lastBackupAt');
  const since = lastBackupAt || Math.min(...recordList.map((r) => r.createdAt));
  const days = Math.floor((Date.now() - since) / DAY_MS);
  if (days < BACKUP_REMIND_DAYS) return;

  document.getElementById('backup-banner-text').textContent = lastBackupAt
    ? `마지막 백업 후 ${days}일이 지났어요. 기록을 잃지 않도록 백업해 주세요.`
    : '아직 백업한 적이 없어요. 기록을 잃지 않도록 백업해 주세요.';
  document.getElementById('backup-banner').hidden = false;
}

// 설정 화면의 백업 버튼들 연결
function initBackup() {
  const importInput = document.getElementById('import-input');

  document.getElementById('export-btn').addEventListener('click', handleExport);
  document.getElementById('share-again-btn').addEventListener('click', () => {
    if (pendingShareFile) shareBackupFile(pendingShareFile);
  });
  document.getElementById('import-btn').addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', () => {
    const file = importInput.files[0];
    importInput.value = ''; // 같은 파일을 다시 골라도 동작하게 비워 둬요
    if (file) handleImportFile(file);
  });
  document.getElementById('restore-btn').addEventListener('click', handleRestoreSnapshot);
}
