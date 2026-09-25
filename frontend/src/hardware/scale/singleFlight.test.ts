import { describe, expect, it } from 'vitest'
import { SingleFlight } from './singleFlight'

const deferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

describe('SingleFlight', () => {
  it('executa a tarefa e devolve o valor', async () => {
    const flight = new SingleFlight()
    expect(await flight.run(async () => 42)).toEqual({ ran: true, value: 42 })
  })

  it('segunda chamada durante uma pesagem em andamento é ignorada (duplo clique não soma duas vezes)', async () => {
    const flight = new SingleFlight()
    const pending = deferred<number>()
    let executions = 0

    const first = flight.run(() => { executions += 1; return pending.promise })
    const second = await flight.run(async () => { executions += 1; return 2 })

    expect(second).toEqual({ ran: false })
    expect(flight.isBusy).toBe(true)
    pending.resolve(1.235)
    expect(await first).toEqual({ ran: true, value: 1.235 })
    expect(executions).toBe(1)
  })

  it('libera depois de terminar, e de novo se a tarefa falhar', async () => {
    const flight = new SingleFlight()
    await flight.run(async () => 1)
    expect(flight.isBusy).toBe(false)

    await expect(flight.run(async () => { throw new Error('falhou') })).rejects.toThrow('falhou')
    expect(flight.isBusy).toBe(false)
    expect(await flight.run(async () => 3)).toEqual({ ran: true, value: 3 })
  })
})
