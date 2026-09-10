/** Serializa leituras concorrentes sem interromper a fila quando uma falha. */
export function createRequestQueue() {
  let tail = Promise.resolve();
  return (task: () => Promise<void>): Promise<void> => {
    const result = tail.then(task);
    tail = result.catch(() => undefined);
    return result;
  };
}
