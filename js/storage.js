// ===== 저장 공간 확인과 영구 저장 요청 =====

const STORAGE_WARN_RATIO = 0.8; // 80% 넘게 쓰면 경고

// 지금 쓰는 용량과 쓸 수 있는 최대 용량 (브라우저가 지원하지 않으면 null)
async function getStorageUsage() {
  if (!navigator.storage || !navigator.storage.estimate) return null;
  const { usage = 0, quota = 0 } = await navigator.storage.estimate();
  return { usage, quota, ratio: quota ? usage / quota : 0 };
}

// "영구 저장" 권한 요청.
// 허락되면 휴대폰 공간이 부족해도 브라우저가 이 앱의 데이터를 함부로 지우지 않아요.
async function requestPersistentStorage() {
  if (!navigator.storage || !navigator.storage.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}

// 설정 화면의 "저장 공간" 정보 갱신
async function refreshStorageInfo() {
  const usageText = document.getElementById('storage-usage-text');
  const bar = document.getElementById('storage-meter-bar');
  const warning = document.getElementById('storage-warning');

  const usage = await getStorageUsage();
  if (!usage || !usage.quota) {
    usageText.textContent = '이 브라우저에서는 확인할 수 없어요';
    bar.style.width = '0%';
    warning.hidden = true;
  } else {
    const percent = Math.min(100, usage.ratio * 100);
    usageText.textContent =
      `${formatBytes(usage.usage)} / ${formatBytes(usage.quota)} (${percent < 1 ? percent.toFixed(1) : Math.round(percent)}%)`;
    bar.style.width = `${percent}%`;
    const almostFull = usage.ratio >= STORAGE_WARN_RATIO;
    bar.classList.toggle('danger', almostFull);
    warning.hidden = !almostFull;
  }

  const persistText = document.getElementById('persist-text');
  const persistBtn = document.getElementById('persist-btn');
  if (!navigator.storage || !navigator.storage.persisted) {
    persistText.textContent = '이 브라우저에서는 지원하지 않아요';
    persistBtn.hidden = true;
  } else {
    const persisted = await navigator.storage.persisted();
    persistText.textContent = persisted ? '켜짐' : '꺼짐';
    persistBtn.hidden = persisted;
  }
}

// 첨부를 저장한 뒤 공간이 거의 찼으면 알려줘요
async function warnIfStorageAlmostFull() {
  const usage = await getStorageUsage();
  if (usage && usage.ratio >= STORAGE_WARN_RATIO) {
    showToast('저장 공간이 80% 넘게 찼어요. 설정에서 확인해 주세요.');
  }
}

function initStorage() {
  document.getElementById('persist-btn').addEventListener('click', async () => {
    const granted = await requestPersistentStorage();
    showToast(granted
      ? '영구 저장이 켜졌어요.'
      : '브라우저가 아직 허락하지 않았어요. 홈 화면에 추가한 뒤 다시 시도해 보세요.');
    refreshStorageInfo().catch(console.error);
  });

  // 앱을 열 때 한 번 조용히 요청해요
  requestPersistentStorage().catch(console.error);
}
