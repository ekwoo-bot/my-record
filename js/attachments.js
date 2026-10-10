// ===== 결과물 첨부 (사진·파일·링크) =====

const MAX_IMAGE_SIDE = 1600;             // 사진의 긴 쪽을 최대 1600px로 줄여요
const IMAGE_QUALITY = 0.8;               // JPEG 압축 품질 (0~1)
const MAX_FILE_SIZE = 10 * 1024 * 1024;  // 파일 하나 최대 10MB
// 크기를 줄일 수 있는 사진 형식 (GIF는 움직임이 사라지므로 제외)
const COMPRESSIBLE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/bmp'];

// 1234567 → "1.2MB"
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)}GB`;
}

function isImage(item) {
  return item.kind === 'file' && (item.type || '').startsWith('image/');
}

// ----- 사진 줄이기 -----

function loadImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('사진을 읽지 못했어요')); };
    img.src = url;
  });
}

// 사진을 긴 쪽 1600px 이하의 JPEG로 줄여요. 줄일 수 없거나 이득이 없으면 원본을 돌려줘요.
async function compressImage(file) {
  let img;
  try {
    img = await loadImage(file);
  } catch (e) {
    return file; // 브라우저가 읽지 못하는 사진 형식이면 원본 그대로
  }

  const width = img.naturalWidth;
  const height = img.naturalHeight;
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);

  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; // 투명한 배경(PNG)은 흰색으로
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', IMAGE_QUALITY));
  if (!blob) return file;
  // 크기를 줄이지 않았는데 오히려 용량이 커졌다면 원본이 나아요
  if (scale === 1 && blob.size >= file.size) return file;
  return blob;
}

// 고른 파일을 저장할 수 있는 첨부 모양으로 만들어요. 10MB가 넘으면 null을 돌려줘요.
async function prepareFileAttachment(file, ownerId) {
  let blob = file;
  let name = file.name;
  let type = file.type || 'application/octet-stream';

  if (COMPRESSIBLE_TYPES.includes(file.type)) {
    const compressed = await compressImage(file);
    if (compressed !== file) {
      blob = compressed;
      type = 'image/jpeg';
      name = name.replace(/\.[^.]+$/, '') + '.jpg';
    }
  }

  if (blob.size > MAX_FILE_SIZE) return null;

  return { id: makeId(), ownerId, kind: 'file', name, type, size: blob.size, blob, createdAt: Date.now() };
}

// "naver.com" 처럼 앞에 https://가 없으면 붙여 줘요. 올바른 주소가 아니면 null
function normalizeUrl(text) {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : 'https://' + trimmed;
  try {
    const url = new URL(withScheme);
    return url.hostname.includes('.') ? url.href : null;
  } catch (e) {
    return null;
  }
}

// ----- 첨부 열어 보기 -----

// 사진은 앱 안에서 크게, 그 밖의 파일과 링크는 새 탭에서 열어요
function openAttachment(item) {
  if (isImage(item)) {
    showImageViewer(item.blob);
    return;
  }
  const link = document.createElement('a');
  link.target = '_blank';
  link.rel = 'noopener';
  if (item.kind === 'link') {
    link.href = item.url;
  } else {
    const url = URL.createObjectURL(item.blob);
    link.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
  }
  document.body.appendChild(link);
  link.click();
  link.remove();
}

let viewerUrl = null;

function showImageViewer(blob) {
  const viewer = document.getElementById('image-viewer');
  if (viewerUrl) URL.revokeObjectURL(viewerUrl);
  viewerUrl = URL.createObjectURL(blob);
  document.getElementById('viewer-img').src = viewerUrl;
  viewer.hidden = false;
}

function closeImageViewer() {
  document.getElementById('image-viewer').hidden = true;
  document.getElementById('viewer-img').removeAttribute('src');
  if (viewerUrl) URL.revokeObjectURL(viewerUrl);
  viewerUrl = null;
}

// ----- 입력 창 안의 "결과물" 영역 -----
// 추가/삭제는 바로 저장하지 않고 모아 두었다가, "저장" 버튼을 누를 때 한꺼번에 저장해요.
// (다음 단계의 "의미 있는 순간"에서도 재사용할 수 있도록 만들어 둬요)

function createAttachmentEditor(root) {
  const listEl = root.querySelector('.attachment-list');
  const addFileBtn = root.querySelector('.js-add-file');
  const addLinkBtn = root.querySelector('.js-add-link');
  const fileInput = root.querySelector('.js-file-input');
  const linkForm = root.querySelector('.js-link-form');
  const linkUrl = root.querySelector('.js-link-url');
  const linkName = root.querySelector('.js-link-name');
  const statusEl = root.querySelector('.js-attach-status');

  let ownerId = null;
  let items = [];       // 화면에 보이는 첨부 목록
  let removedIds = [];  // 지우기로 한 기존 첨부의 id
  let thumbUrls = [];   // 미리보기 이미지 주소 (나중에 정리용)

  function setStatus(message) {
    statusEl.textContent = message;
    statusEl.hidden = !message;
  }

  function releaseThumbs() {
    thumbUrls.forEach((url) => URL.revokeObjectURL(url));
    thumbUrls = [];
  }

  function render() {
    releaseThumbs();
    listEl.replaceChildren();
    for (const item of items) listEl.appendChild(createItem(item));
  }

  function createItem(item) {
    const li = document.createElement('li');
    li.className = 'attachment-item';

    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.className = 'attachment-open';
    openBtn.addEventListener('click', () => openAttachment(item));

    if (isImage(item)) {
      const img = document.createElement('img');
      const url = URL.createObjectURL(item.blob);
      thumbUrls.push(url);
      img.src = url;
      img.alt = '';
      img.className = 'attachment-thumb';
      openBtn.appendChild(img);
    } else {
      const icon = document.createElement('span');
      icon.className = 'attachment-icon';
      icon.textContent = item.kind === 'link' ? '링크' : '파일';
      openBtn.appendChild(icon);
    }

    const text = document.createElement('span');
    text.className = 'attachment-text';
    const name = document.createElement('span');
    name.className = 'attachment-name';
    name.textContent = item.name;
    const meta = document.createElement('span');
    meta.className = 'attachment-meta';
    meta.textContent = item.kind === 'link' ? new URL(item.url).hostname : formatBytes(item.size);
    text.append(name, meta);
    openBtn.appendChild(text);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'attachment-remove';
    removeBtn.textContent = '×';
    removeBtn.setAttribute('aria-label', `${item.name} 삭제`);
    removeBtn.addEventListener('click', () => {
      if (!item.isNew) removedIds.push(item.id);
      items = items.filter((i) => i !== item);
      render();
    });

    li.append(openBtn, removeBtn);
    return li;
  }

  async function addFiles(files) {
    addFileBtn.disabled = true;
    setStatus('파일을 준비하는 중이에요...');
    const tooLarge = [];

    for (const file of files) {
      try {
        const attachment = await prepareFileAttachment(file, ownerId);
        if (attachment) items.push({ ...attachment, isNew: true });
        else tooLarge.push(file.name);
      } catch (e) {
        console.error(e);
        tooLarge.push(file.name);
      }
    }

    addFileBtn.disabled = false;
    setStatus('');
    render();

    if (tooLarge.length > 0) {
      alert(
        `아래 파일은 10MB가 넘어서 저장하지 않았어요.\n\n${tooLarge.join('\n')}\n\n` +
        '구글 드라이브 같은 곳에 올린 뒤 링크로 첨부해주세요.'
      );
    }
  }

  function showLinkForm(show) {
    linkForm.hidden = !show;
    addLinkBtn.hidden = show;
    linkUrl.value = '';
    linkName.value = '';
    if (show) linkUrl.focus();
  }

  function addLink() {
    const url = normalizeUrl(linkUrl.value);
    if (!url) {
      alert('올바른 링크 주소를 입력해 주세요. 예: https://drive.google.com/...');
      return;
    }
    const name = linkName.value.trim() || new URL(url).hostname;
    items.push({ id: makeId(), ownerId, kind: 'link', name, url, createdAt: Date.now(), isNew: true });
    showLinkForm(false);
    render();
  }

  // 버튼 연결
  addFileBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const files = [...fileInput.files];
    fileInput.value = '';
    if (files.length) addFiles(files);
  });
  // 링크 칸은 이력에만 있어요 (의미 있는 순간은 사진만)
  if (addLinkBtn) {
    addLinkBtn.addEventListener('click', () => showLinkForm(true));
    root.querySelector('.js-link-add').addEventListener('click', addLink);
    root.querySelector('.js-link-cancel').addEventListener('click', () => showLinkForm(false));
    // 링크 칸에서 Enter를 누르면 이력 전체가 저장되지 않고 링크만 추가되게
    for (const input of [linkUrl, linkName]) {
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          addLink();
        }
      });
    }
  }

  return {
    // 입력 창을 열 때: 어느 항목의 첨부인지와 기존 첨부 목록을 받아요
    load(newOwnerId, existing) {
      ownerId = newOwnerId;
      items = [...existing];
      removedIds = [];
      if (addLinkBtn) showLinkForm(false);
      setStatus('');
      render();
    },
    // 저장할 때: 새로 추가한 것과 지운 것을 알려줘요
    getChanges() {
      const added = items.filter((i) => i.isNew).map(({ isNew, ...rest }) => rest);
      return { added, removedIds: [...removedIds] };
    },
    // 파일을 준비하는 중인지 (준비 중에는 저장하지 않게)
    isBusy() {
      return addFileBtn.disabled;
    },
    // 입력 창을 닫을 때 정리
    clear() {
      releaseThumbs();
      items = [];
      removedIds = [];
      listEl.replaceChildren();
    },
  };
}
