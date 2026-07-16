import nextPwa from 'next-pwa'
import defaultCache from 'next-pwa/cache.js'

// next-pwa's default runtimeCaching ends with a catch-all rule that routes EVERY
// cross-origin GET request through the service worker (cacheName: 'cross-origin').
// When the browser loads the Cloudflare Turnstile script
// (https://challenges.cloudflare.com/turnstile/api.js) via that SW-mediated
// response, Chrome refuses to use it and reports
// net::ERR_BLOCKED_BY_RESPONSE.NotSameOrigin — the widget script never runs, so
// the iframe never renders and the form can't be submitted.
//
// Fix: drop the Turnstile origin from the cross-origin rule so those requests
// match no route and bypass the service worker entirely, loading straight from
// the network the way an un-cached third-party embed should.
const runtimeCaching = defaultCache.map((entry) =>
  entry.options?.cacheName === 'cross-origin'
    ? {
        ...entry,
        urlPattern: ({ url }) =>
          url.origin !== self.origin &&
          url.origin !== 'https://challenges.cloudflare.com',
      }
    : entry
)

const withPWA = nextPwa({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  runtimeCaching,
})

/** @type {import('next').NextConfig} */
const nextConfig = {}

export default withPWA(nextConfig)
