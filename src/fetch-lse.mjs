import log from 'logjs'
import sleep from 'pixutil/sleep'
import Scrapie from 'scrapie'

import { get } from './util.mjs'

const debug = log
  .prefix('lse:')
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

  const priceUpdated = new Date()
  let count = 0
  const items = []
  const addItem = data => {
    const { name, ticker } = extractNameAndTicker(data[0])
    const price = extractNumber(data[1])
    items.push({ ticker, name, price, priceUpdated, priceSource })
    count++
  }

  const scrapie = new Scrapie()
  scrapie.when('table').do(({ attrs }) => {
    if (!attrs.class.includes(collClass)) return
    scrapie.when('tr').do(() => {
      const data = []
      scrapie
        .when('td')
        .do(() => {
          if (data.length >= 2) return false
          scrapie.onText(t => data.push(t))
        })
        .atEnd(() => {
          if (data.length >= 2) addItem(data)
        })
    })
  })

  const source = await get(url)
  source.setEncoding('utf8')

  for await (const chunk of source) {
    scrapie.write(chunk)
    count += items.length
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
    price: null,
    priceUpdated: new Date(),
    priceSource: 'lse:share'
  }

  const scrapie = new Scrapie()

  scrapie.when('h1').do(({ attrs }) => {
    if (!attrs.class.includes('title__title')) return
    scrapie.onText(t => {
      item.name = t.replace(/ Share Price.*/, '')
      return false
    })
  })

  scrapie.when('span').do(({ attrs }) => {
    if (attrs['data-field'] !== 'BID') return
    scrapie.onText(t => {
      item.price = extractNumber(t)
      return false
    })
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

function extractNumber (text) {
  return parseFloat(text.replace(/,/g, ''))
}
