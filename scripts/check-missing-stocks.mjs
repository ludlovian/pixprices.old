import Portfolio from '../src/portfolio.mjs'

async function main () {
  const p = new Portfolio()
  await p.load()

  const missing = [...p.stocks.values()].filter(({ incomeType }) => !incomeType)

  if (!missing.length) {
    console.log('No stocks missing')
    return
  }

  for (const stock of missing) {
    console.log('%s - %s', stock.ticker, stock.name)
  }
}

main().catch(e => {
  console.error(e)
  process.exit(255)
})
