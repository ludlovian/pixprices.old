import Portfolio from './portfolio.mjs'
import { importFromPortfolioSheet } from './import.mjs'
import { fetchPrices } from './fetch.mjs'
import { exportPositions } from './export.mjs'

export async function update (options) {
  const portfolio = new Portfolio()
  await portfolio.load()

  if (options['get-portfolio']) {
    await importFromPortfolioSheet(portfolio)
  }

  if (options['fetch-prices']) {
    await fetchPrices(portfolio.stocks)
  }

  await portfolio.save()

  if (options['update-positions']) {
    await exportPositions(portfolio)
  }
}
