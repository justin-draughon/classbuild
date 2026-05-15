// Simple Express server: serves SPA static files + proxies DuckDuckGo search
// No external runtime deps — uses only Node built-ins (18.20+)

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, '..', 'dist');
const PORT = process.env.PORT || 3000;

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
};

// Simple DuckDuckGo HTML search scrape (lite endpoint — no JS required)
async function searchDDG(query) {
  const url = new URL('https://html.duckduckgo.com/html/');
  url.searchParams.set('q', query);
  url.searchParams.set('kl', 'us-en');

  const response = await fetch(url.toString(), {
    headers: {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  if (!response.ok) {
    throw new Error(`DDG returned ${response.status}`);
  }

  const html = await response.text();
  return parseDdgHtml(html);
}

function parseDdgHtml(html) {
  const results = [];
  // DDG lite HTML: results are in <div class="result"> blocks
  // Title link: <a class="result__a" href="...">title</a>
  // Snippet: <a class="result__snippet">...</a> or following text
  const resultBlocks = html.split(/<div class="result[^"]*">/g).slice(1);

  for (const block of resultBlocks) {
    const titleMatch = block.match(/<a[^>]*class="result__a"[^>]*>(.*?)<\/a>/i);
    const urlMatch = block.match(/<a[^>]*class="result__a"[^>]*href="([^"]*)"/i);
    const snippetMatch = block.match(/<a[^>]*class="result__snippet"[^>]*>(.*?)<\/a>/i);

    if (titleMatch && urlMatch) {
      const title = decodeHtmlEntities(stripTags(titleMatch[1]));
      let url = decodeHtmlEntities(urlMatch[1]);

      // DDG redirects through their own tracker — extract real URL from /html/
      if (url.startsWith('/html/') || url.startsWith('/l/')) {
        const u = new URL(url, 'https://duckduckgo.com');
        const realUrl = u.searchParams.get('uddg') || u.searchParams.get('udga') || u.searchParams.get('u') || u.searchParams.get('rut');
        if (realUrl) url = decodeURIComponent(realUrl);
      }

      const snippet = snippetMatch ? decodeHtmlEntities(stripTags(snippetMatch[1])) : '';
      results.push({ title, url, snippet });
    }

    if (results.length >= 10) break;
  }

  return results;
}

function stripTags(str) {
  return str.replace(/<[^>]+>/g, '');
}

function decodeHtmlEntities(str) {
  const entities = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&#x2F;': '/',
  };
  return str.replace(/&[#\w]+;/g, (e) => entities[e] || e);
}

function serveStatic(req, res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        // SPA fallback — serve index.html for unknown routes
        serveIndex(req, res);
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Server error');
      }
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000',
    });
    res.end(data);
  });
}

function serveIndex(req, res) {
  const indexPath = path.join(distDir, 'index.html');
  fs.readFile(indexPath, (err, data) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Could not load SPA');
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'text/html',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
}

async function handleApiSearch(req, res) {
  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', async () => {
    try {
      const { query } = JSON.parse(body || '{}');
      if (!query || typeof query !== 'string') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing query parameter' }));
        return;
      }

      const results = await searchDDG(query);
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      res.end(JSON.stringify({ query, results }));
    } catch (err) {
      console.error('Search error:', err.message);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message, results: [] }));
    }
  });
}

function handleOptions(req, res) {
  res.writeHead(204, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end();
}

const server = http.createServer((req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    handleOptions(req, res);
    return;
  }

  const url = req.url;

  // API routes
  if (url === '/api/search' && req.method === 'POST') {
    handleApiSearch(req, res);
    return;
  }

  // Health check
  if (url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  // Static files
  let filePath = path.join(distDir, url === '/' ? 'index.html' : url);
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // SPA fallback for React Router
      serveIndex(req, res);
    } else {
      serveStatic(req, res, filePath);
    }
  });
});

server.listen(PORT, () => {
  console.log(`ClassBuild server listening on port ${PORT}`);
  console.log(`Serving static from ${distDir}`);
});
