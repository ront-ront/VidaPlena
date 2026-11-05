import type { ProcessWaitlist } from '../../application/use-cases/process-waitlist'

export function startWaitlistWorker(
  processor: ProcessWaitlist,
  pollSeconds: number,
  report: (status: 'succeeded' | 'failed', count: number) => void,
) {
  let stopped = false,
    running: Promise<void> = Promise.resolve()
  let timer: ReturnType<typeof setTimeout>
  const tick = () => {
    running = processor
      .runOnce()
      .then(
        (count) => report('succeeded', count),
        () => report('failed', 0),
      )
      .finally(() => {
        if (!stopped) timer = setTimeout(tick, pollSeconds * 1000)
      })
  }
  timer = setTimeout(tick, pollSeconds * 1000)
  return {
    close: async () => {
      stopped = true
      clearTimeout(timer)
      await running
    },
  }
}
