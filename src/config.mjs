const isTest = process.argv.includes('test')

const host = isTest ? 'client2' : 'localhost'

const port = 5234

const HOSTS = {
  localhost: {
    url: `https://localhost:${port}`,
    key: 'server-localhost.key',
    cert: 'server-localhost.cert'
  },
  client2: {
    url: `https://pixclient2.uk.to:${port}`,
    key: 'server-client2.key',
    cert: 'server-client2.cert'
  }
}

const LSE1 = 'https://www.lse.co.uk/share-prices/'
const LSE2 = '/constituents.html'

const jobs = {
  AllShare: {
    url: `${LSE1}indices/ftse-all-share${LSE2}`,
    times: ['09:40', '13:40', '16:40'].sort()
  },
  Aim: {
    url: `${LSE1}indices/ftse-aim-all-share${LSE2}`,

    times: ['09:45', '13:45', '16:45'].sort()
  },
  CEnd: {
    url: `${LSE1}sectors/closed-end-investments${LSE2}`,
    times: ['09:50', '13:50', '16:50'].sort()
  }
}

const priceSheet = {
  id: '1UdNhJNLWriEJtAJdbxwswGTl8CBcDK1nkEmJvwbc_5c',
  range: rows => `Prices!A2:E${rows ? rows + 1 : ''}`
}

export default {
  isTest,
  server: { host, port, ...HOSTS[host] },
  jobs,
  priceSheet,
  client: {
    allowedOrigins: ['https://www.lse.co.uk']
  }
}
