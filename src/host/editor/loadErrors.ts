import { t } from '@vscode/l10n';

/** Which part of the graph could not be read. `repo` covers anything before refs, such as finding repositories. */
export type GraphLoadStage = 'repo' | 'refs' | 'commits';

export class GraphLoadError extends Error {
  constructor(
    readonly stage: GraphLoadStage,
    readonly detail: string,
  ) {
    super(detail);
    this.name = 'GraphLoadError';
  }
}

export function errorText(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.trim() || t('Unknown error');
}

export function toLoadError(stage: GraphLoadStage, error: unknown): GraphLoadError {
  return error instanceof GraphLoadError ? error : new GraphLoadError(stage, errorText(error));
}

/** Runs a load the graph cannot do without. A failure comes back as `error` next to the fallback instead of being dropped. */
export async function settleLoad<T>(stage: GraphLoadStage, task: Promise<T>, fallback: T): Promise<{ value: T; error?: GraphLoadError }> {
  try {
    return { value: await task };
  } catch (error) {
    return { value: fallback, error: toLoadError(stage, error) };
  }
}

/** Writes each message once until it changes or is cleared, so automatic reloads do not repeat the same line. */
export interface LoadLog {
  report(key: string, text: string, force?: boolean): void;
  clear(key: string): void;
}

export function createLoadLog(write: (line: string) => void): LoadLog {
  const last = new Map<string, string>();
  return {
    report(key, text, force = false) {
      if (!force && last.get(key) === text) return;
      last.set(key, text);
      try {
        write(text);
      } catch {
        /* a closed output channel must not break loading */
      }
    },
    clear(key) {
      last.delete(key);
    },
  };
}

/** Runs a load the graph can do without. A failure is logged and the fallback is used. */
export async function optionalLoad<T>(log: LoadLog, key: string, label: string, task: Promise<T>, fallback: T): Promise<T> {
  try {
    const value = await task;
    log.clear(key);
    return value;
  } catch (error) {
    log.report(key, `${label}: ${errorText(error)}`);
    return fallback;
  }
}

/** `git log HEAD` in a repository whose current branch has no commits yet. */
export function isUnbornHeadError(text: string): boolean {
  return /does not have any commits yet|bad default revision 'HEAD'|ambiguous argument 'HEAD': unknown revision/i.test(text);
}

function stageText(stage: GraphLoadStage): string {
  switch (stage) {
    case 'refs':
      return t('Could not read branches and tags');
    case 'commits':
      return t('Could not read commits');
    case 'repo':
      return t('Could not open the repository');
  }
}

export function graphLoadFailMessage(error: unknown): string {
  const failure = toLoadError('repo', error);
  return t('{0}: {1}', stageText(failure.stage), failure.detail);
}

/**
 * What to do when the graph could not be loaded.
 * A graph that is already showing for the same repository stays. Automatic reloads only write to the output,
 * unless there is nothing correct on screen.
 */
export function loadFailurePlan(o: { fromWatch: boolean; hasSnapshot: boolean; sameRepo: boolean }): {
  postSnapshot: boolean;
  showFail: boolean;
} {
  const postSnapshot = !o.hasSnapshot || !o.sameRepo;
  return { postSnapshot, showFail: !o.fromWatch || postSnapshot };
}
