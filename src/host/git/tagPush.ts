/** Some remotes were updated before this push stopped. */
export class PartialRemotePushError extends Error {
  readonly pushedRemotes: string[];

  constructor(message: string, pushedRemotes: string[]) {
    super(message);
    this.name = 'PartialRemotePushError';
    this.pushedRemotes = pushedRemotes;
  }
}

/** The local tag exists. Remotes after the failed push were not attempted. */
export class TagPushError extends PartialRemotePushError {
  readonly pushed: boolean;

  constructor(message: string, pushedRemotes: string[]) {
    super(message, pushedRemotes);
    this.name = 'TagPushError';
    this.pushed = pushedRemotes.length > 0;
  }
}

export async function pushTagToRemotes(remotes: string[], push: (remote: string) => Promise<void>): Promise<void> {
  const done: string[] = [];
  for (const remote of remotes) {
    try {
      await push(remote);
      done.push(remote);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      const where = done.length ? ` and pushed to ${done.join(', ')}` : '';
      throw new TagPushError(`Local tag created${where}. ${detail}`, done);
    }
  }
}
