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

// 앱 상태
let records = [];       // 저장소에서 불러온 이력들
let editingId = null;   // 수정 중인 이력의 id (새로 추가할 때는 null)
let dateMode = 'single'; // 'single' = 하루, 'range' = 기간
let sortOrder = loadSortOrder(); // 'desc' = 최신순, 'asc' = 오래된순

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

// ----- 화면 그리기 -----

function render() {
  sortBtn.textContent = sortOrder === 'asc' ? '오래된순' : '최신순';

  listEl.replaceChildren(); // 기존 카드 지우기
  emptyEl.hidden = records.length > 0;

  for (const record of sortRecords(records)) {
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

  card.append(badge, title, period);

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
function openSheet(record) {
  editingId = record ? record.id : null;
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

  backdrop.hidden = false;
  document.body.style.overflow = 'hidden'; // 뒤 화면이 같이 스크롤되지 않게
}

function closeSheet() {
  backdrop.hidden = true;
  document.body.style.overflow = '';
  editingId = null;
}

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
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

  const now = Date.now();
  const existing = records.find((r) => r.id === editingId);

  // 기존 이력을 수정할 때는 원래 값(...existing)을 유지한 채 바뀐 칸만 덮어써요.
  const record = {
    ...existing,
    id: existing ? existing.id : makeId(),
    title,
    startDate,
    endDate,
    category: fCategory.value,
    content: fContent.value,
    createdAt: existing ? existing.createdAt : now,
    updatedAt: now,
  };

  try {
    await saveRecord(record);
    await loadRecords();
    closeSheet();
  } catch (e) {
    console.error(e);
    showError('저장하지 못했어요. 다시 시도해 주세요.');
  }
}

async function handleDelete() {
  if (!editingId) return;
  if (!confirm('이 이력을 삭제할까요? 되돌릴 수 없어요.')) return;

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
  render();
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

  sortBtn.addEventListener('click', () => {
    sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
    saveSortOrder();
    render();
  });

  loadRecords().catch((e) => {
    console.error(e);
    emptyEl.hidden = false;
    emptyEl.textContent = '저장된 기록을 불러오지 못했어요. 브라우저의 시크릿 모드에서는 저장이 안 될 수 있어요.';
  });
}

init();
