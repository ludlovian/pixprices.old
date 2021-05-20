import { get as _get } from 'https'

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
