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

  const items = []
  let count = 0
  const priceUpdated = new Date()

  const scrapie = new Scrapie()
  scrapie.whenTag(whenTable, handleTable)

  const source = await get(url)
  source.setEncoding('utf8')

  for await (const chunk of source) {
    scrapie.write(chunk)
    count += items.length
    yield * items.splice(0)
  }

  debug('Read %d items from %s', count, priceSource)

  function whenTable ({ type, attrs }) {
    return type === 'table' && attrs.class.includes(collClass)
  }

  function handleTable () {
    scrapie.whenTag(tagIs('tr'), handleRow)
  }

  function tagIs (x) {
    return ({ type }) => type === x
  }

  function handleRow () {
    const data = []
    scrapie.whenTag(tagIs('td'), () =>
      scrapie.onText(text => {
        if (data.push(text) === 2) {
          const { name, ticker } = extractNameAndTicker(data[0])
          const price = extractNumber(data[1])
          items.push({ ticker, name, price, priceUpdated, priceSource })
          return false
        }
      })
    )
  }
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
  scrapie.whenTag(whenTitle, handleTitle)
  scrapie.whenTag(whenBid, handleBid)

  const source = await get(url)
  source.setEncoding('utf8')

  for await (const chunk of source) {
    scrapie.write(chunk)
  }

  debug('fetched %s from lse:share', ticker)

  return item

  function whenTitle ({ type, attrs }) {
    return type === 'h1' && attrs.class.includes('title__title')
  }

  function handleTitle () {
    scrapie.onText(txt => {
      item.name = txt.replace(/ Share Price.*/, '')
      return false
    })
  }

  function whenBid ({ type, attrs }) {
    return type === 'span' && attrs['data-field'] === 'BID'
  }

  function handleBid () {
    scrapie.onText(txt => {
      item.price = extractNumber(txt)
      return false
    })
  }
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
