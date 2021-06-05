import { get as _get } from 'https'

import tinydate from 'tinydate'

const USER_AGENT =
  'Mozilla/5.0 (X11; CrOS x86_64 13729.56.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.95 Safari/537.36'

export const toISODateTime = tinydate(
  '{YYYY}-{MM}-{DD}T{HH}:{mm}:{ss}.{fff}{TZ}',
  { TZ: getTZString }
)

function getTZString (d) {
  const o = d.getTimezoneOffset()
  const a = Math.abs(o)
  const s = o < 0 ? '+' : '-'
  const h = ('0' + Math.floor(a / 60)).slice(-2)
  const m = ('0' + (a % 60)).slice(-2)
  return s + h + ':' + m
}

export function get (url) {
  return new Promise((resolve, reject) => {
    const req = _get(url, { headers: { 'User-Agent': USER_AGENT } }, res => {
      const { statusCode } = res
      if (statusCode >= 400) {
        const { statusMessage, headers } = res
        return reject(
          Object.assign(new Error(res.statusMessage), {
            statusMessage,
            statusCode,
            headers,
            url
          })
        )
      }
      resolve(res)
    })
    req.on('error', reject)
  })
}
