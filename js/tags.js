// ===== 역량 태그와 검색 =====

const DEFAULT_TAGS = ['리더십', '협업', '문제 해결', '소통', '책임감', '도전', '분석력'];
const MAX_TAG_LENGTH = 20;

let customTags = []; // 내가 직접 만든 태그 이름들 (만든 순서대로)

// "#  문제   해결 " → "문제 해결"
function normalizeTagName(text) {
  return text.trim().replace(/^#+/, '').trim().replace(/\s+/g, ' ').slice(0, MAX_TAG_LENGTH);
}

async function loadCustomTags() {
  const list = await getAllTags();
  customTags = list.sort((a, b) => a.createdAt - b.createdAt).map((t) => t.name);
}

// 고를 수 있는 태그 목록: 기본 태그 → 내가 만든 태그 → (혹시 빠진) 이력에 달린 태그
function getAvailableTags(extraNames = []) {
  return [...new Set([...DEFAULT_TAGS, ...customTags, ...extraNames])];
}

// 태그를 정해진 순서(기본 → 내가 만든 순)로 정렬
function sortTags(names) {
  const order = getAvailableTags(names);
  return [...names].sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

// 새 태그 만들기. 이미 있으면 그 이름을 그대로 돌려줘요
async function addCustomTag(text) {
  const name = normalizeTagName(text);
  if (!name) return null;
  if (!DEFAULT_TAGS.includes(name) && !customTags.includes(name)) {
    await saveTag({ name, createdAt: Date.now() });
    customTags.push(name);
  }
  return name;
}

// ----- 검색 -----

// 검색어를 띄어쓰기로 나눠서, 모든 단어가 어딘가에 들어 있으면 찾은 것으로 봐요
// 예: "해커톤 리더" → 제목에 해커톤, 태그에 리더십이 있으면 찾음
function matchesQuery(texts, query) {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = texts.filter(Boolean).join('\n').toLowerCase();
  return words.every((word) => haystack.includes(word));
}

// ----- 입력 창 안의 태그 고르기 -----

function createTagPicker(root) {
  const chipsEl = root.querySelector('.tag-picker');
  const input = root.querySelector('.js-new-tag');
  const addBtn = root.querySelector('.js-add-tag');
  let selected = new Set();

  function render() {
    chipsEl.replaceChildren();
    for (const name of getAvailableTags([...selected])) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'tag-chip';
      const isOn = selected.has(name);
      chip.classList.toggle('selected', isOn);
      chip.setAttribute('aria-pressed', String(isOn));
      chip.textContent = `#${name}`;
      chip.addEventListener('click', () => {
        if (selected.has(name)) selected.delete(name);
        else selected.add(name);
        render();
      });
      chipsEl.appendChild(chip);
    }
  }

  async function addFromInput() {
    try {
      const name = await addCustomTag(input.value);
      if (!name) return;
      selected.add(name); // 새로 만든 태그는 바로 선택
      input.value = '';
      render();
    } catch (e) {
      console.error(e);
      alert('태그를 추가하지 못했어요. 다시 시도해 주세요.');
    }
  }

  addBtn.addEventListener('click', addFromInput);
  // Enter를 누르면 이력 전체가 저장되지 않고 태그만 추가되게
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addFromInput();
    }
  });

  return {
    load(tags) {
      selected = new Set(tags || []);
      input.value = '';
      render();
    },
    getSelected() {
      return sortTags([...selected]);
    },
  };
}

// ----- 설정 화면: 내가 만든 태그 관리 -----

async function refreshTagSettings() {
  const listEl = document.getElementById('custom-tag-list');
  const emptyEl = document.getElementById('custom-tag-empty');
  listEl.replaceChildren();
  emptyEl.hidden = customTags.length > 0;

  for (const name of customTags) {
    const li = document.createElement('li');
    li.className = 'custom-tag-item';
    const label = document.createElement('span');
    label.textContent = `#${name}`;
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'text-btn danger-text';
    removeBtn.textContent = '삭제';
    removeBtn.addEventListener('click', () => handleDeleteTag(name));
    li.append(label, removeBtn);
    listEl.appendChild(li);
  }
}

async function handleDeleteTag(name) {
  const usedCount = records.filter((r) => (r.tags || []).includes(name)).length;
  const message = usedCount > 0
    ? `'#${name}' 태그를 삭제할까요?\n이 태그가 달린 이력 ${usedCount}개에서도 빠져요.`
    : `'#${name}' 태그를 삭제할까요?`;
  if (!confirm(message)) return;

  try {
    await deleteTagEverywhere(name);
    customTags = customTags.filter((t) => t !== name);
    if (activeFilter === `tag:${name}`) activeFilter = 'all';
    await loadRecords();
    await refreshTagSettings();
    showToast('태그를 삭제했어요.');
  } catch (e) {
    console.error(e);
    alert('태그를 삭제하지 못했어요. 다시 시도해 주세요.');
  }
}
