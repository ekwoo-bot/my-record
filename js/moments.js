// ===== 의미 있는 순간 =====
// 이력과 따로, 기억하고 싶은 순간과 그때의 생각·감정을 남기는 곳이에요.

const momentListEl = document.getElementById('moment-list');
const momentBackdrop = document.getElementById('moment-backdrop');
const momentForm = document.getElementById('moment-form');
const momentSheetTitle = document.getElementById('moment-sheet-title');
const momentDeleteBtn = document.getElementById('moment-delete-btn');
const momentError = document.getElementById('moment-error');
const moDate = document.getElementById('mo-date');
const moTitle = document.getElementById('mo-title');
const moThoughts = document.getElementById('mo-thoughts');
const momentAttachmentEditor = createAttachmentEditor(document.getElementById('moment-attachments'));

let moments = [];            // 저장소에서 불러온 순간들
let editingMomentId = null;  // 수정 중인 순간의 id (새로 쓸 때는 null)
let formMomentId = null;     // 입력 창에 열린 순간의 id
let momentThumbUrls = [];    // 카드 사진 미리보기 주소 (다시 그릴 때 정리)

// 날짜순 정렬 (같은 날이면 먼저 쓴 것 기준). 정렬 방향은 이력과 같이 써요
function sortMoments(list) {
  const direction = sortOrder === 'asc' ? 1 : -1;
  return [...list].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -direction : direction;
    return (a.createdAt - b.createdAt) * direction;
  });
}

// 검색 대상: 제목, 생각·감정
function getMomentSearchTexts(moment) {
  return [moment.title, moment.thoughts];
}

// 검색어에 맞는 순간을 날짜순으로
function getVisibleMoments() {
  let list = moments;
  if (searchQuery.trim()) list = list.filter((m) => matchesQuery(getMomentSearchTexts(m), searchQuery));
  return sortMoments(list);
}

// ----- 화면 그리기 -----

function renderMoments() {
  momentThumbUrls.forEach((url) => URL.revokeObjectURL(url));
  momentThumbUrls = [];
  momentListEl.replaceChildren();

  const visible = getVisibleMoments();
  emptyEl.hidden = visible.length > 0;
  if (moments.length === 0) {
    emptyEl.textContent = '아직 기록한 순간이 없어요.\n아래 + 버튼으로 기억하고 싶은 순간을 남겨 보세요.';
  } else if (searchQuery.trim()) {
    emptyEl.textContent = `'${searchQuery.trim()}'에 맞는 순간이 없어요.`;
  }

  appendItems(momentListEl, visible, (moment) => moment.date, createMomentCard);
}

function createMomentCard(moment) {
  const li = document.createElement('li');
  const card = document.createElement('div');
  card.className = 'record-card moment-card';
  card.setAttribute('role', 'button');
  card.tabIndex = 0;
  card.addEventListener('click', () => openMomentSheet(moment));
  card.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') openMomentSheet(moment);
  });

  const body = document.createElement('div');
  body.className = 'moment-body';

  const date = document.createElement('span');
  date.className = 'period';
  date.textContent = formatDate(moment.date);

  const title = document.createElement('span');
  title.className = 'title';
  title.textContent = moment.title;

  body.append(date, title);

  if (moment.thoughts && moment.thoughts.trim()) {
    const thoughts = document.createElement('span');
    thoughts.className = 'moment-thoughts';
    thoughts.textContent = moment.thoughts.trim();
    body.appendChild(thoughts);
  }

  card.appendChild(body);

  // 사진이 있으면 첫 장을 오른쪽에 작게 보여줘요
  const photoCount = attachmentCounts.get(moment.id) || 0;
  if (photoCount > 0) {
    const thumbWrap = document.createElement('div');
    thumbWrap.className = 'moment-thumb-wrap';
    if (photoCount > 1) {
      const more = document.createElement('span');
      more.className = 'moment-photo-count';
      more.textContent = `${photoCount}장`;
      thumbWrap.appendChild(more);
    }
    card.appendChild(thumbWrap);
    loadMomentThumb(moment.id, thumbWrap);
  }

  li.appendChild(card);
  return li;
}

// 카드의 사진 미리보기는 화면을 먼저 그린 다음에 천천히 불러와요
async function loadMomentThumb(momentId, wrap) {
  try {
    const list = await getAttachmentsByOwner(momentId);
    const photo = list.find(isImage);
    if (!photo) return;
    const url = URL.createObjectURL(photo.blob);
    momentThumbUrls.push(url);
    const img = document.createElement('img');
    img.className = 'moment-thumb';
    img.alt = '';
    img.src = url;
    wrap.prepend(img);
  } catch (e) {
    console.error(e);
  }
}

// ----- 입력 창 -----

async function openMomentSheet(moment) {
  editingMomentId = moment ? moment.id : null;
  formMomentId = moment ? moment.id : makeId();

  let photos = [];
  if (moment) {
    try {
      photos = await getAttachmentsByOwner(moment.id);
    } catch (e) {
      console.error(e);
    }
  }
  momentAttachmentEditor.load(formMomentId, photos);

  momentSheetTitle.textContent = moment ? '순간 수정' : '의미 있는 순간';
  momentDeleteBtn.hidden = !moment;
  momentError.hidden = true;
  moDate.value = moment ? moment.date : dateToString(new Date());
  moTitle.value = moment ? moment.title : '';
  moThoughts.value = moment ? moment.thoughts : '';

  momentBackdrop.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeMomentSheet() {
  momentBackdrop.hidden = true;
  document.body.style.overflow = '';
  editingMomentId = null;
  formMomentId = null;
  momentAttachmentEditor.clear();
}

function showMomentError(message) {
  momentError.textContent = message;
  momentError.hidden = false;
}

async function handleMomentSubmit(event) {
  event.preventDefault();

  const title = moTitle.value.trim();
  const date = moDate.value;
  if (!date) return showMomentError('날짜를 선택해 주세요.');
  if (!title) return showMomentError('제목을 입력해 주세요.');
  if (momentAttachmentEditor.isBusy()) return showMomentError('사진을 준비하는 중이에요. 잠시 후 다시 저장해 주세요.');

  const now = Date.now();
  const existing = moments.find((m) => m.id === editingMomentId);
  const moment = {
    ...existing,
    id: formMomentId,
    date,
    title,
    thoughts: moThoughts.value,
    createdAt: existing ? existing.createdAt : now,
    updatedAt: now,
  };

  const { added, removedIds } = momentAttachmentEditor.getChanges();

  try {
    await saveMoment(moment, added, removedIds);
    await reloadData();
    closeMomentSheet();
    if (added.length > 0) warnIfStorageAlmostFull().catch(console.error);
  } catch (e) {
    console.error(e);
    if (e && e.name === 'QuotaExceededError') {
      showMomentError('저장 공간이 부족해요. 설정에서 저장 공간을 확인해 주세요.');
    } else {
      showMomentError('저장하지 못했어요. 다시 시도해 주세요.');
    }
  }
}

async function handleMomentDelete() {
  if (!editingMomentId) return;
  if (!confirm('이 순간을 삭제할까요? 사진도 함께 삭제되고, 되돌릴 수 없어요.')) return;

  try {
    await deleteMoment(editingMomentId);
    await reloadData();
    closeMomentSheet();
  } catch (e) {
    console.error(e);
    showMomentError('삭제하지 못했어요. 다시 시도해 주세요.');
  }
}

function initMoments() {
  momentForm.addEventListener('submit', handleMomentSubmit);
  momentDeleteBtn.addEventListener('click', handleMomentDelete);
  document.getElementById('moment-close-btn').addEventListener('click', closeMomentSheet);
  momentBackdrop.addEventListener('click', (event) => {
    if (event.target === momentBackdrop) closeMomentSheet();
  });
}
