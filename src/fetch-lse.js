'use strict'

import cheerio from 'cheerio'
import { get } from 'httpie'
import Debug from 'debug'

import { delay } from './util'

const debug = Debug('pixprices:fetch-lse')

const USER_AGENT =
  'Mozilla/5.0 (X11; CrOS x86_64 13729.56.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.95 Safari/537.36'

export async function fetchIndex (indexName) {
  // ftse-all-share
  // ftse-aim-all-share
  const url = `https://www.lse.co.uk/share-prices/indices/${indexName}/constituents.html`
  return fetchCollection(
    url,
    'sp-constituents__table',
    `lse:index:${indexName}`
  )
}

export async function fetchSector (sectorName) {
  // alternative-investment-instruments
  const url = `https://www.lse.co.uk/share-prices/sectors/${sectorName}/constituents.html`
  return fetchCollection(url, 'sp-sectors__table', `lse:sector:${sectorName}`)
}

async function fetchCollection (url, collClass, source) {
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
        ticker,
        name,
        price,
        time: now,
        source
      })
    })
  debug('Read %d items from %s', items.length, source)
  return items
}

export async function fetchPrice (ticker) {
  await delay(1000)

  const url = `https://www.lse.co.uk/SharePrice.asp?shareprice=${ticker}`
  const now = new Date()
  const fetchOpts = {
    headers: {
      'User-Agent': USER_AGENT
    }
  }
  const { data: html } = await get(url, fetchOpts)
  const $ = cheerio.load(html)

  const item = {
    ticker,
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

  debug('fetched %s from lse:share', ticker)

  return item
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
