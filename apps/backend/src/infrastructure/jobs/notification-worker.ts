import type { DispatchNotifications } from '../../application/use-cases/dispatch-notifications'

export function startNotificationWorker(
  dispatcher: DispatchNotifications,
  pollSeconds: number,
  report: (event: { event: string }) => void,
) {
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let running: Promise<void> = Promise.resolve()
  const tick = () => {
    running = dispatcher
      .runOnce()
      .then(() => undefined)
      .catch(() => report({ event: 'notification.worker_failed' }))
      .finally(() => {
        if (!stopped) timer = setTimeout(tick, pollSeconds * 1000)
      })
  }
  tick()
  return {
    close: async () => {
      stopped = true
      clearTimeout(timer)
      await running
    },
  }
}
