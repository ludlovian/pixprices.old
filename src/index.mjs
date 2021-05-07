import sade from 'sade'

import { update } from './main.mjs'

const version = '__VERSION__'

const prog = sade('pixprices')

prog.version(version)

prog
  .command('update', 'update data')
  .option('--import-portfolio', 'read portfolio sheet')
  .option('--import-trades', 'read trades sheet')
  .option('--fetch-prices', 'fetch prices from LSE')
  .option('--export-positions', 'update the positions sheet')
  .option('--export-trades', 'update the trades sheet')
  .action(update)

const parsed = prog.parse(process.argv, {
  lazy: true
})

if (parsed) {
  const { handler, args } = parsed
  handler(...args).catch(err => {
    console.error(err)
    process.exit(1)
  })
}
