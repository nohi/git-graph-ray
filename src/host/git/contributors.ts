import { contributorLogArgs, parseContributorLog, type ActivityRange, type ContributorStat } from '../../shared/contributors';
import { gitOk } from './runner';

export async function loadContributors(
  git: string,
  cwd: string,
  mailmap: boolean,
  range: ActivityRange | null,
): Promise<{ authors: ContributorStat[]; committers: ContributorStat[] }> {
  const stdout = await gitOk(git, cwd, contributorLogArgs(mailmap));
  return parseContributorLog(stdout, range);
}
