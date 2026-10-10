// ===== 기간별 그룹화 =====
// 내가 만든 기간(예: 1학년, 군복무) 또는 연도별로 기록을 묶어서 보여줘요.

const periodBackdrop = document.getElementById('period-backdrop');
const periodForm = document.getElementById('period-form');
const periodSheetTitle = document.getElementById('period-sheet-title');
const periodDeleteBtn = document.getElementById('period-delete-btn');
const periodError = document.getElementById('period-error');
const pName = document.getElementById('p-name');
const pStart = document.getElementById('p-start');
const pEnd = document.getElementById('p-end');

let periods = [];             // 내가 만든 기간들
let editingPeriodId = null;   // 수정 중인 기간의 id (새로 만들 때는 null)

// ----- 어느 기간에 속하는지 찾기 -----

// 종료일이 없으면 "진행 중" → 시작일 이후는 모두 포함
function periodContains(period, date) {
  return date >= period.startDate && (!period.endDate || date <= period.endDate);
}

// 기간 길이(일). 진행 중인 기간은 가장 긴 것으로 봐요
function periodLength(period) {
  if (!period.endDate) return Infinity;
  return (Date.parse(period.endDate) - Date.parse(period.startDate)) / DAY_MS;
}

// 날짜가 들어가는 기간 찾기. 여러 기간이 겹치면 가장 짧은(구체적인) 기간을 골라요
function findPeriodFor(date) {
  let best = null;
  for (const period of periods) {
    if (!periodContains(period, date)) continue;
    if (!best
      || periodLength(period) < periodLength(best)
      || (periodLength(period) === periodLength(best) && period.startDate > best.startDate)) {
      best = period;
    }
  }
  return best;
}

function formatPeriodRange(period) {
  const start = formatDate(period.startDate);
  return period.endDate ? `${start} ~ ${formatDate(period.endDate)}` : `${start} ~ 진행 중`;
}

// 정렬 방향(최신순/오래된순)에 맞춰 두 값을 비교
function compareByOrder(a, b) {
  const direction = sortOrder === 'asc' ? 1 : -1;
  if (a === b) return 0;
  return a < b ? -direction : direction;
}

// ----- 묶기 -----
// items는 이미 날짜순으로 정렬되어 있어요. 묶은 뒤에도 그 순서를 그대로 지켜요.

function groupByPeriod(items, getDate) {
  const groups = new Map();
  const others = [];
  for (const item of items) {
    const period = findPeriodFor(getDate(item));
    if (!period) {
      others.push(item);
      continue;
    }
    if (!groups.has(period.id)) {
      groups.set(period.id, { title: period.name, subtitle: formatPeriodRange(period), sortKey: period.startDate, items: [] });
    }
    groups.get(period.id).items.push(item);
  }
  const result = [...groups.values()].sort((a, b) => compareByOrder(a.sortKey, b.sortKey));
  // 어느 기간에도 속하지 않는 기록은 맨 아래 "기타"로
  if (others.length > 0) result.push({ title: '기타', subtitle: '', items: others });
  return result;
}

function groupByYear(items, getDate) {
  const groups = new Map();
  for (const item of items) {
    const year = getDate(item).slice(0, 4);
    if (!groups.has(year)) groups.set(year, { title: `${year}년`, subtitle: '', sortKey: year, items: [] });
    groups.get(year).items.push(item);
  }
  return [...groups.values()].sort((a, b) => compareByOrder(a.sortKey, b.sortKey));
}

// 리스트에 카드 넣기. 묶어 보기가 켜져 있으면 묶음 제목도 함께 넣어요
function appendItems(listEl, items, getDate, createCardFn) {
  if (groupMode === 'none') {
    for (const item of items) listEl.appendChild(createCardFn(item));
    return;
  }
  const groups = groupMode === 'year' ? groupByYear(items, getDate) : groupByPeriod(items, getDate);
  for (const group of groups) {
    listEl.appendChild(createGroupHeader(group));
    for (const item of group.items) listEl.appendChild(createCardFn(item));
  }
}

function createGroupHeader(group) {
  const li = document.createElement('li');
  li.className = 'group-header';
  const title = document.createElement('span');
  title.className = 'group-title';
  title.textContent = group.title;
  const meta = document.createElement('span');
  meta.className = 'group-meta';
  meta.textContent = group.subtitle ? `${group.subtitle} · ${group.items.length}개` : `${group.items.length}개`;
  li.append(title, meta);
  return li;
}

// ----- 설정 화면: 기간 관리 -----

async function loadPeriods() {
  periods = await getAllPeriods();
}

function refreshPeriodSettings() {
  const listEl = document.getElementById('period-list');
  document.getElementById('period-empty').hidden = periods.length > 0;
  listEl.replaceChildren();

  const sorted = [...periods].sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
  for (const period of sorted) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'period-item';
    const name = document.createElement('span');
    name.className = 'period-name';
    name.textContent = period.name;
    const range = document.createElement('span');
    range.className = 'period-range';
    range.textContent = formatPeriodRange(period);
    btn.append(name, range);
    btn.addEventListener('click', () => openPeriodSheet(period));
    li.appendChild(btn);
    listEl.appendChild(li);
  }
}

function openPeriodSheet(period) {
  editingPeriodId = period ? period.id : null;
  periodSheetTitle.textContent = period ? '기간 수정' : '기간 추가';
  periodDeleteBtn.hidden = !period;
  periodError.hidden = true;
  pName.value = period ? period.name : '';
  pStart.value = period ? period.startDate : '';
  pEnd.value = period ? period.endDate : '';
  periodBackdrop.hidden = false;
}

function closePeriodSheet() {
  periodBackdrop.hidden = true;
  editingPeriodId = null;
}

function showPeriodError(message) {
  periodError.textContent = message;
  periodError.hidden = false;
}

async function handlePeriodSubmit(event) {
  event.preventDefault();
  const name = pName.value.trim();
  const startDate = pStart.value;
  const endDate = pEnd.value;
  if (!name) return showPeriodError('기간 이름을 입력해 주세요.');
  if (!startDate) return showPeriodError('시작일을 선택해 주세요.');
  if (endDate && endDate < startDate) return showPeriodError('종료일은 시작일보다 빠를 수 없어요.');

  const existing = periods.find((p) => p.id === editingPeriodId);
  const period = {
    id: existing ? existing.id : makeId(),
    name,
    startDate,
    endDate,
    createdAt: existing ? existing.createdAt : Date.now(),
  };

  try {
    await savePeriod(period);
    await reloadData();
    refreshPeriodSettings();
    closePeriodSheet();
  } catch (e) {
    console.error(e);
    showPeriodError('저장하지 못했어요. 다시 시도해 주세요.');
  }
}

async function handlePeriodDelete() {
  if (!editingPeriodId) return;
  if (!confirm('이 기간을 삭제할까요?\n기간만 지워지고, 그 안의 기록은 그대로 남아요.')) return;
  try {
    await deletePeriod(editingPeriodId);
    await reloadData();
    refreshPeriodSettings();
    closePeriodSheet();
  } catch (e) {
    console.error(e);
    showPeriodError('삭제하지 못했어요. 다시 시도해 주세요.');
  }
}

function initPeriods() {
  document.getElementById('add-period-btn').addEventListener('click', () => openPeriodSheet(null));
  document.getElementById('period-close-btn').addEventListener('click', closePeriodSheet);
  periodForm.addEventListener('submit', handlePeriodSubmit);
  periodDeleteBtn.addEventListener('click', handlePeriodDelete);
  periodBackdrop.addEventListener('click', (event) => {
    if (event.target === periodBackdrop) closePeriodSheet();
  });
}
