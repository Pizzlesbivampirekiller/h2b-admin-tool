const https = require('https')

const TOKEN = process.env.GITHUB_TOKEN || ''
const OWNER = 'Pizzlesbivampirekiller'
const REPO = 'h2b-paws-v2'
const PASSWORD = 'h2badmin2026'

function gh(method, path, data) {
  return new Promise((resolve, reject) => {
    const body = data ? JSON.stringify(data) : undefined
    const req = https.request({
      hostname: 'api.github.com', path: `/repos/${OWNER}/${REPO}/${path}`, method,
      headers: { 'Authorization': 'token ' + TOKEN, 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'h2b-admin', 'Content-Type': 'application/json', 'Content-Length': body ? Buffer.byteLength(body) : 0 }
    }, res => { let b = ''; res.on('data', c => b += c); res.on('end', () => { try { const j = JSON.parse(b); if (res.statusCode >= 400) reject(new Error('GitHub ' + res.statusCode)); else resolve(j) } catch(e) { reject(new Error(b.slice(0, 200))) } }) })
    req.on('error', reject); if (body) req.write(body); req.end()
  })
}

async function getFileContent(ghPath) {
  const f = await gh('GET', `contents/${ghPath}?ref=master`)
  return { content: Buffer.from(f.content, 'base64').toString('utf8'), sha: f.sha }
}

async function commitFile(ghPath, newContent, sha, msg) {
  await gh('PUT', `contents/${ghPath}`, {
    message: msg,
    content: Buffer.from(newContent).toString('base64'),
    sha, branch: 'master'
  })
}

// === PRODUCTS ===
async function readProducts() {
  const { content } = await getFileContent('src/data/products.js')
  const m = content.match(/export const products = (\[[\s\S]*?\])\s*\n/)
  return m ? eval(m[1]) : []
}

async function writeProducts(products) {
  const { content, sha } = await getFileContent('src/data/products.js')
  const nc = content.replace(/export const products = \[[\s\S]*?\](?=\s*\n)/, `export const products = ${JSON.stringify(products, null, 2)}`)
  await commitFile('src/data/products.js', nc, sha, 'Update products via admin')
}

// === CONTENT ===
async function readContent() {
  const { content } = await getFileContent('src/context/AdminContext.jsx')
  const m = content.match(/const defaultContent = (\{[\s\S]*?\n\})/)
  return m ? eval('(' + m[1] + ')') : {}
}

async function writeContent(updates, fullReplace = false) {
  const { content, sha } = await getFileContent('src/context/AdminContext.jsx')
  const current = await readContent()
  const merged = fullReplace ? updates : { ...current, ...updates }
  const nc = content.replace(/const defaultContent = \{[\s\S]*?\n\}/, 'const defaultContent = ' + JSON.stringify(merged, null, 2))
  await commitFile('src/context/AdminContext.jsx', nc, sha, 'Update content via admin')
}

// === IMAGE UPLOAD ===
async function uploadImage(buf, filename) {
  const ext = require('path').extname(filename) || '.png'
  const name = Date.now() + '-' + Math.random().toString(36).slice(2, 8) + ext
  await gh('PUT', `contents/public/${name}`, { message: 'Upload image', content: buf.toString('base64'), branch: 'master' })
  return `/${name}`
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const auth = req.body?.password
  if (auth && auth !== PASSWORD) return res.status(401).json({ error: 'Wrong password' })

  try {
    const { action } = req.body || {}

    if (action === 'getProducts') return res.json(await readProducts())
    if (action === 'saveProducts') { await writeProducts(req.body.products); return res.json({ ok: true }) }
    if (action === 'getContent') return res.json(await readContent())
    if (action === 'saveContent') { await writeContent(req.body.data, req.body.replace); return res.json({ ok: true }) }

    res.status(400).json({ error: 'Unknown action' })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
