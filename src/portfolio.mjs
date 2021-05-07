import sortBy from 'sortby'
import { Row } from 'googlejs/datastore'

import { Table, Index, UniqueIndex } from './table.mjs'

export default class Portfolio {
  constructor () {
    this.stocks = new Stocks()
    this.positions = new Positions()
    this.trades = new Trades()
  }

  async load () {
    await Promise.all([
      this.stocks.load(),
      this.positions.load(),
      this.trades.load()
    ])
  }

  async save () {
    await Promise.all([
      this.stocks.save(),
      this.positions.save(),
      this.trades.save()
    ])
  }
}

class Stocks extends Table {
  constructor () {
    super('Stock')
    this.factory = Stock
    this.order = sortBy('ticker')
    this.ix.main = new UniqueIndex(({ ticker }) => ticker)
  }

  get (ticker) {
    return this.ix.main.get({ ticker })
  }
}

class Stock extends Row {}

class Positions extends Table {
  constructor () {
    super('Position')
    this.factory = Position
    this.order = sortBy('ticker')
      .thenBy('who')
      .thenBy('account')
    this.ix.main = new UniqueIndex(
      ({ ticker, who, account }) => `${ticker}_${who}_${account}`
    )
  }
}

class Position extends Row {}

class Trades extends Table {
  constructor () {
    super('Trade')
    this.factory = Trade
    this.order = sortBy('who')
      .thenBy('account')
      .thenBy('ticker')
      .thenBy('seq')
    this.ix.main = new UniqueIndex(
      ({ who, account, ticker, seq }) => `${who}_${account}_${ticker}_${seq}`
    )

    this.ix.position = new Index(
      ({ who, account, ticker }) => `${who}_${account}_${ticker}`
    )
  }

  setTrades (data) {
    const existing = [...this.ix.position.get(data[0])]
    existing.sort(sortBy('seq'))
    let seq = 1
    for (const row of data) {
      this.set({ ...row, seq })
      seq++
    }
    for (const row of existing.slice(data.length)) {
      this.delete(row)
    }
  }
}

class Trade extends Row {}
