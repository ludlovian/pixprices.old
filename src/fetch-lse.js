'use strict'

import cheerio from 'cheerio'
import { get } from 'httpie'
import Debug from 'debug'

import { delay } from './util'
import { writePrices } from './db'

const debug = Debug('pixprices:fetch-lse')

const USER_AGENT =
  'Mozilla/5.0 (X11; CrOS x86_64 13729.56.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.95 Safari/537.36'

export async function fetchIndex (indexName, opts) {
  // ftse-all-share
  // ftse-aim-all-share
  debug('index %s', indexName)
  const url = `https://www.lse.co.uk/share-prices/indices/${indexName}/constituents.html`
  return fetchCollection(
    url,
    'sp-constituents__table',
    `lse:index:${indexName}`,
    opts
  )
}

export async function fetchSector (sectorName, opts) {
  // alternative-investment-instruments
  debug('sector %s', sectorName)
  const url = `https://www.lse.co.uk/share-prices/sectors/${sectorName}/constituents.html`
  return fetchCollection(
    url,
    'sp-sectors__table',
    `lse:sector:${sectorName}`,
    opts
  )
}

async function fetchCollection (url, collClass, source, opts) {
  await delay(1000)

  const now = new Date()
  const fetchOpts = {
    headers: {
      'User-Agent': USER_AGENT
    }
  }
  const { data: html } = await get(url, fetchOpts)
  const $ = cheerio.load(html)
  const items = []
  $(`table.${collClass} tr`)
    .has('td')
    .each((i, tr) => {
      const values = []
      $('td', tr).each((j, td) => {
        values.push($(td).text())
      })

      const { name, ticker } = extractNameAndTicker(values[0])
      const price = extractNumber(values[1])
      items.push({
        code: ticker,
        name,
        price,
        time: now,
        source
      })
    })
  debug('Read %d items', items.length)
  await writePrices(items, opts)
}

export async function fetchPrice (code, opts) {
  debug('share %s', code)
  await delay(1000)

  const url = `https://www.lse.co.uk/SharePrice.asp?shareprice=${code}`
  const now = new Date()
  const fetchOpts = {
    headers: {
      'User-Agent': USER_AGENT
    }
  }
  const { data: html } = await get(url, fetchOpts)
  const $ = cheerio.load(html)

  const item = {
    code,
    time: now,
    source: 'lse:share'
  }

  item.name = $('h1.title__title')
    .text()
    .replace(/ Share Price.*/, '')
  item.price = extractNumber(
    $('span[data-field="BID"]')
      .first()
      .text()
  )
  await writePrices([item], opts)
}

function extractNameAndTicker (text) {
  const re = /(.*)\s+\(([A-Z0-9.]{2,4})\)$/
  const m = re.exec(text)
  if (!m) return {}
  const [, name, ticker] = m
  return { name, ticker }
}

function extractNumber (text) {
  return parseFloat(text.replace(/,/g, ''))
}
