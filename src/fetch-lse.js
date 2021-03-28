'use strict'

import cheerio from 'cheerio'
import { get } from 'httpie'
import Debug from 'debug'

import { delay } from './util'

const debug = Debug('pixprices:fetch-lse')

export const URL = {
  ASX:
    'https://www.lse.co.uk/share-prices/indices/ftse-all-share/constituents.html',
  AXX:
    'https://www.lse.co.uk/share-prices/indices/ftse-aim-all-share/constituents.html',
  ALT:
    'https://www.lse.co.uk/share-prices/sectors/alternative-investment-instruments/constituents.html'
}

export async function fetchAll () {
  const results = {}
  for (const url of Object.values(URL)) {
    await delay(1000)
    const prices = await fetchPrices(url)
    for (const price of prices) {
      results[price.code] = price
    }
  }
  return results
}

export async function fetchPrices (url) {
  debug('fetching from %s', url)

  const now = Date.now()
  const { data: html } = await get(url)
  const $ = cheerio.load(html)
  const items = []
  $('table.sp-constituents__table tr, table.sp-sectors__table tr')
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
        source: 'lse'
      })
    })

  debug('retrieved %d items', items.length)

  return items
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
