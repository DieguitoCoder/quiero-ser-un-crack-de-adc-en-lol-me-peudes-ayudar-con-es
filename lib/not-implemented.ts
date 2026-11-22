/** Scaffold helper. Owner: orion. Delete once no stub references it. */
export function notImplemented(owner: string, fn: string): never {
  throw new Error(`[${owner}] ${fn} is not implemented yet`);
}
