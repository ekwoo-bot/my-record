// ===== 화면 동작을 담당하는 파일 =====

// 분류 목록 (여기만 고치면 입력 창의 선택 상자에도 반영돼요)
const CATEGORIES = ['대외활동', '수업/학업', '아르바이트', '자격증', '수상', '기타'];

// 화면 요소 찾아두기
const listEl = document.getElementById('record-list');
const emptyEl = document.getElementById('empty-message');
const sortBtn = document.getElementById('sort-btn');
const addBtn = document.getElementById('add-btn');
const memoBtn = document.getElementById('memo-btn');
const tabButtons = document.querySelectorAll('.tab-btn');
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

// 필터, 검색, 태그 고르기
const filterBar = document.getElementById('filter-bar');
const searchInput = document.getElementById('search-input');
const tagPicker = createTagPicker(document.getElementById('tag-field'));

// 앱 상태
let records = [];       // 저장소에서 불러온 이력들
let attachmentCounts = new Map(); // 이력·순간 id → 첨부 개수
let editingId = null;   // 수정 중인 이력의 id (새로 추가할 때는 null)
let formRecordId = null; // 입력 창에 열린 이력의 id (새 이력이면 미리 만들어 둔 id)
let dateMode = 'single'; // 'single' = 하루, 'range' = 기간
let sortOrder = loadPref('sortOrder', ['desc', 'asc']);      // 'desc' = 최신순, 'asc' = 오래된순
let activeTab = loadPref('activeTab', ['records', 'moments']); // 'records' = 이력, 'moments' = 의미 있는 순간
// 'all' = 전체, 'important' = 중요만, 'draft' = 작성 중만, 'tag:리더십' = 그 태그만
let activeFilter = 'all';
let searchQuery = '';            // 검색창에 쓴 글

// ----- 화면 선택(정렬, 탭) 기억하기 -----
// localStorage는 막혀 있을 수도 있어서, 실패하면 첫 번째 값(기본값)을 써요.
function loadPref(key, allowed) {
  try {
    const value = localStorage.getItem(key);
    return allowed.includes(value) ? value : allowed[0];
  } catch (e) {
    return allowed[0];
  }
}
function savePref(key, value) {
  try {
    localStorage.setItem(key, value);
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

// 선택한 필터와 검색어에 맞는 이력만 고르기
function filterRecords(list) {
  let result = list;
  if (activeFilter === 'important') result = result.filter((r) => r.important);
  else if (activeFilter === 'draft') result = result.filter((r) => r.isDraft);
  else if (activeFilter.startsWith('tag:')) {
    const tag = activeFilter.slice(4);
    result = result.filter((r) => (r.tags || []).includes(tag));
  }
  if (searchQuery.trim()) {
    result = result.filter((r) => matchesQuery(getSearchTexts(r), searchQuery));
  }
  return result;
}

// 검색 대상: 제목, 내용, 분류, STAR 4칸, 태그
function getSearchTexts(record) {
  const star = getStar(record);
  const tags = (record.tags || []).map((t) => `#${t}`);
  return [record.title, record.content, record.category, star.s, star.t, star.a, star.r, ...tags];
}

// 태그 필터로 바꾸고 맨 위로 올라가기 (카드의 태그를 눌렀을 때)
function filterByTag(tag) {
  activeFilter = `tag:${tag}`;
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// STAR 칸이 비어 있는 이력도 있어서, 항상 4칸이 있는 모양으로 맞춰요
function getStar(record) {
  const star = (record && record.star) || {};
  return { s: star.s || '', t: star.t || '', a: star.a || '', r: star.r || '' };
}

// ----- 화면 그리기 -----

// 지금 탭에 맞는 화면 그리기
function render() {
  sortBtn.textContent = sortOrder === 'asc' ? '오래된순' : '최신순';

  const isRecords = activeTab === 'records';
  for (const btn of tabButtons) {
    const isActive = btn.dataset.tab === activeTab;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', String(isActive));
  }
  // 탭에 따라 보이는 것 바꾸기
  filterBar.hidden = !isRecords;
  listEl.hidden = !isRecords;
  momentListEl.hidden = isRecords;
  memoBtn.hidden = !isRecords;
  addBtn.textContent = isRecords ? '+ 이력 추가' : '+ 순간 기록';
  searchInput.placeholder = isRecords ? '검색 (제목, 내용, STAR, 태그)' : '검색 (제목, 생각·감정)';

  if (isRecords) renderRecords();
  else renderMoments();
}

function renderRecords() {
  renderFilterBar();

  listEl.replaceChildren(); // 기존 카드 지우기
  const visible = sortRecords(filterRecords(records));

  emptyEl.hidden = visible.length > 0;
  if (records.length === 0) {
    emptyEl.textContent = '아직 기록이 없어요.\n아래 + 버튼으로 첫 이력을 추가해 보세요.';
  } else if (searchQuery.trim()) {
    emptyEl.textContent = `'${searchQuery.trim()}'에 맞는 이력이 없어요.`;
  } else if (activeFilter === 'important') {
    emptyEl.textContent = '중요 표시한 이력이 없어요.\n카드 오른쪽 위의 ☆를 눌러 표시해 보세요.';
  } else if (activeFilter === 'draft') {
    emptyEl.textContent = '작성 중인 이력이 없어요.';
  } else if (activeFilter.startsWith('tag:')) {
    emptyEl.textContent = `#${activeFilter.slice(4)} 태그가 달린 이력이 없어요.`;
  }

  for (const record of visible) {
    listEl.appendChild(createCard(record));
  }
}

// 필터 버튼 줄 만들기: 전체 / 중요 / 작성 중 / 쓰인 태그들
function renderFilterBar() {
  const chips = [
    { key: 'all', label: '전체' },
    { key: 'important', label: `★ 중요 ${records.filter((r) => r.important).length}` },
    { key: 'draft', label: `작성 중 ${records.filter((r) => r.isDraft).length}` },
  ];

  // 이력에 한 번이라도 쓰인 태그만 보여줘요 (지금 고른 태그는 항상 보이게)
  const tagCounts = new Map();
  for (const r of records) for (const t of r.tags || []) tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
  const activeTag = activeFilter.startsWith('tag:') ? activeFilter.slice(4) : null;
  if (activeTag && !tagCounts.has(activeTag)) tagCounts.set(activeTag, 0);
  for (const tag of sortTags([...tagCounts.keys()])) {
    chips.push({ key: `tag:${tag}`, label: `#${tag} ${tagCounts.get(tag)}` });
  }

  filterBar.replaceChildren();
  for (const { key, label } of chips) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'filter-chip';
    chip.textContent = label;
    const isActive = key === activeFilter;
    chip.classList.toggle('active', isActive);
    chip.setAttribute('aria-pressed', String(isActive));
    chip.addEventListener('click', () => {
      activeFilter = key;
      render();
    });
    filterBar.appendChild(chip);
  }
}

// 중요 표시 켜고 끄기 (카드의 ☆ 버튼)
async function toggleImportant(record) {
  try {
    await saveRecord({ ...record, important: !record.important });
    await reloadData();
  } catch (e) {
    console.error(e);
    showToast('중요 표시를 바꾸지 못했어요.');
  }
}

// 이력 카드 하나 만들기
// 사용자가 쓴 글은 textContent로만 넣어서, 글 속의 코드가 실행되지 않게 해요.
function createCard(record) {
  const li = document.createElement('li');
  // 카드 안에 별표·태그 버튼이 들어가야 해서, 카드 자체는 div로 만들고 "버튼 역할"을 줘요
  const card = document.createElement('div');
  card.className = 'record-card';
  card.setAttribute('role', 'button');
  card.tabIndex = 0;
  card.addEventListener('click', () => openSheet(record));
  card.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && event.target === card) openSheet(record);
  });

  // 윗줄: 분류·작성 중·결과물 개수 + 오른쪽 별표
  const top = document.createElement('div');
  top.className = 'card-top';
  const badges = document.createElement('div');
  badges.className = 'card-badges';

  const badge = document.createElement('span');
  badge.className = 'badge';
  badge.textContent = record.category;
  badges.appendChild(badge);

  // 빠른 메모 등으로 아직 다 쓰지 않은 이력
  if (record.isDraft) {
    const draftBadge = document.createElement('span');
    draftBadge.className = 'badge draft';
    draftBadge.textContent = '작성 중';
    badges.appendChild(draftBadge);
  }

  // 첨부가 있으면 개수 표시
  const count = attachmentCounts.get(record.id) || 0;
  if (count > 0) {
    const attachCount = document.createElement('span');
    attachCount.className = 'attach-count';
    attachCount.textContent = `결과물 ${count}개`;
    badges.appendChild(attachCount);
  }

  const importantBtn = document.createElement('button');
  importantBtn.type = 'button';
  importantBtn.className = 'important-btn';
  importantBtn.classList.toggle('on', !!record.important);
  importantBtn.textContent = record.important ? '★' : '☆';
  importantBtn.setAttribute('aria-label', record.important ? '중요 표시 해제' : '중요 표시');
  importantBtn.addEventListener('click', (event) => {
    event.stopPropagation(); // 카드가 열리지 않게
    toggleImportant(record);
  });

  top.append(badges, importantBtn);

  const title = document.createElement('span');
  title.className = 'title';
  title.textContent = record.title;

  const period = document.createElement('span');
  period.className = 'period';
  period.textContent = formatPeriod(record);

  card.append(top, title, period);

  // 내용이 있으면 첫 줄만 미리보기
  const firstLine = (record.content || '').trim().split('\n')[0];
  if (firstLine) {
    const preview = document.createElement('span');
    preview.className = 'preview';
    preview.textContent = firstLine;
    card.appendChild(preview);
  }

  // 태그: 누르면 그 태그가 달린 이력만 모아 보기
  const tags = sortTags(record.tags || []);
  if (tags.length > 0) {
    const tagRow = document.createElement('div');
    tagRow.className = 'card-tags';
    for (const tag of tags) {
      const tagBtn = document.createElement('button');
      tagBtn.type = 'button';
      tagBtn.className = 'card-tag';
      tagBtn.textContent = `#${tag}`;
      tagBtn.addEventListener('click', (event) => {
        event.stopPropagation(); // 카드가 열리지 않게
        filterByTag(tag);
      });
      tagRow.appendChild(tagBtn);
    }
    card.appendChild(tagRow);
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
  tagPicker.load(record ? record.tags : []);

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
    tags: [],
    important: false,
    isDraft: true,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await saveRecord(record);
    await reloadData();
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
    tags: tagPicker.getSelected(),
    important: existing ? !!existing.important : false,
    isDraft: fDraft.checked,
    createdAt: existing ? existing.createdAt : now,
    updatedAt: now,
  };

  const { added, removedIds } = attachmentEditor.getChanges();

  try {
    await saveRecord(record, added, removedIds);
    await reloadData();
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
    await reloadData();
    closeSheet();
  } catch (e) {
    console.error(e);
    showError('삭제하지 못했어요. 다시 시도해 주세요.');
  }
}

// 저장소에서 이력·순간·태그를 다시 읽어 와서 화면 갱신
async function reloadData() {
  records = await getAllRecords();
  moments = await getAllMoments();
  attachmentCounts = await countAttachmentsByOwner();
  await loadCustomTags();
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
  refreshTagSettings().catch(console.error);
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

  // 버튼에 동작 연결 (+ 버튼은 지금 탭에 맞는 입력 창을 열어요)
  addBtn.addEventListener('click', () => {
    if (activeTab === 'records') openSheet(null);
    else openMomentSheet(null);
  });
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
  memoBtn.addEventListener('click', openMemo);
  document.getElementById('memo-close-btn').addEventListener('click', closeMemo);
  memoForm.addEventListener('submit', handleMemoSubmit);
  memoBackdrop.addEventListener('click', (event) => {
    if (event.target === memoBackdrop) closeMemo();
  });

  // 검색: 글자를 칠 때마다 바로 결과 갱신
  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value;
    render();
  });
  // 휴대폰 키보드의 "검색"을 누르면 키보드 내리기
  searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') searchInput.blur();
  });

  sortBtn.addEventListener('click', () => {
    sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
    savePref('sortOrder', sortOrder);
    render();
  });

  // 탭 바꾸기
  for (const btn of tabButtons) {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tab;
      savePref('activeTab', activeTab);
      render();
      window.scrollTo(0, 0);
    });
  }
  initMoments();

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

  reloadData()
    .then(() => checkBackupReminder([...records, ...moments]))
    .catch((e) => {
      console.error(e);
      emptyEl.hidden = false;
      emptyEl.textContent = '저장된 기록을 불러오지 못했어요. 브라우저의 시크릿 모드에서는 저장이 안 될 수 있어요.';
    });
}

init();
