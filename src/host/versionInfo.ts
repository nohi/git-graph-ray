/**
 * Notification toasts collapse `\n` into a space and then wrap wherever the row is full,
 * which splits `git version` from the version number. U+2028 is a mandatory line break.
 * Spaces inside an item are non-breaking so that item stays on one line.
 */
const DISPLAY_BREAK = '\u2028';

export function versionInformationLines(extensionVersion: string, gitVersion: string): readonly [string, string] {
  const git = gitVersion.replace(/\s+/g, ' ').trim();
  return [`Git Graph Ray v${extensionVersion}`, git || 'Git version unavailable'];
}

/** Plain text for the clipboard. One item per line. */
export function versionInformationText(extensionVersion: string, gitVersion: string): string {
  return versionInformationLines(extensionVersion, gitVersion).join('\n');
}

/** Same items as {@link versionInformationText}, with breaks the notification toast keeps. */
export function versionInformationDisplay(extensionVersion: string, gitVersion: string): string {
  return versionInformationLines(extensionVersion, gitVersion)
    .map((line) => line.replaceAll(' ', '\u00A0'))
    .join(DISPLAY_BREAK);
}
