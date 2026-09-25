/**
 * Deixa uma tarefa assíncrona rodar por vez. Enquanto uma pesagem espera o peso estabilizar,
 * um segundo clique no mesmo produto (ou em outro) é ignorado, em vez de somar o mesmo peso duas vezes.
 */
export class SingleFlight {
  private busy = false

  get isBusy(): boolean {
    return this.busy
  }

  async run<T>(task: () => Promise<T>): Promise<{ ran: true; value: T } | { ran: false }> {
    if (this.busy) return { ran: false }
    this.busy = true
    try {
      return { ran: true, value: await task() }
    } finally {
      this.busy = false
    }
  }
}
