// 테이프 해금과 기록. 브라우저(localStorage)에만 저장한다.
const KEY = 'noclip.progress';

export function loadProgress() {
  const base = { unlocked: 0, best: {}, clears: {} };
  try {
    return { ...base, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return base;
  }
}

function save(p) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {}
}

// 레벨을 비상구로 빠져나왔을 때: 클리어 횟수·최고 기록을 남기고 다음 테이프를 연다
export function recordClear(p, index, seconds, total) {
  p.clears[index] = (p.clears[index] || 0) + 1;
  if (!p.best[index] || seconds < p.best[index]) p.best[index] = Math.round(seconds);
  p.unlocked = Math.max(p.unlocked, Math.min(index + 1, total - 1));
  save(p);
}

export function formatTime(sec) {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
