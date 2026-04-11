// Midnight Scholar — Service Worker
// Caches the app shell for offline use, network-first for Firebase

const CACHE = 'ms-v1';
const SHELL = [
  '/',
  '/index.html',
  // Google Fonts
  'https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,500;0,600;1,400&family=DM+Mono:wght@400;500&family=Instrument+Serif:ital@0;1&display=swap',
  // Firebase SDKs
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js',
];

// Install — cache the shell
self.addEventListener('install', e=>{
  e.waitUntil(
    caches.open(CACHE).then(cache=>{
      // Cache what we can, don't fail install if external resources miss
      return Promise.allSettled(SHELL.map(url=>cache.add(url)));
    }).then(()=>self.skipWaiting())
  );
});

// Activate — clean old caches
self.addEventListener('activate', e=>{
  e.waitUntil(
    caches.keys().then(keys=>
      Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))
    ).then(()=>self.clients.claim())
  );
});

// Fetch strategy:
// - Firebase/Firestore/Auth: network only (they handle their own caching)
// - Google Fonts: cache first, network fallback
// - App shell (index.html): stale-while-revalidate
// - Everything else: network first, cache fallback
self.addEventListener('fetch', e=>{
  const url = new URL(e.request.url);

  // Always network for Firebase APIs and auth
  if(
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('identitytoolkit.googleapis.com') ||
    url.hostname.includes('securetoken.googleapis.com') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('gstatic.com') ||
    e.request.method !== 'GET'
  ){
    return; // let browser handle
  }

  // App shell — stale while revalidate
  if(url.pathname === '/' || url.pathname === '/index.html' || url.pathname.endsWith('index.html')){
    e.respondWith(
      caches.open(CACHE).then(async cache=>{
        const cached = await cache.match(e.request);
        const fetchPromise = fetch(e.request).then(res=>{
          if(res.ok) cache.put(e.request, res.clone());
          return res;
        }).catch(()=>null);
        return cached || await fetchPromise || new Response('Offline', {status:503});
      })
    );
    return;
  }

  // Fonts — cache first
  if(url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')){
    e.respondWith(
      caches.match(e.request).then(cached=>{
        if(cached) return cached;
        return fetch(e.request).then(res=>{
          if(res.ok){
            const clone = res.clone();
            caches.open(CACHE).then(c=>c.put(e.request, clone));
          }
          return res;
        });
      })
    );
    return;
  }

  // Everything else — network first, cache fallback
  e.respondWith(
    fetch(e.request).then(res=>{
      if(res.ok){
        const clone = res.clone();
        caches.open(CACHE).then(c=>c.put(e.request, clone));
      }
      return res;
    }).catch(()=>caches.match(e.request))
  );
});
