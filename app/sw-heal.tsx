'use client'

import { useEffect } from 'react'

// One-time, self-healing service-worker reset.
//
// Some returning visitors still have an OLD workbox service worker cached from
// before we excluded https://challenges.cloudflare.com from the cross-origin
// runtime-caching route. That stale worker intercepts the Turnstile script and
// the browser rejects the SW-mediated cross-origin response with
// net::ERR_BLOCKED_BY_RESPONSE.NotSameOrigin — so the widget never renders and
// the form can't be submitted.
//
// This runs once per browser: if the stored heal version is behind CURRENT, we
// unregister every service worker, drop the workbox caches, mark the heal done,
// and reload once. next-pwa then re-registers a fresh worker that carries the
// Turnstile exclusion. The version flag guarantees we never loop and, once
// healed, normal PWA behaviour resumes untouched. Bump SW_HEAL_VERSION only if
// a future stale-worker problem needs another forced reset.
const SW_HEAL_VERSION = '1'
const SW_HEAL_KEY = 'sw-heal-version'

export default function ServiceWorkerHeal() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

    let done: string | null = null
    try {
      done = window.localStorage.getItem(SW_HEAL_KEY)
    } catch {
      // localStorage unavailable (private mode edge cases) — skip, don't loop.
      return
    }
    if (done === SW_HEAL_VERSION) return

    ;(async () => {
      try {
        const regs = await navigator.serviceWorker.getRegistrations()
        await Promise.all(regs.map((r) => r.unregister()))

        if ('caches' in window) {
          const keys = await caches.keys()
          await Promise.all(keys.map((k) => caches.delete(k)))
        }
      } catch {
        // Best-effort — still mark done so a partial failure can't loop forever.
      } finally {
        try {
          window.localStorage.setItem(SW_HEAL_KEY, SW_HEAL_VERSION)
        } catch {
          // If we can't persist the flag, bail without reloading to avoid a loop.
          return
        }
        window.location.reload()
      }
    })()
  }, [])

  return null
}
