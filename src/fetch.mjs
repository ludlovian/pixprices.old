import log from 'logjs'
import teme from 'teme'
import uniq from 'pixutil/uniq'

import { fetchIndex, fetchSector, fetchPrice } from './fetch-lse.mjs'

const debug = log
  .prefix('fetch:')
  .colour()
  .level(2)

// first try to load prices via collections - indices and sectors
const attempts = [
  ['ftse-all-share', fetchIndex],
  ['ftse-aim-all-share', fetchIndex],
  ['closed-end-investments', fetchSector]
]

export async function updatePrices ({ stocks, positions }) {
  // we fetch prices for anything that we have a position in, or where
  // we have manually caught dividends
  const needed = new Set(
    uniq(
      [...positions.values()].map(p => p.ticker),
      [...stocks.values()].filter(s => s.dividend).map(s => s.ticker)
    )
  )

  const unneeded = new Set(
    [...stocks.values()].map(s => s.ticker).filter(t => !needed.has(t))
  )

  const prices = getPrices(needed)
  for await (const item of prices) {
    const s = stocks.get(item.ticker)
    stocks.set({
      ...item,
      name: s ? s.name || item.name : item.name
    })
  }

  for (const ticker of unneeded) {
    stocks.set({
      ticker,
      price: undefined,
      priceSource: undefined,
      priceUpdated: undefined
    })
  }
}

async function * getPrices (tickers) {
  const needed = new Set(tickers)
  const isNeeded = ({ ticker }) => needed.delete(ticker)

  for (const [name, fetchFunc] of attempts) {
    let n = 0
    const prices = teme(fetchFunc(name))
      .filter(isNeeded)
      .each(() => n++)
    yield * prices
    debug('%d prices from %s', n, name)

    if (!needed.size) return
  }

  // now pick up the remaining ones
  for (const ticker of needed) {
    yield await fetchPrice(ticker)
  }
  debug('%d prices individually: %s', needed.size, [...needed].join(', '))
}
