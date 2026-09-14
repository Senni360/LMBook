/**
 * Serialize filesystem artifact publication and reclamation in this backend.
 * The desktop app owns one backend process per data directory; a second
 * backend pointed at the same directory remains unsupported.
 */
let tail: Promise<void> = Promise.resolve();

export async function withArtifactMutation<T>(
  work: () => T | Promise<T>,
): Promise<T> {
  const previous = tail;
  let release!: () => void;
  tail = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await work();
  } finally {
    release();
  }
}
