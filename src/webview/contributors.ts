import { personLabel } from '../shared/personFilter';
import { normalizeActivityPeriod, type ActivityPeriod, type ContributorReport, type ContributorStat, type ContributorsToHost, type HostToContributors } from '../shared/contributors';

type VsCodeApi = {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

type SortKey = 'name' | 'commits' | 'additions' | 'deletions';
type SortDir = 'asc' | 'desc';
type PersonField = 'author' | 'committer';

type PageState = { repo?: string; period?: ActivityPeriod };

export function startContributorsPage(vscode: VsCodeApi): void {
  const post = (message: ContributorsToHost) => vscode.postMessage(message);
  const saved = pageState(vscode);
  let repoPath = document.body.dataset.repo ?? saved.repo ?? '';
  let period = normalizeActivityPeriod(saved.period);

  let report: ContributorReport | null = null;
  let field: PersonField = 'author';
  let sortKey: SortKey = 'commits';
  let sortDir: SortDir = 'desc';
  let query = '';
  let phase: 'loading' | 'ready' | 'error' = 'loading';
  let error = '';

  const status = document.getElementById('contrib-status');
  const rows = document.getElementById('contrib-rows');
  const repoLabel = document.getElementById('contrib-repo');
  const reload = document.getElementById('contrib-reload');
  const periodSelect = document.getElementById('contrib-period');
  const custom = document.getElementById('contrib-custom');
  const fromInput = document.getElementById('contrib-from');
  const toInput = document.getElementById('contrib-to');
  const periodNote = document.getElementById('contrib-period-note');
  if (!status || !rows || !repoLabel || !(reload instanceof HTMLButtonElement)) return;
  if (!(periodSelect instanceof HTMLSelectElement) || !custom || !(fromInput instanceof HTMLInputElement) || !(toInput instanceof HTMLInputElement) || !periodNote) return;

  const saveState = (repo = repoPath) => {
    if (repo) repoPath = repo;
    vscode.setState({ repo: repoPath, period });
  };

  const syncPeriodControls = () => {
    if (period.kind === 'days') periodSelect.value = String(period.days);
    else if (period.kind === 'range') {
      periodSelect.value = 'custom';
      fromInput.value = period.from;
      toInput.value = period.to;
    } else periodSelect.value = 'all';
    custom.hidden = periodSelect.value !== 'custom';
    periodNote.textContent = field === 'author' ? 'Author date' : 'Committer date';
  };

  const readPeriod = (): ActivityPeriod => {
    const value = periodSelect.value;
    if (value === '7' || value === '30' || value === '90' || value === '365') return { kind: 'days', days: Number(value) };
    if (value === 'custom') return { kind: 'range', from: fromInput.value, to: toInput.value };
    return { kind: 'all' };
  };

  const publishPeriod = () => {
    custom.hidden = periodSelect.value !== 'custom';
    const next = readPeriod();
    if (next.kind === 'range' && !next.from && !next.to) {
      if (period.kind !== 'range') return;
      period = { kind: 'all' };
    } else period = normalizeActivityPeriod(next);
    report = null;
    phase = 'loading';
    saveState();
    paint();
    post({ type: 'setPeriod', period });
  };

  const setStatus = (text: string) => {
    status.hidden = !text;
    status.textContent = text;
  };

  const paint = () => {
    syncSortHeaders();
    rows.replaceChildren();
    const people = (report ? (field === 'author' ? report.authors : report.committers) : []).filter((person) => matches(person, query));
    people.sort((a, b) => compareStats(a, b, sortKey, sortDir));
    for (const person of people) rows.append(row(person));
    if (phase === 'loading') setStatus('Reading history…');
    else if (phase === 'error') setStatus(error);
    else if (people.length === 0) setStatus(query ? 'No matching contributors.' : period.kind === 'all' ? 'No commits.' : 'No commits in this period.');
    else setStatus('');
  };

  const showReport = (payload: ContributorReport) => {
    report = payload;
    phase = 'ready';
    error = '';
    saveState(payload.repoPath);
    repoLabel.textContent = payload.repoName;
    repoLabel.title = payload.repoPath;
    reload.disabled = false;
    paint();
  };

  window.addEventListener('message', (ev: MessageEvent<HostToContributors>) => {
    const message = ev.data;
    if (!message || typeof message !== 'object' || !('type' in message)) return;
    if (message.type === 'busy') {
      reload.disabled = message.on;
      if (message.on) {
        phase = 'loading';
        if (message.repoPath && report?.repoPath !== message.repoPath) report = null;
        if (message.repoPath) {
          saveState(message.repoPath);
          repoLabel.textContent = message.repoName ?? '';
          repoLabel.title = message.repoPath;
        }
        paint();
      }
      return;
    }
    if (message.type === 'fail') {
      phase = 'error';
      error = message.message || 'Could not read contributor history.';
      reload.disabled = false;
      paint();
      return;
    }
    if (message.type === 'report') showReport(message.payload);
  });

  for (const next of ['author', 'committer'] as const) {
    document.getElementById(`contrib-tab-${next}`)?.addEventListener('click', () => {
      field = next;
      for (const tab of ['author', 'committer'] as const) {
        document.getElementById(`contrib-tab-${tab}`)?.setAttribute('aria-selected', tab === field ? 'true' : 'false');
      }
      periodNote.textContent = field === 'author' ? 'Author date' : 'Committer date';
      paint();
    });
  }

  periodSelect.addEventListener('change', publishPeriod);
  fromInput.addEventListener('change', publishPeriod);
  toInput.addEventListener('change', publishPeriod);

  document.getElementById('contrib-q')?.addEventListener('input', (ev) => {
    query = (ev.target as HTMLInputElement).value.trim().toLowerCase();
    paint();
  });

  document.querySelector('.contrib-table thead')?.addEventListener('click', (ev) => {
    if (!(ev.target instanceof Element)) return;
    const button = ev.target.closest<HTMLButtonElement>('button[data-sort]');
    const key = button?.dataset.sort;
    if (key !== 'name' && key !== 'commits' && key !== 'additions' && key !== 'deletions') return;
    if (sortKey === key) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    else {
      sortKey = key;
      sortDir = key === 'name' ? 'asc' : 'desc';
    }
    paint();
  });

  reload.addEventListener('click', () => post({ type: 'reload' }));
  syncPeriodControls();
  saveState();
  paint();
  post({ type: 'ready', period });

  function syncSortHeaders(): void {
    for (const button of document.querySelectorAll<HTMLButtonElement>('.contrib-table button[data-sort]')) {
      const key = button.dataset.sort;
      const header = button.closest('th');
      if (!header) continue;
      header.setAttribute('aria-sort', key === sortKey ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none');
    }
  }
}

function pageState(vscode: VsCodeApi): PageState {
  const raw = vscode.getState();
  if (!raw || typeof raw !== 'object') return {};
  return raw as PageState;
}

function matches(person: ContributorStat, query: string): boolean {
  if (!query) return true;
  return person.name.toLowerCase().includes(query) || person.email.toLowerCase().includes(query);
}

function compareStats(a: ContributorStat, b: ContributorStat, key: SortKey, dir: SortDir): number {
  const sign = dir === 'asc' ? 1 : -1;
  if (key === 'name') return sign * (a.name.localeCompare(b.name) || a.email.localeCompare(b.email));
  const diff = a[key] - b[key];
  if (diff !== 0) return sign * diff;
  return a.name.localeCompare(b.name) || a.email.localeCompare(b.email);
}

function row(person: ContributorStat): HTMLTableRowElement {
  const tr = document.createElement('tr');
  const name = document.createElement('td');
  name.textContent = personLabel(person.name, person.email);
  const commits = numCell(String(person.commits));
  const additions = numCell(`+${person.additions}`, 'file-add');
  const deletions = numCell(`-${person.deletions}`, 'file-del');
  tr.append(name, commits, additions, deletions);
  return tr;
}

function numCell(text: string, className?: string): HTMLTableCellElement {
  const td = document.createElement('td');
  td.className = className ? `num ${className}` : 'num';
  td.textContent = text;
  return td;
}
