const express = require('express')
const multer = require('multer')
const simpleGit = require('simple-git')
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const app = express()
const upload = multer({ dest: path.join(__dirname, 'uploads') })
const PORT = 4000

// H2B project paths
const H2B_DIR = path.resolve('C:/Users/song3/h2b-paws1')
const SRC_DIR = path.join(H2B_DIR, 'src')
const PUBLIC_DIR = path.join(H2B_DIR, 'public')
const DATA_DIR = path.join(SRC_DIR, 'data')
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.js')

// Read products from the source file
function readProducts() {
  try {
    const raw = fs.readFileSync(PRODUCTS_FILE, 'utf8')
    const match = raw.match(/export const products = (\[[\s\S]*?\])\s*\n/)
    if (match) return eval(match[1])
  } catch (e) { console.error('Read products error:', e.message) }
  return []
}

// Write products back to the source file
function writeProducts(products) {
  try {
    const raw = fs.readFileSync(PRODUCTS_FILE, 'utf8')
    const newContent = raw.replace(
      /export const products = \[[\s\S]*?\](?=\s*\n)/,
      `export const products = ${JSON.stringify(products, null, 2)}`
    )
    fs.writeFileSync(PRODUCTS_FILE, newContent, 'utf8')
    return true
  } catch (e) { console.error('Write products error:', e.message); return false }
}

// Content file for all text
const CONTENT_FILE = path.join(__dirname, 'content.json')
const DEFAULT_CONTENT = {
  splashSlogan: 'Every Degree Matters',
  heroBadge: 'Luxury Pet Essentials',
  heroHeadline1: 'Where luxury',
  heroHeadlineItalic: 'loyalty',
  heroSubheading: 'Thoughtfully crafted essentials for the modern pet.',
  heroCta1: 'Explore Collection', heroCta2: 'Our Story',
  heroStats: [{ value: '10K+', label: 'Happy Pets' }, { value: '40+', label: 'Countries' }, { value: '4.9', label: 'Avg. Rating' }],
  featuredSubtitle: 'Curated Selection', featuredTitle: 'Featured Favorites', featuredDesc: 'Our most-loved pieces.',
  categoriesSubtitle: 'Browse By', categoriesTitle: 'Shop by Category', categoriesDesc: 'Find exactly what your companion needs.',
  testimonialsSubtitle: 'Testimonials', testimonialsTitle: 'Loved by Pets & Parents',
  ctaHeadline: 'Ready to treat\nyour companion to\nthe best?', ctaHeadlineItalic: 'the best',
  ctaSubheading: "Join 10,000+ pet parents who've upgraded their companion's lifestyle.",
  aboutTitle: 'Crafting luxury for the modern companion', aboutDesc: 'Born from a belief that pets deserve the best.',
  contactTitle: "We'd love to hear from you", contactDesc: 'Whether a question about sizing or a custom order request.',
  footerTitle: 'Join the H2B Pack', footerDesc: 'Subscribe for early access.',
  shopTitle: 'Shop H2B Paws', shopSubtitle: 'Premium Essentials', shopDesc: 'Browse our collection.',
  bgCta: '', bgAbout: '', bgContact: '',
}

function readContent() {
  try { if (fs.existsSync(CONTENT_FILE)) return JSON.parse(fs.readFileSync(CONTENT_FILE, 'utf8')) } catch (_) {}
  return { ...DEFAULT_CONTENT }
}

function writeContent(data) { fs.writeFileSync(CONTENT_FILE, JSON.stringify(data, null, 2)) }

// Build the H2B project
function buildProject() {
  try {
    execSync('npm run build', { cwd: H2B_DIR, stdio: 'pipe', timeout: 60000 })
    return { success: true, message: 'Build completed' }
  } catch (e) {
    return { success: false, message: e.stderr?.toString() || e.message }
  }
}

// Push to GitHub
async function pushToGithub() {
  return pushViaApi()
}

async function pushViaApi() {
  const { request } = require('https')
  // Read token from .env file
  let T = ''
  try { T = fs.readFileSync(path.join(__dirname, '.env'), 'utf8').match(/GITHUB_TOKEN=(.+)/)?.[1]?.trim() || '' } catch (_) {}
  const O = 'Pizzlesbivampirekiller', R = 'h2b-paws-v2'

  function api(m, p, d) {
    return new Promise((resolve, reject) => {
      const body = d ? JSON.stringify(d) : undefined
      const req = request({
        hostname: 'api.github.com', path: '/repos/' + O + '/' + R + '/' + p, method: m,
        headers: { 'Authorization': 'token ' + T, 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'h2b', 'Content-Type': 'application/json', 'Content-Length': body ? Buffer.byteLength(body) : 0 }
      }, res => { let b = ''; res.on('data', c => b += c); res.on('end', () => { if (res.statusCode >= 400) { reject(new Error('API ' + res.statusCode)) } else resolve(JSON.parse(b)) }) })
      req.on('error', reject)
      if (body) req.write(body)
      req.end()
    })
  }

  const files = []
  function walk(dir, pre) {
    for (const f of fs.readdirSync(dir)) {
      if (f === '.git' || f === 'node_modules' || f.endsWith('.cjs')) continue
      const full = path.join(dir, f)
      const stat = fs.statSync(full)
      if (stat.isDirectory()) walk(full, pre + f + '/')
      else files.push({ localPath: full, repoPath: (pre + f).replace(/\\/g, '/') })
    }
  }
  walk(H2B_DIR, '')

  const items = []
  for (const f of files) {
    const c = fs.readFileSync(f.localPath)
    const blob = await api('POST', 'git/blobs', { content: c.toString('base64'), encoding: 'base64' })
    items.push({ path: f.repoPath, mode: '100644', type: 'blob', sha: blob.sha })
  }
  const tree = await api('POST', 'git/trees', { tree: items })
  const commit = await api('POST', 'git/commits', { message: 'Update via H2B Admin Tool', tree: tree.sha, parents: [] })
  await api('PATCH', 'git/refs/heads/master', { sha: commit.sha, force: true })
  return { success: true, message: 'Pushed ' + files.length + ' files to master' }
}

// Update AdminContext in the source to use defaults (not API)
function updateSourceContent(content) {
  try {
    const file = path.join(SRC_DIR, 'context', 'AdminContext.jsx')
    let raw = fs.readFileSync(file, 'utf8')

    // Update each content field
    for (const [key, value] of Object.entries(content)) {
      if (typeof value === 'string') {
        // Escape the value properly
        const escaped = value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')
        const regex = new RegExp(`(${key}:[\\s]*)('[^']*')`, 'g')
        raw = raw.replace(regex, `$1'${escaped}'`)
      }
    }
    fs.writeFileSync(file, raw, 'utf8')
    return true
  } catch (e) { console.error('Update content error:', e.message); return false }
}

// Serve admin UI
app.use(express.static(path.join(__dirname, 'public')))

// API routes
app.get('/api/products', (_, res) => res.json(readProducts()))
app.put('/api/products', express.json(), (req, res) => {
  const ok = writeProducts(req.body)
  res.json({ success: ok })
})

app.get('/api/content', (_, res) => res.json(readContent()))
app.put('/api/content', express.json(), (req, res) => {
  writeContent(req.body)
  // Content is stored in content.json, read by AdminContext.jsx
  res.json({ success: true })
})

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' })
  const ext = path.extname(req.file.originalname) || '.png'
  const basename = Date.now() + ext
  const dest = path.join(PUBLIC_DIR, basename)
  fs.copyFileSync(req.file.path, dest)
  // Also copy to dist
  const distDir = path.join(H2B_DIR, 'dist')
  if (fs.existsSync(distDir)) fs.copyFileSync(req.file.path, path.join(distDir, basename))
  res.json({ success: true, url: '/' + basename, path: dest })
})

app.post('/api/build', (_, res) => res.json(buildProject()))
app.post('/api/push', async (_, res) => res.json(await pushToGithub()))
app.post('/api/deploy', async (_, res) => {
  const build = buildProject()
  if (!build.success) return res.json({ success: false, step: 'build', ...build })
  const push = await pushToGithub()
  res.json({ success: push.success, step: 'push', ...push })
})

// Serve the admin HTML
app.get('/', (_, res) => res.sendFile(path.join(__dirname, 'admin.html')))

app.listen(PORT, () => {
  console.log(`\n✨ H2B Paws Admin Tool running at http://localhost:${PORT}\n`)
  console.log(`   Products: ${readProducts().length} items`)
  console.log(`   Content keys: ${Object.keys(readContent()).length}`)
  console.log(`   H2B project: ${H2B_DIR}\n`)
})
