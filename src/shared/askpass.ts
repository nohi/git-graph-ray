export function isSecretPrompt(prompt: string): boolean {
  return /password|passphrase|secret|token/i.test(prompt);
}
