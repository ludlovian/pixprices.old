import Debug from 'debug'
import Database from 'jsdbd'

import { fetchIndex, fetchSector, fetchPrice } from './fetch-lse.mjs'

const debug = Debug('pixprices:portfolio')

const DEFAULT_TICKER_COLUMN = 10 // column K
const DEFAULT_ACCOUNT_COLUMN = 0 // column A
const DEFAULT_ACCOUNT_LIST =
  'AJL,ISA;RSGG,ISA;AJL,Dealing;RSGG,Dealing;AJL,SIPP;RSGG,SIPP;RSGG,SIPP2'
const DEFAULT_DIV_COLUMN = 26 // column AA

export default class Portfolio {
  constructor () {
    this.stocks = new Stocks()
    this.positions = new Positions()
  }

  static async deserialize () {
    const p = new Portfolio()
    {
      const db = new Database('stocks.db')
      for (const stock of await db.getAll()) {
        Object.assign(p.stocks.get(stock.ticker), stock)
      }
    }
    {
      const db = new Database('positions.db')
      for (const pos of await db.getAll()) {
        Object.assign(p.positions.get(pos), pos)
      }
    }

    debug('portfolio loaded from database')
    return p
  }

  async serialize () {
    {
      const db = new Database('stocks.db')
      await db.ensureIndex({ fieldName: 'ticker', unique: true })

      const { insert, update, remove } = getChanges(
        await db.getAll(),
        Array.from(this.stocks.values()),
        x => x.ticker
      )
      await db.insert(insert)
      await db.update(update)
      await db.delete(remove)
      await db.compact()
      debug(
        'stocks wrtten to db (I:%d, U:%d, D:%d)',
        insert.length,
        update.length,
        remove.length
      )
    }

    {
      const db = new Database('positions.db')
      await db.ensureIndex({ fieldName: 'who' })
      await db.ensureIndex({ fieldName: 'account' })
      await db.ensureIndex({ fieldName: 'ticker' })
      const { insert, update, remove } = getChanges(
        await db.getAll(),
        Array.from(this.positions.values()),
        keyToString
      )

      await db.insert(insert)
      await db.update(update)
      await db.delete(remove)
      await db.compact()
      debug(
        'positions wrtten to db (I:%d, U:%d, D:%d)',
        insert.length,
        update.length,
        remove.length
      )
    }
  }

  loadStocksFromSheet (rangeData, options = {}) {
    const {
      tickerColumn = DEFAULT_TICKER_COLUMN,
      divColumn = DEFAULT_DIV_COLUMN
    } = options

    const old = new Set(this.stocks.values())

    for (const row of rangeData) {
      const ticker = row[tickerColumn]
      if (!ticker) continue
      const stock = this.stocks.get(ticker)
      old.delete(stock)
      const div = row[divColumn]
      if (!div || typeof div !== 'number') {
        stock.dividend = undefined
      } else {
        stock.dividend = Math.round(div * 1e5) / 1e5
      }
    }

    for (const stock of old.values()) {
      this.stocks.delete(stock.ticker)
    }

    debug('stocks refreshed from piggy sheet')
  }

  loadPositionsFromSheet (rangeData, options = {}) {
    const {
      tickerColumn = DEFAULT_TICKER_COLUMN,
      accountStartColumn = DEFAULT_ACCOUNT_COLUMN,
      accountList = DEFAULT_ACCOUNT_LIST
    } = options

    const accounts = accountList.split(';').map(code => {
      const [who, account] = code.split(',')
      return { who, account }
    })

    const old = new Set(this.positions.values())

    for (const row of rangeData) {
      const ticker = row[tickerColumn]
      if (!ticker) continue
      const qtys = row.slice(
        accountStartColumn,
        accountStartColumn + accounts.length
      )
      for (const [i, qty] of qtys.entries()) {
        if (!qty || typeof qty !== 'number') continue
        const pos = this.positions.get({ ...accounts[i], ticker })
        pos.qty = qty
        old.delete(pos)
      }
    }

    for (const pos of old) {
      this.positions.delete(pos)
    }

    debug('positions refreshed from piggy sheet')
  }

  async fetchPrices () {
    const need = new Map(
      Array.from(this.stocks.values()).map(stock => [stock.ticker, stock])
    )

    // first try to load prices via collections - indices and sectors

    const attempts = [
      ['ftse-all-share', fetchIndex],
      ['ftse-aim-all-share', fetchIndex],
      ['alternative-investment-instruments', fetchSector]
    ]

    for (const [name, fetchFunc] of attempts) {
      const items = await fetchFunc(name)
      let count = 0
      for (const item of items) {
        const ticker = item.ticker.replace(/\.+$/, '')
        const stock = need.get(ticker)
        if (!stock) continue
        need.delete(ticker)
        count++
        Object.assign(stock, {
          name: item.name,
          price: {
            value: item.price,
            source: item.source,
            time: item.time
          }
        })
      }
      debug('%d prices from %s', count, name)
      if (!need.size) break
    }

    // now pick up the remaining ones
    for (const stock of need.values()) {
      const item = await fetchPrice(stock.ticker.padEnd(3, '.'))
      Object.assign(stock, {
        name: item.name,
        price: {
          value: item.price,
          source: item.source,
          time: item.time
        }
      })
    }

    if (need.size) {
      debug(
        '%d prices individually: %s',
        need.size,
        Array.from(need.values())
          .map(s => s.ticker)
          .join(', ')
      )
    }
  }

  getPositionsSheet () {
    const rows = []
    for (const pos of this.positions.values()) {
      const { who, account, ticker, qty } = pos
      if (!qty) continue

      const stock = this.stocks.get(ticker)
      const {
        dividend,
        price: { value: price }
      } = stock
      rows.push([
        ticker,
        who,
        account,
        qty,
        price,
        dividend,
        Math.round(qty * price) / 100,
        dividend ? Math.round(qty * dividend * 100) / 100 : undefined
      ])
    }

    return rows
  }
}

class Stocks {
  constructor () {
    this._map = new Map()
  }

  get (key) {
    let s = this._map.get(key)
    if (s) return s
    s = Object.assign(new Stock(), { ticker: key })
    this._map.set(key, s)
    return s
  }

  delete (key) {
    this._map.delete(key)
  }

  values () {
    return this._map.values()
  }
}

class Positions {
  constructor () {
    this._map = new Map()
  }

  get (key) {
    const s = keyToString(key)

    let pos = this._map.get(s)
    if (pos) return pos

    pos = Object.assign(new Position(), { ...key, qty: 0 })
    this._map.set(s, pos)
    return pos
  }

  delete (key) {
    this._map.delete(keyToString(key))
  }

  values () {
    return this._map.values()
  }
}

class Position {}
class Stock {}

function keyToString ({ who, account, ticker }) {
  return `${who}_${account}_${ticker}`
}

function getChanges (fromList, toList, keyFunc) {
  const prevEntries = new Map(fromList.map(item => [keyFunc(item), item]))

  const insert = []
  const update = []

  for (const item of toList) {
    const key = keyFunc(item)
    if (prevEntries.has(key)) {
      update.push(item)
      prevEntries.delete(key)
    } else {
      insert.push(item)
    }
  }

  const remove = Array.from(prevEntries.values())

  return { insert, update, remove }
}
