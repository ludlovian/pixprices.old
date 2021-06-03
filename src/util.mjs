import { get as _get } from 'https'

import decimal from './decimal.mjs'

const USER_AGENT =
  'Mozilla/5.0 (X11; CrOS x86_64 13729.56.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.95 Safari/537.36'

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

export function maybeDecimal (x, prec) {
  if (x == null || x === '') return undefined
  try {
    let d = decimal(x)
    if (prec != null) d = d.precision(prec)
    return d
  } catch (e) {
    console.log('Trying to decimal (%s): %o', typeof x, x)
    throw e
  }
}

export function maybeNumber (x) {
  return x ? x.number : undefined
}
