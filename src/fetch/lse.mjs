import log from 'logjs'
import sleep from 'pixutil/sleep'
import Scrapie from 'scrapie'
import decimal from 'decimal'

import { get, toISODateTime } from './util.mjs'

const debug = log
  .prefix('fetch:lse:')
  .colour()
  .level(3)

export function fetchIndex (indexName) {
  // ftse-all-share
  // ftse-aim-all-share
  const url = `https://www.lse.co.uk/share-prices/indices/${indexName}/constituents.html`
  return fetchCollection(
    url,
    'sp-constituents__table',
    `lse:index:${indexName}`
  )
}

export function fetchSector (sectorName) {
  // alternative-investment-instruments
  const url = `https://www.lse.co.uk/share-prices/sectors/${sectorName}/constituents.html`
  return fetchCollection(url, 'sp-sectors__table', `lse:sector:${sectorName}`)
}

async function * fetchCollection (url, collClass, priceSource) {
  await sleep(500)

  const priceUpdated = toISODateTime(new Date())
  let count = 0
  const items = []
  const addItem = data => {
    const { name, ticker } = extractNameAndTicker(data[0])
    const price = extractPriceInPence(data[1])
    items.push({ ticker, name, price, priceUpdated, priceSource })
    count++
  }

  let row

  const scrapie = new Scrapie()
  scrapie
    .when('table.' + collClass)
    .when('tr')
    .on('enter', () => (row = []))
    .on('exit', () => row.length >= 2 && addItem(row))
    .when('td')
    .on('text', t => row.push(t))

  const source = await get(url)
  source.setEncoding('utf8')

  for await (const chunk of source) {
    scrapie.write(chunk)
    yield * items.splice(0)
  }

  debug('Read %d items from %s', count, priceSource)
}

export async function fetchPrice (ticker) {
  await sleep(500)

  const url = [
    'https://www.lse.co.uk/SharePrice.asp',
    `?shareprice=${ticker.padEnd('.', 3)}`
  ].join('')

  const item = {
    ticker,
    name: '',
    price: undefined,
    priceUpdated: toISODateTime(new Date()),
    priceSource: 'lse:share'
  }

  const scrapie = new Scrapie()

  const whenBid = ({ type, attrs }) =>
    type === 'span' && attrs && attrs['data-field'] === 'BID'

  scrapie.when('h1.title__title').on('text', t => {
    item.name = item.name || t.replace(/ Share Price.*/, '')
  })

  scrapie.when(whenBid).on('text', t => {
    item.price = item.price || extractPriceInPence(t)
  })

  const source = await get(url)
  source.setEncoding('utf8')

  for await (const chunk of source) {
    scrapie.write(chunk)
  }

  debug('fetched %s from lse:share', ticker)

  return item
}

function extractNameAndTicker (text) {
  const re = /(.*)\s+\(([A-Z0-9.]{2,4})\)$/
  const m = re.exec(text)
  if (!m) return {}
  const [, name, ticker] = m
  return { name, ticker: ticker.replace(/\.+$/, '') }
}

const hundred = decimal(100)
function extractPriceInPence (text) {
  return decimal(text.replace(/[,\s]/g, ''))
    .withPrecision(6)
    .div(hundred)
    .normalise()
}
