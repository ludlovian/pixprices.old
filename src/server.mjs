import { createServer } from 'node:https'
import { readFileSync } from 'node:fs'

import { log } from './util.mjs'

const PORT = 5234

const HOSTS = {
  localhost: {
    url: `https://localhost:${PORT}/`,
    key: 'server-localhost.key',
    cert: 'server-localhost.cert'
  },
  client2: {
    url: `https://pixclient2.uk.to:${PORT}/`,
    key: 'server-client2.key',
    cert: 'server-client2.cert'
  }
}

export default class Server {
  constructor (host, priceStore) {
    this.host = host
    this.priceStore = priceStore

    const { key, cert } = HOSTS[this.host]
    this.ssl = {
      key: readFileSync(key),
      cert: readFileSync(cert)
    }

    this.handleRequest = this.handleRequest.bind(this)
  }

  async start () {
    const host = '0.0.0.0'
    const { key, cert } = this.ssl
    return new Promise((resolve, reject) => {
      this.httpServer = createServer({ key, cert }, this.handleRequest)

      this.httpServer
        .listen(PORT, '0.0.0.0')
        .once('listening', () => {
          log(`Listening on ${host}:${PORT}`)
          resolve()
        })
        .once('error', reject)
    })
  }

  async handleRequest (req, res) {
    if (req.method === 'OPTIONS') {
      return this.handleCorsPreflight(req, res)
    } else if (req.method === 'POST') {
      try {
        const data = JSON.parse(await readBody(req))
        await this.priceStore.updatePrices(data)
        res.writeHead(200, {
          'Access-Control-Allow-Origin': req.headers.origin
        })
        res.end('')
      } catch (e) {
        log(e)
        res.writeHead(500)
        res.end('')
      }
    } else if (req.method === 'GET') {
      return this.deliverScript(req, res)
    }
  }

  deliverScript (req, res) {
    const script = readFileSync('./src/client.js', {
      encoding: 'utf8'
    }).replaceAll('{{URL}}', HOSTS[this.host].url)
    res.writeHead(200, {
      'Content-Type': 'text/javascript',
      'Content-Length': Buffer.from(script).length,
      'Access-Control-Allow-Origin': req.headers.origin || '*'
    })
    res.end(script)
    log('Script sent')
  }

  handleCorsPreflight (req, res) {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': req.headers.origin,
      'Access-Control-Allow-Methods': 'GET,POST',
      'Access-Control-Allow-Headers': 'Content-Type,Content-Length'
    })
    res.end('')
  }
}

async function readBody (req) {
  let body = ''
  for await (const chunk of req) {
    body += chunk
  }
  return body
}
