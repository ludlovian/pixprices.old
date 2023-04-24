;(async () => {
  //
  // constants
  //
  const server = '{{URL}}'
  const urls = {
    AllShare:
      'https://www.lse.co.uk/share-prices/indices/ftse-all-share/constituents.html',
    Aim:
      'https://www.lse.co.uk/share-prices/indices/ftse-aim-all-share/constituents.html',
    CEnd:
      'https://www.lse.co.uk/share-prices/sectors/closed-end-investments/constituents.html'
  }

  const runTimes = ['10:00', '13:30', '17:00']

  const nextAction = {
    AllShare: () => loadPage('Aim'),
    Aim: () => loadPage('CEnd'),
    CEnd: () => waitUntilNext(runTimes).then(() => loadPage('AllShare'))
  }

  //
  // Page loading
  //

  const domLoaded = new Promise(resolve => {
    const okStates = ['interactive', 'complete']
    const ready = () => okStates.includes(document.readyState)
    if (ready()) return resolve()
    document.addEventListener('readystatechange', () => ready() && resolve())
  })

  const loaded = new Promise(resolve => {
    const ready = () => document.readyState === 'complete'
    if (ready()) return resolve()
    document.addEventListener('readystatechange', () => ready() && resolve())
  })

  await domLoaded

  //
  // Status
  //

  const statusText = document.createElement('div')
  document.body.insertBefore(statusText, document.body.firstChild)

  function status (txt) {
    statusText.textContent = 'PixPrices: ' + txt
  }
  status('waiting')

  //
  // Current page
  //

  const pageName = location.hash.split(':')[1]

  //
  // Navigation & timing
  //

  async function doNext () {
    const fn = nextAction[pageName]
    if (!fn) return
    await fn()
  }

  async function loadPage (name) {
    status(`Loading ${name}...`)
    await delay(10 * 1000)
    location.assign(urls[name] + '#PixPrices:' + name)
  }

  function delay (ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  async function waitUntil (dt) {
    const ms = dt.valueOf() - Date.now()
    if (ms > 0) await delay(ms)
  }

  function getNextTime (time) {
    const oneDay = 24 * 60 * 60 * 1000
    const [hh, mm] = time.split(':').map(t => Number(t))
    const now = new Date()
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm)
    if (d < now) return new Date(+d + oneDay)
    return d
  }

  function getEarliestOf (times) {
    const byTime = (a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0)
    return times.map(tm => [tm, getNextTime(tm)]).sort(byTime)[0]
  }

  async function waitUntilNext (times) {
    const [tm, dt] = getEarliestOf(times)
    status(`Waiting until ${tm}...`)
    await waitUntil(dt)
  }

  //
  // Scraping
  //

  const tableSelector =
    'table.sp-constituents__table' + ',' + 'table.sp-sectors__table'

  function getTable () {
    const table = document.querySelector(tableSelector)
    if (!table) {
      status('Could not find table!')
      throw new Error('Could not find table')
    }

    function getNameAndTicker (txt) {
      if (!txt) return
      const m = /^(.*) \((\w+)\.*\)$/.exec(txt)
      if (!m) return
      return [m[1], m[2]]
    }

    function getPrice (txt) {
      if (!txt) return
      if (!/^[\d.,]+$/.test(txt)) return
      return Number(txt.replace(/,/g, ''))
    }

    function processRow (row) {
      const cells = Array.from(row.querySelectorAll('td')).map(
        c => c.textContent
      )
      const [name, ticker] = getNameAndTicker(cells[0]) || []
      const price = getPrice(cells[1])
      if (!name || !ticker || price == null) return
      return { name, ticker, price }
    }

    return Array.from(table.querySelectorAll('tr'))
      .map(processRow)
      .filter(Boolean)
  }

  async function scrape () {
    if (!urls[pageName]) return // not recognised
    const source = `lse:${pageName}`
    const prices = getTable()
    if (!prices.length) return
    const body = JSON.stringify({ source, prices })
    await fetch(server, { method: 'POST', body })
  }

  status('Loading...')
  await loaded

  status('Scraping...')
  await delay(10 * 1000)
  scrape()
  doNext()
})()
