import { createServer } from 'node:https'
import { readFileSync } from 'node:fs'

import polka from 'polka'
import send from '@polka/send-type'

import { log } from './util.mjs'
import config from './config.mjs'
import renderStatus from './renderStatus.mjs'

export default class Server {
  constructor ({ priceStore, scheduler }) {
    Object.assign(this, { priceStore, scheduler })

    const { key, cert } = config.server
    const sslOptions = {
      key: readFileSync(key),
      cert: readFileSync(cert)
    }

    const server = createServer(sslOptions)
    this.server = polka({ server })

    this.server
      .use((req, res, next) => this.cors(req, res, next))
      .post('/prices/:source', (req, res) => this.postPrices(req, res))
      .get('/scrape.js', (req, res) => this.sendScript(req, res))
      .get('/worker', (req, res) => this.showStatus(req, res, true))
      .get('/', (req, res) => this.showStatus(req, res, false))
  }

  async start () {
    return new Promise((resolve, reject) => {
      const s = this.server
      const { port } = config.server
      s.listen(port, '0.0.0.0')
      s.server
        .once('listening', () => {
          log(`Listening on port ${port}`)
          resolve()
        })
        .once('error', reject)
    })
  }

  cors (req, res, next) {
    if (req.method !== 'OPTIONS') return next()

    const { origin } = req.headers
    const { allowedOrigins } = config.client

    if (!allowedOrigins.includes(origin)) {
      log(`CORS request from ${origin} denied`)
      res.writeHead(403)
      return res.end('')
    }

    res.writeHead(200, {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET,POST',
      'Access-Control-Allow-Headers': 'Content-Type,Content-Length'
    })
    log(`CORS authorised from ${origin} for ${req.path}`)
    res.end('')
  }

  async postPrices (req, res) {
    const { scheduler, priceStore } = this
    const { source } = req.params
    const id = Number(req.query.task || scheduler.currentTask.id)
    try {
      const prices = JSON.parse(await readBody(req))
      await priceStore.updatePrices({ source: 'lse:' + source, prices })
      scheduler.writeLog(`${prices.length} prices from ${source}`, id)
      scheduler.completeTask(id)

      res.writeHead(200, {
        'Access-Control-Allow-Origin': req.headers.origin
      })
      res.end('')
    } catch (e) {
      log(`Error: ${e}\n${e.stack}`)
      res.writeHead(500)
      res.end('')
    }
  }

  sendScript (req, res) {
    const script = readFileSync('./src/scrape.js', {
      encoding: 'utf8'
    }).replaceAll('{ CONTEXT }', JSON.stringify(this.scheduler.clientContext))
    res.writeHead(200, {
      'Content-Type': 'text/javascript',
      'Content-Length': Buffer.from(script).length,
      'Access-Control-Allow-Origin': req.headers.origin || '*'
    })
    res.end(script)
    log('Script sent')
  }

  showStatus (req, res, isWorker) {
    const headers = { 'content-type': 'text/html;charset=utf-8' }
    if (isWorker && req.query.task) {
      this.scheduler.completeTask(Number(req.query.task))
    }
    try {
      const context = { isWorker, ...this.scheduler.statusContext }
      const txt = renderStatus(context)
      send(res, 200, txt, headers)
    } catch (e) {
      console.log(e)
      res.writeHead(500)
      res.end(e.message)
    }
  }
}

async function readBody (req) {
  let body = ''
  for await (const chunk of req) {
    body += chunk
  }
  return body
}
