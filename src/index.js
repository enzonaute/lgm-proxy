// proxy cloudflare pour lgm - prod
// 04.11.25 - @enzonaute

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

const CACHE_CONFIG = {
  static: {
    browserTTL: 31536000,
    edgeTTL: 31536000,
  },
  html: {
    browserTTL: 0,
    edgeTTL: 600,
    staleWhileRevalidate: 1800
  },
  noCache: {
    browserTTL: 0,
    edgeTTL: 0
  }
};
  
async function handleRequest(request) {
  try {
    const url = new URL(request.url);
    
    if (!url.pathname || url.pathname === '') {
      url.pathname = '/';
    }
    
    // Interception des requêtes Weglot pour les proxifier vers webproxy
    // Cela permet à Weglot de fonctionner même si le domaine public est lagrowthmachine.com
    if (isWeglotRequest(url)) {
      return await proxyWeglotRequest(request, url);
    }
    
    // homepage toujours sur webflow
    if (url.pathname === '/' && !url.search) {
      return await fetchWebflow(request, url, '/');
    }
    
    const academyRedirect = handleAcademyRedirect(url);
    if (academyRedirect) {
      return academyRedirect;
    }
    
    const specificRedirect = handleSpecificRedirects(url);
    if (specificRedirect) {
      return specificRedirect;
    }
    
    const needsTrailingSlash = shouldAddTrailingSlash(url);
    if (needsTrailingSlash) {
      const newUrl = new URL(url);
      newUrl.pathname = url.pathname + '/';
      return Response.redirect(newUrl.toString(), 301);
    }
    
    if (url.pathname.startsWith('/sitemap')) {
      return await handleSitemap(request, url);
    }
    
    let path = url.pathname;
    const queryString = url.search;
    
    const wordpressRoutes = [
      '/wp-login.php',
      '/wp-admin',
      '/wp-content',
      '/wp-includes',
      '/wp-json',
      '/xmlrpc.php',
      '/wp-cron.php'
    ];
    
    const isWordPressRoute = wordpressRoutes.some(route => path.startsWith(route));
    
    const excludeQueryString = queryString.includes("post_type=") || 
                             queryString.includes("preview=true") ||
                             queryString.includes("p=") ||
                             queryString.includes("page_id=") ||
                             queryString.includes("action=");

    if (excludeQueryString || isWordPressRoute) {
      return await fetchWordPress(request, url, true);
    }

    const destination = determineDestination(path);
    
    if (destination === 'webflow') {
      return await fetchWebflow(request, url, path);
    } else {
      return await fetchWordPress(request, url, false);
    }
    
  } catch (error) {
    console.error('Worker error:', error);
    return new Response('Internal Server Error', {
      status: 500,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}
  
// redirections academy: /academy/course/section/chapter → /academy-chapter/chapter
function handleAcademyRedirect(url) {
  const path = url.pathname;
  
  const academyOldPattern = /^\/((?:fr|de|es)\/)?academy\/[^\/]+\/[^\/]+\/([^\/]+)\/?$/;
  const match = path.match(academyOldPattern);
  
  if (match) {
    const langPrefix = match[1] || '';
    const chapterSlug = match[2];
    const newPath = `/${langPrefix}academy-chapter/${chapterSlug}/`;
    const newUrl = new URL(url);
    newUrl.pathname = newPath;
    return Response.redirect(newUrl.toString(), 301);
  }
  
  const sectionPattern = /^\/((?:fr|de|es)\/)?academy\/([^\/]+)\/[^\/]+\/?$/;
  const sectionMatch = path.match(sectionPattern);
  
  if (sectionMatch) {
    const langPrefix = sectionMatch[1] || '';
    const courseSlug = sectionMatch[2];
    const newPath = `/${langPrefix}academy/${courseSlug}/`;
    const newUrl = new URL(url);
    newUrl.pathname = newPath;
    return Response.redirect(newUrl.toString(), 301);
  }
  
  return null;
}
  
// redirections complexes (les simples sont dans bulk redirects cloudflare)
function handleSpecificRedirects(url) {
  return null;
}
  
function shouldAddTrailingSlash(url) {
  const path = url.pathname;
  
  if (path === '/') return false;
  if (path.endsWith('/')) return false;
  if (/\.[a-zA-Z0-9]+$/.test(path)) return false;
  
  const wpRoutes = ['/wp-login.php', '/wp-admin', '/wp-content', '/wp-includes', '/wp-json', '/xmlrpc.php'];
  if (wpRoutes.some(route => path.startsWith(route))) return false;
  
  if (path.startsWith('/sitemap')) return false;
  
  const queryString = url.search;
  if (queryString.includes("post_type=") || 
      queryString.includes("preview=true") ||
      queryString.includes("p=") ||
      queryString.includes("page_id=") ||
      queryString.includes("action=")) return false;
  
  return true;
}
  
function shouldCacheHTML(request, url) {
  const cookies = request.headers.get('cookie') || '';
  const queryString = url.search;
  
  const sessionCookies = [
    'wordpress_logged_in',
    'wp-settings',
    'wordpress_test_cookie',
    'wf_loggedin',
    'PHPSESSID',
    'pll_language',
    'weglot_language',
    'wg_language'
  ];
  
  for (const cookieName of sessionCookies) {
    if (cookies.includes(cookieName) && cookieName !== 'pll_language') {
      return false;
    }
  }
  
  if (queryString.includes('preview=') || 
      queryString.includes('post_type=') ||
      queryString.includes('page_id=') ||
      queryString.includes('p=') ||
      queryString.includes('action=') ||
      queryString.includes('edit=')) {
    return false;
  }
  
  const path = url.pathname;
  if (path.startsWith('/wp-admin') || 
      path.startsWith('/wp-login') ||
      path.startsWith('/admin') ||
      path.includes('/preview/')) {
    return false;
  }
  
  // pas de cache pour les pages traduites weglot
  if (path.match(/^\/(fr|de|es|en)(\/|$)/)) {
    return false;
  }
  
  return true;
}
  
// réécriture seo: canonical, hreflang, og:url, json-ld
// Détecte si la requête est destinée à Weglot (scripts, API, assets)
function isWeglotRequest(url) {
  const path = url.pathname;
  
  // Scripts Weglot
  if (path.includes('cdn.weglot.com')) return true;
  
  // API Weglot
  if (path.startsWith('/weglot/') || path.includes('weglot')) return true;
  
  return false;
}

// Proxifie les requêtes Weglot vers webproxy pour que Weglot fonctionne
async function proxyWeglotRequest(request, url) {
  try {
    // Construire l'URL vers webproxy
    const proxyUrl = new URL(url.toString());
    proxyUrl.hostname = 'webproxy.lagrowthmachine.com';
    
    const requestInit = {
      method: request.method,
      headers: new Headers(request.headers),
      redirect: 'follow'
    };
    
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      requestInit.body = request.body;
    }
    
    const modifiedRequest = new Request(proxyUrl, requestInit);
    
    // Faire croire à Weglot que la requête vient de webproxy
    modifiedRequest.headers.set('Host', 'webproxy.lagrowthmachine.com');
    modifiedRequest.headers.set('X-Forwarded-Host', 'lagrowthmachine.com');
    modifiedRequest.headers.set('X-Forwarded-Proto', 'https');
    
    const response = await fetch(modifiedRequest);
    
    // Retourner la réponse sans modification pour Weglot
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    });
  } catch (error) {
    console.error('Weglot proxy error:', error);
    return new Response('Weglot Service Error', { status: 502 });
  }
}

function rewriteSEOMetadata(html, currentUrl) {
  const ROUTER_DOMAIN = 'https://lagrowthmachine.com';
  
  const preconnectDomains = [
      'https://app.lagrowthmachine.com',
      'https://cdn.supademo.com',
      'https://www.gstatic.com',
      'https://js.stripe.com',
      'https://cdn.prod.website-files.com',
      'https://cdnjs.cloudflare.com',
      'https://connect.facebook.net',
      'https://www.googletagmanager.com',
      'https://hello.lagrowthmachine.com',
      'https://cdn.weglot.com',
      'https://my.hellobar.com',
      'https://scripts.clarity.ms'
    ];
    
  const preconnectTags = preconnectDomains
    .map(domain => `<link rel="preconnect" href="${domain}" crossorigin>`)
    .join('\n    ');
  
  html = html.replace(/<head([^>]*)>/i, (match) => {
    return `${match}\n    ${preconnectTags}`;
  });
  
  function ensureTrailingSlash(url) {
    try {
      if (!url.startsWith('http')) {
        if (url.startsWith('/')) {
          url = ROUTER_DOMAIN + url;
        } else {
          return url;
        }
      }
      
      const urlObj = new URL(url);
      const path = urlObj.pathname;
      
      if (path === '/' || path === '') {
        urlObj.pathname = '/';
        return urlObj.toString();
      }
      
      // laisser weglot gérer les trailing slashes pour les urls traduites
      if (path.match(/^\/(fr|de|es|en)\//)) {
        return url;
      }
      
      if (/\.[a-zA-Z0-9]+$/.test(path)) return url;
      if (path.endsWith('/')) return url;
      
      urlObj.pathname = path + '/';
      return urlObj.toString();
    } catch (e) {
      console.error('Error in ensureTrailingSlash:', e, 'URL:', url);
      return url;
    }
  }
  
  function processUrl(url) {
    // Déterminer le domaine cible en fonction de l'origine de la requête
    const hostname = new URL(currentUrl).hostname;
    const targetDomain = hostname === 'router.lagrowthmachine.com' 
      ? 'https://router.lagrowthmachine.com' 
      : ROUTER_DOMAIN;
    
    url = url.replace(/https?:\/\/(preprod|webproxy|router|wp)\.lagrowthmachine\.com/g, targetDomain);
    if (url.startsWith('/')) {
      url = targetDomain + url;
    }
    return ensureTrailingSlash(url);
  }
    
  html = html.replace(
      /<link([^>]*)\s+rel=["']canonical["']([^>]*)>/gi,
      (match, before, after) => {
        const hrefMatch = match.match(/href=["']([^"']+)["']/i);
        if (hrefMatch) {
          const href = processUrl(hrefMatch[1]);
          return match.replace(/href=["'][^"']*["']/i, `href="${href}"`);
        }
        return match;
      }
    );
    
  html = html.replace(
      /<link([^>]*?)href=["']([^"']+)["']([^>]*?)hreflang=["']([^"']+)["']([^>]*)>/gi,
      (match, before, href, middle, hreflang, after) => {
        const newHref = processUrl(href);
        return `<link${before}href="${newHref}"${middle}hreflang="${hreflang}"${after}>`;
      }
    );
    
  html = html.replace(
      /<link([^>]*?)hreflang=["']([^"']+)["']([^>]*?)href=["']([^"']+)["']([^>]*)>/gi,
      (match, before, hreflang, middle, href, after) => {
        const newHref = processUrl(href);
        return `<link${before}hreflang="${hreflang}"${middle}href="${newHref}"${after}>`;
      }
    );
    
  html = html.replace(
      /<meta([^>]*)\s+property=["']og:url["']([^>]*)>/gi,
      (match, before, after) => {
        const contentMatch = match.match(/content=["']([^"']+)["']/i);
        if (contentMatch) {
          const content = processUrl(contentMatch[1]);
          return match.replace(/content=["'][^"']*["']/i, `content="${content}"`);
        }
        return match;
      }
    );
    
  html = html.replace(
      /<meta([^>]*)\s+name=["']twitter:url["']([^>]*)>/gi,
      (match, before, after) => {
        const contentMatch = match.match(/content=["']([^"']+)["']/i);
        if (contentMatch) {
          const content = processUrl(contentMatch[1]);
          return match.replace(/content=["'][^"']*["']/i, `content="${content}"`);
        }
        return match;
      }
    );
    
  html = html.replace(
      /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
      (match, jsonContent) => {
        try {
          let modifiedJson = jsonContent
            .replace(/https?:\/\/(preprod|webproxy|router|wp)\.lagrowthmachine\.com/g, ROUTER_DOMAIN);
          
        modifiedJson = modifiedJson.replace(/"url"\s*:\s*"([^"]+)"/g, (m, url) => {
          const newUrl = processUrl(url);
          return `"url":"${newUrl}"`;
        });
        
        modifiedJson = modifiedJson.replace(/"@id"\s*:\s*"([^"]+)"/g, (m, url) => {
          if (url.startsWith('http')) {
            const newUrl = processUrl(url);
            return `"@id":"${newUrl}"`;
          }
          return `"@id":"${url}"`;
        });
          
          return match.replace(jsonContent, modifiedJson);
        } catch (e) {
          console.error('JSON-LD parsing error:', e);
          return match;
        }
      }
    );
    
  html = html.replace(
      /<link([^>]*)\s+rel=["']alternate["']([^>]*)>/gi,
      (match) => {
        const hrefMatch = match.match(/href=["']([^"']+)["']/i);
        if (hrefMatch) {
          const href = processUrl(hrefMatch[1]);
          return match.replace(/href=["'][^"']*["']/i, `href="${href}"`);
        }
        return match;
      }
    );
    
  html = html.replace(
    /href=(["'])(https?:\/\/[^\/\s]+)?\/(fr|de|es|en)(?!\/)(["'])/gi,
    (match, quote1, domain, lang, quote2) => {
      if (domain) {
        return `href=${quote1}${domain}/${lang}/${quote2}`;
      } else {
        return `href=${quote1}/${lang}/${quote2}`;
      }
    }
  );
  
  html = html.replace(/href="https:\/\/lagrowthmachine\.com\/(fr|de|es|en)(?!\/)"/g, 'href="https://lagrowthmachine.com/$1/"');
  html = html.replace(/href='https:\/\/lagrowthmachine\.com\/(fr|de|es|en)(?!\/)'/g, "href='https://lagrowthmachine.com/$1/'");
  
  html = html.replace(
    /<a([^>]*)\s+href=["']([^"']+)["']([^>]*)>/gi,
    (match, before, href, after) => {
      if (href.startsWith('#')) return match;
      
      if (href.startsWith('/') || href.includes('lagrowthmachine.com')) {
        let newHref = processUrl(href);
        if (href.startsWith('/') && newHref.startsWith(ROUTER_DOMAIN)) {
          newHref = newHref.replace(ROUTER_DOMAIN, '');
        }
        return `<a${before} href="${newHref}"${after}>`;
      }
      
      return match;
    }
  );
  
  return html;
}
  
async function handleSitemap(request, url) {
    const path = url.pathname;
    
    if (path === '/sitemap.xml' || path === '/sitemap_index.xml') {
      return generateAggregatedSitemapIndex();
    }
    
    if (path.match(/^\/(?:post-sitemap2?|page-sitemap|author-sitemap)\.xml$/)) {
      return await fetchWordPressSitemap(request, url);
    }
    
    if (path === '/sitemap-webflow.xml') {
      return await fetchWebflowSitemap(request, url);
    }
    
    return new Response('Sitemap not found', { 
      status: 404,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
  
async function generateAggregatedSitemapIndex() {
    const sitemapIndexContent = `<?xml version="1.0" encoding="UTF-8"?>
  <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <sitemap>
      <loc>https://lagrowthmachine.com/sitemap-webflow.xml</loc>
      <lastmod>${new Date().toISOString()}</lastmod>
    </sitemap>
    <sitemap>
      <loc>https://lagrowthmachine.com/post-sitemap.xml</loc>
      <lastmod>${new Date().toISOString()}</lastmod>
    </sitemap>
    <sitemap>
      <loc>https://lagrowthmachine.com/post-sitemap2.xml</loc>
      <lastmod>${new Date().toISOString()}</lastmod>
    </sitemap>
    <sitemap>
      <loc>https://lagrowthmachine.com/page-sitemap.xml</loc>
      <lastmod>${new Date().toISOString()}</lastmod>
    </sitemap>
    <sitemap>
      <loc>https://lagrowthmachine.com/author-sitemap.xml</loc>
      <lastmod>${new Date().toISOString()}</lastmod>
    </sitemap>
  </sitemapindex>`;
  
    return new Response(sitemapIndexContent, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml',
        'Cache-Control': 'public, max-age=3600'
      }
    });
  }
  
async function fetchWordPressSitemap(request, url) {
    try {
      let wpPath = url.pathname;
      
      const sitemapMapping = {
        '/post-sitemap.xml': '/post-sitemap.xml',
        '/post-sitemap2.xml': '/post-sitemap2.xml',
        '/page-sitemap.xml': '/page-sitemap.xml',
        '/author-sitemap.xml': '/author-sitemap.xml'
      };
      
      const finalPath = sitemapMapping[wpPath] || wpPath;
      const wordpressUrl = `https://wp.lagrowthmachine.com${finalPath}`;
      
      const response = await fetch(wordpressUrl);
      
      if (!response.ok) {
        return new Response(`WordPress sitemap not found: ${finalPath}`, { 
          status: 404,
          headers: { 'Content-Type': 'text/plain' }
        });
      }
      
      let content = await response.text();
      content = content.replace(/https?:\/\/wp\.lagrowthmachine\.com/g, 'https://lagrowthmachine.com');
      
    content = content.replace(/<loc>([^<]+)<\/loc>/g, (match, url) => {
      if (!/\.[a-zA-Z0-9]+$/.test(url) && !url.endsWith('/')) {
        try {
          const urlObj = new URL(url);
          if (urlObj.pathname !== '/') {
            urlObj.pathname = urlObj.pathname + '/';
            return `<loc>${urlObj.toString()}</loc>`;
          }
        } catch (e) {
          return match;
        }
      }
      return match;
    });
      
      return new Response(content, {
        status: 200,
        headers: {
          'Content-Type': 'application/xml',
          'Cache-Control': 'public, max-age=3600'
        }
      });
    } catch (error) {
      console.error('Error fetching WordPress sitemap:', error);
      return new Response(`Error fetching WordPress sitemap: ${error.message}`, { 
        status: 500,
        headers: { 'Content-Type': 'text/plain' }
      });
    }
  }
  
async function fetchWebflowSitemap(request, url) {
    try {
      let webflowPath = url.pathname;
      
      if (webflowPath === '/sitemap-webflow.xml' || webflowPath.startsWith('/sitemap-webflow-')) {
        webflowPath = '/sitemap.xml';
      }
      
    const webflowUrl = `https://webproxy.lagrowthmachine.com${webflowPath}`;
      const response = await fetch(webflowUrl);
      
      if (!response.ok) {
        return new Response(`Webflow sitemap not found: ${webflowPath}`, { 
          status: 404,
          headers: { 'Content-Type': 'text/plain' }
        });
      }
      
      let content = await response.text();
    content = content.replace(/https?:\/\/webproxy\.lagrowthmachine\.com/g, 'https://lagrowthmachine.com');
    
    content = content.replace(/<loc>([^<]+)<\/loc>/g, (match, url) => {
        if (!/\.[a-zA-Z0-9]+$/.test(url) && !url.endsWith('/')) {
          try {
            const urlObj = new URL(url);
            if (urlObj.pathname !== '/') {
              urlObj.pathname = urlObj.pathname + '/';
              return `<loc>${urlObj.toString()}</loc>`;
            }
          } catch (e) {
            return match;
          }
        }
        return match;
      });
      
      return new Response(content, {
        status: 200,
        headers: {
          'Content-Type': 'application/xml',
          'Cache-Control': 'public, max-age=3600'
        }
      });
    } catch (error) {
      console.error('Error fetching Webflow sitemap:', error);
      return new Response(`Error fetching Webflow sitemap: ${error.message}`, { 
        status: 500,
        headers: { 'Content-Type': 'text/plain' }
      });
    }
  }
  
const WORDPRESS_ROUTES = [
    '/wp-',
    '/app/uploads',
    '/wp-json',
    '/xmlrpc',
    '/wp-admin',
    '/admin',
    '/lgm-academy-sales-ai-strategies-waiting-list',
    '/fr/lgm-academy-strategies-sales-ia-liste-dattente',
    '/sequence-generator',
    '/fr/communaute-playground',
    '/b2b-lead-generation-software',
    '/clay-lgm-templates'
  ];
  
const WEBFLOW_ROUTES = [
    '/robots.txt',
    '/llms.txt',
    '/',
    '/fr',
    '/de',
    '/es',
    '/3',
    '/academy',
    '/academy/*',
    '/academy-chapter/*',
    '/fr/academy',
    '/fr/academy/*',
    '/fr/academy-chapter/*',
    '/features',
    '/features/*',
    '/fr/fonctionnalites',
    '/fr/fonctionnalites/*',
    '/alternative/*',
    '/fr/alternative/*',
    '/integrations',
    '/integrations/*',
    '/fr/integrations',
    '/fr/integrations/*',
    '/b2b-customer-segmentation-hub',
    '/data-enrichment-hub',
    '/linkedin-automation-hub',
    '/fr/b2b-customer-segmentation-hub',
    '/fr/b2b-segmentation-hub',
    '/fr/data-enrichment-hub',
    '/fr/linkedin-automation-hub',
    '/de/b2b-customer-segmentation-hub',
    '/de/data-enrichment-hub',
    '/de/linkedin-automation-hub',
    '/es/b2b-customer-segmentation-hub',
    '/es/data-enrichment-hub',
    '/es/linkedin-automation-hub',
    '/playbooks',
    '/playbooks/*',
    '/fr/playbooks',
    '/fr/playbooks/*',
    '/resources/*',
    '/fr/ressources/*',
    '/pricing',
    '/fr/tarifs',
    '/linkedin-safety',
    '/fr/securite-linkedin',
    '/wall-of-love',
    '/fr/wall-of-love',
    '/privacy-policy',
    '/terms-of-service'
  ];
  
function matchRoute(path, pattern) {
  if (!pattern.includes('*')) {
    return path === pattern || path === pattern + '/';
  }
  
  const regexPattern = pattern
    .replace(/\*/g, '[^/]+')
    .replace(/\//g, '\\/');
  const regex = new RegExp(`^${regexPattern}\/?$`);
  return regex.test(path);
}
  
function determineDestination(path) {
  for (const route of WEBFLOW_ROUTES) {
    if (matchRoute(path, route)) {
      return 'webflow';
    }
  }
  
  for (const route of WORDPRESS_ROUTES) {
    if (path.startsWith(route)) {
      return 'wordpress';
    }
  }
  
  return 'wordpress';
}
  
function getCacheType(url, isAdminRequest, request) {
    if (isAdminRequest) {
      return 'noCache';
    }
    
    const path = url.pathname;
    
  if (path === '/robots.txt' || path === '/llms.txt') {
      return 'noCache';
    }
    
  const staticExtensions = /\.(css|js|jpg|jpeg|png|gif|svg|webp|woff|woff2|ttf|eot|ico|pdf|mp4|webm)$/i;
    if (staticExtensions.test(path)) {
      return 'static';
    }
    
  if (request && shouldCacheHTML(request, url)) {
      return 'html';
    }
    
  return 'noCache';
  }
  
function addCacheHeaders(headers, cacheType) {
  if (cacheType === 'static') {
    headers.set('Cache-Control', `public, max-age=${CACHE_CONFIG.static.browserTTL}, s-maxage=${CACHE_CONFIG.static.edgeTTL}, immutable`);
  } else if (cacheType === 'html') {
    headers.set('Cache-Control', `public, max-age=${CACHE_CONFIG.html.browserTTL}, s-maxage=${CACHE_CONFIG.html.edgeTTL}, stale-while-revalidate=${CACHE_CONFIG.html.staleWhileRevalidate}`);
    headers.set('Vary', 'Accept-Encoding, Cookie');
  } else {
    headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    headers.set('Pragma', 'no-cache');
    headers.set('Expires', '0');
  }
}
  
async function fetchWebflow(request, url, path) {
  try {
    const webflowUrl = new URL(`https://webproxy.lagrowthmachine.com${path}${url.search}`);
    const cacheType = getCacheType(url, false, request);
    
    // Déterminer le domaine public (lagrowthmachine.com ou router.lagrowthmachine.com)
    const publicDomain = url.hostname === 'router.lagrowthmachine.com' 
      ? 'router.lagrowthmachine.com' 
      : 'lagrowthmachine.com';
    
    const requestInit = {
      method: request.method,
      headers: new Headers(request.headers),
      redirect: 'follow',
      cf: path === '/robots.txt' ? { cacheEverything: false, cacheTtl: 0 } : undefined
    };
    
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      requestInit.body = request.body;
    }
      
      const modifiedRequest = new Request(webflowUrl, requestInit);
      
    modifiedRequest.headers.delete('host');
    modifiedRequest.headers.set('Host', 'webproxy.lagrowthmachine.com');
    modifiedRequest.headers.set('X-Forwarded-Host', publicDomain);
    modifiedRequest.headers.set('X-Forwarded-Proto', 'https');
    modifiedRequest.headers.set('X-Forwarded-For', request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || '');
    modifiedRequest.headers.set('X-Original-URL', url.pathname + url.search);
    
    const clientCookies = request.headers.get('cookie');
    if (clientCookies) {
      modifiedRequest.headers.set('cookie', clientCookies);
    }
      
      let webflowResponse = await fetch(modifiedRequest);
      
    if (webflowResponse.status >= 300 && webflowResponse.status < 400) {
        const location = webflowResponse.headers.get('location');
        if (location) {
          let redirectUrl = location.startsWith('/') ? 
            `https://webproxy.lagrowthmachine.com${location}` : location;
          
          const redirectInit = {
            method: 'GET',
            headers: new Headers(request.headers),
            redirect: 'follow'
          };
          
          webflowResponse = await fetch(new Request(redirectUrl, redirectInit));
        }
      }
      
    const newHeaders = new Headers(webflowResponse.headers);
    newHeaders.delete('location');
    newHeaders.delete('Link');
    newHeaders.delete('link');
    newHeaders.set('X-Source-Backend', 'webflow');
    newHeaders.set('X-LGM-Served-By', 'Webflow');
    addCacheHeaders(newHeaders, cacheType);
    newHeaders.delete('X-Robots-Tag');
    newHeaders.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    const setCookieHeaders = webflowResponse.headers.getAll ? 
        webflowResponse.headers.getAll('set-cookie') : 
        [webflowResponse.headers.get('set-cookie')].filter(Boolean);
      
    if (setCookieHeaders && setCookieHeaders.length > 0) {
      newHeaders.delete('set-cookie');
      
      setCookieHeaders.forEach(cookieHeader => {
        if (cookieHeader) {
          let modifiedCookie = cookieHeader
            .replace(/Domain=webproxy\.lagrowthmachine\.com/gi, 'Domain=lagrowthmachine.com')
            .replace(/Domain=\.webproxy\.lagrowthmachine\.com/gi, 'Domain=.lagrowthmachine.com');
          
          if (!modifiedCookie.includes('Domain=')) {
            modifiedCookie += '; Domain=lagrowthmachine.com';
          }
          if (!modifiedCookie.includes('Path=')) {
            modifiedCookie += '; Path=/';
          }
          if (!modifiedCookie.includes('SameSite=')) {
            modifiedCookie += '; SameSite=Lax';
          }
          
          newHeaders.append('set-cookie', modifiedCookie);
        }
      });
    }
      
      const contentType = webflowResponse.headers.get('content-type');
      let body = webflowResponse.body;
      
    if (contentType && contentType.includes('text/html')) {
      let text = await webflowResponse.text();
      
      // Remplacer les domaines backend par le domaine public approprié
      const targetDomain = publicDomain === 'router.lagrowthmachine.com' 
        ? 'router.lagrowthmachine.com' 
        : 'lagrowthmachine.com';
      
      // IMPORTANT: Traiter Weglot EN PREMIER avant les remplacements généraux
      // Weglot doit garder "webproxy.lagrowthmachine.com" dans sa config
      // On protège le JSON Weglot en le remplaçant temporairement
      const weglotDataMatch = text.match(/<script type="application\/json" id="weglot-data">([\s\S]*?)<\/script>/i);
      let weglotData = null;
      if (weglotDataMatch) {
        weglotData = weglotDataMatch[0];
        // Remplacer temporairement par un placeholder
        text = text.replace(weglotDataMatch[0], '<!--WEGLOT_DATA_PLACEHOLDER-->');
      }
      
      // Maintenant faire les remplacements généraux de domaine
      text = text.replace(/https?:\/\/webproxy\.lagrowthmachine\.com/gi, `https://${targetDomain}`);
      text = text.replace(/https?:\/\/router\.lagrowthmachine\.com/gi, `https://${targetDomain}`);
      text = text.replace(/https?:\/\/preprod\.lagrowthmachine\.com/gi, `https://${targetDomain}`);
      text = text.replace(/\/\/webproxy\.lagrowthmachine\.com/gi, `//${targetDomain}`);
      text = text.replace(/\/\/router\.lagrowthmachine\.com/gi, `//${targetDomain}`);
      text = text.replace(/data-wf-domain="webproxy\.lagrowthmachine\.com"/gi, `data-wf-domain="${targetDomain}"`);
      text = text.replace(/data-wf-domain='webproxy\.lagrowthmachine\.com'/gi, `data-wf-domain='${targetDomain}'`);
      
      // Restaurer le JSON Weglot SANS modification (il doit garder webproxy.lagrowthmachine.com)
      if (weglotData) {
        text = text.replace('<!--WEGLOT_DATA_PLACEHOLDER-->', weglotData);
      }
      
      text = rewriteSEOMetadata(text, url);
      body = text;
    } else if (contentType && contentType.includes('text/plain')) {
      let text = await webflowResponse.text();
      text = text.replace(/webproxy\.lagrowthmachine\.com/g, 'lagrowthmachine.com');
      
      if (path === '/robots.txt') {
        text = text.replace(
          /# DO NOT TOUCH THIS LINE - REWRITTEN BY CLOUDFLARE WORKER\s*\n\s*Disallow:\s*\/\s*\n/gi,
          ''
        );
        
        const lines = text.split('\n');
        const seenSitemaps = new Set();
        const dedupedLines = lines.filter(line => {
          const trimmed = line.trim();
          if (trimmed.startsWith('Sitemap:')) {
            if (seenSitemaps.has(trimmed)) {
              return false;
            }
            seenSitemaps.add(trimmed);
          }
          return true;
        });
        
        text = dedupedLines.join('\n');
      }
      
      body = text;
    }
      
    const response = new Response(body, {
      status: webflowResponse.status,
      statusText: webflowResponse.statusText,
      headers: newHeaders
    });
    
    if (path === '/robots.txt') {
      response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
      response.headers.set('CDN-Cache-Control', 'no-store');
      response.headers.set('Cloudflare-CDN-Cache-Control', 'no-store');
    }
    
    return response;
    
  } catch (error) {
    console.error('Webflow fetch error:', error);
    return new Response('Webflow Service Error', { status: 502 });
  }
}
  
async function fetchWordPress(request, url, isAdminRequest = false) {
    try {
      let wordpressUrl = new URL(`https://wp.lagrowthmachine.com${url.pathname}${url.search}`);
      
    const cacheType = getCacheType(url, isAdminRequest, request);
      
      const params = new URLSearchParams(wordpressUrl.search);
      const paramsToCheck = ['redirect_to', 'redirect', 'return', '_wp_http_referer'];
      paramsToCheck.forEach(paramName => {
        if (params.has(paramName)) {
          let paramValue = params.get(paramName);
          paramValue = paramValue.replace(/wp\.lagrowthmachine\.com/g, 'lagrowthmachine.com');
          params.set(paramName, paramValue);
        }
      });
      
      wordpressUrl.search = params.toString();
      
      // Construire la requête en fonction de la méthode
      const requestInit = {
        method: request.method,
        headers: new Headers(request.headers),
        redirect: 'manual',
        credentials: 'include'
      };
      
      // Ajouter le body seulement pour POST, PUT, PATCH
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        requestInit.body = request.body;
      }
      
      const modifiedRequest = new Request(wordpressUrl, requestInit);
      
      const incomingCookies = request.headers.get('cookie');
      if (incomingCookies) {
        modifiedRequest.headers.set('cookie', incomingCookies);
      }
      
      modifiedRequest.headers.delete('host');
      modifiedRequest.headers.set('Host', 'wp.lagrowthmachine.com');
      modifiedRequest.headers.set('X-Forwarded-Host', 'lagrowthmachine.com');
      modifiedRequest.headers.set('X-Forwarded-Proto', 'https');
      modifiedRequest.headers.set('X-Forwarded-For', request.headers.get('CF-Connecting-IP') || '');
      modifiedRequest.headers.set('X-Real-IP', request.headers.get('CF-Connecting-IP') || '');
      
      if (request.method === 'POST') {
        const referer = request.headers.get('referer');
        if (referer) {
          modifiedRequest.headers.set('referer', referer.replace('lagrowthmachine.com', 'wp.lagrowthmachine.com'));
        }
        
        const origin = request.headers.get('origin');
        if (origin) {
          modifiedRequest.headers.set('origin', 'https://wp.lagrowthmachine.com');
        }
      }
      
      const wordpressResponse = await fetch(modifiedRequest);
      const newHeaders = new Headers(wordpressResponse.headers);
      
    newHeaders.set('X-Source-Backend', 'wordpress');
    newHeaders.set('X-LGM-Served-By', 'WordPress');
    addCacheHeaders(newHeaders, cacheType);
    
    if (!isAdminRequest) {
      newHeaders.delete('X-Robots-Tag');
      newHeaders.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    } else {
      newHeaders.set('X-Robots-Tag', 'noindex, nofollow');
    }
      
      const setCookieHeaders = wordpressResponse.headers.getAll ? 
        wordpressResponse.headers.getAll('set-cookie') : 
        [wordpressResponse.headers.get('set-cookie')].filter(Boolean);
      
      if (setCookieHeaders && setCookieHeaders.length > 0) {
        newHeaders.delete('set-cookie');
        
        setCookieHeaders.forEach(cookieHeader => {
          if (cookieHeader) {
            let modifiedCookie = cookieHeader
              .replace(/Domain=wp\.lagrowthmachine\.com/gi, 'Domain=lagrowthmachine.com')
              .replace(/Domain=\.wp\.lagrowthmachine\.com/gi, 'Domain=.lagrowthmachine.com');
            
            if (!modifiedCookie.includes('Domain=')) {
              modifiedCookie += '; Domain=lagrowthmachine.com';
            }
            
            if (!modifiedCookie.includes('SameSite=')) {
              modifiedCookie += '; SameSite=Lax';
            }
            
            newHeaders.append('set-cookie', modifiedCookie);
          }
        });
      }
      
      if (wordpressResponse.status >= 300 && wordpressResponse.status < 400) {
        const location = wordpressResponse.headers.get('location');
        if (location) {
          let newLocation = location.replace(/wp\.lagrowthmachine\.com/g, 'lagrowthmachine.com');
          
          if (location.startsWith('/')) {
            newLocation = location;
          }
          
          newHeaders.set('Location', newLocation);
          
          return new Response(null, {
            status: wordpressResponse.status,
            statusText: wordpressResponse.statusText,
            headers: newHeaders
          });
        }
      }
      
      const contentType = wordpressResponse.headers.get('content-type');
      let body = wordpressResponse.body;
      
    if (contentType && (contentType.includes('text/html') || contentType.includes('application/json') || contentType.includes('text/javascript'))) {
      let text = await wordpressResponse.text();
      text = text.replace(/wp\.lagrowthmachine\.com(?!\/app\/uploads)/g, 'lagrowthmachine.com');
      
      if (!isAdminRequest && contentType.includes('text/html')) {
        text = rewriteSEOMetadata(text, url);
      }
      
      if (isAdminRequest) {
        text = text.replace(/https:\\\/\\\/wp\.lagrowthmachine\.com/g, 'https:\\/\\/lagrowthmachine.com');
        text = text.replace(/["']wp\.lagrowthmachine\.com["']/g, '"lagrowthmachine.com"');
      }
      
      body = text;
    }
      
      return new Response(body, {
        status: wordpressResponse.status,
        statusText: wordpressResponse.statusText,
        headers: newHeaders
      });
      
    } catch (error) {
      console.error('WordPress fetch error:', error);
      return new Response(`WordPress Service Error: ${error.message}`, { status: 502 });
    }
  }