import Debug from 'debug'

import { fetchIndex, fetchSector, fetchPrice } from './fetch-lse.mjs'

const debug = Debug('pixprices:fetch')

// first try to load prices via collections - indices and sectors
const attempts = [
  ['ftse-all-share', fetchIndex],
  ['ftse-aim-all-share', fetchIndex],
  ['alternative-investment-instruments', fetchSector]
]

export async function fetchPrices (stocks) {
  const neededTickers = new Set([...stocks.values()].map(s => s.ticker))

  for (const [name, fetchFunc] of attempts) {
    const items = await fetchFunc(name)
    let count = 0
    for (const { ticker, ...data } of items) {
      if (!neededTickers.has(ticker)) continue
      const stock = stocks.get({ ticker })
      neededTickers.delete(ticker)
      count++
      Object.assign(stock, data)
    }
    debug('%d prices from %s', count, name)
    if (!neededTickers.size) break
  }

  // now pick up the remaining ones
  for (const ticker of neededTickers) {
    const item = await fetchPrice(ticker)
    const stock = stocks.get({ ticker })
    Object.assign(stock, item)
  }

  if (neededTickers) {
    debug(
      '%d prices individually: %s',
      neededTickers.size,
      [...neededTickers].join(', ')
    )
  }
}
