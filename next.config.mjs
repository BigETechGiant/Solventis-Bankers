import nextPwa from 'next-pwa'
import defaultCache from 'next-pwa/cache.js'

// next-pwa's default runtimeCaching ends with a catch-all rule that routes EVERY
// cross-origin GET request through the service worker (cacheName: 'cross-origin').
// When the browser loads the Cloudflare Turnstile script
// (https://challenges.cloudflare.com/turnstile/v0/api.js) via that SW-mediated
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
const nextConfig = {
  // Guard against cross-origin isolation. The Cloudflare Turnstile widget loads a
  // cross-origin script and iframe from https://challenges.cloudflare.com, which
  // a `Cross-Origin-Embedder-Policy: require-corp` document would block. This
  // repo sets no such header today, but we assert `unsafe-none` (the browser
  // default) explicitly so no edge/proxy layer or future change can silently
  // isolate the page and break the widget. This loosens nothing versus the
  // current behaviour — it only pins it.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Cross-Origin-Embedder-Policy', value: 'unsafe-none' },
        ],
      },
    ]
  },
}

export default withPWA(nextConfig)
