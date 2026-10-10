// ===== 화면 동작을 담당하는 파일 =====

// 분류 목록 (여기만 고치면 입력 창의 선택 상자에도 반영돼요)
const CATEGORIES = ['대외활동', '수업/학업', '아르바이트', '자격증', '수상', '기타'];

const SORT_KEY = 'sortOrder'; // 정렬 선택을 기억해 둘 이름

// 화면 요소 찾아두기
const listEl = document.getElementById('record-list');
const emptyEl = document.getElementById('empty-message');
const sortBtn = document.getElementById('sort-btn');
const addBtn = document.getElementById('add-btn');
const backdrop = document.getElementById('sheet-backdrop');
const form = document.getElementById('record-form');
const sheetTitle = document.getElementById('sheet-title');
const closeBtn = document.getElementById('close-btn');
const deleteBtn = document.getElementById('delete-btn');
const errorEl = document.getElementById('form-error');
const fTitle = document.getElementById('f-title');
const fStart = document.getElementById('f-start');
const fEnd = document.getElementById('f-end');
const fCategory = document.getElementById('f-category');
const fContent = document.getElementById('f-content');
const modeSingleBtn = document.getElementById('mode-single');
const modeRangeBtn = document.getElementById('mode-range');
const startLabel = document.getElementById('start-label');
const endField = document.getElementById('end-field');
const endHint = document.getElementById('end-hint');
const fDraft = document.getElementById('f-draft');
const starSection = document.getElementById('star-section');
const starProgress = document.getElementById('star-progress');
const attachmentEditor = createAttachmentEditor(document.getElementById('record-attachments'));

// STAR 입력칸 4개 (s=상황, t=과제, a=행동, r=결과)
const STAR_KEYS = ['s', 't', 'a', 'r'];
const starInputs = {
  s: document.getElementById('f-star-s'),
  t: document.getElementById('f-star-t'),
  a: document.getElementById('f-star-a'),
  r: document.getElementById('f-star-r'),
};

// 빠른 메모 창
const memoBackdrop = document.getElementById('memo-backdrop');
const memoForm = document.getElementById('memo-form');
const memoTitle = document.getElementById('m-title');
const memoDate = document.getElementById('m-date');
const memoError = document.getElementById('memo-error');

// 필터 버튼들
const filterChips = document.querySelectorAll('.filter-chip');

// 앱 상태
let records = [];       // 저장소에서 불러온 이력들
let attachmentCounts = new Map(); // 이력 id → 첨부 개수
let editingId = null;   // 수정 중인 이력의 id (새로 추가할 때는 null)
let formRecordId = null; // 입력 창에 열린 이력의 id (새 이력이면 미리 만들어 둔 id)
let dateMode = 'single'; // 'single' = 하루, 'range' = 기간
let sortOrder = loadSortOrder(); // 'desc' = 최신순, 'asc' = 오래된순
let activeFilter = 'all';        // 'all' = 전체, 'draft' = 작성 중만

// ----- 정렬 선택 기억하기 -----
// localStorage는 막혀 있을 수도 있어서, 실패하면 기본값(최신순)을 써요.
function loadSortOrder() {
  try {
    return localStorage.getItem(SORT_KEY) === 'asc' ? 'asc' : 'desc';
  } catch (e) {
    return 'desc';
  }
}
function saveSortOrder() {
  try {
    localStorage.setItem(SORT_KEY, sortOrder);
  } catch (e) {
    // 저장 못 해도 앱 사용에는 문제없어요
  }
}

// ----- 도우미 함수 -----

// 고유한 id 만들기
function makeId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

// "2026-03-02" → "2026.03.02"
function formatDate(dateStr) {
  return dateStr ? dateStr.replaceAll('-', '.') : '';
}

// 기간 글자 만들기
function formatPeriod(record) {
  const start = formatDate(record.startDate);
  if (!record.endDate) return `${start} ~ 진행 중`;
  if (record.endDate === record.startDate) return start;
  return `${start} ~ ${formatDate(record.endDate)}`;
}

// 날짜순 정렬 (시작일 기준, 같으면 먼저 만든 것 기준)
function sortRecords(list) {
  const direction = sortOrder === 'asc' ? 1 : -1;
  return [...list].sort((a, b) => {
    if (a.startDate !== b.startDate) {
      return a.startDate < b.startDate ? -direction : direction;
    }
    return (a.createdAt - b.createdAt) * direction;
  });
}

// 선택한 필터에 맞는 이력만 고르기
function filterRecords(list) {
  if (activeFilter === 'draft') return list.filter((r) => r.isDraft);
  return list;
}

// STAR 칸이 비어 있는 이력도 있어서, 항상 4칸이 있는 모양으로 맞춰요
function getStar(record) {
  const star = (record && record.star) || {};
  return { s: star.s || '', t: star.t || '', a: star.a || '', r: star.r || '' };
}

// ----- 화면 그리기 -----

function render() {
  sortBtn.textContent = sortOrder === 'asc' ? '오래된순' : '최신순';

  // 필터 버튼 모양과 개수
  const draftCount = records.filter((r) => r.isDraft).length;
  for (const chip of filterChips) {
    chip.classList.toggle('active', chip.dataset.filter === activeFilter);
    if (chip.dataset.filter === 'draft') chip.textContent = `작성 중 ${draftCount}`;
  }

  listEl.replaceChildren(); // 기존 카드 지우기
  const visible = sortRecords(filterRecords(records));

  emptyEl.hidden = visible.length > 0;
  if (records.length === 0) {
    emptyEl.textContent = '아직 기록이 없어요.\n아래 + 버튼으로 첫 이력을 추가해 보세요.';
  } else if (activeFilter === 'draft') {
    emptyEl.textContent = '작성 중인 이력이 없어요.';
  }

  for (const record of visible) {
    listEl.appendChild(createCard(record));
  }
}

// 이력 카드 하나 만들기
// 사용자가 쓴 글은 textContent로만 넣어서, 글 속의 코드가 실행되지 않게 해요.
function createCard(record) {
  const li = document.createElement('li');
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'record-card';
  card.addEventListener('click', () => openSheet(record));

  const badge = document.createElement('span');
  badge.className = 'badge';
  badge.textContent = record.category;

  const title = document.createElement('span');
  title.className = 'title';
  title.textContent = record.title;

  const period = document.createElement('span');
  period.className = 'period';
  period.textContent = formatPeriod(record);

  card.append(badge);

  // 빠른 메모 등으로 아직 다 쓰지 않은 이력
  if (record.isDraft) {
    const draftBadge = document.createElement('span');
    draftBadge.className = 'badge draft';
    draftBadge.textContent = '작성 중';
    card.appendChild(draftBadge);
  }

  // 첨부가 있으면 분류 옆에 개수 표시
  const count = attachmentCounts.get(record.id) || 0;
  if (count > 0) {
    const attachCount = document.createElement('span');
    attachCount.className = 'attach-count';
    attachCount.textContent = `결과물 ${count}개`;
    card.appendChild(attachCount);
  }

  card.append(title, period);

  // 내용이 있으면 첫 줄만 미리보기
  const firstLine = (record.content || '').trim().split('\n')[0];
  if (firstLine) {
    const preview = document.createElement('span');
    preview.className = 'preview';
    preview.textContent = firstLine;
    card.appendChild(preview);
  }

  li.appendChild(card);
  return li;
}

// ----- 하루 / 기간 전환 -----
// "하루"는 시작일과 종료일을 같은 날로 저장해요. 그래서 따로 표시를 저장하지 않아도 구분돼요.

function isSingleDay(record) {
  return record.endDate === record.startDate;
}

function setDateMode(mode) {
  dateMode = mode;
  const single = mode === 'single';
  modeSingleBtn.classList.toggle('active', single);
  modeRangeBtn.classList.toggle('active', !single);
  modeSingleBtn.setAttribute('aria-pressed', String(single));
  modeRangeBtn.setAttribute('aria-pressed', String(!single));
  startLabel.textContent = single ? '날짜' : '시작일';
  endField.hidden = single;
  endHint.hidden = single;
}

// ----- 입력 창 열기/닫기 -----

// record가 있으면 수정 모드, 없으면 추가 모드
async function openSheet(record) {
  editingId = record ? record.id : null;
  formRecordId = record ? record.id : makeId();

  // 이 이력에 달린 첨부 불러오기
  let attachments = [];
  if (record) {
    try {
      attachments = await getAttachmentsByOwner(record.id);
    } catch (e) {
      console.error(e);
    }
  }
  attachmentEditor.load(formRecordId, attachments);

  sheetTitle.textContent = record ? '이력 수정' : '이력 추가';
  deleteBtn.hidden = !record;
  errorEl.hidden = true;

  // 새로 추가할 때는 "하루"로 시작하고, 수정할 때는 저장된 모양에 맞춰요
  const single = record ? isSingleDay(record) : true;
  setDateMode(single ? 'single' : 'range');

  fTitle.value = record ? record.title : '';
  fStart.value = record ? record.startDate : '';
  fEnd.value = record && !single ? record.endDate : '';
  fCategory.value = record ? record.category : CATEGORIES[0];
  fContent.value = record ? record.content : '';
  fDraft.checked = record ? !!record.isDraft : false;

  // STAR 칸 채우기 (처음에는 항상 접힌 상태)
  const star = getStar(record);
  for (const key of STAR_KEYS) starInputs[key].value = star[key];
  starSection.open = false;
  updateStarProgress();

  backdrop.hidden = false;
  document.body.style.overflow = 'hidden'; // 뒤 화면이 같이 스크롤되지 않게
}

function closeSheet() {
  backdrop.hidden = true;
  document.body.style.overflow = '';
  editingId = null;
  formRecordId = null;
  attachmentEditor.clear();
}

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
}

// STAR 제목 옆에 "2/4 작성" 표시
function updateStarProgress() {
  const filled = STAR_KEYS.filter((key) => starInputs[key].value.trim()).length;
  starProgress.textContent = filled > 0 ? `· ${filled}/4 작성` : '';
}

// ----- 빠른 메모 -----

function openMemo() {
  memoTitle.value = '';
  memoDate.value = dateToString(new Date()); // 기본값은 오늘
  memoError.hidden = true;
  memoBackdrop.hidden = false;
  document.body.style.overflow = 'hidden';
  memoTitle.focus(); // 바로 키보드가 올라오게
}

function closeMemo() {
  memoBackdrop.hidden = true;
  document.body.style.overflow = '';
}

async function handleMemoSubmit(event) {
  event.preventDefault();

  const title = memoTitle.value.trim();
  const date = memoDate.value;
  const showMemoError = (message) => {
    memoError.textContent = message;
    memoError.hidden = false;
  };
  if (!title) return showMemoError('제목을 입력해 주세요.');
  if (!date) return showMemoError('날짜를 선택해 주세요.');

  const now = Date.now();
  const record = {
    id: makeId(),
    title,
    startDate: date,
    endDate: date, // 하루짜리로 저장 (나중에 기간으로 바꿀 수 있어요)
    category: '기타',
    content: '',
    star: getStar(null),
    isDraft: true,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await saveRecord(record);
    await loadRecords();
    closeMemo();
    showToast('빠른 메모를 저장했어요.');
  } catch (e) {
    console.error(e);
    showMemoError('저장하지 못했어요. 다시 시도해 주세요.');
  }
}

// ----- 저장 / 삭제 -----

async function handleSubmit(event) {
  event.preventDefault(); // 페이지가 새로고침되지 않게 막기

  const title = fTitle.value.trim();
  const startDate = fStart.value;
  // 하루면 종료일 = 시작일, 기간이면 입력한 종료일(비우면 진행 중)
  const endDate = dateMode === 'single' ? startDate : fEnd.value;

  // 입력 검사
  if (!title) return showError('제목을 입력해 주세요.');
  if (!startDate) return showError(dateMode === 'single' ? '날짜를 선택해 주세요.' : '시작일을 선택해 주세요.');
  if (endDate && endDate < startDate) return showError('종료일은 시작일보다 빠를 수 없어요.');
  if (attachmentEditor.isBusy()) return showError('파일을 준비하는 중이에요. 잠시 후 다시 저장해 주세요.');

  const now = Date.now();
  const existing = records.find((r) => r.id === editingId);

  // 기존 이력을 수정할 때는 원래 값(...existing)을 유지한 채 바뀐 칸만 덮어써요.
  const record = {
    ...existing,
    id: formRecordId,
    title,
    startDate,
    endDate,
    category: fCategory.value,
    content: fContent.value,
    star: Object.fromEntries(STAR_KEYS.map((key) => [key, starInputs[key].value])),
    isDraft: fDraft.checked,
    createdAt: existing ? existing.createdAt : now,
    updatedAt: now,
  };

  const { added, removedIds } = attachmentEditor.getChanges();

  try {
    await saveRecord(record, added, removedIds);
    await loadRecords();
    closeSheet();
    if (added.length > 0) warnIfStorageAlmostFull().catch(console.error);
  } catch (e) {
    console.error(e);
    if (e && e.name === 'QuotaExceededError') {
      showError('저장 공간이 부족해요. 큰 파일은 링크로 바꾸거나 설정에서 저장 공간을 확인해 주세요.');
    } else {
      showError('저장하지 못했어요. 다시 시도해 주세요.');
    }
  }
}

async function handleDelete() {
  if (!editingId) return;
  if (!confirm('이 이력을 삭제할까요? 첨부한 결과물도 함께 삭제되고, 되돌릴 수 없어요.')) return;

  try {
    await deleteRecord(editingId);
    await loadRecords();
    closeSheet();
  } catch (e) {
    console.error(e);
    showError('삭제하지 못했어요. 다시 시도해 주세요.');
  }
}

// 저장소에서 이력을 다시 읽어 와서 화면 갱신
async function loadRecords() {
  records = await getAllRecords();
  attachmentCounts = await countAttachmentsByOwner();
  render();
}

// ----- 설정 화면 열기/닫기 -----

const settingsView = document.getElementById('settings-view');

function openSettings() {
  settingsView.hidden = false;
  settingsView.scrollTop = 0;
  document.body.style.overflow = 'hidden';
  refreshBackupInfo().catch(console.error);
  refreshStorageInfo().catch(console.error);
}

function closeSettings() {
  settingsView.hidden = true;
  document.body.style.overflow = '';
}

// ----- 잠깐 나타났다 사라지는 안내 문구 -----

let toastTimer = null;

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 2500);
}

// ----- 시작 -----

function init() {
  // 분류 선택 상자 채우기
  for (const name of CATEGORIES) {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    fCategory.appendChild(option);
  }

  // 버튼에 동작 연결
  addBtn.addEventListener('click', () => openSheet(null));
  closeBtn.addEventListener('click', closeSheet);
  deleteBtn.addEventListener('click', handleDelete);
  form.addEventListener('submit', handleSubmit);
  modeSingleBtn.addEventListener('click', () => setDateMode('single'));
  modeRangeBtn.addEventListener('click', () => setDateMode('range'));

  // 시트 바깥 어두운 부분을 누르면 닫기
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) closeSheet();
  });

  // STAR 칸에 글을 쓸 때마다 "N/4 작성" 갱신
  for (const key of STAR_KEYS) starInputs[key].addEventListener('input', updateStarProgress);

  // 빠른 메모
  document.getElementById('memo-btn').addEventListener('click', openMemo);
  document.getElementById('memo-close-btn').addEventListener('click', closeMemo);
  memoForm.addEventListener('submit', handleMemoSubmit);
  memoBackdrop.addEventListener('click', (event) => {
    if (event.target === memoBackdrop) closeMemo();
  });

  // 필터
  for (const chip of filterChips) {
    chip.addEventListener('click', () => {
      activeFilter = chip.dataset.filter;
      render();
    });
  }

  sortBtn.addEventListener('click', () => {
    sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
    saveSortOrder();
    render();
  });

  // 설정 화면과 백업 알림
  document.getElementById('settings-btn').addEventListener('click', openSettings);
  document.getElementById('settings-back-btn').addEventListener('click', closeSettings);
  document.getElementById('banner-backup-btn').addEventListener('click', openSettings);
  document.getElementById('banner-later-btn').addEventListener('click', () => {
    document.getElementById('backup-banner').hidden = true; // 다음에 앱을 열 때 다시 알려줘요
  });
  initBackup();
  initStorage();

  // 사진 크게 보기 닫기 (닫기 버튼 또는 사진 바깥 누르기)
  document.getElementById('viewer-close-btn').addEventListener('click', closeImageViewer);
  document.getElementById('image-viewer').addEventListener('click', (event) => {
    if (event.target.id === 'image-viewer') closeImageViewer();
  });

  loadRecords()
    .then(() => checkBackupReminder(records))
    .catch((e) => {
      console.error(e);
      emptyEl.hidden = false;
      emptyEl.textContent = '저장된 기록을 불러오지 못했어요. 브라우저의 시크릿 모드에서는 저장이 안 될 수 있어요.';
    });
}

init();
