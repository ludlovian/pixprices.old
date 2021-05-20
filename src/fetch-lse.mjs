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
  scrapie.whenTag(
    ({ type, attrs }) => type === 'table' && attrs.class.includes(collClass),
    () =>
      scrapie.whenTag(
        ({ type }) => type === 'tr',
        () => {
          const data = []
          scrapie.whenTag(
            ({ type }) => type === 'td',
            () =>
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
      )
  )

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

  scrapie.whenTag(
    ({ type, attrs }) => type === 'h1' && attrs.class.includes('title__title'),
    () =>
      scrapie.onText(txt => {
        item.name = txt.replace(/ Share Price.*/, '')
        return false
      })
  )

  scrapie.whenTag(
    ({ type, attrs }) => type === 'span' && attrs['data-field'] === 'BID',
    () =>
      scrapie.onText(txt => {
        item.price = extractNumber(txt)
        return false
      })
  )

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
